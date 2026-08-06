using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using XrayCollector.Models;

namespace XrayCollector.Services
{
    public class Xray9020CollectorService : IXray9020CollectorService
    {
        private readonly IApiService _apiService;
        private readonly IFileWatcherService _logWatcher;
        private readonly ISettingsService _settings;
        private readonly ISyncPersistenceService _persistence;
        private readonly ILogger<Xray9020CollectorService> _logger;
        private readonly SemaphoreSlim _processLock = new(1, 1);
        private bool _isSynchronizing = false;
        private Action<string>? _logAction;
        private int _machineId;
        private string? _imagePath;
        private FileSystemWatcher? _subLogWatcher;
        private readonly string _tempPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "temp");

        public Xray9020CollectorService(
            IApiService apiService,
            IFileWatcherService logWatcher,
            ISettingsService settings,
            ISyncPersistenceService persistence,
            ILogger<Xray9020CollectorService> logger)
        {
            _apiService = apiService;
            _logWatcher = logWatcher;
            _settings = settings;
            _persistence = persistence;
            _logger = logger;
        }

        public void Start(string logPath, string imagePath, string machineId, string logExtension, Action<string> onLog)
        {
            if (string.IsNullOrEmpty(logPath) || !Directory.Exists(logPath)) return;

            Stop();
            _logAction = onLog;
            _imagePath = imagePath;
            
            if (!int.TryParse(machineId, out _machineId))
            {
                _logAction?.Invoke("Lỗi: Machine ID không hợp lệ");
                return;
            }

            var logExt = logExtension ?? ".log";
            if (!logExt.StartsWith(".")) logExt = "." + logExt;
            var logFilter = "*" + logExt;

            _logAction?.Invoke($"[9020] Đang giám sát Log: {logPath} | Filter: {logFilter}");
            _logAction?.Invoke($"[9020] Đang giám sát Ảnh: {imagePath}");

            // Quét dữ liệu lịch sử
            _ = SynchronizeHistoryAsync(logPath, logFilter);

            if (!Directory.Exists(_tempPath))
            {
                Directory.CreateDirectory(_tempPath);
            }
            StartSubLogWatcher();

            _logWatcher.Start(logPath, logFilter, (path, type) => 
            {
                if (type == "ERROR") 
                {
                    _logAction?.Invoke($"[LỖI LOG] {path}");
                    return;
                }

                _logAction?.Invoke($"[{type}] Log: {Path.GetFileName(path)}");
                if (type == "EDITED")
                {
                    // Lưu sublog ngay lập tức để tránh bị ghi đè
                    BackupSubLogs(path);
                    _ = ProcessLogFile(path);
                }
            });
        }

        public void Stop()
        {
            _logWatcher.Stop();
            
            if (_subLogWatcher != null)
            {
                _subLogWatcher.EnableRaisingEvents = false;
                _subLogWatcher.Dispose();
                _subLogWatcher = null;
            }
        }

        private void StartSubLogWatcher()
        {
            string subLogPath = _settings.SubLogPath;
            if (string.IsNullOrEmpty(subLogPath) || !Directory.Exists(subLogPath))
            {
                _logAction?.Invoke($"[9020] Bỏ qua giám sát phụ: Thư mục nguồn Loại 2 không tồn tại hoặc trống.");
                return;
            }

            try
            {
                _subLogWatcher?.Dispose();
                
                string pattern = _settings.SubLogExtension ?? "*.*";
                // Nếu pattern là regex nâng cao (có ký hiệu ^ $ \d), bắt buộc dùng *.* cho FSW để lọc mềm bên trong
                string fswFilter = pattern.Contains("^") || pattern.Contains("\\") ? "*.*" : pattern;

                _subLogWatcher = new FileSystemWatcher(subLogPath)
                {
                    Filter = fswFilter,
                    EnableRaisingEvents = true,
                    IncludeSubdirectories = false,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size
                };

                _subLogWatcher.Created += OnSubLogChanged;
                _subLogWatcher.Changed += OnSubLogChanged;
                
                _logAction?.Invoke($"[9020] Đã bật giám sát phụ Loại 2: {subLogPath} (Mẫu: {pattern})");
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"[9020] Lỗi bật giám sát phụ: {ex.Message}");
            }
        }

        private void OnSubLogChanged(object sender, FileSystemEventArgs e)
        {
            try
            {
                string fileName = Path.GetFileName(e.FullPath);
                string pattern = _settings.SubLogExtension ?? "";

                // Bộ lọc nâng cao: Kiểm tra Regex nếu người dùng nhập pattern phức tạp.
                if (pattern.StartsWith("^") || pattern.Contains("\\d"))
                {
                    if (!System.Text.RegularExpressions.Regex.IsMatch(fileName, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    {
                        return; // Bỏ qua file vì không khớp biểu thức chính quy (VD: rAll.txt không khớp ^r\d+\.txt$)
                    }
                }

                // Thử copy file vào thư mục temp (có thể bị lock bởi app kia nên cố loop)
                Task.Run(async () => {
                    int retryCount = 0;
                    bool copied = false;
                    while (retryCount < 5 && !copied)
                    {
                        try
                        {
                            await Task.Delay(200);
                            string dest = Path.Combine(_tempPath, Path.GetFileName(e.FullPath));
                            File.Copy(e.FullPath, dest, true);
                            copied = true;
                        }
                        catch
                        {
                            retryCount++;
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi sao chép Loại 2 sang temp");
            }
        }

        private async Task SynchronizeHistoryAsync(string logPath, string filter)
        {
            if (_isSynchronizing) return;
            _isSynchronizing = true;
            await Task.Yield();
            
            try
            {
                _logAction?.Invoke($"[9020] Đang quét dữ liệu chưa đồng bộ... {logPath} {filter}");
                var state = _persistence.LoadState();

                var directoriesToScan = new List<string> { logPath };
                string startDirName = state.LastProcessedTime.ToString("yyyyMMdd");

                try
                {
                    if (Directory.Exists(logPath))
                    {
                        var subDirs = Directory.GetDirectories(logPath);
                        foreach (var dir in subDirs)
                        {
                            string dirName = Path.GetFileName(dir);
                            if (dirName.Length == 8 && dirName.All(char.IsDigit))
                            {
                                if (string.Compare(dirName, startDirName) >= 0)
                                {
                                    directoriesToScan.Add(dir);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logAction?.Invoke($"Lỗi khi liệt kê thư mục con: {ex.Message}");
                }

                var logFiles = directoriesToScan
                    .SelectMany(d => Directory.GetFiles(d, filter, SearchOption.TopDirectoryOnly))
                    .Select(f => new FileInfo(f))
                    .Where(f => f.LastWriteTime > state.LastProcessedTime.AddSeconds(-1))
                    .OrderBy(f => f.LastWriteTime)
                    .ToList();

                _logAction?.Invoke($"[9020] Tìm thấy {logFiles.Count} tệp log cần quét bù sau thời điểm {state.LastProcessedTime}");

                int count = 0;
                foreach (var file in logFiles)
                {
                    try
                    {
                        await ProcessLogFile(file.FullName);
                        count++;
                    }
                    catch (Exception ex)
                    {
                        _logAction?.Invoke($"Lỗi khi xử lý file {Path.GetFileName(file.FullName)}: {ex.Message}");
                    }
                }
                
                if (count > 0) _logAction?.Invoke($"[9020] Đã hoàn thành quét bù {count} tệp log.");
                else _logAction?.Invoke("[9020] Dữ liệu đã được đồng bộ hóa hoàn toàn.");
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"[9020] Lỗi khi quét bù dữ liệu: {ex.Message}");
                _logger.LogError(ex, "Lỗi khi quét bù dữ liệu 9020");
            }
            finally
            {
                _isSynchronizing = false;
            }
        }

        private async Task ProcessLogFile(string filePath)
        {
            await _processLock.WaitAsync();
            try
            {
                int retryCount = 0;
                string[]? lines = null;
                Exception? lastEx = null;

                while (retryCount < 5 && lines == null)
                {
                    try
                    {
                        await Task.Delay(500);
                        lines = File.ReadAllLines(filePath);
                    }
                    catch (IOException ex)
                    {
                        lastEx = ex;
                        retryCount++;
                        _logAction?.Invoke($"Thử lại lần {retryCount} do file bị khóa...");
                    }
                    catch (Exception ex)
                    {
                        _logAction?.Invoke($"Lỗi không xác định khi đọc file: {ex.Message}");
                        return;
                    }
                }

                if (lines == null || lines.Length <= 1)
                {
                    if (lines == null) _logAction?.Invoke($"Không thể đọc file sau 5 lần thử: {lastEx?.Message}");
                    return;
                }

                // 1. Phân tích file log để lấy danh sách PID và timestamp
                var logEntries = new List<LogEntry>();
                string? commonTimestamp = null;
                foreach (var line in lines.Skip(1))
                {
                    var parts = line.Split(',');
                    if (parts.Length < 4) continue;

                    string pid = parts[0].Trim();
                    string unitIdxStr = parts[1].Trim();
                    string result = parts[2].Trim();
                    string ts = parts[3].Trim();

                    if (string.IsNullOrEmpty(commonTimestamp)) commonTimestamp = ts;
                    
                    logEntries.Add(new LogEntry { Pid = pid, OriginalUnitIndex = unitIdxStr, Result = result, Timestamp = ts });
                }

                if (logEntries.Count == 0 || string.IsNullOrEmpty(commonTimestamp)) return;

                _logAction?.Invoke($"[9020] File log có {logEntries.Count} bản ghi. Timestamp mẫu: {commonTimestamp}");

                // 2. Tìm tất cả ảnh theo timestamp và sắp xếp theo thời gian tạo
                var allImageGroups = FindAndGroupImagesByTimestamp(commonTimestamp);
                _logAction?.Invoke($"[9020] Tìm thấy {allImageGroups.Count} nhóm ảnh cho timestamp {commonTimestamp}");

                // 3. Match each image Unit to its corresponding Unit in the log.
                // File write time must never decide PID identity.
                int matchCount = Math.Min(logEntries.Count, allImageGroups.Count);
                
                var state = _persistence.LoadState();
                var lastTime = state.LastProcessedTime;
                bool stateChanged = false;
                string logFileName = Path.GetFileName(filePath);

                // Automatic mode always starts from Unit 1's PID, then derives
                // every other PID from the UnitIndex embedded in the image name.
                var autoBaseEntry = logEntries.FirstOrDefault(logEntry =>
                    int.TryParse(logEntry.OriginalUnitIndex, out int logUnitIndex) &&
                    logUnitIndex == 1) ?? logEntries[0];

                for (int i = 0; i < matchCount; i++)
                {
                    var group = allImageGroups[i];
                    var entry = logEntries.FirstOrDefault(logEntry =>
                        int.TryParse(logEntry.OriginalUnitIndex, out int logUnitIndex) &&
                        logUnitIndex == group.UnitIndex) ?? logEntries[i];
                    
                    string finalPid;
                    if (group.UnitIndex > 0)
                    {
                        int unitOffset = group.UnitIndex - 1;
                        finalPid = PidMapper.MapPid(
                            autoBaseEntry.Pid,
                            unitOffset,
                            _settings.IsPidMappingIncrease);
                        _logAction?.Invoke($"[Auto Map] Unit {group.UnitIndex} => Base PID {autoBaseEntry.Pid}, Offset {unitOffset} => {finalPid}");
                    }
                    else
                    {
                        finalPid = entry.Pid;
                        _logAction?.Invoke($"[Auto Map Warning] Không đọc được UnitIndex từ tên ảnh. Dùng PID log: {finalPid}");
                    }

                    _logAction?.Invoke($"[Match] {i+1}: PID {entry.Pid} => {group.JobFolder} ({group.Images.Count} ảnh, Time: {group.LastWriteTime:HH:mm:ss})");

                    DateTime currentLogTime = DateTime.MinValue;
                    if (entry.Timestamp.Length == 14)
                    {
                        try {
                            currentLogTime = DateTime.ParseExact(entry.Timestamp, "yyyyMMddHHmmss", null);
                        } catch { }
                    }

                    string isoTime = currentLogTime != DateTime.MinValue ? currentLogTime.ToString("yyyy-MM-ddTHH:mm:ss"): DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss");

                    var imagePaths = group.Images.Select(img => img.Path).ToList();
                    var imageResults = group.Images.Select(img => img.Result).ToList();
                    string boardResult = imageResults.Any(result =>
                        string.Equals(result, "NG", StringComparison.OrdinalIgnoreCase)) ? "NG" : "OK";

                    if (!string.Equals(entry.Result, boardResult, StringComparison.OrdinalIgnoreCase))
                    {
                        _logAction?.Invoke($"[Result Mismatch] Unit {group.UnitIndex}: Log={entry.Result}, Images={boardResult}. Dùng kết quả từ ảnh.");
                    }
                    
                    var shotNums = new List<int>();
                    var imageTypes = new List<string>();
                    var imageCauses = new List<string>();
                    foreach (var path in imagePaths)
                    {
                        var match = System.Text.RegularExpressions.Regex.Match(path, @"(\d+)(?:_o)?\.[^.]+$");
                        shotNums.Add(match.Success ? int.Parse(match.Groups[1].Value) : 1);
                        imageTypes.Add(path.ToLower().Contains("_o") ? "origin" : "marked");
                        
                        // Nếu là NG, tạm thời gán nguyên nhân là "Machine Detect"
                        imageCauses.Add(imageResults[imagePaths.IndexOf(path)] == "NG" ? "Machine Detect" : "");
                    }

                    var success = await _apiService.UploadScanAsync(finalPid, _machineId, boardResult, isoTime, group.JobFolder, group.UnitIndex, imagePaths, imageResults, logFileName, shotNums, imageTypes, imageCauses);
                    
                    if (success) 
                    {
                        _logAction?.Invoke($"Đồng bộ thành công: {finalPid} ({boardResult}) - Job: {group.JobFolder}");
                        
                        if (currentLogTime > lastTime)
                        {
                            lastTime = currentLogTime;
                            stateChanged = true;
                        }
                    }
                    else 
                    {
                        _logAction?.Invoke($"Mất kết nối Server. Đã lưu vào hàng đợi: {finalPid}");
                        _persistence.AddToQueue(new PendingScan
                        {
                            Pid = finalPid,
                            MachineId = _machineId,
                            Result = boardResult,
                            ClientTime = isoTime,
                            JobFile = group.JobFolder,
                            ImagePaths = imagePaths,
                            ImageResults = imageResults,
                            ShotNums = shotNums,
                            ImageTypes = imageTypes,
                            ImageCauses = imageCauses
                        });
                    }
                }

                // --- Backup Log loại 2 đã được tách ra gọi trực tiếp từ watcher để đảm bảo tính tức thì ---

                if (stateChanged)
                {
                    state.LastProcessedTime = lastTime;
                    _persistence.SaveState(state);
                }
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"Lỗi xử lý file log: {ex.Message}");
                _logger.LogError(ex, "Lỗi xử lý file log 9020: {Path}", filePath);
            }
            finally
            {
                _processLock.Release();
            }
        }

        private List<ImageGroup> FindAndGroupImagesByTimestamp(string timestamp)
        {
            var groups = new List<ImageGroup>();
            if (string.IsNullOrEmpty(_imagePath) || timestamp.Length < 8) return groups;

            string datePart = timestamp.Substring(0, 8);
            string dateDir = Path.Combine(_imagePath, datePart);

            try
            {
                if (!Directory.Exists(dateDir)) return groups;

                // Tìm tất cả ảnh chứa timestamp trong toàn bộ thư mục ngày dùng AllDirectories
                string searchPattern = $"*{timestamp}*";
                var allFiles = Directory.GetFiles(dateDir, searchPattern, SearchOption.AllDirectories);
                
                var allUnitImages = new List<ImageInfoInternal>();

                foreach (var filePath in allFiles)
                {
                    if (filePath.EndsWith(".raw", StringComparison.OrdinalIgnoreCase))
                        continue;

                    var fi = new FileInfo(filePath);
                    var dirInfo = fi.Directory;
                    if (dirInfo == null) continue;

                    string resultFolder = dirInfo.Name; // Thường là GD hoặc NG
                    string jobFolder = dirInfo.Parent?.Name ?? "UnknownJob";

                    // Chuyển đổi GD -> OK để đồng bộ với API
                    string finalResult = resultFolder == "GD" ? "OK" : resultFolder;

                    // Lấy UnitIndex từ tên file: *{timestamp}_{unitIndex}_{shotIdx}*
                    var unitMatch = System.Text.RegularExpressions.Regex.Match(fi.Name, $"{timestamp}_(\\d+)_");
                    int unitIdx = unitMatch.Success ? int.Parse(unitMatch.Groups[1].Value) : -1;

                    allUnitImages.Add(new ImageInfoInternal 
                    { 
                        Path = filePath, 
                        Result = finalResult, 
                        LastWriteTime = fi.LastWriteTime, 
                        UnitIndex = unitIdx,
                        JobFolder = jobFolder
                    });
                }

                // Nhóm theo UnitIndex và JobFolder (để đảm bảo cùng 1 màng)
                groups = allUnitImages
                    .GroupBy(img => new { img.JobFolder, img.UnitIndex })
                    .Select(g => new ImageGroup
                    {
                        JobFolder = g.Key.JobFolder,
                        UnitIndex = g.Key.UnitIndex,
                        LastWriteTime = g.Min(img => img.LastWriteTime),
                        Images = g.OrderBy(img => img.LastWriteTime).Select(img => (img.Path, img.Result)).ToList()
                    })
                    .OrderBy(g => g.LastWriteTime)
                    .ToList();
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"Lỗi khi tìm ảnh theo timestamp: {ex.Message}");
            }

            return groups;
        }

        private class LogEntry
        {
            public string Pid { get; set; } = "";
            public string OriginalUnitIndex { get; set; } = "";
            public string Result { get; set; } = "";
            public string Timestamp { get; set; } = "";
        }

        private class ImageInfoInternal
        {
            public string Path { get; set; } = "";
            public string Result { get; set; } = "";
            public DateTime LastWriteTime { get; set; }
            public int UnitIndex { get; set; }
            public string JobFolder { get; set; } = "";
        }

        private class ImageGroup
        {
            public string JobFolder { get; set; } = "";
            public int UnitIndex { get; set; }
            public DateTime LastWriteTime { get; set; }
            public List<(string Path, string Result)> Images { get; set; } = new();
        }

        private void BackupSubLogs(string mainLogPath)
        {
            if (string.IsNullOrEmpty(_settings.BackupPath)) return;

            try
            {
                if (!Directory.Exists(_tempPath)) return;

                var tempFiles = Directory.GetFiles(_tempPath);
                if (tempFiles.Length == 0) return;

                // Tạo folder dựa trên tên file mainlog
                string mainLogName = Path.GetFileNameWithoutExtension(mainLogPath);
                string dateFolder = DateTime.Now.ToString("yyyy\\\\MM\\\\dd"); 
                string destBase = Path.Combine(_settings.BackupPath, dateFolder, mainLogName);

                Directory.CreateDirectory(destBase);
                int count = 0;
                foreach (var f in tempFiles)
                {
                    try 
                    {
                        string destFile = Path.Combine(destBase, Path.GetFileName(f));
                        // Dùng Move để đảm bảo temp luôn sạch cho unit tiếp theo
                        if (File.Exists(destFile)) File.Delete(destFile);
                        File.Move(f, destFile);
                        count++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning($"Cảnh báo: Không thể di chuyển sublog {Path.GetFileName(f)}: {ex.Message}");
                    }
                }

                if (count > 0)
                {
                    _logAction?.Invoke($"[Backup] Đã lưu {count} tệp Log Loại 2 vào: {destBase}");
                }
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"[BackupLỗi] {ex.Message}");
                _logger.LogError(ex, "Lỗi khi BackupSubLogs cho {Path}", mainLogPath);
            }
        }

        private (string jobFile, List<(string Path, string Result)> images) FindImagesAndJobFile(string timestamp, int unitIndex)
        {
            // Không còn dùng nữa nhưng giữ lại để tránh lỗi compile nếu có chỗ khác gọi bừa
            return ("", new List<(string, string)>());
        }
    }
}

using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CommunityToolkit.Mvvm.Messaging;
using XrayCollector.Services;
using XrayCollector.Models;

namespace XrayCollector.ViewModels
{
    public partial class HomeViewModel : ObservableObject
    {
        private readonly IApiService _apiService;
        private readonly IFileWatcherService _logWatcher;
        private readonly ISettingsService _settings;
        private readonly IUpdateService _updateService;
        private readonly ISyncPersistenceService _persistence;
        private readonly IXray9730CollectorService _xray9730Service;
        private readonly SemaphoreSlim _processLock = new(1, 1);
        private DispatcherTimer? _heartbeatTimer;
        private DispatcherTimer? _retryTimer;
        private bool _isSynchronizing = false;

        [ObservableProperty] private string _currentMachineName = "Unknown Machine";
        [ObservableProperty] private string _currentLineName = "Unknown Line";
        [ObservableProperty] private string _machineTypeName = "Unknown Type";
        [ObservableProperty] private string _machinePartNo = "N/A";
        [ObservableProperty] private string _statusMessage = "Sẵn sàng hoạt động";
        [ObservableProperty] private string _statusColor = "Red";
        [ObservableProperty] 
        [NotifyPropertyChangedFor(nameof(MonitoringButtonText))]
        private bool _isRunning;
        
        public string MonitoringButtonText => IsRunning ? "STOP" : "START";

        [ObservableProperty] private string _version;
        [ObservableProperty] private bool _isUpdateAvailable;
        
        [ObservableProperty] private bool _isUpdating;
        [ObservableProperty] private double _updateProgress;
        [ObservableProperty] private string _localIpAddress = "0.0.0.0";
        [ObservableProperty] private bool _isServerConnected;
        [ObservableProperty] private string _connectionStatusColor = "Gray";

        public ObservableCollection<string> Logs { get; } = new();

        public HomeViewModel(IApiService apiService, IFileWatcherService logWatcher, ISettingsService settings, IUpdateService updateService, ISyncPersistenceService persistence, IXray9730CollectorService xray9730Service)
        {
            _apiService = apiService;
            _logWatcher = logWatcher;
            _settings = settings;
            _updateService = updateService;
            _persistence = persistence;
            _xray9730Service = xray9730Service;

            _version = $"v{_updateService.CurrentVersion}";
            
            // Lắng nghe thông điệp khi cài đặt thay đổi
            WeakReferenceMessenger.Default.Register<SettingsChangedMessage>(this, (r, m) => RefreshDisplayInfo());

            // Chạy các tác vụ khởi tạo ngay khi Startup (không đợi nhấn START)
            _ = InitializeStartupAsync();
        }

        private async Task InitializeStartupAsync()
        {
            await Task.Yield(); // Chuyển sang background ngay lập tức
            RefreshDisplayInfo();
            
            // 1. Chỉ khởi tạo timer thử lại gửi dữ liệu lỗi (Retry Queue) mỗi 1 phút lúc Startup
            if (_retryTimer == null)
            {
                _retryTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
                _retryTimer.Tick += async (s, e) => await ProcessRetryQueueAsync();
                _retryTimer.Start();
            }

            await Task.Delay(1000); // Đợi 1 chút cho mạng ổn định rồi check update
            CheckForUpdatesCommand.Execute(null);
        }

        private async void RefreshDisplayInfo()
        {
            _settings.Load();
            LocalIpAddress = await Task.Run(() => GetLocalIpAddress());
            
            if (int.TryParse(_settings.MachineId, out int mid))
            {
                var detail = await _apiService.GetMachineDetailAsync(mid);
                if (detail != null)
                {
                    CurrentMachineName = detail.name;
                    CurrentLineName = detail.line_name;
                    MachineTypeName = detail.machine_type_name ?? "";
                    MachinePartNo = detail.machine_type_part_no ?? "";
                }
                else
                {
                    CurrentMachineName = $"Máy ID: {mid}";
                    CurrentLineName = "Không xác định";
                }
            }
        }

        private string GetLocalIpAddress()
        {
            try 
            {
                var serverUrl = _settings.ServerUrl;
                if (string.IsNullOrEmpty(serverUrl)) return "0.0.0.0";
                
                Uri uri = new Uri(serverUrl);
                string host = uri.Host;

                // Thủ thuật lấy IP Local đang dùng để kết nối tới Server
                using (var socket = new System.Net.Sockets.Socket(System.Net.Sockets.AddressFamily.InterNetwork, System.Net.Sockets.SocketType.Dgram, 0))
                {
                    socket.Connect(host, 65530); // Cổng giả không cần kết nối thật
                    var endPoint = socket.LocalEndPoint as System.Net.IPEndPoint;
                    return endPoint?.Address.ToString() ?? "0.0.0.0";
                }
            }
            catch 
            {
                // Fallback nếu không parse được URL hoặc lỗi mạng
                try {
                    return System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName()).AddressList
                        .FirstOrDefault(ip => ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?.ToString() ?? "127.0.0.1";
                } catch { return "127.0.0.1"; }
            }
        }

        public void UpdateMachineInfo(string lineName, string machineName)
        {
            CurrentLineName = lineName;
            CurrentMachineName = machineName;
        }

        [RelayCommand]
        private async Task CheckForUpdates()
        {
            AddLog($"Kiểm tra cập nhật... (Bản hiện tại: v{_updateService.CurrentVersion})");
            IsUpdateAvailable = await _updateService.CheckForUpdatesAsync();
            if (IsUpdateAvailable)
            {
                AddLog($"Phát hiện bản cập nhật mới: v{_updateService.ServerVersion}");
            }
            else
            {
                AddLog($"Hệ thống đã là bản mới nhất (Server: v{_updateService.ServerVersion})");
            }
        }

        [RelayCommand]
        private async Task PerformUpdate()
        {
            var result = MessageBox.Show(
                $"Phát hiện phiên bản mới: v{_updateService.ServerVersion}\nBạn có muốn cập nhật ngay bây giờ không?", 
                "Cập nhật hệ thống", 
                MessageBoxButton.YesNo, 
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            IsUpdating = true;
            UpdateProgress = 0;
            AddLog("Bắt đầu tải bản cập nhật...");

            var progress = new Progress<double>(value =>
            {
                UpdateProgress = value;
            });

            var success = await _updateService.DownloadAndInstallUpdateAsync(progress);
            if (!success)
            {
                IsUpdating = false;
                AddLog("Lỗi: Không thể tải hoặc cài đặt bản cập nhật.");
                MessageBox.Show("Cập nhật thất bại. Vui lòng thử lại sau.", "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        [RelayCommand]
        private void ToggleMonitoring()
        {
            if (!IsRunning)
            {
                if (string.IsNullOrEmpty(_settings.ImagePath) || string.IsNullOrEmpty(_settings.LogPath))
                {
                    AddLog("Lỗi: Chưa cấu hình thư mục!");
                    return;
                }
                StartMonitoring();
            }
            else
            {
                StopMonitoring();
            }
        }

        private async void StartMonitoring()
        {
            IsRunning = true;
            StatusMessage = "Hệ thống đang hoạt động";
            StatusColor = "Green";

            int mid = 0;
            // 1. Kiểm tra loại máy để khởi chạy Service tương ứng
            // Sử dụng Part Number để nhận diện máy 9730
            if (MachinePartNo.Contains("9730") || MachineTypeName.Contains("9730"))
            {
                if (int.TryParse(_settings.MachineId, out mid))
                {
                    _xray9730Service.Start(_settings.LogPath, mid, (msg) => AddLog(msg));
                }
            }
            else
            {
                // ... (giữ nguyên logic cũ) ...
                var logExt = _settings.LogExtension ?? ".log";
                if (!logExt.StartsWith(".")) logExt = "." + logExt;
                var logFilter = "*" + logExt;

                AddLog($"Đang giám sát Log: {_settings.LogPath} | Filter: {logFilter}");
                AddLog($"Đang giám sát Ảnh: {_settings.ImagePath}");

                // Quét dữ liệu lịch sử (9020)
                _ = SynchronizeHistoricalDataAsync(_settings.LogPath, logFilter);

                _logWatcher.Start(_settings.LogPath, logFilter, (path, type) => 
                {
                    if (type == "ERROR") 
                    {
                        AddLog($"[LỖI LOG] {path}");
                        return;
                    }

                    AddLog($"[{type}] Log: {System.IO.Path.GetFileName(path)}");
                    if (type == "EDITED")
                    {
                        _ = ProcessLogFile(path);
                    }
                });
            }

            // 3. Kích hoạt Heartbeat báo Online chỉ sau khi đã START thành công
            if (int.TryParse(_settings.MachineId, out mid))
            {
                // Gửi gói tin báo Online ngay lập tức
                var result = await _apiService.SendHeartbeatAsync(mid, LocalIpAddress);
                UpdateConnectionStatus(result.Success, result.Message);

                // Sau đó duy trì đều đặn
                _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                _heartbeatTimer.Tick += async (s, e) => 
                {
                    var hb = await _apiService.SendHeartbeatAsync(mid, LocalIpAddress);
                    UpdateConnectionStatus(hb.Success, hb.Message);
                };
                _heartbeatTimer.Start();
            }

            AddLog("Bắt đầu giám sát hệ thống.");
        }

        private async Task SynchronizeHistoricalDataAsync(string logPath, string filter)
        {
            if (_isSynchronizing) return;
            _isSynchronizing = true;
            await Task.Yield(); // Tuyệt đối không treo UI thread khi liệt kê hàng nghìn file
            
            try
            {
                AddLog($"Đang quét dữ liệu chưa đồng bộ... {logPath} {filter}");
                var state = _persistence.LoadState();

                // TỐI ƯU HÓA: Thay vì quét toàn bộ subdirectories (SearchOption.AllDirectories) làm treo UI,
                // Chúng ta chỉ quét thư mục gốc và các thư mục yyyyMMdd >= ngày xử lý cuối.
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
                            // Kiểm tra nếu thư mục có tên là 8 chữ số (yyyyMMdd)
                            if (dirName.Length == 8 && dirName.All(char.IsDigit))
                            {
                                // Chỉ quét nếu thư mục này mới hơn hoặc bằng ngày cuối cùng đã xử lý
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
                    AddLog($"Lỗi khi liệt kê thư mục con: {ex.Message}");
                }

                // Thu thập file từ các thư mục đã chọn (chỉ quét TopDirectoryOnly cho từng thư mục cụ thể)
                var logFiles = directoriesToScan
                    .SelectMany(d => Directory.GetFiles(d, filter, SearchOption.TopDirectoryOnly))
                    .Select(f => new FileInfo(f))
                    .Where(f => f.LastWriteTime > state.LastProcessedTime.AddSeconds(-1)) // Trừ 1s để an toàn
                    .OrderBy(f => f.LastWriteTime)
                    .ToList();

                AddLog($"Tìm thấy {logFiles.Count} tệp log cần quét bù sau thời điểm {state.LastProcessedTime}");

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
                        AddLog($"Lỗi khi xử lý file {Path.GetFileName(file.FullName)}: {ex.Message}");
                    }
                }
                
                if (count > 0) AddLog($"Đã hoàn thành quét bù {count} tệp log.");
                else AddLog("Dữ liệu đã được đồng bộ hóa hoàn toàn.");
            }
            catch (Exception ex)
            {
                AddLog($"Lỗi khi quét bù dữ liệu: {ex.Message}");
            }
            finally
            {
                _isSynchronizing = false;
            }
        }

        private async Task ProcessRetryQueueAsync()
        {
            if (!IsRunning) return;

            var queue = _persistence.GetQueue();
            if (queue.Count == 0) return;

            // Kiểm tra ping tới server trước khi thử lại để tránh spam
            if (!await _apiService.PingAsync()) return;

            AddLog($"Đang thử gửi lại {queue.Count} bản ghi từ hàng đợi ngoại tuyến...");
            
            foreach (var scan in queue.OrderBy(s => s.CreatedAt).Take(10)) // Xử lý từng đợt 10 bản ghi
            {
                bool success = await _apiService.UploadScanAsync(
                    scan.Pid, 
                    scan.MachineId, 
                    scan.Result, 
                    scan.ClientTime, 
                    scan.JobFile, 
                    1, 
                    scan.ImagePaths, 
                    scan.ImageResults,
                    null,
                    scan.ShotNums,
                    scan.ImageTypes);

                if (success)
                {
                    _persistence.RemoveFromQueue(scan.Id);
                    // Không log quá nhiều để tránh spam UI
                }
                else
                {
                    // Nếu vẫn lỗi thì dừng đợt này, đợi timer tiếp theo
                    break;
                }
            }
        }

        private async Task ProcessLogFile(string filePath)
        {
            await _processLock.WaitAsync();
            try
            {
                // Cơ chế Retry để tránh lỗi Access Denied khi file đang bị tester software khóa
                int retryCount = 0;
                string[]? lines = null;
                Exception? lastEx = null;

                while (retryCount < 5 && lines == null)
                {
                    try
                    {
                        await Task.Delay(500); // Đợi mỗi lần retry
                        lines = File.ReadAllLines(filePath);
                    }
                    catch (IOException ex)
                    {
                        lastEx = ex;
                        retryCount++;
                        AddLog($"Thử lại lần {retryCount} do file bị khóa...");
                    }
                    catch (Exception ex)
                    {
                        AddLog($"Lỗi không xác định khi đọc file: {ex.Message}");
                        return;
                    }
                }

                if (lines == null)
                {
                    AddLog($"Không thể đọc file sau 5 lần thử: {lastEx?.Message}");
                    return;
                }

                if (lines.Length <= 1) return; // Chỉ có header
                
                var state = _persistence.LoadState();
                var lastTime = state.LastProcessedTime;
                bool stateChanged = false;

                string? basePid = null;
                string? inspDate = null;

                foreach (var line in lines.Skip(1)) // Bỏ qua header
                {
                    var parts = line.Split(',');
                    if (parts.Length < 4) continue;

                    string pidInLog = parts[0].Trim();
                    string unitIndexStr = parts[1].Trim();
                    string result = parts[2].Trim();
                    string timestamp = parts[3].Trim(); // yyyyMMddHHmmss

                    if (!int.TryParse(unitIndexStr, out int unitIndex)) continue;
                    
                    // Chuyển đổi timestamp sang DateTime để so sánh
                    DateTime currentLogTime = DateTime.MinValue;
                    if (timestamp.Length == 14)
                    {
                        try {
                            currentLogTime = DateTime.ParseExact(timestamp, "yyyyMMddHHmmss", null);
                        } catch { }
                    }

                    // ĐÃ LOẠI BỎ KIỂM TRA CHECKPOINT: Backend đã dùng cơ chế Upsert nên gửi trùng 1 vài record cũng không sao.
                    // Việc bỏ check này giúp xử lý trọn vẹn file dù mốc thời gian global bị nhảy cóc.

                    // Lưu PID của Unit 1 làm mốc
                    if (unitIndex == 1)
                    {
                        basePid = pidInLog;
                        inspDate = timestamp;
                    }

                    if (basePid == null) continue;

                    // Ánh xạ PID cho Unit hiện tại
                    string mappedPid = PidMapper.MapPid(basePid, unitIndex - 1, _settings.IsPidMappingIncrease);
                    AddLog($"[Mapping] Unit {unitIndex}: {basePid} => {mappedPid}");
                    
                    // Chuyển đổi timestamp sang định dạng ISO cho API (yyyy-MM-ddTHH:mm:ss)
                    string isoTime = currentLogTime != DateTime.MinValue 
                        ? currentLogTime.ToString("yyyy-MM-ddTHH:mm:ss") 
                        : DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss");

                    // Tìm ảnh và JobFile (Sử dụng unitIndex để lọc đúng ảnh của Array đó)
                    var (jobFile, imageInfos) = FindImagesAndJobFile(timestamp, unitIndex);
                    string logFileName = Path.GetFileName(filePath); // Lấy tên file log
                    AddLog($"[ImageSearch] Log: {logFileName}, Unit {unitIndex} => Tìm thấy {imageInfos.Count} ảnh");
                    
                    var imagePaths = imageInfos.Select(i => i.Path).ToList();
                    var imageResults = imageInfos.Select(i => i.Result).ToList();
                    
                    // Trích xuất ShotNum và ImageType cho máy 9020
                    var shotNums = new List<int>();
                    var imageTypes = new List<string>();
                    foreach (var path in imagePaths)
                    {
                        var match = System.Text.RegularExpressions.Regex.Match(path, @"(\d+)(?:_o)?\.[^.]+$");
                        shotNums.Add(match.Success ? int.Parse(match.Groups[1].Value) : 1);
                        imageTypes.Add(path.ToLower().Contains("_o") ? "origin" : "marked");
                    }

                    // Đẩy dữ liệu lên Server
                    if (int.TryParse(_settings.MachineId, out int mid))
                    {
                        var success = await _apiService.UploadScanAsync(mappedPid, mid, result, isoTime, jobFile, unitIndex, imagePaths, imageResults, logFileName, shotNums, imageTypes);
                        
                        if (success) 
                        {
                            AddLog($"Đồng bộ thành công: {mappedPid} ({result}) - Job: {jobFile}");
                            
                            // Cập nhật checkpoint mới
                            if (currentLogTime > lastTime)
                            {
                                lastTime = currentLogTime;
                                stateChanged = true;
                            }
                        }
                        else 
                        {
                            AddLog($"Mất kết nối Server. Đã lưu vào hàng đợi: {mappedPid}");
                            
                            // LƯU VÀO HÀNG ĐỢI NGOẠI TUYẾN
                            _persistence.AddToQueue(new PendingScan
                            {
                                Pid = mappedPid,
                                MachineId = mid,
                                Result = result,
                                ClientTime = isoTime,
                                JobFile = jobFile,
                                ImagePaths = imagePaths,
                                ImageResults = imageResults,
                                ShotNums = shotNums,
                                ImageTypes = imageTypes
                            });
                        }
                    }
                }

                // Lưu trạng thái mới xuống ổ đĩa
                if (stateChanged)
                {
                    state.LastProcessedTime = lastTime;
                    _persistence.SaveState(state);
                }
            }
            catch (Exception ex)
            {
                AddLog($"Lỗi xử lý file log: {ex.Message}");
            }
            finally
            {
                _processLock.Release();
            }
        }

        private (string jobFile, List<(string Path, string Result)> images) FindImagesAndJobFile(string timestamp, int unitIndex)
        {
            if (string.IsNullOrEmpty(_settings.ImagePath) || timestamp.Length < 8) return ("", new List<(string, string)>());

            string jobFile = "";
            var imageInfos = new List<(string Path, string Result)>();
            string datePart = timestamp.Substring(0, 8); // yyyyMMdd
            string dateDir = Path.Combine(_settings.ImagePath, datePart);

            try
            {
                if (!Directory.Exists(dateDir)) return ("", new List<(string, string)>());

                // Duyệt qua các thư mục JobFile bên trong thư mục Ngày
                var jobFolders = Directory.GetDirectories(dateDir);
                foreach (var jobPath in jobFolders)
                {
                    bool foundInThisJob = false;
                    
                    // Kiểm tra cả thư mục GD (OK) và NG (Lỗi)
                    var resConfigs = new[] { (Dir: "GD", Res: "OK"), (Dir: "NG", Res: "NG") };
                    foreach (var cfg in resConfigs)
                    {
                        string targetPath = Path.Combine(jobPath, cfg.Dir);
                        if (Directory.Exists(targetPath))
                        {
                            // Tìm các file có chứa timestamp và unitIndex theo pattern: *{timestamp}_{unitIndex}_*
                            string searchPattern = $"*{timestamp}_{unitIndex}_*";
                            var matches = Directory.GetFiles(targetPath, searchPattern);
                            foreach (var match in matches)
                            {
                                imageInfos.Add((match, cfg.Res));
                                foundInThisJob = true;
                            }
                        }
                    }

                    if (foundInThisJob)
                    {
                        jobFile = Path.GetFileName(jobPath);
                        break; // Đã tìm thấy JobFile phù hợp
                    }
                }
            }
            catch (Exception ex)
            {
                AddLog($"Lỗi khi tìm ảnh: {ex.Message}");
            }

            return (jobFile, imageInfos);
        }

        private async void StopMonitoring()
        {
            IsRunning = false;
            StatusMessage = "Sẵn sàng hoạt động";
            StatusColor = "Red";

            _logWatcher.Stop();
            _xray9730Service.Stop();
            _heartbeatTimer?.Stop();

            if (int.TryParse(_settings.MachineId, out int mid))
            {
                await _apiService.SendOfflineAsync(mid);
            }

            AddLog("Đã dừng giám sát.");
        }

        private void UpdateConnectionStatus(bool isSuccess, string message)
        {
            IsServerConnected = isSuccess;
            if (isSuccess)
            {
                ConnectionStatusColor = "LimeGreen";
                StatusMessage = "Hệ thống đang hoạt động";
            }
            else
            {
                ConnectionStatusColor = "Gray";
                StatusMessage = message ?? "Mất kết nối Server";
                
                // Nếu là lỗi trùng IP thì ghi log nổi bật
                if (!string.IsNullOrEmpty(message) && message.Contains("Trùng IP"))
                {
                    ConnectionStatusColor = "Orange";
                    AddLog($"[CẢNH BÁO] {message}");
                }
            }
        }

        public void AddLog(string message)
        {
            // Sử dụng BeginInvoke để không nén (block) luồng xử lý nếu UI đang bận
            Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
            {
                var now = DateTime.Now;
                var timeStr = now.ToString("HH:mm:ss");
                var fullMessage = $"[{timeStr}] {message}";
                
                Logs.Insert(0, fullMessage);
                if (Logs.Count > 100) Logs.RemoveAt(100); // Tăng lên 100 log

                // Ghi log ra tệp tin
                try {
                    string logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs", now.ToString("yyyy"), now.ToString("MM"));
                    if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                    string logFile = Path.Combine(logDir, now.ToString("yyyyMMdd") + ".log");
                    
                    string fileLogEntry = fullMessage;
                    if (message.Contains("Đồng bộ thành công")) {
                        fileLogEntry = $"[{timeStr}] Upload completed {message.Replace("Đồng bộ thành công: ", "")}";
                    }
                    
                    File.AppendAllText(logFile, fileLogEntry + Environment.NewLine);
                } catch { /* Bỏ qua lỗi ghi file để không làm treo UI */ }
            }));
        }
    }

    // Thông điệp dùng để đồng bộ giữa các ViewModel
    public class SettingsChangedMessage { }
}

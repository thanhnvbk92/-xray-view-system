using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace XrayCollector.Services
{
    public interface IXray9730CollectorService
    {
        void Start(string path, int machineId, Action<string> onLog);
        void Stop();
        Task ProcessNewFolderAsync(string folderPath);
    }

    public class Xray9730CollectorService : IXray9730CollectorService
    {
        private readonly IApiService _apiService;
        private readonly IImageMarkingService _markingService;
        private readonly ISyncPersistenceService _persistence;
        private readonly ILogger<Xray9730CollectorService> _logger;
        private FileSystemWatcher? _watcher;
        private int _machineId;
        private Action<string>? _logAction;
        private readonly HashSet<string> _processedFolders = new();
        private readonly HashSet<string> _activeFolders = new();

        public Xray9730CollectorService(
            IApiService apiService, 
            IImageMarkingService markingService,
            ISyncPersistenceService persistence,
            ILogger<Xray9730CollectorService> logger)
        {
            _apiService = apiService;
            _markingService = markingService;
            _persistence = persistence;
            _logger = logger;
        }

        public void Start(string path, int machineId, Action<string> onLog)
        {
            if (string.IsNullOrEmpty(path) || !Directory.Exists(path)) return;

            Stop();
            _machineId = machineId;
            _logAction = onLog;

            _watcher = new FileSystemWatcher(path)
            {
                EnableRaisingEvents = true,
                IncludeSubdirectories = true, // Quan trọng: Bao gồm cả thư mục con
                Filter = "InspectResult.xml", // Chỉ bắt file kết quả cuối cùng
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.CreationTime
            };

            //_watcher.Created += async (s, e) => await OnFileEvent(e.FullPath);
            _watcher.Changed += async (s, e) => await OnFileEvent(e.FullPath);
            //_watcher.Renamed += async (s, e) => await OnFileEvent(e.FullPath);

            _logAction?.Invoke($"Đang giám sát 9730 qua InspectResult.xml tại: {path}");
        }

        private async Task OnFileEvent(string fullPath)
        {
            string folderPath = Path.GetDirectoryName(fullPath) ?? "";
            if (string.IsNullOrEmpty(folderPath)) return;

            // Tránh xử lý trùng lặp trong một khoảng thời gian ngắn
            if (_processedFolders.Contains(folderPath)) return;

            await ProcessNewFolderAsync(folderPath);
        }

        public void Stop()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
        }

        public async Task ProcessNewFolderAsync(string folderPath)
        {
            if (string.IsNullOrEmpty(folderPath)) return;
            
            lock (_activeFolders)
            {
                if (_processedFolders.Contains(folderPath) || _activeFolders.Contains(folderPath)) return;
                _activeFolders.Add(folderPath);
            }
            
            try
            {
                string xmlPath = Path.Combine(folderPath, "InspectResult.xml");
                
                // 1. Đợi một chút để OS giải phóng file
                int retry = 0;
                while (retry < 5)
                {
                    try {
                        using (var stream = File.Open(xmlPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                            break; 
                        }
                    } catch {
                        await Task.Delay(500);
                        retry++;
                    }
                }

                _logAction?.Invoke($"Đang xử lý thư mục: {Path.GetFileName(folderPath)}");

                // 2. Đọc file dưới dạng chuỗi thô (ISO-8859-1 mã hóa 1-1 cho byte) để tránh crash encoding
                // Bảng mã này luôn có sẵn trong .NET mà không cần cài thêm thư viện
                string xmlContent = "";
                var rawBytes = File.ReadAllBytes(xmlPath);
                xmlContent = System.Text.Encoding.GetEncoding("iso-8859-1").GetString(rawBytes);

                //_logAction?.Invoke($"Đã đọc nội dung XML thô, độ dài: {xmlContent.Length} ký tự");
                //_logAction?.Invoke($"Nội dung XML mẫu: {xmlContent.Substring(0, Math.Min(200, xmlContent.Length))}...");

                // 3. Vá (Patch) nội dung header để trình phân tích XML không đòi hỏi euc-kr  <?xml version="1.0" encoding="euc-kr"?>
                if (xmlContent.Contains("euc-kr"))
                {
                    xmlContent = xmlContent.Replace("encoding=\"euc-kr\"", "encoding=\"utf-8\"")
                                           .Replace("encoding='euc-kr'", "encoding='utf-8'");
                }

                _logAction?.Invoke($"Nội dung XML mẫu sau xử lý: {xmlContent.Substring(0, Math.Min(2000, xmlContent.Length))}...");


                var xDoc = XDocument.Parse(xmlContent);
                var inspectElement = xDoc.Element("INSPECT");
                var dataElement = inspectElement?.Element("DATA");
                var unitElements = dataElement?.Elements("UNIT");
                if (unitElements == null)
                {
                    _logAction?.Invoke($"[LỖI] Không tìm thấy thẻ <UNIT> trong XML. Gốc: {xDoc.Root?.Name}");
                    return;
                }
                foreach (var unitElement in unitElements)
                {
                    if (unitElement == null)
                    {
                        _logAction?.Invoke($"[LỖI] Không tìm thấy thẻ <UNIT> trong XML. Gốc: {xDoc.Root?.Name}");
                        return;
                    }

                    string pid = unitElement.Attribute("UNIT_BARCODE")?.Value ?? "UNKNOWN";
                    string modelName = dataElement?.Attribute("MODEL_NAME")?.Value ?? "";
                    string result = (unitElement.Attribute("MACHINE_RESULT")?.Value == "NG" || unitElement.Attribute("REVIEW_RESULT")?.Value == "NG") ? "NG" : "OK";


                    // Chuyển đổi timestamp sang DateTime để so sánh
                    string timestamp = Directory.GetParent(xmlPath)?.Name ?? "";
                    DateTime currentLogTime = DateTime.MinValue;
                    string isoTime = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss");
                    if (timestamp.Length >= 14)
                        timestamp = timestamp.Substring(0, 14); // Lấy phần timestamp chính xác nếu có thêm hậu tố
                    {
                        try
                        {
                            currentLogTime = DateTime.ParseExact(timestamp, "yyyyMMddHHmmss", null);
                            isoTime = currentLogTime.ToString("yyyy-MM-ddTHH:mm:ss");
                        }
                        catch { }
                    }


                    _logAction?.Invoke($"Đang xử lý PCB: {pid} ({result}) - Model: {modelName}");

                    // 3. Xử lý từng Shot
                    var shotElements = unitElement.Elements("SHOT");
                    var imagePaths = new List<string>();
                    var imageResults = new List<string>();
                    var shotNums = new List<int>();
                    var imageTypes = new List<string>();

                    foreach (var shot in shotElements)
                    {
                        int shotIdx = int.Parse(shot.Attribute("NUM")?.Value ?? "1");
                        string shotFolder = Path.Combine(folderPath, shotIdx.ToString());

                        if (!Directory.Exists(shotFolder)) continue;

                        string originTif = Path.Combine(shotFolder, "r.tif");
                        string maskTif = Path.Combine(shotFolder, "r_mask.tif");
                        string shotXml = Path.Combine(shotFolder, "r.xml");

                        // Ảnh đầu ra Marked (lưu chung vào thư mục đó luôn)
                        string markedJpg = Path.Combine(shotFolder, $"r_marked_{shotIdx}.jpg");
                        string originJpg = Path.Combine(shotFolder, $"r_origin_{shotIdx}_o.jpg");

                        // Chuyển ảnh gốc sang JPEG luôn để đồng bộ và nhẹ
                        if (File.Exists(originTif) && File.Exists(shotXml))
                        {
                            var successMark = _markingService.MarkImage(originTif, maskTif, shotXml, markedJpg);
                            // Dùng OpenCV để thực sự convert TIF sang JPG (Thay cho File.Copy lỗi)
                            try
                            {
                                using var mat = OpenCvSharp.Cv2.ImRead(originTif);
                                if (!mat.Empty())
                                {
                                    mat.ImWrite(originJpg);
                                }
                            }
                            catch { }

                            if (successMark)
                            {
                                // Thêm ảnh Marked
                                imagePaths.Add(markedJpg);
                                imageResults.Add(shot.Attribute("MACHINE_RESULT")?.Value == "OK" ? "OK" : "NG");
                                shotNums.Add(shotIdx);
                                imageTypes.Add("marked");

                                // Thêm ảnh Gốc (Origin)
                                imagePaths.Add(originJpg);
                                imageResults.Add(shot.Attribute("MACHINE_RESULT")?.Value == "OK" ? "OK" : "NG");
                                shotNums.Add(shotIdx);
                                imageTypes.Add("origin");
                            }
                        }
                    }

                    // 4. Upload
                    if (imagePaths.Count > 0)
                    {
                        var imageCauses = new List<string>();
                        for (int i = 0; i < imageResults.Count; i++)
                        {
                            string res = imageResults[i];
                            if (res == "NG")
                            {
                                // Tìm SHOT element tương ứng trong XML để lấy cause chi tiết
                                int currentShotIdx = shotNums[i];
                                var currentShotEl = shotElements.FirstOrDefault(s => (s.Attribute("NUM")?.Value ?? "0") == currentShotIdx.ToString());
                                
                                string detailedCause = "";
                                if (currentShotEl != null)
                                {
                                    var allNgObjects = currentShotEl.Elements("OBJECT")
                                        .Where(obj => obj.Attribute("MACHINE_RESULT")?.Value == "NG");

                                    foreach (var obj in allNgObjects)
                                    {
                                        string objCause = obj.Attribute("CAUSE_TEXT")?.Value ?? "NG";
                                        
                                        // Nếu là area_NG, kiểm tra thêm xem có phải Short không
                                        if (objCause == "Area_NG")
                                        {
                                            var areaValueEl = obj.Element("DETAIL")?.Elements("VALUE")
                                                .FirstOrDefault(v => v.Attribute("ALGORITHM_TEXT")?.Value == "Area");

                                            if (areaValueEl != null)
                                            {
                                                double.TryParse(areaValueEl.Attribute("VALUE")?.Value, out double val);
                                                double.TryParse(areaValueEl.Attribute("MAX")?.Value, out double max);

                                                if (val > max)
                                                {
                                                    detailedCause = "Short";
                                                    break; // Ưu tiên cao nhất cho Short
                                                }
                                                else 
                                                {
                                                    detailedCause = "Area_NG"; // Giữ là area_NG nếu diện tích nhỏ (có thể là dính thiếc ít)
                                                }
                                            }
                                            else if (string.IsNullOrEmpty(detailedCause))
                                            {
                                                detailedCause = "Area_NG";
                                            }
                                        }
                                        else if (string.IsNullOrEmpty(detailedCause) || detailedCause == "Machine Detect")
                                        {
                                            detailedCause = objCause;
                                        }
                                    }
                                }
                                
                                if (string.IsNullOrEmpty(detailedCause)) detailedCause = "Machine Detect";
                                imageCauses.Add(detailedCause);
                            }
                            else
                            {
                                imageCauses.Add("");
                            }
                        }

                        var success = await _apiService.UploadScanAsync(
                            pid, _machineId, result, isoTime, modelName, 1,
                            imagePaths, imageResults, "InspectResult.xml",
                            shotNums, imageTypes, imageCauses);

                        if (success)
                        {
                            _logAction?.Invoke($"[INFO] Đã upload PCB {pid} thành công.");
                            _processedFolders.Add(folderPath);

                            // Cập nhật LastProcessedTime vào SyncState
                            var state = _persistence.LoadState();
                            if (currentLogTime > state.LastProcessedTime)
                            {
                                state.LastProcessedTime = currentLogTime;
                                _persistence.SaveState(state);
                            }
                        }
                        else
                        {
                            _logAction?.Invoke($"[ERROR] Upload PCB {pid} thất bại. Đã thêm vào hàng chờ retry.");
                            
                            // Tạo PendingScan để lưu offline
                            var pending = new Models.PendingScan
                            {
                                Id = Guid.NewGuid().ToString(),
                                Pid = pid,
                                MachineId = _machineId,
                                Result = result,
                                ClientTime = isoTime,
                                JobFile = modelName,
                                ImagePaths = imagePaths,
                                ImageResults = imageResults,
                                ShotNums = shotNums,
                                ImageTypes = imageTypes,
                                ImageCauses = imageCauses,
                                CreatedAt = DateTime.Now
                            };
                            _persistence.AddToQueue(pending);
                        }
                    }
                }    
                
                
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"[ERROR] Xử lý thư mục {Path.GetFileName(folderPath)}: {ex.Message}");
                _logger.LogError(ex, "Lỗi xử lý thư mục 9730: {Path}", folderPath);
            }
            finally
            {
                lock (_activeFolders)
                {
                    _activeFolders.Remove(folderPath);
                }
            }
        }
    }
}

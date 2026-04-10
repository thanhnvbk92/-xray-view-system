using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using System.Windows;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CommunityToolkit.Mvvm.Messaging;
using XrayCollector.Services;

namespace XrayCollector.ViewModels
{
    public partial class HomeViewModel : ObservableObject
    {
        private readonly IApiService _apiService;
        private readonly IFileWatcherService _imgWatcher;
        private readonly IFileWatcherService _logWatcher;
        private readonly ISettingsService _settings;
        private readonly IUpdateService _updateService;
        private DispatcherTimer? _heartbeatTimer;

        [ObservableProperty] private string _currentMachineName = "Chưa cấu hình";
        [ObservableProperty] private string _currentLineName = "Chưa cấu hình";
        [ObservableProperty] private string _statusMessage = "Sẵn sàng hoạt động";
        [ObservableProperty] private string _statusColor = "Red";
        [ObservableProperty] 
        [NotifyPropertyChangedFor(nameof(MonitoringButtonText))]
        private bool _isRunning;
        
        public string MonitoringButtonText => IsRunning ? "STOP" : "START";

        [ObservableProperty] private string _version;
        [ObservableProperty] private bool _isUpdateAvailable;
        public ObservableCollection<string> Logs { get; } = new();

        public HomeViewModel(IApiService apiService, IFileWatcherService imgWatcher, IFileWatcherService logWatcher, ISettingsService settings, IUpdateService updateService)
        {
            _apiService = apiService;
            _imgWatcher = imgWatcher;
            _logWatcher = logWatcher;
            _settings = settings;
            _updateService = updateService;

            _version = $"v{_updateService.CurrentVersion}";
            RefreshDisplayInfo();

            // Lắng nghe thông điệp khi cài đặt thay đổi
            WeakReferenceMessenger.Default.Register<SettingsChangedMessage>(this, (r, m) => RefreshDisplayInfo());
            
            CheckForUpdatesCommand.Execute(null);
        }

        private void RefreshDisplayInfo()
        {
            _settings.Load();
            CurrentMachineName = $"Máy ID: {_settings.MachineId}";
            // Nếu có tên máy từ API thì sẽ tốt hơn, tạm thời lấy từ settings
            // Trong thực tế, SettingsViewModel sẽ gửi kèm thông tin sau khi lưu
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
            AddLog("Đang tải bản cập nhật...");
            var success = await _updateService.DownloadAndInstallUpdateAsync();
            if (!success)
            {
                AddLog("Lỗi: Không thể tải hoặc cài đặt bản cập nhật.");
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

            var logExt = _settings.LogExtension ?? ".log";
            if (!logExt.StartsWith(".")) logExt = "." + logExt;
            var logFilter = "*" + logExt;

            AddLog($"Đang giám sát Log: {_settings.LogPath} | Filter: {logFilter}");
            AddLog($"Đang giám sát Ảnh: {_settings.ImagePath}");

            _imgWatcher.Start(_settings.ImagePath, "*.*", (path, type) => 
            {
                if (type == "ERROR") AddLog($"[LỖI ẢNH] {path}");
                else AddLog($"[{type}] Ảnh: {System.IO.Path.GetFileName(path)}");
            });

            _logWatcher.Start(_settings.LogPath, logFilter, (path, type) => 
            {
                if (type == "ERROR") 
                {
                    AddLog($"[LỖI LOG] {path}");
                    return;
                }

                AddLog($"[{type}] Log: {System.IO.Path.GetFileName(path)}");
                if (type == "EDITED" || type == "CREATED")
                {
                    _ = ProcessLogFile(path);
                }
            });

            if (int.TryParse(_settings.MachineId, out int mid))
            {
                var success = await _apiService.SendHeartbeatAsync(mid);
                AddLog(success ? "Đã kết nối tới Server." : "Cảnh báo: Không thể kết nối Server!");

                _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
                _heartbeatTimer.Tick += async (s, e) => await _apiService.SendHeartbeatAsync(mid);
                _heartbeatTimer.Start();
            }

            AddLog("Bắt đầu giám sát hệ thống.");
        }

        private async Task ProcessLogFile(string filePath)
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

            try
            {
                if (lines.Length <= 1) return; // Chỉ có header
                
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

                    // Lưu PID của Unit 1 làm mốc
                    if (unitIndex == 1)
                    {
                        basePid = pidInLog;
                        inspDate = timestamp;
                    }

                    if (basePid == null) continue;

                    // Ánh xạ PID cho Unit hiện tại
                    string mappedPid = PidMapper.MapPid(basePid, unitIndex - 1, _settings.IsPidMappingIncrease);
                    
                    // Chuyển đổi timestamp sang định dạng ISO cho API (yyyy-MM-ddTHH:mm:ss)
                    string isoTime = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"); // Fallback
                    if (timestamp.Length == 14)
                    {
                        try {
                            var dt = DateTime.ParseExact(timestamp, "yyyyMMddHHmmss", null);
                            isoTime = dt.ToString("yyyy-MM-ddTHH:mm:ss");
                        } catch { }
                    }

                    // Tìm ảnh và JobFile tương ứng theo cấu trúc thư mục lồng nhau
                    var (jobFile, imageInfos) = FindImagesAndJobFile(timestamp);
                    var imagePaths = imageInfos.Select(i => i.Path).ToList();
                    var imageResults = imageInfos.Select(i => i.Result).ToList();

                    // Đẩy dữ liệu lên Server (Bao gồm cả ảnh để phục vụ tính năng nén tự động)
                    if (int.TryParse(_settings.MachineId, out int mid))
                    {
                        var success = await _apiService.UploadScanAsync(mappedPid, mid, result, isoTime, jobFile, imagePaths, imageResults);
                        if (success) AddLog($"Đồng bộ thành công: {mappedPid} ({result}) - Job: {jobFile}");
                        else AddLog($"Lỗi đồng bộ: {mappedPid}");
                    }
                }
            }
            catch (Exception ex)
            {
                AddLog($"Lỗi xử lý file log: {ex.Message}");
            }
        }

        private (string jobFile, List<(string Path, string Result)> images) FindImagesAndJobFile(string timestamp)
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
                            // Tìm các file có chứa timestamp
                            var matches = Directory.GetFiles(targetPath, $"*{timestamp}*");
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

            _imgWatcher.Stop();
            _logWatcher.Stop();
            _heartbeatTimer?.Stop();

            if (int.TryParse(_settings.MachineId, out int mid))
            {
                await _apiService.SendOfflineAsync(mid);
            }

            AddLog("Đã dừng giám sát.");
        }

        public void AddLog(string message)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                var time = DateTime.Now.ToString("HH:mm:ss");
                Logs.Insert(0, $"[{time}] {message}");
                if (Logs.Count > 50) Logs.RemoveAt(50);
            });
        }
    }

    // Thông điệp dùng để đồng bộ giữa các ViewModel
    public class SettingsChangedMessage { }
}

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
        private readonly ISettingsService _settings;
        private readonly IUpdateService _updateService;
        private readonly ISyncPersistenceService _persistence;
        private readonly IXray9730CollectorService _xray9730Service;
        private readonly IXray9020CollectorService _xray9020Service;
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
        [NotifyPropertyChangedFor(nameof(MonitoringButtonIcon))]
        private bool _isRunning;
        
        public string MonitoringButtonText => IsRunning ? "STOP" : "START";
        public string MonitoringButtonIcon => IsRunning ? "Stop" : "Play";

        [ObservableProperty] private string _version;
        [ObservableProperty] private bool _isUpdateAvailable;
        
        [ObservableProperty] private bool _isUpdating;
        [ObservableProperty] private double _updateProgress;
        [ObservableProperty] private string _localIpAddress = "0.0.0.0";
        [ObservableProperty] private bool _isServerConnected;
        [ObservableProperty] private string _connectionStatusColor = "Gray";
        [ObservableProperty] private string _connectionStatusText = "KẾT NỐI: ĐANG KIỂM TRA";

        public ObservableCollection<string> Logs { get; } = new();

        public HomeViewModel(IApiService apiService, ISettingsService settings, IUpdateService updateService, ISyncPersistenceService persistence, IXray9730CollectorService xray9730Service, IXray9020CollectorService xray9020Service)
        {
            _apiService = apiService;
            _settings = settings;
            _updateService = updateService;
            _persistence = persistence;
            _xray9730Service = xray9730Service;
            _xray9020Service = xray9020Service;

            // Đăng ký nhận log từ các ViewModel khác
            WeakReferenceMessenger.Default.Register<AddLogMessage>(this, (r, m) => AddLog(m.Value));

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
            // Thiết lập trạng thái đang kiểm tra ngay lập tức
            ConnectionStatusText = "KẾT NỐI: ĐANG KIỂM TRA...";
            ConnectionStatusColor = "#64748B"; // Slate
            
            _settings.Load();
            
            // Lấy IP local với timeout để tránh treo
            LocalIpAddress = await Task.Run(() => {
                try {
                    var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                    return GetLocalIpAddress();
                } catch { return "0.0.0.0"; }
            });
            
            if (int.TryParse(_settings.MachineId, out int mid))
            {
                try 
                {
                    // Thêm timeout cho API call
                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    var detailTask = _apiService.GetMachineDetailAsync(mid);
                    
                    if (await Task.WhenAny(detailTask, Task.Delay(5000, cts.Token)) == detailTask)
                    {
                        var detail = await detailTask;
                        if (detail != null)
                        {
                            CurrentMachineName = detail.name;
                            CurrentLineName = detail.line_name;
                            MachineTypeName = detail.machine_type_name ?? "";
                            MachinePartNo = detail.machine_type_part_no ?? "";
                            
                            UpdateConnectionStatus(true, "Kết nối thành công");
                        }
                        else
                        {
                            CurrentMachineName = $"Máy ID: {mid}";
                            CurrentLineName = "Không xác định";
                            UpdateConnectionStatus(false, "Không tìm thấy thông tin máy trên Server");
                        }
                    }
                    else
                    {
                        UpdateConnectionStatus(false, "Hết thời gian kết nối tới Server (Timeout)");
                    }
                }
                catch (Exception ex)
                {
                    UpdateConnectionStatus(false, $"Lỗi kết nối: {ex.Message}");
                }
            }
            else
            {
                UpdateConnectionStatus(false, "Chưa cấu hình Machine ID");
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
            var result = System.Windows.MessageBox.Show(
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
                AddLog("Lỗi: Không thể tải hoặc cài đặt bản cập nhật. Kiểm tra Logs/update_error.log");
                System.Windows.MessageBox.Show("Cập nhật thất bại. Vui lòng kiểm tra Logs/update_error.log để biết thêm chi tiết.", "Lỗi Cập Nhật", MessageBoxButton.OK, MessageBoxImage.Error);
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
                    // Quét bù dữ liệu lịch sử cho 9730
                    _ = Synchronize9730HistoricalDataAsync(_settings.LogPath);
                }
            }
            else
            {
                _xray9020Service.Start(_settings.LogPath, _settings.ImagePath, _settings.MachineId, _settings.LogExtension, (msg) => AddLog(msg));
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


        private async Task Synchronize9730HistoricalDataAsync(string logPath)
        {
            if (_isSynchronizing || !Directory.Exists(logPath)) return;
            _isSynchronizing = true;
            await Task.Yield();

            try
            {
                AddLog($"[9730] Đang quét dữ liệu chưa đồng bộ tại: {logPath}");
                var state = _persistence.LoadState();
                
                // Liệt kê các thư mục log (format: yyyyMMddHHmmss_BARCODE)
                var directories = Directory.GetDirectories(logPath)
                    .Select(d => new DirectoryInfo(d))
                    .Where(d => d.Name.Length >= 14 && d.Name.Substring(0, 14).All(char.IsDigit))
                    .OrderBy(d => d.Name)
                    .ToList();

                int count = 0;
                foreach (var dir in directories)
                {
                    string ts = dir.Name.Substring(0, 14);
                    if (DateTime.TryParseExact(ts, "yyyyMMddHHmmss", null, System.Globalization.DateTimeStyles.None, out DateTime logTime))
                    {
                        // Chỉ xử lý nếu thư mục này mới hơn mốc thời gian đã xử lý cuối cùng
                        if (logTime > state.LastProcessedTime)
                        {
                            // Gọi Service để xử lý thư mục này
                            await _xray9730Service.ProcessNewFolderAsync(dir.FullName);
                            count++;
                        }
                    }
                }

                if (count > 0) AddLog($"[9730] Đã hoàn thành quét bù {count} thư mục log.");
                else AddLog("[9730] Dữ liệu đã được đồng bộ hóa hoàn toàn.");
            }
            catch (Exception ex)
            {
                AddLog($"[9730] Lỗi khi quét bù dữ liệu: {ex.Message}");
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
                    scan.ImageTypes,
                    scan.ImageCauses);

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



        private async void StopMonitoring()
        {
            IsRunning = false;
            StatusMessage = "Sẵn sàng hoạt động";
            StatusColor = "Red";

            _xray9730Service.Stop();
            _xray9020Service.Stop();
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
                ConnectionStatusColor = "#10B981"; // LimeGreen
                ConnectionStatusText = "KẾT NỐI: ONLINE";
                StatusMessage = "Hệ thống đang hoạt động";
            }
            else
            {
                ConnectionStatusColor = "#64748B"; // Gray-Slate
                ConnectionStatusText = "KẾT NỐI: OFFLINE";
                StatusMessage = message ?? "Mất kết nối Server";
                
                // Nếu là lỗi trùng IP thì ghi log nổi bật
                if (!string.IsNullOrEmpty(message) && message.Contains("Trùng IP"))
                {
                    ConnectionStatusColor = "#F59E0B"; // Orange
                    ConnectionStatusText = "KẾT NỐI: LỖI IP";
                    AddLog($"[CẢNH BÁO] {message}");
                }
            }
        }

        public void AddLog(string message)
        {
            // Sử dụng BeginInvoke để không nén (block) luồng xử lý nếu UI đang bận
            System.Windows.Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
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

    // Thông điệp dùng để ghi log từ các ViewModel khác
    public class AddLogMessage : CommunityToolkit.Mvvm.Messaging.Messages.ValueChangedMessage<string>
    {
        public AddLogMessage(string value) : base(value) { }
    }
}

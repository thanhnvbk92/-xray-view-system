using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;

namespace XrayCollector.Services
{
    public interface IUpdateService
    {
        Task<bool> CheckForUpdatesAsync();
        Task<bool> DownloadAndInstallUpdateAsync(IProgress<double> progress);
        string CurrentVersion { get; }
        string ServerVersion { get; }
    }

    public class UpdateService : IUpdateService
    {
        private readonly HttpClient _httpClient;
        private readonly ISettingsService _settings;
        private string _newVersionUrl = "";

        public string CurrentVersion 
        {
            get
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version;
                return version != null ? $"{version.Major}.{version.Minor}.{version.Build}" : "1.0.0";
            }
        }
        public string ServerVersion { get; private set; } = "N/A";

        public UpdateService(HttpClient httpClient, ISettingsService settings)
        {
            _httpClient = httpClient;
            _httpClient.Timeout = TimeSpan.FromMinutes(10); // Tăng timeout cho việc tải file lớn
            _settings = settings;
        }

        public async Task<bool> CheckForUpdatesAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.GetAsync($"{baseUrl}/api/version");
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    var serverVerStr = doc.RootElement.GetProperty("version").GetString();
                    ServerVersion = serverVerStr ?? "N/A";
                    if (Version.TryParse(serverVerStr, out var sv) && Version.TryParse(CurrentVersion, out var cv))
                    {
                        if (sv > cv)
                        {
                            _newVersionUrl = $"{baseUrl}/api/download/collector";
                            return true;
                        }
                    }
                }
            }
            catch (Exception ex) 
            {
                LogUpdateError($"CheckForUpdatesAsync error: {ex.Message}");
            }
            return false;
        }

        private void LogUpdateError(string message)
        {
            try
            {
                string logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                string logFile = Path.Combine(logDir, "update_error.log");
                File.AppendAllText(logFile, $"[{DateTime.Now}] {message}\n");
            }
            catch { }
        }

        public async Task<bool> DownloadAndInstallUpdateAsync(IProgress<double> progress)
        {
            if (string.IsNullOrEmpty(_newVersionUrl))
            {
                LogUpdateError("DownloadAndInstallUpdateAsync failed: _newVersionUrl is null or empty.");
                return false;
            }

            try
            {
                LogUpdateError($"Starting download from: {_newVersionUrl}");
                
                // Sử dụng HttpClient mới với Proxy bị tắt để tránh lỗi "request was aborted" hoặc lỗi Proxy hệ thống
                var handler = new HttpClientHandler { UseProxy = false };
                using var client = new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(10) };
                
                using var response = await client.GetAsync(_newVersionUrl, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode)
                {
                    LogUpdateError($"DownloadAndInstallUpdateAsync failed: HTTP {response.StatusCode} from {_newVersionUrl}");
                    return false;
                }

                var totalBytes = response.Content.Headers.ContentLength ?? -1L;
                var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // Sử dụng thư mục Temp của hệ thống để tránh lỗi quyền ghi (Access Denied)
                var tempZip = Path.Combine(Path.GetTempPath(), "XrayCollector_Update.zip");
                var tempExtractPath = Path.Combine(Path.GetTempPath(), "XrayCollector_Update_Temp");

                LogUpdateError($"BaseDir: {baseDir}");
                LogUpdateError($"TempZip path: {tempZip}");
                LogUpdateError($"Expected bytes: {totalBytes}");

                // 1. Tải file ZIP
                using var contentStream = await response.Content.ReadAsStreamAsync();
                using var fileStream = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

                var buffer = new byte[8192];
                var totalRead = 0L;
                var readCount = 0;

                while ((readCount = await contentStream.ReadAsync(buffer, 0, buffer.Length)) != 0)
                {
                    await fileStream.WriteAsync(buffer, 0, readCount);
                    totalRead += readCount;

                    if (totalBytes != -1)
                    {
                        var percentage = (double)totalRead / totalBytes * 100;
                        progress?.Report(percentage);
                    }
                }

                await fileStream.FlushAsync();
                fileStream.Close();

                // 2. Giải nén file ZIP vào thư mục tạm
                if (Directory.Exists(tempExtractPath)) Directory.Delete(tempExtractPath, true);
                ZipFile.ExtractToDirectory(tempZip, tempExtractPath);
                
                // 3. Tìm XrayUpdater.exe trong thư mục vừa giải nén (Self-bootstrapping)
                string updaterExe = Path.Combine(tempExtractPath, "XrayUpdater.exe");
                
                if (!File.Exists(updaterExe))
                {
                    // Fallback: Nếu vì lý do gì đó nó nằm ở root (tùy cấu trúc zip)
                    updaterExe = Path.Combine(baseDir, "XrayUpdater.exe");
                }

                if (!File.Exists(updaterExe))
                {
                    throw new FileNotFoundException("Không tìm thấy XrayUpdater.exe trong bản cập nhật.");
                }

                var currentExe = Process.GetCurrentProcess().MainModule?.FileName;
                if (currentExe == null) return false;
                int currentPid = Process.GetCurrentProcess().Id;
                
                var psi = new ProcessStartInfo
                {
                    FileName = updaterExe,
                    UseShellExecute = true,
                    CreateNoWindow = false
                };
                
                psi.ArgumentList.Add(tempZip);
                psi.ArgumentList.Add(baseDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                psi.ArgumentList.Add(currentPid.ToString());
                psi.ArgumentList.Add(currentExe);

                Process.Start(psi);

                System.Windows.Application.Current.Shutdown();
                return true;
            }
            catch (Exception ex)
            {
                // Thêm log chi tiết để debug
                string logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                string logFile = Path.Combine(logDir, "update_error.log");
                string errMsg = ex.Message;
                if (ex.InnerException != null) errMsg += $" (Inner: {ex.InnerException.Message})";
                LogUpdateError($"Error during update: {errMsg}\n{ex.StackTrace}\n");
                
                return false;
            }
        }
    }
}

using System;
using System.Diagnostics;
using System.IO;
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
            catch { }
            return false;
        }

        public async Task<bool> DownloadAndInstallUpdateAsync(IProgress<double> progress)
        {
            if (string.IsNullOrEmpty(_newVersionUrl)) return false;

            try
            {
                using var response = await _httpClient.GetAsync(_newVersionUrl, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode) return false;

                var totalBytes = response.Content.Headers.ContentLength ?? -1L;
                var tempFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "XrayCollector_New.exe");

                using var contentStream = await response.Content.ReadAsStreamAsync();
                using var fileStream = new FileStream(tempFile, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

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

                var currentExe = Process.GetCurrentProcess().MainModule?.FileName;
                if (currentExe == null) return false;

                var batchScript = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "updater.bat");
                var scriptContent = $@"
@echo off
set ""EXE_PATH={currentExe}""
set ""NEW_EXE={tempFile}""

:wait_loop
timeout /t 1 /nobreak > nul
del ""%EXE_PATH%"" 2>nul
if exist ""%EXE_PATH%"" goto wait_loop

move ""%NEW_EXE%"" ""%EXE_PATH%""
start """" ""%EXE_PATH%""
del ""%~f0""
";
                await File.WriteAllTextAsync(batchScript, scriptContent);
                Process.Start(new ProcessStartInfo { FileName = batchScript, CreateNoWindow = true, UseShellExecute = true });
                System.Windows.Application.Current.Shutdown();
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}

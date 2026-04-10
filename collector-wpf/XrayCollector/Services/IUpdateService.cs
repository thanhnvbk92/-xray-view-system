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
        Task<bool> DownloadAndInstallUpdateAsync();
        string CurrentVersion { get; }
        string ServerVersion { get; }
    }

    public class UpdateService : IUpdateService
    {
        private readonly HttpClient _httpClient;
        private readonly ISettingsService _settings;
        private string _newVersionUrl = "";

        public string CurrentVersion => Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "1.0.0";
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

        public async Task<bool> DownloadAndInstallUpdateAsync()
        {
            if (string.IsNullOrEmpty(_newVersionUrl)) return false;

            try
            {
                var response = await _httpClient.GetAsync(_newVersionUrl);
                if (response.IsSuccessStatusCode)
                {
                    var tempFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "XrayCollector_New.exe");
                    await File.WriteAllBytesAsync(tempFile, await response.Content.ReadAsByteArrayAsync());

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
            }
            catch { }
            return false;
        }
    }
}

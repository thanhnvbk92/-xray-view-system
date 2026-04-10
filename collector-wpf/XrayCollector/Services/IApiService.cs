using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using XrayCollector.Models;

namespace XrayCollector.Services
{
    public interface IApiService
    {
        Task<bool> SendHeartbeatAsync(int machineId);
        Task<bool> SendOfflineAsync(int machineId);
        Task<bool> CheckUpdateAsync();
        Task<List<LineDto>> GetLinesAsync();
        Task<List<MachineDto>> GetMachinesAsync();
        Task<bool> UploadScanAsync(string pid, int machineId, string result, string clientTime, string jobFile, System.Collections.Generic.List<string> imagePaths, System.Collections.Generic.List<string> imageResults);
    }

    public class ApiService : IApiService
    {
        private readonly HttpClient _httpClient;
        private readonly ISettingsService _settings;

        public ApiService(HttpClient httpClient, ISettingsService settings)
        {
            _httpClient = httpClient;
            _settings = settings;
        }

        public async Task<bool> SendHeartbeatAsync(int machineId)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.PostAsJsonAsync($"{baseUrl}/heartbeat", new { machine_id = machineId });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> SendOfflineAsync(int machineId)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.PostAsJsonAsync($"{baseUrl}/offline", new { machine_id = machineId });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> CheckUpdateAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.GetAsync($"{baseUrl}/api/version");
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public async Task<List<LineDto>> GetLinesAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                return await _httpClient.GetFromJsonAsync<List<LineDto>>($"{baseUrl}/api/lines") ?? new List<LineDto>();
            }
            catch { return new List<LineDto>(); }
        }

        public async Task<List<MachineDto>> GetMachinesAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                return await _httpClient.GetFromJsonAsync<List<MachineDto>>($"{baseUrl}/api/machines") ?? new List<MachineDto>();
            }
            catch { return new List<MachineDto>(); }
        }

        public async Task<bool> UploadScanAsync(string pid, int machineId, string result, string clientTime, string jobFile, List<string> imagePaths, List<string> imageResults)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                using var content = new MultipartFormDataContent();
                content.Add(new StringContent(pid), "pid");
                content.Add(new StringContent(machineId.ToString()), "machine_id");
                content.Add(new StringContent(result), "machine_result");
                content.Add(new StringContent(clientTime), "client_time");
                
                if (!string.IsNullOrEmpty(jobFile))
                {
                    content.Add(new StringContent(jobFile), "job_file");
                }

                if (imageResults != null && imageResults.Count > 0)
                {
                    content.Add(new StringContent(string.Join(",", imageResults)), "image_results");
                }

                if (imagePaths != null && imagePaths.Count > 0)
                {
                    foreach (var path in imagePaths)
                    {
                        if (System.IO.File.Exists(path))
                        {
                            var fileBytes = System.IO.File.ReadAllBytes(path);
                            var fileContent = new ByteArrayContent(fileBytes);
                            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
                            content.Add(fileContent, "files", System.IO.Path.GetFileName(path));
                        }
                    }
                }

                var response = await _httpClient.PostAsync($"{baseUrl}/upload-scan", content);
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }
    }
}

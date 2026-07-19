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
        Task<(bool Success, string Message)> SendHeartbeatAsync(int machineId, string ipAddress);
        Task<bool> SendOfflineAsync(int machineId);
        Task<bool> CheckUpdateAsync();
        Task<List<LineDto>> GetLinesAsync();
        Task<List<MachineDto>> GetMachinesAsync();
        Task<List<MachineTypeDto>> GetMachineTypesAsync();
        Task<bool> PingAsync();
        Task<bool> UploadScanAsync(string pid, int machineId, string result, string clientTime, string jobFile, int arrayIndex, List<string> imagePaths, List<string> imageResults, string? logFile = null, List<int>? shotNums = null, List<string>? imageTypes = null, List<string>? imageCauses = null);
        Task<MachineDetailDto?> GetMachineDetailAsync(int machineId);
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

        public async Task<(bool Success, string Message)> SendHeartbeatAsync(int machineId, string ipAddress)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.PostAsJsonAsync($"{baseUrl}/api/machines/heartbeat", new { 
                    machine_id = machineId,
                    ip_address = ipAddress
                });
                
                if (response.IsSuccessStatusCode)
                    return (true, "OK");
                
                var error = await response.Content.ReadAsStringAsync();
                // Phổ biến là {"detail": "..."} từ FastAPI
                try {
                    var json = System.Text.Json.JsonDocument.Parse(error);
                    var detail = json.RootElement.GetProperty("detail").GetString();
                    return (false, detail ?? "Lỗi không xác định");
                } catch {
                    return (false, error);
                }
            }
            catch (Exception ex) { return (false, ex.Message); }
        }

        public async Task<bool> SendOfflineAsync(int machineId)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.PostAsJsonAsync($"{baseUrl}/api/machines/offline", new { machine_id = machineId });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> CheckUpdateAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                // Sửa URL đúng theo Backend mapping
                var response = await _httpClient.GetAsync($"{baseUrl}/api/version");
                return response. IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public async Task<List<LineDto>> GetLinesAsync()
        {
            var baseUrl = _settings.ServerUrl.TrimEnd('/');
            var result = await _httpClient.GetFromJsonAsync<List<LineDto>>($"{baseUrl}/api/lines");
            return result ?? new List<LineDto>();
        }

        public async Task<List<MachineDto>> GetMachinesAsync()
        {
            var baseUrl = _settings.ServerUrl.TrimEnd('/');
            // Thêm dấu / cuối để đảm bảo tương thích tốt nhất với FastAPI router
            var result = await _httpClient.GetFromJsonAsync<List<MachineDto>>($"{baseUrl}/api/machines/");
            return result ?? new List<MachineDto>();
        }

        public async Task<List<MachineTypeDto>> GetMachineTypesAsync()
        {
            var baseUrl = _settings.ServerUrl.TrimEnd('/');
            var result = await _httpClient.GetFromJsonAsync<List<MachineTypeDto>>($"{baseUrl}/api/machine-types");
            return result ?? new List<MachineTypeDto>();
        }

        public async Task<bool> PingAsync()
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                var response = await _httpClient.GetAsync($"{baseUrl}/api/lines");
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> UploadScanAsync(string pid, int machineId, string result, string clientTime, string jobFile, int arrayIndex, List<string> imagePaths, List<string> imageResults, string? logFile = null, List<int>? shotNums = null, List<string>? imageTypes = null, List<string>? imageCauses = null)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                using var content = new MultipartFormDataContent();
                content.Add(new StringContent(pid), "pid");
                content.Add(new StringContent(machineId.ToString()), "machine_id");
                content.Add(new StringContent(result), "machine_result");
                content.Add(new StringContent(clientTime), "client_time");
                content.Add(new StringContent(arrayIndex.ToString()), "array_index");
                
                if (!string.IsNullOrEmpty(jobFile))
                {
                    content.Add(new StringContent(jobFile), "job_file");
                }

                if (!string.IsNullOrEmpty(logFile))
                {
                    content.Add(new StringContent(logFile), "log_file");
                }

                if (imageResults != null && imageResults.Count > 0)
                {
                    content.Add(new StringContent(string.Join(",", imageResults)), "image_results");
                }

                if (shotNums != null && shotNums.Count > 0)
                {
                    content.Add(new StringContent(string.Join(",", shotNums)), "shot_nums");
                }

                if (imageTypes != null && imageTypes.Count > 0)
                {
                    content.Add(new StringContent(string.Join(",", imageTypes)), "image_types");
                }

                if (imageCauses != null && imageCauses.Count > 0)
                {
                    content.Add(new StringContent(string.Join(",", imageCauses)), "image_causes");
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

                var response = await _httpClient.PostAsync($"{baseUrl}/api/pcbs/upload-scan", content);
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }
        public async Task<MachineDetailDto?> GetMachineDetailAsync(int machineId)
        {
            try
            {
                var baseUrl = _settings.ServerUrl.TrimEnd('/');
                return await _httpClient.GetFromJsonAsync<MachineDetailDto>($"{baseUrl}/api/machines/{machineId}");
            }
            catch { return null; }
        }
    }

    public class MachineDetailDto
    {
        public int id { get; set; }
        public string name { get; set; } = string.Empty;
        public string line_name { get; set; } = string.Empty;
        public string machine_type_name { get; set; } = string.Empty;
        public string machine_type_part_no { get; set; } = string.Empty;
    }
}

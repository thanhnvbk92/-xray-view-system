using System;
using System.IO;
using System.Text.Json;

namespace XrayCollector.Services
{
    public interface ISettingsService
    {
        string MachineId { get; set; }
        string ServerUrl { get; set; }
        string ImagePath { get; set; }
        string LogPath { get; set; }
        string LogExtension { get; set; }
        bool IsPidMappingIncrease { get; set; }
        void Save();
        void Load();
    }

    public class SettingsService : ISettingsService
    {
        private readonly string _configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "settings.json");

        public string MachineId { get; set; } = "1";
        public string ServerUrl { get; set; } = "http://10.224.142.245:8000";
        public string ImagePath { get; set; } = "";
        public string LogPath { get; set; } = "";
        public string LogExtension { get; set; } = ".log";
        public bool IsPidMappingIncrease { get; set; } = true;

        public void Save()
        {
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_configPath, json);
        }

        public void Load()
        {
            if (File.Exists(_configPath))
            {
                try
                {
                    var json = File.ReadAllText(_configPath);
                    var settings = JsonSerializer.Deserialize<SettingsService>(json);
                    if (settings != null)
                    {
                        MachineId = settings.MachineId;
                        ServerUrl = settings.ServerUrl;
                        ImagePath = settings.ImagePath;
                        LogPath = settings.LogPath;
                        LogExtension = settings.LogExtension;
                        IsPidMappingIncrease = settings.IsPidMappingIncrease;
                    }
                }
                catch { /* Ignore and use defaults */ }
            }
        }
    }
}

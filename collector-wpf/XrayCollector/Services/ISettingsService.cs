using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using XrayCollector.Models;

namespace XrayCollector.Services
{
    public interface ISettingsService
    {
        string MachineId { get; set; }
        string ServerUrl { get; set; }
        string ImagePath { get; set; }
        string LogPath { get; set; }
        string BackupPath { get; set; }
        string SubLogPath { get; set; }
        string LogExtension { get; set; }
        string SubLogExtension { get; set; }
        bool IsPidMappingIncrease { get; set; }
        bool IsManualPidMappingEnabled { get; set; }
        bool HasScanner { get; set; }
        string UpstreamLogPath { get; set; }
        string ComPort { get; set; }
        int BaudRate { get; set; }
        string LastDetected9020Model { get; set; }
        List<ModelMappingConfig> ModelMappings { get; set; }
        void Save();
        void Load();
    }

    public class SettingsService : ISettingsService
    {
        private readonly string _configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "settings.json");

        public string MachineId { get; set; } = "1";
        public string ServerUrl { get; set; } = "http://10.224.189.245:8000";
        public string ImagePath { get; set; } = "";
        public string LogPath { get; set; } = "";
        public string BackupPath { get; set; } = "";
        public string SubLogPath { get; set; } = @"C:\exer";
        public string LogExtension { get; set; } = ".csv";
        public string SubLogExtension { get; set; } = @"^r\d+\.txt$";
        public bool IsPidMappingIncrease { get; set; } = true;
        public bool IsManualPidMappingEnabled { get; set; } = false;
        public bool HasScanner { get; set; } = true;
        public string UpstreamLogPath { get; set; } = "";
        public string ComPort { get; set; } = "";
        public int BaudRate { get; set; } = 9600;
        public string LastDetected9020Model { get; set; } = "";
        public List<ModelMappingConfig> ModelMappings { get; set; } = new();

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
                        MachineId = settings.MachineId ?? MachineId;
                        ServerUrl = settings.ServerUrl ?? ServerUrl;
                        ImagePath = settings.ImagePath ?? ImagePath;
                        LogPath = settings.LogPath ?? LogPath;
                        BackupPath = settings.BackupPath ?? BackupPath;
                        SubLogPath = settings.SubLogPath ?? SubLogPath;
                        LogExtension = settings.LogExtension ?? LogExtension;
                        SubLogExtension = settings.SubLogExtension ?? SubLogExtension;
                        IsPidMappingIncrease = settings.IsPidMappingIncrease;
                        IsManualPidMappingEnabled = settings.IsManualPidMappingEnabled;
                        HasScanner = settings.HasScanner;
                        UpstreamLogPath = settings.UpstreamLogPath ?? UpstreamLogPath;
                        ComPort = settings.ComPort ?? ComPort;
                        BaudRate = settings.BaudRate != 0 ? settings.BaudRate : BaudRate;
                        LastDetected9020Model = settings.LastDetected9020Model ?? LastDetected9020Model;
                        ModelMappings = settings.ModelMappings ?? ModelMappings;
                    }
                }
                catch { /* Ignore and use defaults */ }
            }
        }
    }
}

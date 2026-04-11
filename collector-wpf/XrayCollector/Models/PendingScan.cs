using System;
using System.Collections.Generic;

namespace XrayCollector.Models
{
    /// <summary>
    /// Model đại diện cho một bản quét chưa được gửi thành công lên Server
    /// </summary>
    public class PendingScan
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Pid { get; set; } = string.Empty;
        public int MachineId { get; set; }
        public string Result { get; set; } = string.Empty;
        public string ClientTime { get; set; } = string.Empty;
        public string JobFile { get; set; } = string.Empty;
        public List<string> ImagePaths { get; set; } = new();
        public List<string> ImageResults { get; set; } = new();
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }

    /// <summary>
    /// Lưu trữ trạng thái quét của Collector
    /// </summary>
    public class SyncState
    {
        public DateTime LastProcessedTime { get; set; } = DateTime.MinValue;
        public Dictionary<string, long> FileCheckpoints { get; set; } = new(); // FileName -> LastReadPosition or Index
    }
}

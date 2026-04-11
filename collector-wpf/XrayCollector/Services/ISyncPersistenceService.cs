using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using XrayCollector.Models;

namespace XrayCollector.Services
{
    public interface ISyncPersistenceService
    {
        SyncState LoadState();
        void SaveState(SyncState state);
        void AddToQueue(PendingScan scan);
        List<PendingScan> GetQueue();
        void RemoveFromQueue(string id);
    }

    public class SyncPersistenceService : ISyncPersistenceService
    {
        private readonly string _dataDir;
        private readonly string _statePath;
        private readonly string _queuePath;
        private readonly object _lock = new object();

        public SyncPersistenceService()
        {
            _dataDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".data");
            if (!Directory.Exists(_dataDir)) Directory.CreateDirectory(_dataDir);

            _statePath = Path.Combine(_dataDir, "sync_state.json");
            _queuePath = Path.Combine(_dataDir, "retry_queue.json");
        }

        public SyncState LoadState()
        {
            lock (_lock)
            {
                if (!File.Exists(_statePath)) return new SyncState();
                try
                {
                    string json = File.ReadAllText(_statePath);
                    return JsonSerializer.Deserialize<SyncState>(json) ?? new SyncState();
                }
                catch { return new SyncState(); }
            }
        }

        public void SaveState(SyncState state)
        {
            lock (_lock)
            {
                try
                {
                    string json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_statePath, json);
                }
                catch { }
            }
        }

        public void AddToQueue(PendingScan scan)
        {
            lock (_lock)
            {
                var queue = GetQueue();
                // Tránh trùng lặp PID trong hàng đợi nếu cùng một bản ghi bị lỗi nhiều lần
                if (!queue.Exists(s => s.Pid == scan.Pid && s.ClientTime == scan.ClientTime))
                {
                    queue.Add(scan);
                    SaveQueue(queue);
                }
            }
        }

        public List<PendingScan> GetQueue()
        {
            lock (_lock)
            {
                if (!File.Exists(_queuePath)) return new List<PendingScan>();
                try
                {
                    string json = File.ReadAllText(_queuePath);
                    return JsonSerializer.Deserialize<List<PendingScan>>(json) ?? new List<PendingScan>();
                }
                catch { return new List<PendingScan>(); }
            }
        }

        public void RemoveFromQueue(string id)
        {
            lock (_lock)
            {
                var queue = GetQueue();
                queue.RemoveAll(s => s.Id == id);
                SaveQueue(queue);
            }
        }

        private void SaveQueue(List<PendingScan> queue)
        {
            try
            {
                string json = JsonSerializer.Serialize(queue, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_queuePath, json);
            }
            catch { }
        }
    }
}

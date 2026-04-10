using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace XrayCollector.Services
{
    public interface IFileWatcherService
    {
        void Start(string path, string filter, Action<string, string> onEvent);
        void Stop();
    }

    public class FileWatcherService : IFileWatcherService, IDisposable
    {
        private FileSystemWatcher? _watcher;
        private Action<string, string>? _callback;

        public void Start(string path, string filter, Action<string, string> onEvent)
        {
            if (string.IsNullOrEmpty(path)) 
            {
                onEvent?.Invoke("ERROR", "Đường dẫn thư mục trống!");
                return;
            }
            if (!Directory.Exists(path))
            {
                onEvent?.Invoke("ERROR", $"Thư mục không tồn tại: {path}");
                return;
            }

            Stop();

            _callback = onEvent;
            _watcher = new FileSystemWatcher(path)
            {
                Filter = filter,
                EnableRaisingEvents = true,
                IncludeSubdirectories = true,
                InternalBufferSize = 65536, // Tăng buffer lên 64KB
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.DirectoryName | NotifyFilters.Size
            };

            _watcher.Created += (s, e) => _callback?.Invoke(e.FullPath, "CREATED");
            _watcher.Changed += (s, e) => _callback?.Invoke(e.FullPath, "EDITED");
            _watcher.Renamed += (s, e) => _callback?.Invoke(e.FullPath, "EDITED");
            _watcher.Error += (s, e) => _callback?.Invoke("ERROR", $"Watcher Error: {e.GetException().Message}");
        }

        public void Stop()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
        }

        public void Dispose()
        {
            Stop();
        }
    }
}

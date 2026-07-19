using System;

namespace XrayCollector.Services
{
    public interface IXray9020CollectorService
    {
        void Start(string logPath, string imagePath, string machineId, string logExtension, Action<string> onLog);
        void Stop();
    }
}

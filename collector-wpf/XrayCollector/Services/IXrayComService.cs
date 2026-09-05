using System;

namespace XrayCollector.Services
{
    public interface IXrayComService
    {
        bool IsOpen { get; }
        string LatestPid { get; }
        void Start(string portName, int baudRate, Action<string> onLog);
        void Stop();
        void SetLatestPid(string pid);
    }
}

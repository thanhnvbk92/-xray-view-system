using System;
using System.IO.Ports;
using Microsoft.Extensions.Logging;

namespace XrayCollector.Services
{
    public class XrayComService : IXrayComService
    {
        private SerialPort? _serialPort;
        private Action<string>? _logAction;
        private readonly ILogger<XrayComService> _logger;
        private readonly object _lock = new();

        public string LatestPid { get; private set; } = string.Empty;
        public bool IsOpen => _serialPort != null && _serialPort.IsOpen;

        public XrayComService(ILogger<XrayComService> logger)
        {
            _logger = logger;
        }

        public void SetLatestPid(string pid)
        {
            if (!string.IsNullOrWhiteSpace(pid))
            {
                LatestPid = pid.Trim();
                _logAction?.Invoke($"[COM] Đã cập nhật PID mới nhất: {LatestPid}");
            }
        }

        public void Start(string portName, int baudRate, Action<string> onLog)
        {
            Stop();
            _logAction = onLog;

            if (string.IsNullOrWhiteSpace(portName) || portName.Equals("Không dùng", StringComparison.OrdinalIgnoreCase) || portName.Equals("None", StringComparison.OrdinalIgnoreCase))
            {
                _logAction?.Invoke("[COM] Cổng COM X-ray không được cấu hình.");
                return;
            }

            try
            {
                _serialPort = new SerialPort(portName, baudRate, Parity.None, 8, StopBits.One)
                {
                    ReadTimeout = 1000,
                    WriteTimeout = 1000
                };

                _serialPort.DataReceived += OnDataReceived;
                _serialPort.Open();

                _logAction?.Invoke($"[COM] Đã mở kết nối cổng {portName} (BaudRate: {baudRate})");
            }
            catch (Exception ex)
            {
                _logAction?.Invoke($"[LỖI COM] Không thể mở cổng {portName}: {ex.Message}");
                _logger.LogError(ex, "Lỗi mở cổng COM {Port}", portName);
            }
        }

        public void Stop()
        {
            lock (_lock)
            {
                if (_serialPort != null)
                {
                    try
                    {
                        _serialPort.DataReceived -= OnDataReceived;
                        if (_serialPort.IsOpen)
                        {
                            _serialPort.Close();
                        }
                        _serialPort.Dispose();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Lỗi khi đóng cổng COM");
                    }
                    finally
                    {
                        _serialPort = null;
                    }
                }
            }
        }

        private void OnDataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            lock (_lock)
            {
                if (_serialPort == null || !_serialPort.IsOpen) return;

                try
                {
                    string data = _serialPort.ReadExisting();
                    if (!string.IsNullOrEmpty(data))
                    {
                        _logAction?.Invoke($"[COM Receive] Tín hiệu từ X-ray: '{data.Trim()}'");

                        if (data.Contains("+"))
                        {
                            if (string.IsNullOrEmpty(LatestPid))
                            {
                                _logAction?.Invoke("[COM Warning] X-ray yêu cầu PID ('+') nhưng chưa có PID khả dụng!");
                            }
                            else
                            {
                                string response = LatestPid + "\r\n";
                                _serialPort.Write(response);
                                _logAction?.Invoke($"[COM Send] Đã gửi lại PID cho X-ray: {LatestPid}");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logAction?.Invoke($"[LỖI COM Receive] {ex.Message}");
                    _logger.LogError(ex, "Lỗi xử lý dữ liệu nhận từ COM");
                }
            }
        }
    }
}

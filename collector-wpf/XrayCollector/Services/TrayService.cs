using System;
using System.Drawing;
using System.Windows;
using System.Windows.Forms;
using Application = System.Windows.Application;

namespace XrayCollector.Services
{
    public interface ITrayService
    {
        void Initialize();
        void ShowMessage(string title, string message);
        void Dispose();
    }

    public class TrayService : ITrayService, IDisposable
    {
        private NotifyIcon? _notifyIcon;
        private readonly MainWindow _mainWindow;

        public TrayService(MainWindow mainWindow)
        {
            _mainWindow = mainWindow;
        }

        public void Initialize()
        {
            _notifyIcon = new NotifyIcon();
            
            // Mặc định sử dụng icon hệ thống, người dùng có thể thay thế sau
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string pngPath = System.IO.Path.Combine(baseDir, "Assets", "app.png");
                string icoPath = System.IO.Path.Combine(baseDir, "Assets", "app.ico");
                
                if (System.IO.File.Exists(pngPath))
                {
                    using (var bitmap = new Bitmap(pngPath))
                    {
                        var hIcon = bitmap.GetHicon();
                        _notifyIcon.Icon = Icon.FromHandle(hIcon);
                    }
                }
                else if (System.IO.File.Exists(icoPath))
                {
                    _notifyIcon.Icon = new Icon(icoPath);
                }
                else
                {
                    _notifyIcon.Icon = SystemIcons.Application;
                }
            }
            catch 
            { 
                _notifyIcon.Icon = SystemIcons.Application; 
            }

            _notifyIcon.Text = "Xray View System Collector";
            _notifyIcon.Visible = true;

            // Tạo Menu chuẩn cho khay hệ thống
            var contextMenu = new ContextMenuStrip();
            
            var openItem = new ToolStripMenuItem("Open");
            openItem.Click += (s, e) => ShowMainWindow();
            contextMenu.Items.Add(openItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            var exitItem = new ToolStripMenuItem("Exit");
            exitItem.Click += (s, e) => ExitApplication();
            contextMenu.Items.Add(exitItem);

            _notifyIcon.ContextMenuStrip = contextMenu;

            // Phản hồi khi nhấn đúp chuột vào icon
            _notifyIcon.DoubleClick += (s, e) => ShowMainWindow();
        }

        public void ShowMessage(string title, string message)
        {
            if (_notifyIcon != null)
            {
                _notifyIcon.ShowBalloonTip(3000, title, message, ToolTipIcon.Info);
            }
        }

        private void ShowMainWindow()
        {
            _mainWindow.Show();
            if (_mainWindow.WindowState == WindowState.Minimized)
            {
                _mainWindow.WindowState = WindowState.Normal;
            }
            _mainWindow.Activate();
            _mainWindow.Focus();
        }

        private void ExitApplication()
        {
            _notifyIcon?.Dispose();
            Application.Current.Shutdown();
        }

        public void Dispose()
        {
            _notifyIcon?.Dispose();
        }
    }
}

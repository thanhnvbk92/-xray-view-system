using System;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using XrayCollector.ViewModels;

namespace XrayCollector
{
    public partial class MainWindow : Window
    {
        public MainWindow(MainViewModel viewModel)
        {
            DataContext = viewModel;
            InitializeComponent();
            LoadAppIcon();
        }

        private void LoadAppIcon()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string pngPath = Path.Combine(baseDir, "Assets", "app.png");
                string icoPath = Path.Combine(baseDir, "Assets", "app.ico");

                if (File.Exists(pngPath))
                {
                    this.Icon = BitmapFrame.Create(new Uri(pngPath, UriKind.Absolute));
                }
                else if (File.Exists(icoPath))
                {
                    this.Icon = BitmapFrame.Create(new Uri(icoPath, UriKind.Absolute));
                }
            }
            catch { /* Im lặng nếu lỗi nạp icon */ }
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            // Thay vì đóng ứng dụng, chúng ta ẩn cửa sổ vào khay hệ thống
            e.Cancel = true;
            this.Hide();

            // Hiển thị thông báo nhỏ ở khay hệ thống (Balloon Tip)
            var safeTrayService = App.GetService<Services.ITrayService>();
            safeTrayService?.ShowMessage("Xray Collector", "Ứng dụng vẫn đang chạy ngầm để giám sát máy.");

            base.OnClosing(e);
        }
    }
}
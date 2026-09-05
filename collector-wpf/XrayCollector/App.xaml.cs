using System.Windows;
using System.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using XrayCollector.Services;
using XrayCollector.ViewModels;

namespace XrayCollector
{
    public partial class App : System.Windows.Application
    {
        private static Mutex? _mutex;
        private static readonly IHost _host = Host
            .CreateDefaultBuilder()
            .ConfigureServices((context, services) =>
            {
                // Services
                services.AddSingleton<ISettingsService, SettingsService>();
                services.AddSingleton<IUpdateService, UpdateService>();
                services.AddSingleton<ISyncPersistenceService, SyncPersistenceService>();
                services.AddSingleton<ITrayService, TrayService>(); // Thêm TrayService
                services.AddSingleton<IXrayComService, XrayComService>();
                services.AddTransient<IApiService, ApiService>();
                services.AddTransient<IFileWatcherService, FileWatcherService>();
                services.AddTransient<IImageMarkingService, ImageMarkingService>();
                services.AddTransient<IXray9730CollectorService, Xray9730CollectorService>();
                services.AddTransient<IXray9020CollectorService, Xray9020CollectorService>();
                services.AddHttpClient<IApiService, ApiService>();
                services.AddHttpClient<IUpdateService, UpdateService>();

                // ViewModels
                services.AddSingleton<MainViewModel>();

                // Windows
                services.AddSingleton<MainWindow>();
            })
            .Build();

        public static T? GetService<T>() where T : class
            => _host.Services.GetService(typeof(T)) as T;

        protected override async void OnStartup(StartupEventArgs e)
        {
            // 1. Kiểm tra Single Instance dùng Mutex
            const string appName = "XrayCollector_SingleInstance_Mutex";
            _mutex = new Mutex(true, appName, out bool createdNew);

            if (!createdNew)
            {
                System.Windows.MessageBox.Show("Ứng dụng Xray Collector đang được mở. Vui lòng kiểm tra khay hệ thống (System Tray).", 
                                "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
                Shutdown();
                return;
            }

            await _host.StartAsync();

            // 2. Khởi tạo System Tray
            var trayService = _host.Services.GetRequiredService<ITrayService>();
            trayService.Initialize();

            var mainWindow = _host.Services.GetRequiredService<MainWindow>();
            mainWindow.Show();

            base.OnStartup(e);
        }

        protected override async void OnExit(ExitEventArgs e)
        {
            _mutex?.ReleaseMutex();
            _mutex?.Dispose();

            await _host.StopAsync();
            _host.Dispose();

            base.OnExit(e);
        }
    }
}

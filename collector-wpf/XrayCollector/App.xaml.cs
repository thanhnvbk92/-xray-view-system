using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using XrayCollector.Services;
using XrayCollector.ViewModels;

namespace XrayCollector
{
    public partial class App : Application
    {
        private static readonly IHost _host = Host
            .CreateDefaultBuilder()
            .ConfigureServices((context, services) =>
            {
                // Services
                services.AddSingleton<ISettingsService, SettingsService>();
                services.AddSingleton<IUpdateService, UpdateService>();
                services.AddTransient<IApiService, ApiService>();
                services.AddTransient<IFileWatcherService, FileWatcherService>();
                services.AddHttpClient<IApiService, ApiService>();
                services.AddHttpClient<IUpdateService, UpdateService>();

                // ViewModels
                services.AddSingleton<MainViewModel>();

                // Windows
                services.AddSingleton<MainWindow>();
            })
            .Build();

        public static T GetService<T>() where T : class
            => _host.Services.GetService(typeof(T)) as T;

        protected override async void OnStartup(StartupEventArgs e)
        {
            await _host.StartAsync();

            var mainWindow = _host.Services.GetRequiredService<MainWindow>();
            mainWindow.Show();

            base.OnStartup(e);
        }

        protected override async void OnExit(ExitEventArgs e)
        {
            await _host.StopAsync();
            _host.Dispose();

            base.OnExit(e);
        }
    }
}

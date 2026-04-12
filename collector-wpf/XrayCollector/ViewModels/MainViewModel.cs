using CommunityToolkit.Mvvm.ComponentModel;
using XrayCollector.Services;

namespace XrayCollector.ViewModels
{
    public partial class MainViewModel : ObservableObject
    {
        [ObservableProperty] private HomeViewModel _home;
        [ObservableProperty] private SettingsViewModel _settings;

        public MainViewModel(
            IApiService apiService, 
            IFileWatcherService logWatcher, 
            ISettingsService settings, 
            IUpdateService updateService,
            ISyncPersistenceService persistence,
            IXray9730CollectorService xray9730Service)
        {
            // Khởi tạo các sub-ViewModels
            _home = new HomeViewModel(apiService, logWatcher, settings, updateService, persistence, xray9730Service);
            _settings = new SettingsViewModel(apiService, settings);
        }
    }
}

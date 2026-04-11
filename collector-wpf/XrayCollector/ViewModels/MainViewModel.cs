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
            IFileWatcherService imgWatcher, 
            IFileWatcherService logWatcher, 
            ISettingsService settings, 
            IUpdateService updateService,
            ISyncPersistenceService persistence)
        {
            // Khởi tạo các sub-ViewModels
            _home = new HomeViewModel(apiService, imgWatcher, logWatcher, settings, updateService, persistence);
            _settings = new SettingsViewModel(apiService, settings);
        }
    }
}

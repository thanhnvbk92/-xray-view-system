using CommunityToolkit.Mvvm.ComponentModel;
using XrayCollector.Services;

namespace XrayCollector.ViewModels
{
    public partial class MainViewModel : ObservableObject
    {
        [ObservableProperty] private object _currentView;
        [ObservableProperty] private HomeViewModel _home;
        [ObservableProperty] private SettingsViewModel _settings;

        public MainViewModel(
            IApiService apiService, 
            ISettingsService settings, 
            IUpdateService updateService,
            ISyncPersistenceService persistence,
            IXray9730CollectorService xray9730Service,
            IXray9020CollectorService xray9020Service,
            IXrayComService xrayComService)
        {
            // Initialize sub-ViewModels
            _home = new HomeViewModel(apiService, settings, updateService, persistence, xray9730Service, xray9020Service, xrayComService);
            _settings = new SettingsViewModel(apiService, settings);

            // Default view
            _currentView = _home;
        }

        [CommunityToolkit.Mvvm.Input.RelayCommand]
        private void Navigate(string destination)
        {
            if (destination == "Monitor" || destination == "Home")
                CurrentView = Home;
            else if (destination == "Settings")
                CurrentView = Settings;
        }
    }
}

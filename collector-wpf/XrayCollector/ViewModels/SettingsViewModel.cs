using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CommunityToolkit.Mvvm.Messaging;
using XrayCollector.Models;
using XrayCollector.Services;

namespace XrayCollector.ViewModels
{
    public partial class SettingsViewModel : ObservableObject
    {
        private readonly IApiService _apiService;
        private readonly ISettingsService _settings;

        [ObservableProperty] private string _tempMachineId;
        [ObservableProperty] private string _tempServerUrl;
        [ObservableProperty] private string _tempImagePath;
        [ObservableProperty] private string _tempLogPath;
        [ObservableProperty] private string _tempLogExtension;
        [ObservableProperty] private bool _tempIsPidMappingIncrease;
        
        [ObservableProperty] private ObservableCollection<LineDto> _lines = new();
        [ObservableProperty] private ObservableCollection<MachineDto> _allMachines = new();
        [ObservableProperty] private ObservableCollection<MachineDto> _filteredMachines = new();
        
        [ObservableProperty] private LineDto? _selectedLine;
        [ObservableProperty] private MachineDto? _selectedMachine;

        public SettingsViewModel(IApiService apiService, ISettingsService settings)
        {
            _apiService = apiService;
            _settings = settings;

            _settings.Load();
            _tempMachineId = _settings.MachineId;
            _tempServerUrl = _settings.ServerUrl;
            _tempImagePath = _settings.ImagePath;
            _tempLogPath = _settings.LogPath;
            _tempLogExtension = _settings.LogExtension;
            _tempIsPidMappingIncrease = _settings.IsPidMappingIncrease;

            LoadDataCommand.Execute(null);
        }

        [RelayCommand]
        private async Task LoadData()
        {
            if (string.IsNullOrEmpty(TempServerUrl)) return;
            
            var lines = await _apiService.GetLinesAsync();
            var machines = await _apiService.GetMachinesAsync();

            Lines = new ObservableCollection<LineDto>(lines);
            AllMachines = new ObservableCollection<MachineDto>(machines);
            
            if (!string.IsNullOrEmpty(TempMachineId))
            {
                var machine = AllMachines.FirstOrDefault(m => m.Id.ToString() == TempMachineId);
                if (machine != null)
                {
                    SelectedLine = Lines.FirstOrDefault(l => l.Id == machine.LineId);
                    SelectedMachine = machine;
                }
            }
        }

        partial void OnSelectedLineChanged(LineDto? value)
        {
            if (value == null)
            {
                FilteredMachines = new ObservableCollection<MachineDto>();
            }
            else
            {
                FilteredMachines = new ObservableCollection<MachineDto>(AllMachines.Where(m => m.LineId == value.Id));
            }
            SelectedMachine = null;
        }

        [RelayCommand]
        private void SaveSettings()
        {
            if (SelectedMachine == null)
            {
                MessageBox.Show("Vui lòng chọn Máy quét trước khi lưu!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            _settings.MachineId = SelectedMachine.Id.ToString();
            _settings.ServerUrl = TempServerUrl;
            _settings.ImagePath = TempImagePath;
            _settings.LogPath = TempLogPath;
            _settings.LogExtension = TempLogExtension;
            _settings.IsPidMappingIncrease = TempIsPidMappingIncrease;
            _settings.Save();

            TempMachineId = _settings.MachineId;

            MessageBox.Show("Đã lưu cài đặt thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
            
            // Gửi thông điệp cập nhật cho HomeViewModel
            WeakReferenceMessenger.Default.Send(new SettingsChangedMessage());
        }

        [RelayCommand]
        private void SelectFolder(string type)
        {
            var dialog = new Microsoft.Win32.OpenFolderDialog();
            if (dialog.ShowDialog() == true)
            {
                if (type == "img") TempImagePath = dialog.FolderName;
                else TempLogPath = dialog.FolderName;
            }
        }
    }
}

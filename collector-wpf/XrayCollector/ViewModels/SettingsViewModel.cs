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
        [ObservableProperty] private string _tempBackupPath;
        [ObservableProperty] private string _tempSubLogPath;
        [ObservableProperty] private string _tempLogExtension;
        [ObservableProperty] private string _tempSubLogExtension;
        [ObservableProperty] private bool _tempIsPidMappingIncrease;
        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(IsManualMappingConfigurationVisible))]
        private bool _tempIsManualPidMappingEnabled;
        [ObservableProperty] private string _detected9020Model = string.Empty;
        [ObservableProperty] private bool _isLoading;
        
        [ObservableProperty] private ObservableCollection<LineDto> _lines = new();
        [ObservableProperty] private ObservableCollection<MachineDto> _allMachines = new();
        [ObservableProperty] private ObservableCollection<MachineDto> _filteredMachines = new();
        
        [ObservableProperty] private LineDto? _selectedLine;
        
        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(IsMachine9020))]
        [NotifyPropertyChangedFor(nameof(IsManualMappingConfigurationVisible))]
        private MachineDto? _selectedMachine;

        public bool IsMachine9020 => SelectedMachine != null && 
            (SelectedMachine.MachineType?.Name?.Contains("9020") == true || 
             SelectedMachine.MachineType?.PartNo?.Contains("9020") == true);

        public bool IsManualMappingConfigurationVisible => IsMachine9020 && TempIsManualPidMappingEnabled;

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasSelectedModelMapping))]
        private ModelMappingConfig? _selectedModelMapping;

        public bool HasSelectedModelMapping => SelectedModelMapping != null;

        [ObservableProperty] private ObservableCollection<ModelMappingConfig> _tempModelMappings = new();
        [ObservableProperty] private ObservableCollection<UnitMappingItem> _currentUnitMappings = new();
        [ObservableProperty] private ObservableCollection<int> _availablePidIndices = new();
        [ObservableProperty] private string _tempUnitCount = "6";
        [ObservableProperty] private string _newModelName = string.Empty;

        public SettingsViewModel(IApiService apiService, ISettingsService settings)
        {
            _apiService = apiService;
            _settings = settings;

            _settings.Load();
            _tempMachineId = _settings.MachineId;
            _tempServerUrl = _settings.ServerUrl;
            _tempImagePath = _settings.ImagePath;
            _tempLogPath = _settings.LogPath;
            _tempBackupPath = _settings.BackupPath;
            _tempSubLogPath = _settings.SubLogPath;
            _tempLogExtension = _settings.LogExtension;
            _tempSubLogExtension = _settings.SubLogExtension;
            _tempIsPidMappingIncrease = _settings.IsPidMappingIncrease;
            _tempIsManualPidMappingEnabled = _settings.IsManualPidMappingEnabled;
            _detected9020Model = _settings.LastDetected9020Model;

            if (_settings.ModelMappings != null)
            {
                _tempModelMappings = new ObservableCollection<ModelMappingConfig>(_settings.ModelMappings);
            }

            if (_tempIsManualPidMappingEnabled && !string.IsNullOrWhiteSpace(_detected9020Model))
            {
                SelectedModelMapping = _tempModelMappings.FirstOrDefault(mapping =>
                    string.Equals(mapping.ModelName.Trim(), _detected9020Model.Trim(), StringComparison.OrdinalIgnoreCase));
            }

            LoadDataCommand.Execute(null);
        }

        [RelayCommand]
        private async Task LoadData()
        {
            if (string.IsNullOrEmpty(TempServerUrl)) return;

            // Chuẩn hóa URL
            string url = TempServerUrl.Trim();
            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
            {
                url = "http://" + url;
            }
            TempServerUrl = url.TrimEnd('/');

            IsLoading = true;
            try
            {
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
            catch (System.Exception ex)
            {
                WeakReferenceMessenger.Default.Send(new AddLogMessage($"[LỖI] Không thể kết nối tới máy chủ API: {ex.Message}"));
            }
            finally
            {
                IsLoading = false;
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

        partial void OnSelectedMachineChanged(MachineDto? value)
        {
            if (value != null && value.MachineType != null)
            {
                // Tự động gợi ý Log Extension từ cấu hình trung tâm nếu đang để mặc định hoặc trống
                if (string.IsNullOrEmpty(TempLogExtension) || TempLogExtension == ".log")
                {
                    TempLogExtension = value.MachineType.LogExtension;
                }
            }
        }

        partial void OnTempIsManualPidMappingEnabledChanged(bool value)
        {
            if (!value) return;

            Detected9020Model = _settings.LastDetected9020Model?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(Detected9020Model))
            {
                System.Windows.MessageBox.Show(
                    "Chưa đọc được JobFile/Model từ Xray 9020. Hãy chạy một board trước, sau đó mở lại phần cài đặt.",
                    "Chưa có Model", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var existing = TempModelMappings.FirstOrDefault(mapping =>
                string.Equals(mapping.ModelName.Trim(), Detected9020Model, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                SelectedModelMapping = existing;
                return;
            }

            NewModelName = Detected9020Model;
            System.Windows.MessageBox.Show(
                $"Model '{Detected9020Model}' chưa có cấu hình manual. Tên Model đã được điền sẵn; hãy bấm + để đăng ký rồi thiết lập mapping.",
                "Đăng ký Model mới", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        partial void OnSelectedModelMappingChanged(ModelMappingConfig? value)
        {
            if (value == null)
            {
                CurrentUnitMappings.Clear();
                _tempUnitCount = "6";
                OnPropertyChanged(nameof(TempUnitCount));
                AvailablePidIndices.Clear();
            }
            else
            {
                _tempUnitCount = value.UnitCount.ToString();
                OnPropertyChanged(nameof(TempUnitCount));
                
                UpdateAvailablePidIndices(value.UnitCount);
                
                CurrentUnitMappings.Clear();
                for (int i = 1; i <= value.UnitCount; i++)
                {
                    int pidIdx = value.Mappings.TryGetValue(i, out int mapped) ? mapped : i;
                    var item = new UnitMappingItem { UnitIndex = i, PidIndex = pidIdx };
                    item.PropertyChanged += (s, e) =>
                    {
                        if (e.PropertyName == nameof(UnitMappingItem.PidIndex) && SelectedModelMapping != null)
                        {
                            SelectedModelMapping.Mappings[item.UnitIndex] = item.PidIndex;
                        }
                    };
                    CurrentUnitMappings.Add(item);
                }
            }
        }

        partial void OnTempUnitCountChanged(string value)
        {
            if (SelectedModelMapping == null) return;

            if (int.TryParse(value, out int count) && count >= 1 && count <= 100)
            {
                SelectedModelMapping.UnitCount = count;
                UpdateAvailablePidIndices(count);
                
                // Điều chỉnh danh sách CurrentUnitMappings
                if (CurrentUnitMappings.Count < count)
                {
                    int start = CurrentUnitMappings.Count + 1;
                    for (int i = start; i <= count; i++)
                    {
                        int pidIdx = SelectedModelMapping.Mappings.TryGetValue(i, out int mapped) ? mapped : i;
                        var item = new UnitMappingItem { UnitIndex = i, PidIndex = pidIdx };
                        item.PropertyChanged += (s, e) =>
                        {
                            if (e.PropertyName == nameof(UnitMappingItem.PidIndex) && SelectedModelMapping != null)
                            {
                                SelectedModelMapping.Mappings[item.UnitIndex] = item.PidIndex;
                            }
                        };
                        CurrentUnitMappings.Add(item);
                    }
                }
                else if (CurrentUnitMappings.Count > count)
                {
                    while (CurrentUnitMappings.Count > count)
                    {
                        CurrentUnitMappings.RemoveAt(CurrentUnitMappings.Count - 1);
                    }
                }
                
                // Đảm bảo các PidIndex hiện tại không vượt quá giới hạn count mới
                foreach (var item in CurrentUnitMappings)
                {
                    if (item.PidIndex > count)
                    {
                        item.PidIndex = count;
                    }
                }
            }
        }

        private void UpdateAvailablePidIndices(int count)
        {
            AvailablePidIndices.Clear();
            for (int i = 1; i <= count; i++)
            {
                AvailablePidIndices.Add(i);
            }
        }

        [RelayCommand]
        private void AddModel()
        {
            if (string.IsNullOrWhiteSpace(NewModelName))
            {
                System.Windows.MessageBox.Show("Vui lòng nhập tên Model mới!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            string modelName = NewModelName.Trim();
            if (TempModelMappings.Any(m => m.ModelName.Equals(modelName, StringComparison.OrdinalIgnoreCase)))
            {
                System.Windows.MessageBox.Show("Model này đã tồn tại cấu hình!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var newMapping = new ModelMappingConfig
            {
                ModelName = modelName,
                UnitCount = 6,
                Mappings = new Dictionary<int, int>()
            };
            
            for (int i = 1; i <= 6; i++)
            {
                newMapping.Mappings[i] = i;
            }

            TempModelMappings.Add(newMapping);
            SelectedModelMapping = newMapping;
            NewModelName = string.Empty;
        }

        [RelayCommand]
        private void DeleteModel()
        {
            if (SelectedModelMapping == null)
            {
                System.Windows.MessageBox.Show("Vui lòng chọn Model cần xóa!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var result = System.Windows.MessageBox.Show($"Bạn có chắc chắn muốn xóa cấu hình của Model {SelectedModelMapping.ModelName} không?", "Xác nhận xóa", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (result == MessageBoxResult.Yes)
            {
                TempModelMappings.Remove(SelectedModelMapping);
                SelectedModelMapping = null;
            }
        }

        [RelayCommand]
        private void SaveSettings()
        {
            if (SelectedMachine == null)
            {
                //    MessageBox.Show("Vui lòng chọn Máy quét trước khi lưu!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);

                //    return;
            }
            else
            {
                _settings.MachineId = SelectedMachine.Id.ToString();
            }

            if (SelectedModelMapping != null)
            {
                SelectedModelMapping.Mappings.Clear();
                foreach (var item in CurrentUnitMappings)
                {
                    SelectedModelMapping.Mappings[item.UnitIndex] = item.PidIndex;
                }
            }

            _settings.ServerUrl = TempServerUrl;
            _settings.ImagePath = TempImagePath;
            _settings.LogPath = TempLogPath;
            _settings.BackupPath = TempBackupPath;
            _settings.SubLogPath = TempSubLogPath;
            _settings.LogExtension = TempLogExtension;
            _settings.SubLogExtension = TempSubLogExtension;
            _settings.IsPidMappingIncrease = TempIsPidMappingIncrease;
            _settings.IsManualPidMappingEnabled = TempIsManualPidMappingEnabled;
            _settings.ModelMappings = TempModelMappings.ToList();
            _settings.Save();

            TempMachineId = _settings.MachineId;

            System.Windows.MessageBox.Show("Đã lưu cài đặt thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);
            
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
                else if (type == "log") TempLogPath = dialog.FolderName;
                else if (type == "backup") TempBackupPath = dialog.FolderName;
                else if (type == "sublog") TempSubLogPath = dialog.FolderName;
            }
        }
    }
}

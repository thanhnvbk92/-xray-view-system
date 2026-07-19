using System.Collections.Generic;
using CommunityToolkit.Mvvm.ComponentModel;

namespace XrayCollector.Models
{
    public class ModelMappingConfig
    {
        public string ModelName { get; set; } = string.Empty;
        public int UnitCount { get; set; } = 6;
        public Dictionary<int, int> Mappings { get; set; } = new();
    }

    public class UnitMappingItem : ObservableObject
    {
        private int _unitIndex;
        public int UnitIndex
        {
            get => _unitIndex;
            set => SetProperty(ref _unitIndex, value);
        }

        private int _pidIndex;
        public int PidIndex
        {
            get => _pidIndex;
            set => SetProperty(ref _pidIndex, value);
        }
    }
}

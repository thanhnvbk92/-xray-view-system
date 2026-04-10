using System.Windows;
using XrayCollector.ViewModels;

namespace XrayCollector
{
    public partial class MainWindow : Window
    {
        public MainWindow(MainViewModel viewModel)
        {
            DataContext = viewModel;
            InitializeComponent();
        }
    }
}
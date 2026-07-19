using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Threading;
using System.Linq;

namespace XrayUpdater
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.Title = "Xray Collector - Cap nhat he thong";
            Console.WriteLine("======================================");
            Console.WriteLine("   DANG CAP NHAT XRAY COLLECTOR       ");
            Console.WriteLine("======================================");

            Console.WriteLine($"[DEBUG] Received {args.Length} arguments:");
            for (int i = 0; i < args.Length; i++)
            {
                Console.WriteLine($"  [{i}]: {args[i]}");
            }

            if (args.Length < 4)
            {
                Console.WriteLine("\nUsage: XrayUpdater.exe <zipPath> <destDir> <mainAppPid> <mainExePath>");
                Console.WriteLine("\nNhan phim bat ky de thoat...");
                Console.ReadKey();
                return;
            }

            string zipPath = args[0];
            string destDir = args[1];
            string pidStr = args[2];
            string mainExePath = args[3];

            // 1. Cho ung dung chinh thoat
            if (int.TryParse(pidStr, out int mainPid))
            {
                Console.WriteLine($"- Dang doi ung dung (PID: {mainPid}) ket thuc...");
                try
                {
                    var process = Process.GetProcessById(mainPid);
                    if (!process.WaitForExit(5000))
                    {
                        Console.WriteLine("- Ung dung khong phan hoi, dang cuong che dong...");
                        process.Kill();
                        Thread.Sleep(1000);
                    }
                }
                catch (ArgumentException) { /* Da thoat */ }
                catch (Exception ex) { Console.WriteLine($"! Loi khi doi ung dung: {ex.Message}"); }
            }

            // 2. Giải nén file ZIP
            Console.WriteLine($"- Dang giai nen ban cap nhat: {Path.GetFileName(zipPath)}");
            int retries = 5;
            bool success = false;
            while (retries > 0)
            {
                try
                {
                    using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destinationPath = Path.GetFullPath(Path.Combine(destDir, entry.FullName));
                            
                            // Đảm bảo thư mục tồn tại
                            string? dir = Path.GetDirectoryName(destinationPath);
                            if (dir != null && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

                            if (string.IsNullOrEmpty(entry.Name)) continue; // Là thư mục

                            try
                            {
                                entry.ExtractToFile(destinationPath, overwrite: true);
                            }
                            catch (IOException ex) when (entry.Name.Equals("XrayUpdater.exe", StringComparison.OrdinalIgnoreCase))
                            {
                                // Bỏ qua nếu là chính nó đang chạy
                                Console.WriteLine("  > Dang dung ban Updater hiện tại (bo qua file locked)");
                            }
                        }
                    }
                    success = true;
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"! Giai nen that bai, dang thu lai... Lần {6-retries}: {ex.Message}");
                    Thread.Sleep(2000);
                    retries--;
                }
            }

            if (!success)
            {
                Console.WriteLine("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                Console.WriteLine("CAP NHAT THAT BAI! Khong the ghi de file.");
                Console.WriteLine("Vui long dong tat ca cac cua so Xray va thu lai.");
                Console.WriteLine("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                Console.WriteLine("\nNhan phim bat ky de thoat...");
                Console.ReadKey();
                return;
            }

            // 3. Khoi dong lai ung dung
            Console.WriteLine("- Dang khoi dong lai ung dung...");
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = mainExePath,
                    UseShellExecute = true,
                    WorkingDirectory = destDir
                });
                Console.WriteLine("- Da khoi dong thanh cong.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"! Khong the khoi dong lai ung dung: {ex.Message}");
                Console.WriteLine($"Duong dan: {mainExePath}");
                Console.ReadKey();
            }

            Console.WriteLine("\nCap nhat hoan tat! Cua so nay se tu dong dong.");
            Thread.Sleep(2000);
        }
    }
}

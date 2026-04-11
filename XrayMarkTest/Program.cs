using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using OpenCvSharp;

namespace XrayMarkTest
{
    class Program
    {
        static void Main(string[] args)
        {
            // Danh sách bộ dữ liệu
            string[] testFolders = {
                @"d:\1. Project\Xray View System\20260412000029_604HS119327\1",
                @"d:\1. Project\Xray View System\20260411200733_604HS101290\1"
            };

            for (int i = 0; i < testFolders.Length; i++)
            {
                string baseDir = testFolders[i];
                string xmlPath = Path.Combine(baseDir, "r.xml");
                string imgPath = Path.Combine(baseDir, "r.tif");
                string maskPath = Path.Combine(baseDir, "r_mask.tif");
                string outputName = $"blended_result_csharp_test_{i + 1}.jpg";
                string outputPath = Path.Combine(@"d:\1. Project\Xray View System", outputName);
                string artifactOutput = Path.Combine(@"C:\Users\Administrator\.gemini\antigravity\brain\fd0e7b8b-ff65-4521-9840-11deb36a23f6", outputName);

                try
                {
                    Console.WriteLine($"\nProcessing Set {i + 1}: {baseDir}");
                    using var img = Cv2.ImRead(imgPath);
                    using var mask = Cv2.ImRead(maskPath, ImreadModes.Grayscale);

                    if (img.Empty() || mask.Empty())
                    {
                        Console.WriteLine("Error: Could not load images.");
                        continue;
                    }

                    // 1. Đọc XML
                    var xDoc = XDocument.Load(xmlPath);
                    var pins = new List<PinData>();
                    foreach (var pinElement in xDoc.Descendants("PIN"))
                    {
                        var loc = pinElement.Element("LOCATION");
                        if (loc != null)
                        {
                            pins.Add(new PinData
                            {
                                Rect = new Rect(
                                    int.Parse(loc.Attribute("X").Value),
                                    int.Parse(loc.Attribute("Y").Value),
                                    int.Parse(loc.Attribute("W").Value),
                                    int.Parse(loc.Attribute("H").Value)
                                ),
                                Result = pinElement.Attribute("RESULT")?.Value ?? "0"
                            });
                        }
                    }

                    // 2. Tìm Contours
                    using var thresh = new Mat();
                    Cv2.Threshold(mask, thresh, 0, 255, ThresholdTypes.Binary);
                    Cv2.FindContours(thresh, out var contours, out _, RetrievalModes.List, ContourApproximationModes.ApproxSimple);
                    Console.WriteLine($"Found {contours.Length} contours.");

                    // 3. So khớp và vẽ
                    foreach (var cnt in contours)
                    {
                        var bRect = Cv2.BoundingRect(cnt);
                        var centerX = bRect.X + bRect.Width / 2;
                        var centerY = bRect.Y + bRect.Height / 2;

                        string matchedResult = "0";
                        foreach (var pin in pins)
                        {
                            if (pin.Rect.Contains(centerX, centerY))
                            {
                                matchedResult = pin.Result;
                                break;
                            }
                        }

                        // BGR: Green (0, 255, 0), Red (0, 0, 255)
                        var color = (matchedResult != "0") ? new Scalar(0, 0, 255) : new Scalar(0, 255, 0);
                        Cv2.DrawContours(img, new[] { cnt }, -1, color, 2);
                    }

                    // 4. Lưu kết quả
                    Cv2.ImWrite(outputPath, img);
                    Cv2.ImWrite(artifactOutput, img);
                    Console.WriteLine($"SUCCESS: Result saved to {outputName}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"ERROR: {ex.Message}");
                }
            }
        }
    }

    class PinData
    {
        public Rect Rect { get; set; }
        public string Result { get; set; }
    }
}

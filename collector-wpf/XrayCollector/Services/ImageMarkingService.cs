using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using OpenCvSharp;
using Microsoft.Extensions.Logging;

namespace XrayCollector.Services
{
    public interface IImageMarkingService
    {
        /// <summary>
        /// Xử lý vẽ Outline và Voids cho ảnh X-Ray máy 9730
        /// </summary>
        /// <param name="originPath">Đường dẫn ảnh gốc (.tif)</param>
        /// <param name="maskPath">Đường dẫn ảnh mask (.tif)</param>
        /// <param name="xmlPath">Đường dẫn file XML shot (r.xml)</param>
        /// <param name="outputPath">Đường dẫn lưu kết quả (.jpg)</param>
        /// <returns>Thành công hay thất bại</returns>
        bool MarkImage(string originPath, string maskPath, string xmlPath, string outputPath);
    }

    public class ImageMarkingService : IImageMarkingService
    {
        private readonly ILogger<ImageMarkingService> _logger;

        public ImageMarkingService(ILogger<ImageMarkingService> logger)
        {
            _logger = logger;
        }

        public bool MarkImage(string originPath, string maskPath, string xmlPath, string outputPath)
        {
            try
            {
                if (!File.Exists(originPath) || !File.Exists(maskPath) || !File.Exists(xmlPath))
                {
                    _logger.LogWarning("Thiếu file để xử lý ảnh: {Origin}, {Mask}, {Xml}", originPath, maskPath, xmlPath);
                    return false;
                }

                // 1. Đọc dữ liệu XML
                var pins = ParseXmlPins(xmlPath);
                
                // 2. Load ảnh (OpenCV)
                using var img = Cv2.ImRead(originPath);
                using var mask = Cv2.ImRead(maskPath, ImreadModes.Grayscale);

                if (img.Empty() || mask.Empty())
                {
                    _logger.LogError("Không thể load được ảnh bằng OpenCV: {Path}", originPath);
                    return false;
                }

                // 3. Xử lý Mask và tìm Contours
                using var thresh = new Mat();
                Cv2.Threshold(mask, thresh, 0, 255, ThresholdTypes.Binary);
                
                // Sử dụng RetrievalModes.List để lấy cả các lỗ hổng (Voids) bên trong
                Cv2.FindContours(thresh, out var contours, out _, RetrievalModes.List, ContourApproximationModes.ApproxSimple);

                // 4. So khớp và vẽ
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

                    // BGR: Green (0, 255, 0) if OK, Red (0, 0, 255) if NG
                    var color = (matchedResult != "0") ? new Scalar(0, 0, 255) : new Scalar(0, 255, 0);
                    
                    // Độ dày 2px như yêu cầu
                    Cv2.DrawContours(img, new[] { cnt }, -1, color, 2);
                }

                // 5. Lưu kết quả JPEG (Chất lượng cao để giảm dung lượng nhưng vẫn nét)
                Cv2.ImWrite(outputPath, img, new ImageEncodingParam(ImwriteFlags.JpegQuality, 90));
                
                _logger.LogInformation("Đã xử lý xong ảnh Marked: {Output}", outputPath);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi xử lý vẽ Outline cho ảnh: {Path}", originPath);
                return false;
            }
        }

        private List<PinData> ParseXmlPins(string xmlPath)
        {
            var pins = new List<PinData>();
            try
            {
                var xDoc = XDocument.Load(xmlPath);
                foreach (var pinElement in xDoc.Descendants("PIN"))
                {
                    var loc = pinElement.Element("LOCATION");
                    if (loc != null)
                    {
                        pins.Add(new PinData
                        {
                            Rect = new Rect(
                                int.Parse(loc.Attribute("X")?.Value ?? "0"),
                                int.Parse(loc.Attribute("Y")?.Value ?? "0"),
                                int.Parse(loc.Attribute("W")?.Value ?? "0"),
                                int.Parse(loc.Attribute("H")?.Value ?? "0")
                            ),
                            Result = pinElement.Attribute("RESULT")?.Value ?? "0"
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi khi parse file XML: {Path}", xmlPath);
            }
            return pins;
        }

        private class PinData
        {
            public Rect Rect { get; set; }
            public string Result { get; set; }
        }
    }
}

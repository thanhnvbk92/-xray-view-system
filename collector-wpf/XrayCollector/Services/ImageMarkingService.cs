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
                bool hasMask = File.Exists(maskPath);
                if (!File.Exists(originPath) || !File.Exists(xmlPath))
                {
                    _logger.LogWarning("Thiếu file để xử lý ảnh: {Origin}, {Xml}", originPath, xmlPath);
                    return false;
                }

                // 1. Đọc dữ liệu XML
                var pins = ParseXmlPins(xmlPath);
                
                // 2. Load ảnh gốc
                using var img = Cv2.ImRead(originPath);
                if (img.Empty())
                {
                    _logger.LogError("Không thể load được ảnh gốc bằng OpenCV: {Path}", originPath);
                    return false;
                }

                if (hasMask)
                {
                    // 3. Xử lý Mask và tìm Contours (Logic cũ)
                    using var mask = Cv2.ImRead(maskPath, ImreadModes.Grayscale);
                    if (mask.Empty())
                    {
                        _logger.LogError("Không thể load được ảnh mask mặc dù file tồn tại: {Path}", maskPath);
                        return false;
                    }

                    using var thresh = new Mat();
                    Cv2.Threshold(mask, thresh, 0, 255, ThresholdTypes.Binary);
                    Cv2.FindContours(thresh, out var contours, out _, RetrievalModes.List, ContourApproximationModes.ApproxSimple);

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

                        var color = (matchedResult != "0") ? new Scalar(0, 0, 255) : new Scalar(0, 255, 0);
                        Cv2.DrawContours(img, new[] { cnt }, -1, color, 2);
                    }
                }
                else
                {
                    // 4. Vẽ trực tiếp từ XML (Logic mới khi thiếu Mask)
                    _logger.LogInformation("Không tìm thấy Mask, tiến hành vẽ trực tiếp từ tọa độ XML cho file: {Origin}", originPath);
                    foreach (var pin in pins)
                    {
                        var color = (pin.Result != "0") ? new Scalar(0, 0, 255) : new Scalar(0, 255, 0);
                        
                        // Vẽ hình chữ nhật theo tọa độ và kích thước trong XML
                        // OpenCvSharp Rect(x, y, width, height)
                        Cv2.Rectangle(img, new Rect((int)pin.Rect.X, (int)pin.Rect.Y, (int)pin.Rect.Width, (int)pin.Rect.Height), color, 2);
                    }
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

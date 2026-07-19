# Xray View System - System Knowledge & Context Repository

Tài liệu này được tạo ra để lưu trữ toàn bộ "trí nhớ" của hệ thống, giúp các AI assistant khác có thể tiếp nối công việc một cách chính xác mà không cần hỏi lại người dùng.

## 1. Tổng quan Kiến trúc (Architecture Overview)
- **Frontend**: WPF (.NET 9) sử dụng Material Design In Xaml và CommunityToolkit.Mvvm.
- **Backend**: FastAPI (Python 3.12+) với SQLAlchemy.
- **Database**: MySQL (Primary). Đang triển khai tối ưu hóa bằng Partitioning và Summary Tables.
- **Dòng chảy dữ liệu**: Collector (WPF) -> API -> MySQL -> Dashboard (Web/Analysis).

## 2. Nhật ký Tối ưu hóa (Optimization Log)

### Giai đoạn 1: MySQL Hardening (Hoàn thành - 2026-04-29)
- **Giải pháp**:
    - **Partitioning**: Bảng `pcbs` đã được phân vùng theo dải (Range Partitioning) dựa trên `client_time` hàng tháng.
    - **Summary Tables**: Triển khai bảng `daily_stats` và Stored Procedure `refresh_daily_stats` để tự động hóa việc tổng hợp dữ liệu.
    - **Khóa ngoại**: Các khóa ngoại trên bảng `pcbs` và `pcb_images` đã được gỡ bỏ để hỗ trợ Partitioning (quản lý tính toàn vẹn ở mức ứng dụng).

### Giai đoạn 2: API & Background Optimization (Hoàn thành - 2026-04-29)
- **Giải pháp**:
    - **Fast Analysis API**: Endpoint `/summary` đã được cập nhật để ưu tiên đọc từ `daily_stats` thay vì quét bảng `pcbs` lớn (tốc độ tăng ~50-100x).
    - **Auto-Refresh**: Tích hợp `BackgroundTasks` trong FastAPI để tự động gọi Procedure cập nhật thống kê ngay khi có dữ liệu mới hoặc xác nhận từ người dùng.
- **Trạng thái**: Đã triển khai và kiểm tra trên môi trường local.

## 3. Các thực thể dữ liệu quan trọng (Key Entities)
- `PCB`: Lưu thông tin board, kết quả máy, kết quả AI, kết quả User.
- `PCBImage`: Lưu đường dẫn ảnh và kết quả phân tích từng shot ảnh.
- `Machine`: Quản lý thông tin máy quét và trạng thái kết nối.

## 4. Hướng dẫn cho AI kế tiếp (Instructions for Next AI)
- **Về Database**: Tuyệt đối không thay đổi schema mà không chạy migration script. Giữ MySQL làm "Source of Truth".
- **Về Code Style**: Tuân thủ mẫu MVVM cho WPF và Dependency Injection cho FastAPI.
- **Về Caching**: Sử dụng Redis (nếu đã triển khai) thay vì in-memory dict cho các endpoint thống kê.

---
*Tài liệu này sẽ được cập nhật liên tục sau mỗi giai đoạn hoàn thành.*

# Xray View System - Nhật ký yêu cầu (System Records)

Tài liệu này ghi lại toàn bộ lộ trình phát triển và các yêu cầu kỹ thuật quan trọng của hệ thống Xray View System.

## Lịch sử yêu cầu

### Phiên làm việc: 11/04/2026 - Tối ưu hóa Dashboard và Xray Collector
- **Yêu cầu 1**: Hoán đổi vị trí các biểu đồ trên trang Analysis (Job, Shot, Array Index). [Hoàn thành]
- **Yêu cầu 2**: Điều chỉnh Dashboard chính: Chuyển tên máy và số lượng NG sang dạng cột, nén thẻ máy xuống 32px để tăng mật độ hiển thị. [Hoàn thành]
- **Yêu cầu 3**: Sửa lỗi Xray Collector không hiển thị danh sách máy trong phần Settings. [Hoàn thành]

### Phiên làm việc: 11/04/2026 - Tối ưu hóa GPU và Quy trình nén ảnh
- **Yêu cầu 4**: Tận dụng 2 card đồ họa NVIDIA GTX TiTANX để tăng tốc nén ảnh tối đa. [Hoàn thành]
- **Yêu cầu 5**: Chỉ thực hiện nén ảnh đối với PCB là NG sau khi người dùng đã xác nhận (Confirm). Ảnh chưa xác nhận phải giữ nguyên chất lượng gốc. [Hoàn thành]
- **Yêu cầu 6**: Sửa lỗi không hiển thị ảnh của các PCB gần nhất trên trang xác nhận. [Hoàn thành]
- **Yêu cầu 7**: Sau khi nén thành công, thực hiện xóa ảnh gốc để tiết kiệm dung lượng. [Hoàn thành]
- **Yêu cầu 8**: Ghi nhật ký yêu cầu vào file RECORDS.md. [Hoàn thành]
- **Yêu cầu 9**: Bổ sung cấu hình `IMAGE_QUALITY` trong `config.py` để tùy chỉnh mức độ nén. [Hoàn thành]

## Cấu trúc lưu trữ hình ảnh
- **Thư mục Tạm (Upload)**: `data/images` - Lưu trữ ảnh gốc chất lượng cao từ máy quét.
- **Thư mục Lưu trữ (Storage)**: `D:\3.Xray Image\storage` - Lưu trữ ảnh đã nén sau khi được xác nhận hoặc với sản phẩm OK.
- **Tiêu chuẩn nén**: Mặc định 75% (Có thể cấu hình trong `config.py`).
- **Quy tắc**: 
    - Sản phẩm OK: Nén ngay khi upload.
    - Sản phẩm NG: Giữ nguyên tại thư mục Tạm cho đến khi Confirm. Sau khi Confirm mới nén và di chuyển sang thư mục Lưu trữ. 
    - Xóa ảnh gốc sau khi nén thành công.

### Phiên làm việc: 11/04/2026 - Nâng cấp Turbo Mode (Siêu tốc)
- **Yêu cầu 10**: Chuyển đổi công nghệ từ xử lý tuần tự sang **song song hoàn toàn** (Parallel Processing). [Hoàn thành]
- **Yêu cầu 11**: Tăng số lượng Worker lên 12 để tận dụng tối đa 16 luồng CPU. [Hoàn thành]
- **Yêu cầu 12**: Loại bỏ bước trung chuyển GPU dư thừa cho nén JPEG để giải phóng băng thông I/O. [Hoàn thành]
- **Kết quả**: Tốc độ nén đạt mức ms cho mỗi ảnh, đáp ứng tốt lưu lượng ảnh lớn từ máy quét Xray. [Hoàn thành]

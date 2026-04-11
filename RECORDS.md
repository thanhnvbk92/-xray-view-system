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

### Phiên làm việc: 11/04/2026 - Sửa lỗi đồng bộ ảnh từ Collector
- **Yêu cầu 13**: Khắc phục lỗi Collector không tìm thấy ảnh do sai Search Pattern (thiếu dấu gạch dưới trước timestamp). [Hoàn thành]
- **Yêu cầu 14**: Đồng bộ lại logic tìm kiếm để hỗ trợ mọi định dạng tên file bắt đầu bằng Timestamp. [Hoàn thành]

### Phiên làm việc: 11/04/2026 - Hoàn thiện hệ thống Cập nhật tự động (Auto-Update)
- **Yêu cầu 15**: Chuyển đổi logic Backend từ "phiên bản viết cứng" sang "phiên bản động" đọc từ file `version.json`. [Hoàn thành]
- **Yêu cầu 16**: Hướng dẫn quy trình triển khai bản cập nhật mới lên Server. [Hoàn thành]
- **Yêu cầu 17**: Sửa lỗi Route `/api/version` (loại bỏ prefix `/system` để khớp với Collector). [Hoàn thành]
- **Yêu cầu 18**: Tối ưu hóa trang Confirm (Turbo Load) bằng kỹ thuật `joinedload`, Index và Phân trang. [Hoàn thành]
- **Yêu cầu 19**: Sửa lỗi nút xác nhận OK không phản hồi (Bổ sung WebSocket Broadcast và đồng bộ hóa `machine_result`). [Hoàn thành]
- **Yêu cầu 20**: Sửa lỗi 405 Method Not Allowed tận gốc tại Frontend (`MachineDetail.jsx`), gọi đúng API `/api/pcbs/confirm-image`. [Hoàn thành]
- **Yêu cầu 21**: Hiển thị tổng số lượng PCB chờ duyệt thực tế trên trang chi tiết máy (thay vì bị giới hạn ở con số 50). [Hoàn thành]

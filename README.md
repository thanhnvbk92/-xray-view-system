# Xray View System

Hệ thống giám sát và phân tích dữ liệu máy quét X-Ray thời gian thực dành cho dây chuyền sản xuất PCB.

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-1.1.0-blue)
![Tech](https://img.shields.io/badge/Tech-FastAPI%20|%20React%20|%20WPF-orange)

## 🌟 Tổng quan
Xray View System là một giải pháp toàn diện bao gồm:
*   **Collector (C# WPF)**: Chạy tại máy khách, giám sát log máy quét và đẩy dữ liệu (ảnh + kết quả) lên server.
*   **Backend (FastAPI)**: Hệ thống trung tâm xử lý dữ liệu, quản lý Database, hỗ trợ AI analysis và cung cấp API.
*   **Frontend (React)**: Giao diện web hiện đại, Dashboard thời gian thực và các biểu đồ phân tích tương quan chuyên sâu.

## 🚀 Tính năng chính
- **Dashboard Real-time**: Theo dõi trạng thái Online/Offline của máy và tỉ lệ lỗi NG ngay lập tức qua WebSocket.
- **Phân tích tương quan (Advanced Analysis)**: 
    - Thống kê lỗi theo từng Máy, từng mã Job.
    - **Shot Heatmap**: Phân tích vị trí lỗi trên bản mạch dựa trên tên ảnh.
    - **Array Analysis**: Theo dõi lỗi theo vị trí trong mảng (panel).
    - Xu hướng vận hành 7 ngày gần nhất.
- **Quản lý thiết bị**: Quản lý danh sách máy, Line sản xuất và loại máy.
- **Truy vết (Traceability)**: Tìm kiếm lịch sử quét theo PID, thời gian hoặc kết quả.
- **Tự động cập nhật**: Hệ thống Collector tích hợp sẵn tính năng kiểm tra phiên bản mới từ Server.

## 🛠 Công nghệ sử dụng
### Backend
- **Core**: Python 3.12+, FastAPI
- **Database**: MySQL (SQLAlchemy ORM)
- **Security**: JWT Authentication, Passlib (PBKDF2)
- **Real-time**: WebSockets

### Frontend (Web)
- **Library**: React.js (Vite)
- **Charts**: Recharts
- **Icons**: Lucide-react
- **Styling**: Vanilla CSS (Premium Glassmorphism Design)

### Collector (App)
- **Framework**: WPF (.NET Core)
- **Pattern**: MVVM
- **Communication**: HttpClient (REST API)

## 📁 Cấu trúc thư mục
```text
Xray View System/
├── backend/            # FastAPI Source code
│   ├── app/            # Main application logic
│   └── static/         # Downloads & Uploaded images
├── frontend/           # React Source code
├── collector-wpf/      # C# WPF Source code
├── scripts/            # Test & Utility scripts
├── data/               # Thư mục chứa dữ liệu local (ignore in git)
└── start_backend.ps1   # Script khởi chạy nhanh Backend
```

## ⚙️ Cài đặt & Khởi chạy

### 1. Backend
Yêu cầu Python 3.12+ và MySQL.
1. Cài đặt thư viện:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Chạy script khởi động:
   ```powershell
   ./start_backend.ps1
   ```
*Server sẽ chạy tại: `http://localhost:8000`*

### 2. Frontend
1. Cài đặt dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Chạy chế độ Dev:
   ```bash
   npm run dev
   ```

### 3. Collector
1. Mở giải pháp `XrayCollector.sln` trong Visual Studio.
2. Build và Run ứng dụng.

## 📝 License
Dự án được phát triển cho mục đích quản lý sản xuất nội bộ.

---
*Phát triển bởi [thanhnvbk92](https://github.com/thanhnvbk92)*

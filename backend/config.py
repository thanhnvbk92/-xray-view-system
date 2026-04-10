import os

# Thư mục gốc của Backend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Thư mục lưu trữ dữ liệu (ngoài source code)
DATA_ROOT = os.path.join(os.path.dirname(BASE_DIR), "data")

# Các đường dẫn cụ thể
UPLOAD_DIR = os.path.join(DATA_ROOT, "images")
STORAGE_DIR = r"\\10.7.12.61\3.Xray Image\storage" # Ổ mạng đã sửa cú pháp

# DOWNLOAD và FRONTEND
DOWNLOAD_DIR = os.path.join(BASE_DIR, "static/downloads")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend/dist")

# Cấu hình Engine xử lý (Tạm thời chuyển về CPU để sửa lỗi crash)
IMAGE_ENGINE = os.getenv("IMAGE_ENGINE", "CPU") 

# Đảm bảo các thư mục tồn tại
os.makedirs(UPLOAD_DIR, exist_ok=True)
# os.makedirs(STORAGE_DIR, exist_ok=True) # Chỉ tạo nếu folder mẹ tồn tại
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

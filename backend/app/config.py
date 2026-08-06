import os

# Thư mục gốc của Backend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Thư mục gốc dự án (Xray View System)
PROJECT_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))

# Cấu hình MES Oracle DB
MES_DB_HOST = "10.7.10.56"
MES_DB_PORT = 1521
MES_DB_USER = "INFINITY21_JSMES"
MES_DB_PASS = "INFINITY21_JSMES"
MES_DB_SERVICE = "HSEVNPDB"

# Thư mục lưu trữ dữ liệu (ngoài source code)
DATA_ROOT = os.path.join(PROJECT_ROOT, "data")

# Các đường dẫn cụ thể
UPLOAD_DIR = os.path.join(DATA_ROOT, "images")
STORAGE_DIR = r"D:\3.Xray Image\storage" 

# DOWNLOAD và FRONTEND
DOWNLOAD_DIR = os.path.join(BASE_DIR, "static/downloads")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend/dist")

# Cấu hình Engine xử lý (Mặc định chuyển về nén bằng CPU Turbo)
IMAGE_ENGINE = os.getenv("IMAGE_ENGINE", "CPU").upper()
GPU_COUNT = int(os.getenv("GPU_COUNT", "2"))
IMAGE_TARGET_KB = int(os.getenv("IMAGE_TARGET_KB", "200"))
IMAGE_STRICT_TARGET = os.getenv("IMAGE_STRICT_TARGET", "false").lower() in {"1", "true", "yes"}
IMAGE_QUALITY = int(os.getenv("IMAGE_QUALITY", "50"))

# Tự động giới hạn số worker CPU (để lại ít nhất 4 cores cho hệ thống/FastAPI/SignalR)
_cpu_count = os.cpu_count() or 8
_default_workers = max(2, _cpu_count - 4)
IMAGE_WORKERS = int(os.getenv("IMAGE_WORKERS", str(_default_workers)))
IMAGE_BACKLOG_BATCH_SIZE = int(os.getenv("IMAGE_BACKLOG_BATCH_SIZE", "2000"))
IMAGE_BACKLOG_SCAN_INTERVAL_SECONDS = float(os.getenv("IMAGE_BACKLOG_SCAN_INTERVAL_SECONDS", "2"))
IMAGE_VERBOSE_LOG = os.getenv("IMAGE_VERBOSE_LOG", "false").lower() in {"1", "true", "yes"}

# Đảm bảo các thư mục tồn tại
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

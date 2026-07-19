from sqlalchemy import create_engine, text
import sys
import os

# Add parent directory to path to import app.database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import DATABASE_URL

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE pcb_images ADD COLUMN cause VARCHAR(255) DEFAULT NULL AFTER user_result"))
        conn.commit()
        print("Thêm cột cause vào bảng pcb_images thành công!")
    except Exception as e:
        print(f"Lỗi hoặc cột đã tồn tại: {e}")

from sqlalchemy import create_engine, text
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import DATABASE_URL

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        # Thêm từng cột một để tránh lỗi nếu một trong hai đã tồn tại
        cols = [
            "ALTER TABLE pcb_images ADD COLUMN confirmed_by_id INT NULL",
            "ALTER TABLE pcb_images ADD COLUMN confirmed_at DATETIME NULL",
            "CREATE INDEX ix_pcb_images_confirmed_by_id ON pcb_images (confirmed_by_id)"
        ]
        
        for sql in cols:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"Thực thi thành công: {sql}")
            except Exception as inner_e:
                print(f"Bỏ qua hoặc đã tồn tại: {sql} -> {inner_e}")
                
        print("\n--- Hoàn tất sửa lỗi Database ---")
    except Exception as e:
        print(f"Lỗi nghiêm trọng: {e}")

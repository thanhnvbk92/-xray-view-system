import sys
import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Thêm đường dẫn vào sys.path để import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import DATABASE_URL, SessionLocal

def reconcile_all_history():
    """
    Duyệt qua toàn bộ lịch sử trong bảng pcbs và cập nhật lại daily_stats 
    để đảm bảo dữ liệu khớp 100%.
    """
    db = SessionLocal()
    try:
        print("--- Đang bắt đầu quá trình đối soát dữ liệu ---")
        
        # 1. Lấy danh sách các ngày có dữ liệu trong bảng pcbs
        result = db.execute(text("SELECT DISTINCT DATE(client_time) as d FROM pcbs ORDER BY d ASC"))
        dates = [row[0] for row in result if row[0]]
        
        if not dates:
            print("Không tìm thấy dữ liệu trong bảng pcbs.")
            return

        print(f"Tìm thấy dữ liệu trong {len(dates)} ngày.")

        # 2. Gọi Procedure cho từng ngày
        for target_date in dates:
            print(f"Đang xử lý ngày: {target_date}...", end=" ", flush=True)
            db.execute(text("CALL refresh_daily_stats(:d)"), {"d": target_date})
            db.commit()
            print("Xong.")

        print("--- Hoàn thành đối soát dữ liệu thành công ---")
        
    except Exception as e:
        print(f"\nLỗi trong quá trình đối soát: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reconcile_all_history()

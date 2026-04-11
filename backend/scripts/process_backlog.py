import os
import sys
from concurrent.futures import ProcessPoolExecutor

# Thêm đường dẫn để chạy từ thư mục gốc dự án
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database, image_processor, config

def run_backlog():
    print("--- XRAY BACKLOG PROCESSOR (GPU ACCELERATED) ---")
    db = next(database.get_db())
    try:
        # Tìm các ảnh chưa được xử lý (trạng thái is_processed = False)
        pending = db.query(database.PCBImage).filter(database.PCBImage.is_processed == False).all()
        total = len(pending)
        print(f"Found {total} pending images.")
        
        if total == 0:
            print("Nothing to process.")
            return

        # Sử dụng ProcessPoolExecutor để tận dụng nhân CPU và 2 GPU
        # Chúng ta dùng 8-12 workers để tránh quá tải VRAM của Titan X
        max_workers = min(12, os.cpu_count() or 8) 
        pending_ids = [img.id for img in pending]
        
        print(f"Starting parallel processing with {max_workers} workers...")
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            executor.map(image_processor.process_compressed_image, pending_ids)
            
        print("All pending images processed successfully!")
    except Exception as e:
        print(f"Error during backlog processing: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_backlog()

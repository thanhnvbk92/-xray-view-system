import os
import sys

# Thêm đường dẫn để chạy từ thư mục gốc dự án
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database, image_processor

def run_backlog():
    print("--- XRAY BACKLOG PROCESSOR ---")
    db = next(database.get_db())
    try:
        # Tìm các ảnh chưa được nén (vẫn nằm trong data/images)
        pending = db.query(database.PCBImage).filter(database.PCBImage.image_path.like("%data/images%")).all()
        total = len(pending)
        print(f"Found {total} pending images.")
        
        for i, img in enumerate(pending):
            print(f"[{i+1}/{total}] Processing ID {img.id}...")
            image_processor.process_compressed_image(img.id)
            
        print("Done!")
    except Exception as e:
        print(f"Error during backlog processing: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_backlog()

import os
import sys

# Thêm thư mục gốc vào path để import module backend
sys.path.insert(0, r"d:\1. Project\Xray View System")

from backend.app import database, config

def purge_raw_images():
    db = database.SessionLocal()
    try:
        raw_imgs = db.query(database.PCBImage).filter(
            database.PCBImage.image_path.ilike("%.raw"),
            database.PCBImage.is_processed == False
        ).all()
        
        total_count = len(raw_imgs)
        print(f"[Purge .raw] Found {total_count} unprocessed .raw image records.")
        
        deleted_files = 0
        for idx, img in enumerate(raw_imgs, 1):
            img.is_processed = True
            if os.path.exists(img.image_path):
                try:
                    os.remove(img.image_path)
                    deleted_files += 1
                except Exception:
                    pass
            if idx % 1000 == 0:
                db.commit()
                print(f"[Purge .raw] Processed {idx}/{total_count} records...")
                
        db.commit()
        print(f"[Purge .raw] Completed! Updated {total_count} records to is_processed=True and deleted {deleted_files} raw files.")
    finally:
        db.close()

if __name__ == "__main__":
    purge_raw_images()

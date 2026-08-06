"""Script dọn dẹp các bản ghi ảnh hỏng (0-byte) trong CSDL và thư mục data/images"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import database, config
from backend.app.image_processor import cleanup_image_previews

def main():
    db = database.SessionLocal()
    print("Finding unprocessed images with 0-byte original files...")
    
    try:
        # Lấy tất cả ảnh chưa nén (is_processed == False)
        images = db.query(database.PCBImage).filter(database.PCBImage.is_processed == False).all()
        print(f"Total unprocessed images in DB: {len(images)}")
        
        fixed_count = 0
        for img in images:
            p = img.image_path
            if p and os.path.exists(p) and os.path.getsize(p) == 0:
                try:
                    os.remove(p)
                except Exception:
                    pass
                img.is_processed = True
                cleanup_image_previews(img.id)
                fixed_count += 1
                if fixed_count % 500 == 0:
                    db.commit()
                    print(f"Purged {fixed_count} corrupt 0-byte image records...")
        
        db.commit()
        print(f"Completed! Purged and marked {fixed_count} corrupt 0-byte image records.")
    except Exception as e:
        print(f"Error purging corrupt images: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sys.exit(main())

import os
import sys
from datetime import datetime

# Thêm thư mục hiện tại vào sys.path để import các module local
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# Để có thể import . dạng package
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from backend import image_processor, database, config
except ImportError:
    import image_processor, database, config

def test_manual():
    db = next(database.get_db())
    # Lấy 1 record ảnh chưa được xử lý
    img = db.query(database.PCBImage).filter(database.PCBImage.image_path.like("%data/images%")).first()
    
    if not img:
        print("No pending images found in database with data/images path.")
        # Thử lấy đại 1 cái
        img = db.query(database.PCBImage).first()
        
    if img:
        print(f"Testing for Image ID: {img.id}, Path: {img.image_path}")
        image_processor.process_compressed_image(img.id)
    else:
        print("No image records found in DB at all.")
    db.close()

if __name__ == "__main__":
    test_manual()

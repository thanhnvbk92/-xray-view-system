from app.database import engine
from sqlalchemy import text
import sys

def upgrade_index():
    print("Connecting to database to apply covering index...")
    try:
        with engine.connect() as conn:
            # Xóa index cũ nếu có
            print("Cleaning up old indexes...")
            try:
                conn.execute(text("DROP INDEX idx_pcb_images_analysis ON pcb_images"))
                conn.commit()
            except Exception: pass
            
            try:
                conn.execute(text("DROP INDEX idx_pcb_images_analysis_v2 ON pcb_images"))
                conn.commit()
            except Exception: pass

            # Tạo Covering Index mới
            print("Creating new Covering Index (pcb_id, image_type, shot_num, machine_result)...")
            conn.execute(text("CREATE INDEX idx_pcb_images_analysis_v3 ON pcb_images (pcb_id, image_type, shot_num, machine_result)"))
            conn.commit()
            print("Covering Index created successfully!")
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    upgrade_index()

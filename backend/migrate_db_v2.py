from sqlalchemy import create_engine, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)

def migrate():
    with engine.connect() as conn:
        print("Starting second migration for PCBImage...")
        
        # 1. Cập nhật bảng pcb_images
        try:
            conn.execute(text("ALTER TABLE pcb_images CHANGE COLUMN image_type machine_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Renamed image_type to machine_result")
        except Exception as e: 
            print(f"machine_result might already exist or image_type missing: {e}")
            try:
                conn.execute(text("ALTER TABLE pcb_images ADD COLUMN machine_result VARCHAR(20) DEFAULT 'PENDING'"))
                print("Added machine_result")
            except: pass

        try:
            conn.execute(text("ALTER TABLE pcb_images ADD COLUMN ai_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added ai_result")
        except Exception as e: print(f"ai_result might exist: {e}")

        try:
            conn.execute(text("ALTER TABLE pcb_images ADD COLUMN user_result VARCHAR(20) DEFAULT 'PENDING'"))
            print("Added user_result")
        except Exception as e: print(f"user_result might exist: {e}")
        
        conn.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    migrate()

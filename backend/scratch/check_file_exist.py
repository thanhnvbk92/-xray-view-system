import os
from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)
STORAGE_DIR = r"D:\3.Xray Image\storage"
UPLOAD_DIR = r"D:\1. Project\Xray View System\data\images"

with engine.connect() as conn:
    images = conn.execute(text('SELECT id, pcb_id, image_path, machine_result, user_result, shot_num, image_type, cause FROM pcb_images WHERE pcb_id = 1915224')).mappings().all()
    for img in images:
        path = img['image_path']
        if path.startswith("/storage/"):
            actual_path = os.path.join(STORAGE_DIR, path.removeprefix("/storage/").replace("/", os.sep))
        elif path.startswith("/images/"):
            actual_path = os.path.join(UPLOAD_DIR, os.path.basename(path))
        else:
            actual_path = path
        
        print(f"ID: {img['id']}, Path: {path}, Resolved: {actual_path}, Exists: {os.path.exists(actual_path)}")

from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    images = conn.execute(text('SELECT id, pcb_id, image_path, machine_result, ai_result, user_result, is_processed, shot_num, image_type, cause FROM pcb_images WHERE pcb_id = 1915224')).mappings().all()
    print(f"PCB 1915224 Total images: {len(images)}")
    for img in images:
        print(dict(img))

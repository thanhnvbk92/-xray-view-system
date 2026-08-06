from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    imgs = conn.execute(text('SELECT id, image_path, machine_result, user_result, shot_num, image_type, cause FROM pcb_images WHERE pcb_id = 1915224 ORDER BY id')).mappings().all()
    for img in imgs:
        print(dict(img))

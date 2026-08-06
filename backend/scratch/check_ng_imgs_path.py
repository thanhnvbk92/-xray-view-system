from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    res = conn.execute(text('''
        SELECT id, pcb_id, image_path, machine_result, user_result, image_type, cause
        FROM pcb_images
        WHERE machine_result = 'NG' AND user_result = 'PENDING' AND image_path IS NOT NULL
        ORDER BY id DESC
        LIMIT 30
    ''')).mappings().all()
    print(f"Total NG PENDING images with path sample ({len(res)}):")
    for r in res:
        print(" ", dict(r))

from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check PCB 1915224
    pcb = conn.execute(text('SELECT * FROM pcbs WHERE id = 1915224')).mappings().first()
    print("PCB 1915224:", dict(pcb))
    
    # Check all images of PCB 1915224
    images = conn.execute(text('SELECT id, pcb_id, image_path, machine_result, ai_result, user_result, is_processed, shot_num, image_type, cause FROM pcb_images WHERE pcb_id = 1915224')).mappings().all()
    print(f"PCB 1915224 images ({len(images)}):")
    for img in images:
        print("  ", dict(img))

    # Also check if there are other PCBs with same issue (PCB is NG, unconfirmed, but all pcb_images have machine_result = 'OK')
    mismatch_pcbs = conn.execute(text('''
        SELECT p.id, p.pid, p.machine_id, p.machine_result AS pcb_m_res, p.final_result, p.user_confirmed, p.client_time,
               COUNT(i.id) AS total_imgs,
               SUM(CASE WHEN i.machine_result = 'NG' THEN 1 ELSE 0 END) AS ng_imgs_count,
               SUM(CASE WHEN i.machine_result = 'OK' THEN 1 ELSE 0 END) AS ok_imgs_count
        FROM pcbs p
        JOIN pcb_images i ON i.pcb_id = p.id
        WHERE p.final_result = 'NG' AND p.user_confirmed = 0
        GROUP BY p.id
        HAVING ng_imgs_count = 0
        LIMIT 20
    ''')).mappings().all()
    print(f"\nPCBs where PCB is NG unconfirmed but ng_imgs_count == 0 (Total found: {len(mismatch_pcbs)}):")
    for m in mismatch_pcbs:
        print("  Mismatch PCB:", dict(m))

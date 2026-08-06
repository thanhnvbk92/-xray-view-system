import re
from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    pcbs = conn.execute(text('''
        SELECT p.id, p.pid, p.machine_id, p.final_result, p.user_confirmed
        FROM pcbs p
        WHERE p.final_result = 'NG' AND p.user_confirmed = 0
    ''')).mappings().all()
    
    print(f"Total unconfirmed NG PCBs: {len(pcbs)}")
    
    stuck_pcbs = []
    
    for p in pcbs:
        images = conn.execute(text('''
            SELECT id, image_path, machine_result, user_result, shot_num, image_type, cause
            FROM pcb_images
            WHERE pcb_id = :pcb_id
        '''), {'pcb_id': p['id']}).mappings().all()
        
        # Apply frontend normalization logic:
        normalized = []
        for img in images:
            path_lower = (img['image_path'] or "").lower()
            is_origin = '_o.' in path_lower or '_o.jpg' in path_lower or '_o.png' in path_lower
            i_type = 'origin' if is_origin else 'marked'
            normalized.append({**dict(img), 'i_type': i_type})
        
        # Apply frontend getDisplayImages filter (onlyShowNg = True)
        disp_ng = [img for img in normalized if img['i_type'] != 'origin' and img['user_result'] == 'PENDING' and img['machine_result'] == 'NG']
        
        # Apply frontend getDisplayImages filter (onlyShowNg = False)
        disp_all = [img for img in normalized if img['i_type'] != 'origin' and img['user_result'] == 'PENDING']
        
        if len(disp_ng) == 0:
            ng_origin_count = sum(1 for img in normalized if img['user_result'] == 'PENDING' and img['machine_result'] == 'NG')
            stuck_pcbs.append((p['id'], p['pid'], len(images), ng_origin_count, len(disp_all)))

    print(f"\nStuck PCBs count (onlyShowNg=True produces 0 images): {len(stuck_pcbs)}")
    for s in stuck_pcbs[:20]:
        print(f"  PCB ID: {s[0]}, PID: {s[1]}, Total Imgs: {s[2]}, NG Imgs Total: {s[3]}, Disp All Imgs: {s[4]}")

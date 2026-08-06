import sys
import os
from sqlalchemy import create_engine, text

print("Connecting to DB...", flush=True)
DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 5})

try:
    with engine.connect() as conn:
        print("Connected!", flush=True)
        pcbs = conn.execute(text('SELECT * FROM pcbs WHERE pid LIKE "%608HS067871%"')).mappings().all()
        print(f"PCBS found: {len(pcbs)}", flush=True)
        for p in pcbs:
            d_p = dict(p)
            print(f"PCB ID: {d_p['id']}, PID: {d_p['pid']}, machine_result: {d_p['machine_result']}, ai_result: {d_p['ai_result']}, user_result: {d_p['user_result']}, final_result: {d_p['final_result']}, user_confirmed: {d_p['user_confirmed']}", flush=True)
            pcb_id = d_p['id']
            images = conn.execute(text('SELECT * FROM pcb_images WHERE pcb_id = :id'), {'id': pcb_id}).mappings().all()
            print(f"  IMAGES count: {len(images)}", flush=True)
            for img in images:
                d_img = dict(img)
                path = d_img.get('image_path')
                exists = os.path.exists(path) if path else False
                print(f"    Image ID: {d_img['id']}, Type: {d_img['image_type']}, Shot: {d_img['shot_num']}, Machine Res: {d_img['machine_result']}, User Res: {d_img['user_result']}, Cause: {d_img.get('cause')}, Path: {path}, Exists: {exists}", flush=True)
            
            steps = conn.execute(text('SELECT * FROM test_steps WHERE pcb_id = :id'), {'id': pcb_id}).mappings().all()
            print(f"  STEPS count: {len(steps)}", flush=True)
            for s in steps:
                print(f"    STEP: {dict(s)}", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)

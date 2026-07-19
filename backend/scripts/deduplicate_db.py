import os
import sys
from datetime import datetime

# Add paths to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
sys.path.append(project_root)

from backend.app.database import SessionLocal, PCB, PCBImage

def deduplicate(dry_run=True):
    print(f"--- DATABASE DE-DUPLICATION WORKER (Dry Run: {dry_run}) ---")
    db = SessionLocal()
    
    # 1. Find duplicates of (pid, client_time, array_index, machine_id)
    print("Finding duplicate PCB groups in database...")
    from sqlalchemy import func
    
    dup_groups = db.query(
        PCB.pid, 
        PCB.client_time, 
        PCB.array_index, 
        PCB.machine_id, 
        func.count(PCB.id).label('cnt')
    ).group_by(
        PCB.pid, 
        PCB.client_time, 
        PCB.array_index, 
        PCB.machine_id
    ).having(func.count(PCB.id) > 1).all()
    
    total_groups = len(dup_groups)
    print(f"Found {total_groups} duplicate groups.")
    
    merged_pcbs_count = 0
    deleted_images_count = 0
    reassigned_images_count = 0
    
    for idx, group in enumerate(dup_groups):
        if idx % 1000 == 0 and idx > 0:
            print(f"Processed {idx}/{total_groups} groups...")
            
        pid, client_time, array_index, machine_id, count = group
        
        # Fetch all PCBs in this group
        pcbs = db.query(PCB).filter(
            PCB.pid == pid,
            PCB.client_time == client_time,
            PCB.array_index == array_index,
            PCB.machine_id == machine_id
        ).all()
        
        # Determine the survivor (best one to keep)
        def get_score(pcb):
            storage_images_count = sum(1 for img in pcb.images if img.image_path and img.image_path.startswith('/storage/'))
            return (
                1 if pcb.user_confirmed else 0,
                1 if pcb.final_result != 'PENDING' else 0,
                storage_images_count,
                -pcb.id # tie-breaker: smaller ID gets higher score
            )
            
        pcbs.sort(key=get_score, reverse=True)
        survivor = pcbs[0]
        duplicates = pcbs[1:]
        
        # Merge images of duplicates into survivor
        survivor_images_keys = {} # key: (shot_num, image_type) -> img
        for img in survivor.images:
            key = (img.shot_num, img.image_type)
            survivor_images_keys[key] = img
            
        for dup_pcb in duplicates:
            for img in list(dup_pcb.images):
                key = (img.shot_num, img.image_type)
                if key in survivor_images_keys:
                    surv_img = survivor_images_keys[key]
                    
                    # Update survivor image path if duplicate img has a better /storage/ path
                    if img.image_path and img.image_path.startswith('/storage/') and not (surv_img.image_path and surv_img.image_path.startswith('/storage/')):
                        if not dry_run:
                            surv_img.image_path = img.image_path
                            surv_img.is_processed = True
                            surv_img.machine_result = img.machine_result
                            surv_img.ai_result = img.ai_result
                            surv_img.user_result = img.user_result
                            surv_img.cause = img.cause
                            surv_img.confirmed_by_id = img.confirmed_by_id
                            surv_img.confirmed_at = img.confirmed_at
                    
                    if not dry_run:
                        db.delete(img)
                    deleted_images_count += 1
                else:
                    if not dry_run:
                        img.pcb_id = survivor.id
                    survivor_images_keys[key] = img
                    reassigned_images_count += 1
                    
            if not dry_run:
                db.delete(dup_pcb)
            merged_pcbs_count += 1
            
        if not dry_run and idx % 100 == 0:
            db.commit()
            
    if not dry_run:
        db.commit()
        
    db.close()
    print("\n--- Summary ---")
    print(f"Total duplicate groups: {total_groups}")
    print(f"Duplicate PCBs deleted: {merged_pcbs_count}")
    print(f"Duplicate image records deleted: {deleted_images_count}")
    print(f"Image records reassigned to survivor: {reassigned_images_count}")

if __name__ == "__main__":
    dry = True
    if len(sys.argv) > 1 and sys.argv[1].lower() == "run":
        dry = False
    deduplicate(dry_run=dry)

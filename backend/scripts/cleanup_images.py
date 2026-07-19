import os
import sys
import re
from datetime import datetime

# Add paths to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
sys.path.append(project_root)

from backend.app.database import SessionLocal, PCBImage, PCB, Machine, Line
from backend.app import config

def parse_filename(filename):
    # Format: {Line}_{Machine}_{PID}_{Timestamp}_{ShotNum}[_o].jpg
    # Example: Line 2-2_XRAY-01_356205780083296_20260713113250_1_12_o.jpg
    match = re.match(r"^(Line\s+[^_]+)_([^_]+)_([^_]+)_(\d{14})_", filename)
    if not match:
        match = re.match(r"^([^_]+)_([^_]+)_([^_]+)_(\d{14})_", filename)
    if match:
        line = match.group(1)
        machine = match.group(2)
        pid = match.group(3)
        timestamp = match.group(4)
        return line, machine, pid, timestamp
    return None

def main(dry_run=True):
    print(f"--- IMAGE CLEANUP WORKER (Dry Run: {dry_run}) ---", flush=True)
    db = SessionLocal()
    upload_dir = config.UPLOAD_DIR
    storage_dir = config.STORAGE_DIR
    
    print(f"Upload directory: {upload_dir}", flush=True)
    print(f"Storage directory: {storage_dir}", flush=True)
    
    # 1. Fetch ONLY unprocessed image records (is_processed = False) from DB
    print("Loading unprocessed image records from database (is_processed = False)...", flush=True)
    try:
        results = db.query(
            PCBImage.id,
            PCBImage.pcb_id,
            PCBImage.image_path,
            PCB.job_file
        ).join(PCB, PCBImage.pcb_id == PCB.id)\
         .filter(PCBImage.is_processed == False)\
         .all()
    except Exception as e:
        print(f"Error querying database: {e}", flush=True)
        db.close()
        return

    print(f"Loaded {len(results)} unprocessed image records from database.", flush=True)
    
    # Build direct mapping
    db_map = {}
    for r in results:
        if not r.image_path:
            continue
        fn = os.path.basename(r.image_path)
        if not fn:
            continue
        db_map[fn] = {
            "id": r.id,
            "pcb_id": r.pcb_id
        }
        
    print("Database mapping complete. Scanning upload directory...", flush=True)
    
    if not os.path.exists(upload_dir):
        print(f"Upload directory {upload_dir} does not exist!", flush=True)
        db.close()
        return
        
    deleted_count = 0
    repaired_count = 0
    skipped_count = 0
    errors_count = 0
    checked_count = 0
    
    # Cache day folder listings (job folder names) to avoid scanning disks repetitively
    day_dir_cache = {}
    
    # We will accumulate db updates and commit in batches
    batch_size = 1000
    pending_updates = 0
    
    with os.scandir(upload_dir) as it:
        for entry in it:
            if not entry.is_file():
                continue
            fn = entry.name
            if not fn.lower().endswith(('.jpg', '.png')):
                continue
                
            checked_count += 1
            if checked_count % 10000 == 0:
                print(f"Checked {checked_count} files... Redundant deleted: {deleted_count}, Repaired DB: {repaired_count}, Skipped: {skipped_count}", flush=True)
                
            file_path = entry.path
            
            parsed = parse_filename(fn)
            if not parsed:
                skipped_count += 1
                continue
                
            line, machine, pid, timestamp = parsed
            year = timestamp[0:4]
            month = timestamp[4:6]
            day = timestamp[6:8]
            
            day_dir = os.path.join(storage_dir, line, machine, year, month, day)
            
            # List job folders in day_dir (usually 1 or 2) and cache it
            if day_dir not in day_dir_cache:
                day_dir_cache[day_dir] = []
                if os.path.exists(day_dir):
                    try:
                        for sub_entry in os.scandir(day_dir):
                            if sub_entry.is_dir():
                                day_dir_cache[day_dir].append(sub_entry.name)
                    except Exception:
                        pass
            
            job_folders = day_dir_cache[day_dir]
            
            exists_in_storage = False
            storage_rel_path = None
            
            # Check if file exists in any of the job folders
            for job_folder in job_folders:
                expected_storage_path = os.path.join(day_dir, job_folder, fn)
                if os.path.exists(expected_storage_path):
                    exists_in_storage = True
                    storage_rel_path = f"/storage/{line}/{machine}/{year}/{month}/{day}/{job_folder}/{fn}".replace("\\", "/")
                    break
            
            if exists_in_storage:
                db_repaired = False
                
                # Check if we need to repair DB record
                if fn in db_map:
                    db_repaired = True
                    meta = db_map[fn]
                    
                    if not dry_run:
                        try:
                            # Update PCBImage
                            db.query(PCBImage).filter(PCBImage.id == meta["id"]).update({
                                "image_path": storage_rel_path,
                                "is_processed": True
                            })
                            # Update PCB if its main image is pointing to the old filename
                            db.query(PCB).filter(
                                PCB.id == meta["pcb_id"],
                                (PCB.image_path == fn) | (PCB.image_path == f"data/images/{fn}") | (PCB.image_path.like(f"%/{fn}"))
                            ).update({
                                "image_path": storage_rel_path
                            })
                            pending_updates += 1
                        except Exception as e:
                            print(f"Error preparing update for {fn}: {e}", flush=True)
                            errors_count += 1
                            db_repaired = False
                
                if not dry_run:
                    try:
                        # Commit batch of DB updates
                        if db_repaired and pending_updates >= batch_size:
                            db.commit()
                            pending_updates = 0
                            
                        # Delete the file
                        os.remove(file_path)
                        deleted_count += 1
                        if db_repaired:
                            repaired_count += 1
                    except Exception as e:
                        db.rollback()
                        print(f"Error during deletion/commit for {fn}: {e}", flush=True)
                        errors_count += 1
                else:
                    deleted_count += 1
                    if db_repaired:
                        repaired_count += 1
            else:
                # File does not exist in storage yet. Keep in upload directory.
                skipped_count += 1
                
    # Commit any remaining updates
    if not dry_run and pending_updates > 0:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error during final DB commit: {e}", flush=True)
            
    db.close()
    
    print("\n--- Summary ---", flush=True)
    print(f"Total files checked: {checked_count}", flush=True)
    print(f"Redundant files deleted: {deleted_count}", flush=True)
    print(f"Database records repaired: {repaired_count}", flush=True)
    print(f"Files kept: {skipped_count}", flush=True)
    print(f"Errors encountered: {errors_count}", flush=True)

if __name__ == "__main__":
    dry = True
    if len(sys.argv) > 1 and sys.argv[1].lower() == "run":
        dry = False
    main(dry_run=dry)

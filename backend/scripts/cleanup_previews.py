"""Script dọn dẹp tất cả các file preview đệm trong data/previews đã được xác nhận và nén thành công (Optimized for 16M+ DB rows)."""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text
from backend.app import config
from backend.app.database import SessionLocal


def main() -> int:
    preview_dir = os.path.join(config.DATA_ROOT, "previews")
    if not os.path.isdir(preview_dir):
        print("Preview directory does not exist.")
        return 0

    print(f"Scanning preview directory: {preview_dir}")
    try:
        entries = [e for e in os.scandir(preview_dir) if e.is_file()]
    except Exception as err:
        print(f"Error scanning preview dir: {err}")
        return 1

    print(f"Total preview files found: {len(entries)}")
    if not entries:
        return 0

    # Gom các image_id từ danh sách file preview
    file_map = {}  # image_id (int) -> list of file entries
    for entry in entries:
        parts = entry.name.split("-")
        if parts and parts[0].isdigit():
            img_id = int(parts[0])
            file_map.setdefault(img_id, []).append(entry)

    print(f"Unique image IDs found in preview folder: {len(file_map)}")
    if not file_map:
        return 0

    db = SessionLocal()
    deleted = 0
    skipped = 0
    failed = 0

    try:
        # Truy vấn theo từng batch 2000 IDs dựa trên Index để đạt hiệu năng tối đa
        all_ids = list(file_map.keys())
        batch_size = 2000
        
        for i in range(0, len(all_ids), batch_size):
            batch_ids = all_ids[i:i + batch_size]
            id_list_str = ",".join(str(x) for x in batch_ids)
            
            # Chỉ lấy các ảnh đã nén xong hoặc path thuộc /storage/
            query = text(f"SELECT id FROM pcb_images WHERE id IN ({id_list_str}) AND (is_processed = 1 OR image_path LIKE '/storage/%')")
            result = db.execute(query)
            processed_ids = {row[0] for row in result}

            for img_id in batch_ids:
                entries_for_id = file_map[img_id]
                if img_id in processed_ids:
                    for entry in entries_for_id:
                        try:
                            os.remove(entry.path)
                            deleted += 1
                        except OSError:
                            failed += 1
                else:
                    skipped += len(entries_for_id)

    finally:
        db.close()

    print(f"Preview cleanup finished: {deleted} deleted, {skipped} skipped (pending confirmation), {failed} failed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

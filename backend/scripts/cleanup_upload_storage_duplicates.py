"""Delete RAW uploads and verified upload duplicates already present in storage."""

import csv
import os
import sys
from collections import defaultdict
from datetime import datetime


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text

from backend.app import config
from backend.app.database import SessionLocal


def storage_file_path(api_path: str) -> str:
    relative = api_path.removeprefix("/storage/").replace("/", os.sep)
    return os.path.join(config.STORAGE_DIR, relative)


def main() -> int:
    report_dir = os.path.join(PROJECT_ROOT, "reports")
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, f"upload-duplicate-cleanup-{datetime.now():%Y%m%d-%H%M%S}.csv")

    upload_files = {entry.name: entry.path for entry in os.scandir(config.UPLOAD_DIR) if entry.is_file()}
    raw_files = {name for name in upload_files if name.lower().endswith(".raw")}
    storage_candidates: dict[str, list[str]] = defaultdict(list)

    db = SessionLocal()
    try:
        result = db.execute(text("SELECT image_path FROM pcb_images WHERE image_path LIKE '/storage/%'"))
        while True:
            rows = result.fetchmany(10_000)
            if not rows:
                break
            for (api_path,) in rows:
                name = api_path.rsplit("/", 1)[-1]
                if name in upload_files and name not in raw_files:
                    storage_candidates[name].append(api_path)
    finally:
        db.close()

    raw_deleted = duplicate_deleted = failed = 0
    with open(report_path, "w", newline="", encoding="utf-8-sig") as report_file:
        writer = csv.DictWriter(report_file, fieldnames=["file_path", "action", "storage_path", "error"])
        writer.writeheader()

        for name in sorted(raw_files):
            path = upload_files[name]
            try:
                os.remove(path)
                raw_deleted += 1
                writer.writerow({"file_path": path, "action": "deleted_raw", "storage_path": "", "error": ""})
            except OSError as exc:
                failed += 1
                writer.writerow({"file_path": path, "action": "failed_raw", "storage_path": "", "error": str(exc)})

        for name, api_paths in storage_candidates.items():
            path = upload_files[name]
            confirmed_storage = next((storage_file_path(api_path) for api_path in api_paths if os.path.isfile(storage_file_path(api_path))), None)
            if not confirmed_storage:
                continue
            try:
                os.remove(path)
                duplicate_deleted += 1
                writer.writerow({"file_path": path, "action": "deleted_verified_storage_duplicate", "storage_path": confirmed_storage, "error": ""})
            except OSError as exc:
                failed += 1
                writer.writerow({"file_path": path, "action": "failed_duplicate", "storage_path": confirmed_storage, "error": str(exc)})

    print(f"raw_deleted={raw_deleted}")
    print(f"storage_duplicates_deleted={duplicate_deleted}")
    print(f"failed={failed}")
    print(f"csv={report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

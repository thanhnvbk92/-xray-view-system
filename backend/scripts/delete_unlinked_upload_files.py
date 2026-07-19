"""Delete upload files that are not referenced by any PCBImage record.

The check is intentionally filename-based and considers every image_path in the
database, including /storage paths. This avoids deleting an upload copy merely
because its database record has already been moved to storage.
"""

import argparse
import csv
import os
import sys
from datetime import datetime


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text

from backend.app import config
from backend.app.database import SessionLocal


def filename_from_path(path: str | None) -> str | None:
    if not path:
        return None
    # DB rows may contain Windows paths or API URLs. Normalize both separators.
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    return name or None


def parser() -> argparse.ArgumentParser:
    report_default = os.path.join(
        PROJECT_ROOT,
        "reports",
        f"unlinked-upload-files-{datetime.now():%Y%m%d-%H%M%S}.csv",
    )
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--run", action="store_true", help="Actually delete files. Omit for a dry-run.")
    result.add_argument("--csv", default=report_default, help="CSV report path")
    result.add_argument("--fetch-size", type=int, default=10_000)
    return result


def main() -> int:
    args = parser().parse_args()
    if args.fetch_size <= 0:
        raise ValueError("--fetch-size must be positive")

    # Store only filenames present in the upload directory. The DB stream then
    # removes names as soon as a matching record is found, keeping memory bounded.
    upload_files = {
        entry.name
        for entry in os.scandir(config.UPLOAD_DIR)
        if entry.is_file()
    }
    candidates = set(upload_files)
    print(f"Upload files discovered: {len(upload_files):,}", flush=True)

    db = SessionLocal()
    checked_rows = 0
    try:
        result = db.execute(
            text("SELECT image_path FROM pcb_images WHERE image_path IS NOT NULL")
        )
        while True:
            rows = result.fetchmany(args.fetch_size)
            if not rows:
                break
            checked_rows += len(rows)
            for (image_path,) in rows:
                filename = filename_from_path(image_path)
                if filename:
                    candidates.discard(filename)
            if checked_rows % 500_000 == 0:
                print(
                    f"DB paths checked: {checked_rows:,}; unlinked candidates: {len(candidates):,}",
                    flush=True,
                )
    finally:
        db.close()

    report_path = os.path.abspath(args.csv)
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    deleted = 0
    failed = 0
    bytes_deleted = 0

    with open(report_path, "w", newline="", encoding="utf-8-sig") as report_file:
        writer = csv.DictWriter(report_file, fieldnames=["file_path", "size_bytes", "action", "error"])
        writer.writeheader()
        for filename in sorted(candidates):
            path = os.path.join(config.UPLOAD_DIR, filename)
            try:
                size = os.path.getsize(path)
            except FileNotFoundError:
                continue

            action = "would_delete"
            error = ""
            if args.run:
                try:
                    os.remove(path)
                    action = "deleted"
                    deleted += 1
                    bytes_deleted += size
                except OSError as exc:
                    action = "failed"
                    error = str(exc)
                    failed += 1

            writer.writerow({"file_path": path, "size_bytes": size, "action": action, "error": error})

    print("--- Summary ---")
    print(f"Database paths checked: {checked_rows:,}")
    print(f"Unlinked upload files: {len(candidates):,}")
    print(f"Deleted: {deleted:,}")
    print(f"Failed: {failed:,}")
    print(f"Deleted GB: {bytes_deleted / 1024**3:.2f}")
    print(f"CSV report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

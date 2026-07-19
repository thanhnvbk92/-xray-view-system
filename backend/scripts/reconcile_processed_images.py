"""Repair processed image records whose physical storage file is missing.

For every PCBImage marked processed:
* keep the record unchanged when its storage file exists;
* when storage is missing but data/images/<filename> exists, restore the local
  path and requeue it for compression;
* when neither copy exists, clear the unusable path and mark it unprocessed.

Every changed record is appended to a CSV report so interrupted runs remain
auditable. Re-running the script is safe because repaired records no longer
match the processed-record query.
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

from sqlalchemy import select

from backend.app import config
from backend.app.database import PCBImage, SessionLocal


DEFAULT_BATCH_SIZE = 2_000


def physical_storage_path(image_path: str | None) -> str | None:
    """Map the API storage URL to the configured physical storage directory."""
    if not image_path or not image_path.startswith("/storage/"):
        return None
    relative_path = image_path.removeprefix("/storage/").replace("/", os.sep)
    return os.path.join(config.STORAGE_DIR, relative_path)


def local_upload_path(image_path: str | None) -> str | None:
    """Find the upload copy by filename; uploads are stored in a flat directory."""
    if not image_path:
        return None
    filename = os.path.basename(image_path)
    if not filename:
        return None
    candidate = os.path.join(config.UPLOAD_DIR, filename)
    return candidate if os.path.isfile(candidate) else None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--start-after-id",
        type=int,
        default=0,
        help="Resume from the first record with an ID greater than this value.",
    )
    parser.add_argument(
        "--csv",
        default=os.path.join(
            PROJECT_ROOT,
            "reports",
            f"processed-images-reconciliation-{datetime.now():%Y%m%d-%H%M%S}.csv",
        ),
        help="CSV report path. Existing files are appended to.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report actions without changing the database.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.batch_size <= 0:
        raise ValueError("--batch-size must be positive")

    report_path = os.path.abspath(args.csv)
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    write_header = not os.path.exists(report_path) or os.path.getsize(report_path) == 0

    scanned = 0
    storage_missing = 0
    restored_from_upload = 0
    source_missing = 0
    changed = 0
    last_id = args.start_after_id

    db = SessionLocal()
    try:
        with open(report_path, "a", newline="", encoding="utf-8-sig") as report_file:
            writer = csv.DictWriter(
                report_file,
                fieldnames=[
                    "timestamp",
                    "image_id",
                    "old_image_path",
                    "expected_storage_path",
                    "local_upload_path",
                    "action",
                ],
            )
            if write_header:
                writer.writeheader()
                report_file.flush()

            while True:
                rows = db.execute(
                    select(PCBImage)
                    .where(PCBImage.is_processed.is_(True), PCBImage.id > last_id)
                    .order_by(PCBImage.id)
                    .limit(args.batch_size)
                ).scalars().all()
                if not rows:
                    break

                for image in rows:
                    last_id = image.id
                    scanned += 1
                    old_path = image.image_path
                    storage_path = physical_storage_path(old_path)

                    if storage_path and os.path.isfile(storage_path):
                        continue

                    # A non-/storage/ path is also treated as missing storage: it is
                    # an old local/stale record and must be reconciled the same way.
                    storage_missing += 1
                    upload_path = local_upload_path(old_path)
                    timestamp = datetime.now().isoformat(timespec="seconds")

                    if upload_path:
                        action = "restore_upload_path_and_requeue"
                        restored_from_upload += 1
                        if not args.dry_run:
                            image.image_path = upload_path
                            image.is_processed = False
                    else:
                        action = "source_missing_mark_unprocessed"
                        source_missing += 1
                        if not args.dry_run:
                            # A missing /storage/ URL would be immediately marked
                            # processed again by the worker. Clear it so the record
                            # remains visibly unprocessed until source data is restored.
                            image.image_path = None
                            image.is_processed = False

                    writer.writerow(
                        {
                            "timestamp": timestamp,
                            "image_id": image.id,
                            "old_image_path": old_path or "",
                            "expected_storage_path": storage_path or "",
                            "local_upload_path": upload_path or "",
                            "action": action,
                        }
                    )
                    changed += 1

                if not args.dry_run:
                    db.commit()
                report_file.flush()
                print(
                    f"scanned={scanned:,} missing_storage={storage_missing:,} "
                    f"restored={restored_from_upload:,} source_missing={source_missing:,} "
                    f"last_id={last_id}",
                    flush=True,
                )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("--- Summary ---")
    print(f"Scanned processed records: {scanned:,}")
    print(f"Records with missing storage: {storage_missing:,}")
    print(f"Restored from data/images: {restored_from_upload:,}")
    print(f"Source missing; marked unprocessed: {source_missing:,}")
    print(f"Changed records: {changed:,}")
    print(f"Resume with --start-after-id {last_id}")
    print(f"CSV report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

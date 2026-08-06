"""Script quét và xóa tất cả các file rác 0-byte hình thành trong D:\\3.Xray Image\\storage"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import config


def main():
    storage_dir = config.STORAGE_DIR
    print(f"Scanning storage directory for 0-byte ghost files: {storage_dir}")
    if not os.path.isdir(storage_dir):
        print("Storage directory does not exist.")
        return 0

    removed = 0
    scanned = 0
    failed = 0

    for root, _, files in os.walk(storage_dir):
        for f in files:
            scanned += 1
            file_path = os.path.join(root, f)
            try:
                if os.path.getsize(file_path) == 0:
                    os.remove(file_path)
                    removed += 1
                    print(f"Removed 0-byte ghost file: {file_path}")
            except Exception as e:
                failed += 1

    print(f"Cleanup finished. Scanned: {scanned}, Removed 0-byte files: {removed}, Failed: {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

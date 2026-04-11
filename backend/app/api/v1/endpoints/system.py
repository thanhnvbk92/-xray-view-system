import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app import config

router = APIRouter()

def get_latest_version_info():
    """Lấy thông tin phiên bản từ tệp version.json"""
    import json
    version_file = os.path.join(config.DOWNLOAD_DIR, "version.json")
    try:
        if os.path.exists(version_file):
            with open(version_file, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"Error reading version file: {e}")
    return {"version": "1.0.0"}

@router.get("/version")
async def get_version():
    info = get_latest_version_info()
    return {"version": info.get("version", "1.0.0"), "download_url": "/api/download/collector"}

@router.get("/download/collector")
async def download_collector():
    file_path = os.path.join(config.DOWNLOAD_DIR, "XrayCollector.exe")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Update file not found.")
    return FileResponse(
        path=file_path,
        filename="XrayCollector.exe",
        media_type="application/octet-stream"
    )

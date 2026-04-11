import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app import config

router = APIRouter()

def get_latest_version_info():
    """Giả lập lấy thông tin phiên bản từ tệp hoặc DB"""
    return {"version": "1.0.5"}

@router.get("/version")
async def get_version():
    info = get_latest_version_info()
    return {"version": info.get("version", "1.0.0"), "download_url": "/api/v1/system/download/collector"}

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

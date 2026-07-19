import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from . import database, config
from .api.v1.api import api_router
from .core.websocket import manager
from .workers.image_worker import init_image_executor, image_worker
from .workers.tasks import check_offline_machines, scan_unprocessed_images

class HeartbeatFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "/api/machines/heartbeat" in message:
            return False
        if record.args:
            for arg in record.args:
                if isinstance(arg, str) and "/api/machines/heartbeat" in arg:
                    return False
        return True

def configure_uvicorn_logging():
    loggers = ["uvicorn", "uvicorn.error", "uvicorn.access"]
    for name in loggers:
        logger = logging.getLogger(name)
        if name == "uvicorn.access":
            logger.addFilter(HeartbeatFilter())
            
        for handler in logger.handlers:
            formatter = handler.formatter
            if formatter:
                current_fmt = formatter._fmt
                if "%(asctime)s" not in current_fmt:
                    new_fmt = f"[%(asctime)s] {current_fmt}"
                    formatter_class = formatter.__class__
                    try:
                        kwargs = {}
                        if hasattr(formatter, "use_colors"):
                            kwargs["use_colors"] = getattr(formatter, "use_colors")
                        new_formatter = formatter_class(
                            fmt=new_fmt,
                            datefmt="%Y-%m-%d %H:%M:%S",
                            **kwargs
                        )
                        handler.setFormatter(new_formatter)
                    except Exception:
                        new_formatter = logging.Formatter(
                            fmt=f"[%(asctime)s] {current_fmt}",
                            datefmt="%Y-%m-%d %H:%M:%S"
                        )
                        handler.setFormatter(new_formatter)

# Cấu hình ngay khi module được nạp
configure_uvicorn_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động lại cấu hình để đảm bảo Uvicorn áp dụng đầy đủ
    configure_uvicorn_logging()
    
    # Khởi tạo Database
    database.init_db()
    
    # Khởi tạo Multi-processing Executor cho việc nén ảnh
    executor = init_image_executor()
    
    # Chạy các tác vụ ngầm
    worker_task = asyncio.create_task(image_worker())
    check_offline_task = asyncio.create_task(check_offline_machines())
    cleanup_task = asyncio.create_task(scan_unprocessed_images())
    
    yield
    
    # Dọn dẹp khi tắt server
    worker_task.cancel()
    check_offline_task.cancel()
    cleanup_task.cancel()
    executor.shutdown(wait=True)

app = FastAPI(title="Xray View System API", lifespan=lifespan)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký API chuẩn
app.include_router(api_router, prefix="/api")

# Phục vụ file Static (Ảnh và Downloads)
if not os.path.exists(config.UPLOAD_DIR): os.makedirs(config.UPLOAD_DIR)
if not os.path.exists(config.STORAGE_DIR): os.makedirs(config.STORAGE_DIR)

class CachedStaticFiles(StaticFiles):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        # Cache cho ảnh trong 1 ngày (86400 giây)
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

app.mount("/images", CachedStaticFiles(directory=config.UPLOAD_DIR), name="images")
app.mount("/storage", CachedStaticFiles(directory=config.STORAGE_DIR), name="storage")

# WebSocket cho các thông báo thời gian thực
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Phục vụ Frontend (Catch-all)
if os.path.exists(config.FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(config.FRONTEND_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api") or full_path.startswith("images") or full_path.startswith("storage") or full_path.startswith("ws"):
            raise HTTPException(status_code=404)
        
        index_path = os.path.join(config.FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend index.html missing"}

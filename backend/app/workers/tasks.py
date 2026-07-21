import asyncio
import json
from datetime import datetime, timedelta
from sqlalchemy import or_

from .. import database, config
from ..database import Machine, PCBImage
from ..core.websocket import manager
from .image_worker import enqueue_image

async def check_offline_machines():
    """Tác vụ định kỳ: Tự chuyển máy sang OFFLINE nếu quá 90s chưa nhận heartbeat"""
    while True:
        await asyncio.sleep(30)
        try:
            db = next(database.get_db())
            timeout = datetime.now() - timedelta(seconds=90)
            stale = db.query(Machine).filter(
                Machine.status == "ONLINE",
                Machine.last_heartbeat < timeout
            ).all()
            for m in stale:
                m.status = "OFFLINE"
                await manager.broadcast(json.dumps({"type": "MACHINE_STATUS", "machine_id": m.id, "status": "OFFLINE"}))
            if stale:
                db.commit()
            db.close()
        except Exception:
            pass

def find_queueable_image_ids():
    """Run the blocking SQL query outside FastAPI's event loop."""
    db = next(database.get_db())
    try:
        pending = db.query(PCBImage.id).filter(
            PCBImage.is_processed == False,
            PCBImage.image_path.isnot(None),
            ~PCBImage.image_path.startswith("/storage/")
        ).filter(
            or_(
                PCBImage.machine_result == "OK",
                PCBImage.user_result != "PENDING"
            )
        ).limit(config.IMAGE_BACKLOG_BATCH_SIZE).all()
        return [image_id for (image_id,) in pending]
    finally:
        db.close()

async def scan_unprocessed_images():
    """Tác vụ định kỳ: Quét định kỳ để tránh bỏ sót ảnh chưa được nén/di chuyển"""
    try:
        while True:
            try:
                pending_ids = await asyncio.to_thread(find_queueable_image_ids)
                
                if pending_ids:
                    if config.IMAGE_VERBOSE_LOG:
                        print(f"Cleanup Task: Found {len(pending_ids)} images ready for storage. Adding to queue...")
                    queued = 0
                    for image_id in pending_ids:
                        if await enqueue_image(image_id):
                            queued += 1
                    if queued and config.IMAGE_VERBOSE_LOG:
                        print(f"Cleanup Task: queued {queued} new images.")
            except Exception as e:
                print(f"Cleanup Task Error: {e}")
            
            await asyncio.sleep(config.IMAGE_BACKLOG_SCAN_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        print("Cleanup Task: Stopping gracefully...")

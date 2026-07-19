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

async def scan_unprocessed_images():
    """Tác vụ định kỳ: Quét định kỳ để tránh bỏ sót ảnh chưa được nén/di chuyển"""
    try:
        while True:
            try:
                db = next(database.get_db())
                # Chỉ quét những ảnh thỏa mãn điều kiện lưu trữ: OK ngay hoặc NG đã được đánh giá
                pending = db.query(PCBImage).filter(
                    PCBImage.is_processed == False,
                    # Only queue records that still point at a local source file.
                    # Missing-source records are intentionally left unprocessed for
                    # reconciliation, but cannot be compressed and would otherwise
                    # flood the queue every ten seconds.
                    PCBImage.image_path.isnot(None),
                    ~PCBImage.image_path.startswith("/storage/")
                ).filter(
                    or_(
                        PCBImage.machine_result == "OK",
                        PCBImage.user_result != "PENDING"
                    )
                ).limit(config.IMAGE_BACKLOG_BATCH_SIZE).all()
                
                if pending:
                    print(f"Cleanup Task: Found {len(pending)} images ready for storage. Adding to queue...")
                    queued = 0
                    for img in pending:
                        if await enqueue_image(img.id):
                            queued += 1
                    if queued:
                        print(f"Cleanup Task: queued {queued} new images.")
                db.close()
            except Exception as e:
                print(f"Cleanup Task Error: {e}")
            
            await asyncio.sleep(config.IMAGE_BACKLOG_SCAN_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        print("Cleanup Task: Stopping gracefully...")

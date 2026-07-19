import asyncio
from concurrent.futures import ThreadPoolExecutor
from app import image_processor, config

# Hàng đợi xử lý ảnh dùng chung
image_queue = asyncio.Queue()
image_executor = None
queued_image_ids = set()

async def enqueue_image(image_id: int) -> bool:
    """Queue each image at most once while it is waiting or being compressed."""
    if image_id in queued_image_ids:
        return False
    queued_image_ids.add(image_id)
    await image_queue.put(image_id)
    return True

def init_image_executor():
    """Khởi tạo ThreadPool cho việc nén ảnh"""
    global image_executor
    
    # Cấu hình tối đa 3 luồng đồng thời để tránh làm nghẽn CPU chính, 
    # giữ cho server FastAPI luôn phản hồi mượt mà đối với các request tải ảnh và API.
    max_workers = config.IMAGE_WORKERS
    
    image_executor = ThreadPoolExecutor(max_workers=max_workers)
    print(f"Lifecycle: Started ThreadPool Image Processor with {max_workers} workers")
    return image_executor

async def image_worker():
    """Worker chuyên trách xử lý ảnh từ hàng đợi (Nén song song giới hạn qua ThreadPool)"""
    print("Image Worker: Started and ready for task queue...")
    loop = asyncio.get_running_loop()
    try:
        while True:
            image_id = await image_queue.get()
            # Đẩy task chạy ngầm trong ThreadPool. 
            # ThreadPool với max_workers=3 sẽ tự động điều tiết chỉ chạy tối đa 3 task song song,
            # các task còn lại sẽ nằm trong hàng đợi của executor để xử lý tuần tự.
            asyncio.create_task(run_task(loop, image_id))
            image_queue.task_done()
    except asyncio.CancelledError:
        print("Image Worker: Stopping gracefully...")

async def run_task(loop, image_id):
    """Wrapper để chạy task mà không chặn loop chính"""
    try:
        await loop.run_in_executor(image_executor, image_processor.process_compressed_image, image_id)
    except Exception as e:
        print(f"Task Error [ID {image_id}]: {e}")
    finally:
        queued_image_ids.discard(image_id)

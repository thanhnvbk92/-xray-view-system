import asyncio
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from app import image_processor, config

# Hàng đợi xử lý ảnh dùng chung
image_queue = asyncio.Queue()
image_executor = None

def init_image_executor():
    """Khởi tạo ProcessPool cho việc nén ảnh"""
    global image_executor
    
    # TỐI ƯU CỰC HẠN cho 16 luồng CPU
    max_workers = 12
    
    image_executor = ProcessPoolExecutor(max_workers=max_workers)
    print(f"Lifecycle: Started TURBO Image Processor Pool with {max_workers} workers")
    return image_executor

async def image_worker():
    """Worker chuyên trách xử lý ảnh từ hàng đợi (Song song cự hạn)"""
    print("Turbo Image Worker: Started and ready for parallel tasks...")
    loop = asyncio.get_running_loop()
    try:
        while True:
            image_id = await image_queue.get()
            # KHÔNG await ở đây để vòng lặp có thể lấy ảnh tiếp theo ngay lập tức
            # ProcessPoolExecutor sẽ tự quản lý việc chạy song song 12 tác vụ
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

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
    
    # Tối ưu hóa cho 2 card GPU (Titan X): Mỗi GPU gán 2 worker
    # Tổng cộng 4 worker chạy song song (Phù hợp với đa nhân CPU)
    max_workers = config.GPU_COUNT * 2
    
    image_executor = ProcessPoolExecutor(max_workers=max_workers)
    print(f"Lifecycle: Started Image Processor Pool with {max_workers} workers for {config.GPU_COUNT} GPUs")
    return image_executor

async def image_worker():
    """Worker chuyên trách xử lý ảnh từ hàng đợi (Tuần tự, chống quá tải)"""
    print("Image Worker: Started and waiting for tasks...")
    try:
        while True:
            try:
                image_id = await image_queue.get()
                # Sử dụng ProcessPoolExecutor để tận dụng đa nhân CPU (vượt qua GIL)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(image_executor, image_processor.process_compressed_image, image_id)
                image_queue.task_done()
            except Exception as e:
                print(f"Worker Error: {e}")
            await asyncio.sleep(0.1) # Tránh chiếm dụng CPU 100%
    except asyncio.CancelledError:
        print("Image Worker: Stopping gracefully...")

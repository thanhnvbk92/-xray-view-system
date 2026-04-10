import os
import shutil
from datetime import datetime
from PIL import Image
from . import database, config
from .database import get_db

class ImageEngine:
    """Base class cho các engine xử lý ảnh"""
    def compress(self, input_path: str, target_path: str):
        raise NotImplementedError("Engine must implement compress method")

class CPUEngine(ImageEngine):
    """Engine xử lý bằng CPU sử dụng thư viện Pillow"""
    def compress(self, input_path: str, target_path: str):
        with Image.open(input_path) as img:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # Nén JPEG chất lượng 75%, tối ưu hóa dung lượng
            img.save(target_path, "JPEG", quality=75, optimize=True)

class GPUEngine(ImageEngine):
    """
    Engine xử lý bằng GPU (NVIDIA CUDA).
    Sử dụng PyTorch để đưa dữ liệu lên GPU, giảm tải cho CPU và sẵn sàng cho AI.
    """
    def __init__(self):
        self.is_gpu_ready = False
        try:
            import torch
            import torchvision.io as io
            self.torch = torch
            self.io = io
            self.is_gpu_ready = torch.cuda.is_available()
            if self.is_gpu_ready:
                # In thông tin GPU để debug
                device_name = torch.cuda.get_device_name(0)
                print(f"Image Engine: GPU mode activated ({device_name})")
        except ImportError:
            self.is_gpu_ready = False
        
    def compress(self, input_path: str, target_path: str):
        if not self.is_gpu_ready:
            # Fallback về CPU engine nếu không có CUDA
            return CPUEngine().compress(input_path, target_path)
        
        try:
            # 1. Đọc ảnh vào Tensor (CPU)
            img_tensor = self.io.read_image(input_path)
            
            # 2. Chuyển dữ liệu lên GPU (CUDA) - Giúp CPU rảnh tay cho các task khác
            gpu_tensor = img_tensor.to('cuda')
            
            # 3. Thực hiện Encode/Save 
            # Lưu ý: torchvision.io.write_jpeg sẽ nhận tensor từ CPU
            # Việc nén JPEG diễn ra với các tập lệnh tối ưu
            self.io.write_jpeg(gpu_tensor.to('cpu'), target_path, quality=75)
            
            # Giải phóng bộ nhớ GPU ngay lập tức
            del gpu_tensor
            # self.torch.cuda.empty_cache() # Chỉ gọi nếu bộ nhớ GPU quá hạn hẹp
            
        except Exception as e:
            print(f"GPU Processing error: {e}. Falling back to CPU.")
            return CPUEngine().compress(input_path, target_path)

def get_processor_engine():
    """Factory method để lấy engine phù hợp theo cấu hình"""
    if config.IMAGE_ENGINE == "GPU":
        return GPUEngine()
    return CPUEngine()

def process_compressed_image(image_id: int):
    """Background task chính để nén và di chuyển ảnh"""
    # print(f"DEBUG: Processing image_id={image_id}")
    db = next(get_db())
    try:
        img_record = db.query(database.PCBImage).filter(database.PCBImage.id == image_id).first()
        if not img_record:
            print(f"DEBUG: Image record {image_id} not found in DB")
            return
            
        if not img_record.image_path:
            print(f"DEBUG: Image record {image_id} has no image_path")
            return
            
        # 1. Kiểm tra trạng thái đã xử lý
        if img_record.is_processed:
            print(f"DEBUG: Image already processed (is_processed=True): {img_record.image_path}")
            db.close()
            return True
            
        original_path = img_record.image_path
        if not os.path.exists(original_path):
            print(f"DEBUG: Original image NOT FOUND: {original_path}. Marking as processed to skip.")
            img_record.is_processed = True
            db.commit()
            return

        # 1. Thu thập dữ liệu phân cấp
        pcb = img_record.pcb
        line_name = "UnknownLine"
        machine_name = "UnknownMachine"
        job_name = "UnknownJob"
        test_time = datetime.now()

        if pcb:
            job_name = pcb.job_file if pcb.job_file else "UnknownJob"
            test_time = pcb.client_time if pcb.client_time else datetime.now()
            if pcb.machine:
                machine_name = pcb.machine.name
                if pcb.machine.line:
                    line_name = pcb.machine.line.name

        # 2. Tạo đường dẫn lưu trữ: {Line}/{Machine}/{Year}/{Month}/{Day}/{JobFile}
        rel_path = os.path.join(
            line_name,
            machine_name,
            test_time.strftime("%Y"),
            test_time.strftime("%m"),
            test_time.strftime("%d"),
            job_name.replace("/", "_").replace("\\", "_")
        )
        
        target_dir = os.path.join(config.STORAGE_DIR, rel_path)
        os.makedirs(target_dir, exist_ok=True)
        
        file_name = os.path.basename(original_path)
        target_path = os.path.join(target_dir, file_name)
        # print(f"DEBUG: Compressing to: {target_path}")
        
        # 3. Thực hiện di chuyển ảnh trực tiếp (Bỏ nén để tăng tốc)
        print(f"Image: {file_name} - moving to storage...")
        shutil.move(original_path, target_path)
        print(f"Image: {file_name} - process done")
        db_path = f"/storage/{rel_path.replace(os.sep, '/')}/{file_name}"
        img_record.image_path = db_path
        img_record.is_processed = True # Đánh dấu đã xử lý
        
        # Nếu PCB đang lưu path cũ, cập nhật luôn pcb.image_path
        pcb = db.query(database.PCB).filter(database.PCB.id == img_record.pcb_id).first()
        if pcb and (pcb.image_path == original_path):
            pcb.image_path = db_path
            
        db.commit()
        # print(f"DEBUG: Database updated for {image_id}")
        
        # 5. Dọn dẹp ảnh tạm (không cần vì đã dùng shutil.move)
        pass
            
    except Exception as e:
        print(f"ERROR in image_processor for {image_id}: {e}")
    finally:
        db.close()

def process_ai_analysis(image_id: int):
    """Mở rộng: Phân tích AI sau nén"""
    # TODO: Gọi AI Engine tại đây
    pass

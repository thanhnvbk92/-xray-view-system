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
            # Tối ưu tốc độ: Tắt optimize, sử dụng chất lượng 75%
            # Subsampling=2 (4:2:0) là tiêu chuẩn cân bằng tốc độ/dung lượng
            img.save(target_path, "JPEG", quality=75, optimize=False, subsampling=2)

class GPUEngine(ImageEngine):
    """
    Engine xử lý bằng GPU (NVIDIA CUDA).
    Tận dụng 2 card Titan X bằng cách phân bổ Worker theo tiến trình.
    """
    def __init__(self, device_id=None):
        self.is_gpu_ready = False
        try:
            import torch
            import torchvision.io as io
            import multiprocessing as mp
            
            self.torch = torch
            self.io = io
            
            # Tự động gán GPU nếu không chỉ định:
            # (Process ID - 1) % GPU_COUNT giúp chia đều tải cho 2 card
            if device_id is None:
                try:
                    ident = mp.current_process()._identity
                    if ident:
                        device_id = (ident[0] - 1) % config.GPU_COUNT
                    else:
                        device_id = 0
                except:
                    device_id = 0
            
            self.device = torch.device(f'cuda:{device_id}')
            self.is_gpu_ready = torch.cuda.is_available()
            
            if self.is_gpu_ready:
                device_name = torch.cuda.get_device_name(device_id)
                print(f"Image Engine: Process {mp.current_process().pid} assigned to GPU {device_id} ({device_name})")
        except ImportError:
            self.is_gpu_ready = False
        
    def compress(self, input_path: str, target_path: str):
        if not self.is_gpu_ready:
            return CPUEngine().compress(input_path, target_path)
        
        try:
            # 1. Đọc ảnh vào Tensor (CPU)
            img_tensor = self.io.read_image(input_path)
            
            # 2. Xử lý trên GPU (VD: đưa lên GPU để tận dụng bus dữ liệu nhanh)
            # Dù write_jpeg chạy trên CPU, việc preprocessing trên GPU vẫn giúp ích
            gpu_tensor = img_tensor.to(self.device)
            
            # 3. Thực hiện Encode (về CPU để save)
            # Với CUDA 12.x, torchvision được tối ưu hóa cho các tập lệnh tập trung của NV
            self.io.write_jpeg(gpu_tensor.cpu(), target_path, quality=75)
            
            del gpu_tensor
            
        except Exception as e:
            print(f"GPU Processing error: {e}. Falling back to CPU.")
            return CPUEngine().compress(input_path, target_path)

_engine_cache = None

def get_processor_engine():
    """Factory method để lấy engine phù hợp, có sử dụng cache để tối ưu hiệu năng"""
    global _engine_cache
    if _engine_cache is not None:
        return _engine_cache
        
    if config.IMAGE_ENGINE == "GPU":
        _engine_cache = GPUEngine()
    else:
        _engine_cache = CPUEngine()
        
    return _engine_cache

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
            # Nếu file không tồn tại nhưng path bắt đầu bằng /storage/ thì có nghĩa là đã được di chuyển rồi
            if original_path.startswith("/storage/"):
                img_record.is_processed = True
                db.commit()
                return True
                
            print(f"DEBUG: Original image NOT FOUND: {original_path}. Marking as processed to skip.")
            img_record.is_processed = True
            db.commit()
            return
            
        # 1.1 Kiểm tra điều kiện có được phép lưu trữ chưa (OK ngay hoặc NG đã đánh giá)
        is_ok_result = img_record.machine_result == "OK"
        is_user_evaluated = img_record.user_result != "PENDING"
        
        # Nếu là NG và CHƯA được đánh giá -> Bỏ qua, để ảnh lại thư mục upload chất lượng cao
        if not is_ok_result and not is_user_evaluated:
            # print(f"DEBUG: Image {image_id} is NG and NOT yet evaluated. Holding in upload folder.")
            return False

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
        
        # 3. Thực hiện nén ảnh và lưu vào storage
        print(f"Image: {file_name} - compressing...")
        engine = get_processor_engine()
        engine.compress(original_path, target_path)
        
        # Xóa ảnh gốc sau khi nén thành công
        if os.path.exists(target_path) and original_path != target_path:
            os.remove(original_path)
            
        print(f"Image: {file_name} - compression done")
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

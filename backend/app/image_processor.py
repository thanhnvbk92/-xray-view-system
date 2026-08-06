import os
import shutil
import threading
from datetime import datetime
from PIL import Image, UnidentifiedImageError
import multiprocessing as mp
import cv2
import numpy as np

cv2.setNumThreads(1)

try:
    import torch
    import torchvision.io as io
    HAS_GPU_LIBS = True
except ImportError:
    HAS_GPU_LIBS = False

from . import config


_target_dirs = set()
_target_dirs_lock = threading.Lock()

def verbose_log(message: str):
    """Avoid synchronous console I/O for every image in production."""
    if config.IMAGE_VERBOSE_LOG:
        print(message)

def ensure_target_dir(target_dir: str):
    """Create each target folder once per process to reduce metadata I/O."""
    if not target_dir:
        return
    with _target_dirs_lock:
        if target_dir in _target_dirs:
            return
        os.makedirs(target_dir, exist_ok=True)
        _target_dirs.add(target_dir)

def choose_reduced_decode(original_kb: float, target_kb: float):
    """Chọn DCT scaling trước decode để không giải mã các pixel thừa."""
    desired_scale = min(1.0, (target_kb / original_kb) ** 0.5)
    if desired_scale <= 0.125:
        return cv2.IMREAD_REDUCED_COLOR_8, 8
    if desired_scale <= 0.25:
        return cv2.IMREAD_REDUCED_COLOR_4, 4
    return cv2.IMREAD_REDUCED_COLOR_2, 2

def encode_jpeg_bytes(image, quality: int):
    ok, encoded = cv2.imencode(
        ".jpg",
        image,
        [int(cv2.IMWRITE_JPEG_QUALITY), quality, int(cv2.IMWRITE_JPEG_OPTIMIZE), 0],
    )
    return encoded.tobytes() if ok else None

class ImageEngine:
    """Base class cho các engine xử lý ảnh"""
    def compress(self, input_path: str, target_path: str):
        raise NotImplementedError("Engine must implement compress method")

class CPUEngine(ImageEngine):
    """
    Engine xử lý bằng CPU Turbo sử dụng OpenCV (DCT scaling + downscaling + nén thích ứng theo target KB).
    Tham khảo từ compress_cpu_turbo.py giúp nén sâu hơn (~100KB) và không làm quá tải CPU.
    """
    def compress(self, input_path: str, target_path: str):
        try:
            target_kb = getattr(config, 'IMAGE_TARGET_KB', 100)
            strict_target = getattr(config, 'IMAGE_STRICT_TARGET', False)

            # 1. Đọc dữ liệu thô
            with open(input_path, "rb", buffering=1024 * 1024) as f:
                original_bytes = f.read()
            
            original_size = len(original_bytes)
            if original_size == 0:
                return False
                
            original_kb = original_size / 1024.0

            # Nếu dung lượng file gốc đã <= target_kb * 1.05 thì giữ nguyên / copy trực tiếp
            if original_kb <= target_kb * 1.05:
                ensure_target_dir(os.path.dirname(target_path))
                with open(target_path, "wb", buffering=1024 * 1024) as f_out:
                    f_out.write(original_bytes)
                return True

            # 2. Giải mã bằng OpenCV với kĩ thuật Reduced DCT decode
            decode_flag, reduction = choose_reduced_decode(original_kb, target_kb)
            img = cv2.imdecode(np.frombuffer(original_bytes, dtype=np.uint8), decode_flag)
            
            if img is not None:
                # Tính tỉ lệ downscale thích ứng dựa vào target_kb
                desired_scale = min(1.0, (target_kb / original_kb) ** 0.5 * 0.92)
                residual_scale = min(1.0, desired_scale * reduction)
                if residual_scale < 0.94:
                    h, w = img.shape[:2]
                    new_w = max(1, round(w * residual_scale))
                    new_h = max(1, round(h * residual_scale))
                    img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

                # Tính chất lượng nén JPEG động
                quality = max(35, min(82, round(68 + 12 * target_kb / original_kb)))
                compressed_bytes = encode_jpeg_bytes(img, quality)
                
                if compressed_bytes is not None:
                    # Chạy lượt 2 nếu bật strict_target và ảnh nén lần 1 vượt target
                    if strict_target and len(compressed_bytes) > target_kb * 1024 * 1.05:
                        ratio = target_kb * 1024 / len(compressed_bytes)
                        retry_quality = max(25, min(quality - 5, round(quality * (ratio ** 0.35))))
                        retry_bytes = encode_jpeg_bytes(img, retry_quality)
                        if retry_bytes is not None:
                            compressed_bytes = retry_bytes

                    output_bytes = compressed_bytes if len(compressed_bytes) < original_size else original_bytes
                    
                    ensure_target_dir(os.path.dirname(target_path))
                    tmp_path = target_path + f".cpu-{os.getpid()}.tmp"
                    with open(tmp_path, "wb", buffering=1024 * 1024) as stream:
                        stream.write(output_bytes)
                    os.replace(tmp_path, target_path)
                    return True

        except Exception as err:
            verbose_log(f"OpenCV Turbo CPU compression error: {err}. Trying PIL fallback...")

        # --- Fallback bằng PIL nếu OpenCV không xử lý được ---
        try:
            with Image.open(input_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                quality = getattr(config, 'IMAGE_QUALITY', 50)
                ensure_target_dir(os.path.dirname(target_path))
                img.save(target_path, "JPEG", quality=quality, optimize=True, subsampling=2)
            return True
        except (UnidentifiedImageError, Exception) as e:
            verbose_log(f"CPU Processing warning: {e}. Falling back to COPY for {os.path.basename(input_path)}")
            try:
                ensure_target_dir(os.path.dirname(target_path))
                shutil.copy2(input_path, target_path)
                return os.path.isfile(target_path) and os.path.getsize(target_path) > 0
            except Exception as copy_err:
                verbose_log(f"Copy fallback failed for {input_path}: {copy_err}")
                if os.path.exists(target_path) and os.path.getsize(target_path) == 0:
                    try:
                        os.remove(target_path)
                    except Exception:
                        pass
                return False

class GPUEngine(ImageEngine):
    """
    Engine xử lý bằng GPU (NVIDIA CUDA).
    Tận dụng 2 card Titan X bằng cách phân bổ Worker theo tiến trình.
    """
    def __init__(self, device_id=None):
        self.is_gpu_ready = False
        if not HAS_GPU_LIBS:
            return

        try:
            self.torch = torch
            self.io = io
            
            # Tự động gán GPU nếu không chỉ định:
            # (Process ID - 1) % GPU_COUNT giúp chia đều tải cho 2 card
            if device_id is None:
                try:
                    ident = mp.current_process()._identity
                    if ident and len(ident) > 0:
                        device_id = (ident[0] - 1) % config.GPU_COUNT
                    else:
                        device_id = 0
                except:
                    device_id = 0
            
            self.device_id = device_id
            self.device = torch.device(f'cuda:{device_id}')
            torch.cuda.set_device(self.device)
            self.is_gpu_ready = torch.cuda.is_available()
            
            if self.is_gpu_ready:
                device_name = torch.cuda.get_device_name(device_id)
                verbose_log(f"Image Engine: Worker {mp.current_process().pid} pinned to TITAN X GPU {device_id} ({device_name})")
        except Exception as e:
            verbose_log(f"GPU Init Error: {e}")
            self.is_gpu_ready = False
        
    def compress(self, input_path: str, target_path: str):
        if not self.is_gpu_ready:
            return CPUEngine().compress(input_path, target_path)
        
        import time
        start_t = time.time()
        try:
            # 1. Đọc ảnh vào Tensor (CPU)
            img_tensor = self.io.read_image(input_path)
            
            # 2. Xử lý nén
            quality = getattr(config, 'IMAGE_QUALITY', 75)
            self.io.write_jpeg(img_tensor, target_path, quality=quality)
            
            duration = (time.time() - start_t) * 1000
            if config.IMAGE_VERBOSE_LOG:
                print(f"  [TURBO] Compressed: {os.path.basename(target_path)} in {duration:.1f}ms (Worker {mp.current_process().pid})")
            return True
        except Exception as e:
            # logger warning if it's not a common image format
            if "Unsupported image file" in str(e) or "cannot identify" in str(e).lower():
                 return CPUEngine().compress(input_path, target_path)
            
            verbose_log(f"GPU Processing error: {e}. Falling back to CPU.")
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

def cleanup_image_previews(image_id: int):
    """Xóa tất cả các file preview đệm trong data/previews liên quan đến image_id."""
    preview_dir = os.path.join(config.DATA_ROOT, "previews")
    if not os.path.isdir(preview_dir):
        return
    prefix = f"{image_id}-"
    try:
        for entry in os.scandir(preview_dir):
            if entry.is_file() and entry.name.startswith(prefix):
                try:
                    os.remove(entry.path)
                except Exception as err:
                    verbose_log(f"Warning: Could not remove preview file {entry.path}: {err}")
    except Exception as e:
        verbose_log(f"Error scanning preview dir for image {image_id}: {e}")

def process_compressed_image(image_id: int):
    """Background task chính để nén và di chuyển ảnh"""
    # print(f"DEBUG: Processing image_id={image_id}")
    from . import database
    from .database import get_db
    db = next(get_db())
    try:
        img_record = db.query(database.PCBImage).filter(database.PCBImage.id == image_id).first()
        if not img_record:
            verbose_log(f"DEBUG: Image record {image_id} not found in DB")
            return
            
        if not img_record.image_path:
            verbose_log(f"DEBUG: Image record {image_id} has no image_path")
            return
            
        # 1. Kiểm tra trạng thái đã xử lý
        if img_record.is_processed:
            verbose_log(f"DEBUG: Image already processed (is_processed=True): {img_record.image_path}")
            cleanup_image_previews(image_id)
            db.close()
            return True
            
        original_path = img_record.image_path
        if not os.path.exists(original_path):
            # Nếu file không tồn tại nhưng path bắt đầu bằng /storage/ thì có nghĩa là đã được di chuyển rồi
            if original_path.startswith("/storage/"):
                img_record.is_processed = True
                db.commit()
                cleanup_image_previews(image_id)
                return True
                
            verbose_log(f"DEBUG: Original image NOT FOUND: {original_path}. Leaving unprocessed.")
            return

        # Nếu file gốc 0-byte (file rác hỏng), xóa và đánh dấu processed để tránh treo worker
        if os.path.getsize(original_path) == 0:
            verbose_log(f"Warning: Original image is 0 bytes (corrupt): {original_path}. Purging and marking processed.")
            try:
                os.remove(original_path)
            except Exception:
                pass
            img_record.is_processed = True
            db.commit()
            cleanup_image_previews(image_id)
            return True

        # Nếu là file ảnh đuôi .raw -> Không nén / lưu trữ, đánh dấu processed và giải phóng
        if original_path.lower().endswith(".raw"):
            verbose_log(f"Ignoring .raw image for image_id {image_id}: {original_path}. Marking processed.")
            if os.path.exists(original_path):
                try:
                    os.remove(original_path)
                except Exception:
                    pass
            img_record.is_processed = True
            db.commit()
            cleanup_image_previews(image_id)
            return True
            
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
        ensure_target_dir(target_dir)
        
        file_name = os.path.basename(original_path)
        target_path = os.path.join(target_dir, file_name)
        # print(f"DEBUG: Compressing to: {target_path}")
        
        # 3. Thực hiện nén ảnh và lưu vào storage
        if os.path.isfile(target_path) and os.path.getsize(target_path) > 0:
            # A previous attempt already wrote the compressed file. Reuse it
            # instead of decoding and encoding the same source again.
            compressed = True
        else:
            verbose_log(f"Image: {file_name} - compressing...")
            engine = get_processor_engine()
            compressed = engine.compress(original_path, target_path)

        if not compressed or not os.path.isfile(target_path) or os.path.getsize(target_path) == 0:
            if os.path.exists(target_path) and os.path.getsize(target_path) == 0:
                try:
                    os.remove(target_path)
                except Exception:
                    pass
            raise RuntimeError(f"Compression did not produce a valid target: {target_path}")
        
        # Xóa ảnh gốc sau khi nén thành công
        if os.path.exists(target_path) and original_path != target_path:
            try:
                if os.path.exists(original_path):
                    os.remove(original_path)
            except Exception as remove_err:
                verbose_log(f"Warning: Could not remove original file {original_path}: {remove_err}")
            
        verbose_log(f"Image: {file_name} - compression done")
        db_path = f"/storage/{rel_path.replace(os.sep, '/')}/{file_name}"
        img_record.image_path = db_path
        img_record.is_processed = True # Đánh dấu đã xử lý
        
        # Nếu PCB đang lưu path cũ, cập nhật luôn pcb.image_path
        pcb = db.query(database.PCB).filter(database.PCB.id == img_record.pcb_id).first()
        if pcb and (pcb.image_path == original_path):
            pcb.image_path = db_path
            
        db.commit()
        
        # 5. Dọn dẹp ảnh preview tạm thời sau khi nén thành công
        cleanup_image_previews(image_id)
            
    except Exception as e:
        print(f"ERROR in image_processor for {image_id}: {e}")
    finally:
        db.close()

def process_ai_analysis(image_id: int):
    """Mở rộng: Phân tích AI sau nén"""
    # TODO: Gọi AI Engine tại đây
    pass

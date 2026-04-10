import os
import time
import shutil
import argparse
from datetime import datetime
from PIL import Image

def get_timestamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

class ImageProcessor:
    def __init__(self, use_gpu=False, quality=75):
        self.quality = quality
        self.use_gpu = use_gpu
        self.gpu_ready = False
        
        if use_gpu:
            try:
                import torch
                import torchvision.io as io
                self.torch = torch
                self.io = io
                self.gpu_ready = torch.cuda.is_available()
                if self.gpu_ready:
                    print(f"[{get_timestamp()}] INFO: GPU mode activated ({torch.cuda.get_device_name(0)})")
                else:
                    print(f"[{get_timestamp()}] WARNING: CUDA not available, falling back to CPU")
            except ImportError:
                print(f"[{get_timestamp()}] WARNING: torch/torchvision not found, falling back to CPU")
                self.gpu_ready = False

    def process_file(self, input_path, output_path):
        """Nén và chuyển đổi ảnh sang JPEG"""
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            if self.gpu_ready:
                # GPU Processing
                img_tensor = self.io.read_image(input_path)
                gpu_tensor = img_tensor.to('cuda')
                # torchvision writes from CPU tensor but uses optimized encoding
                self.io.write_jpeg(gpu_tensor.to('cpu'), output_path, quality=self.quality)
                del gpu_tensor
            else:
                # CPU Processing (Pillow)
                with Image.open(input_path) as img:
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    img.save(output_path, "JPEG", quality=self.quality, optimize=True)
            
            return True
        except Exception as e:
            print(f"[{get_timestamp()}] ERROR processing {input_path}: {e}")
            return False

def monitor_folder(source_dir, target_root, use_gpu=False, quality=75, interval=2):
    """Theo dõi thư mục và xử lý ảnh mới"""
    processor = ImageProcessor(use_gpu=use_gpu, quality=quality)
    
    print(f"[{get_timestamp()}] INFO: Monitoring {source_dir}...")
    print(f"[{get_timestamp()}] INFO: Target Root: {target_root}")
    
    while True:
        try:
            # Lấy danh sách ảnh trong source (chỉ lấy level 1)
            files = [f for f in os.listdir(source_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
            
            for file_name in files:
                source_path = os.path.join(source_dir, file_name)
                
                # Tránh xử lý file đang được ghi (vẫn đang upload)
                # Kiểm tra size sau 1s nếu cần, ở đây dùng block đơn giản
                
                # Logic phân cấp thư mục (Giả sử file name có format: Line_Machine_PID_...)
                # Nếu không có format, lưu vào thư mục mặc định theo ngày
                parts = file_name.split('_')
                if len(parts) >= 3:
                    line = parts[0]
                    machine = parts[1]
                    # Target path: {TargetRoot}/{Line}/{Machine}/{Year}/{Month}/{Day}/{FileName}
                    now = datetime.now()
                    target_dir = os.path.join(
                        target_root, 
                        line, 
                        machine, 
                        now.strftime("%Y"), 
                        now.strftime("%m"), 
                        now.strftime("%d")
                    )
                else:
                    target_dir = os.path.join(target_root, "Unsorted", datetime.now().strftime("%Y-%m-%d"))
                
                target_path = os.path.join(target_dir, file_name)
                
                print(f"[{get_timestamp()}] Processing: {file_name}")
                if processor.process_file(source_path, target_path):
                    os.remove(source_path)
                    print(f"[{get_timestamp()}] Done: {file_name}")
            
        except Exception as e:
            print(f"[{get_timestamp()}] Global Error: {e}")
            
        time.sleep(interval)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Standalone Image Processor for Xray View System")
    parser.add_argument("--source", required=True, help="Thư mục nguồn (chứa ảnh tạm)")
    parser.add_argument("--target", required=True, help="Thư mục đích (thư mục lưu trữ chính)")
    parser.add_argument("--gpu", action="store_true", help="Sử dụng GPU (NVIDIA CUDA)")
    parser.add_argument("--quality", type=int, default=75, help="Chất lượng ảnh JPEG (1-100)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.source):
        print(f"Error: Source directory {args.source} does not exist.")
        exit(1)
        
    monitor_folder(args.source, args.target, use_gpu=args.gpu, quality=args.quality)

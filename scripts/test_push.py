import requests
import os
import sys
import time
from datetime import datetime

# Thêm thư mục hiện tại vào sys.path để import được backend
sys.path.append(os.getcwd())

API_URL = "http://10.7.12.236:8000"

def test_integration():
    print("--- STARTING INTEGRATION TEST ---")
    
    try:
        # 1. Test Heartbeat
        print("\n1. Testing Heartbeat...")
        # LƯU Ý: Cần có machine_id=1 trong DB. Lúc init_db ta chưa tạo machine nào.
        # Ta sẽ giả lập lỗi 404 trước, sau đó ta sẽ tạo machine.
        hb_data = {"machine_id": 1}
        response = requests.post(f"{API_URL}/heartbeat", json=hb_data)
        if response.status_code == 404:
            print("Expected: Machine 1 not found. Creating a test machine directly in DB...")
            # Tạo machine 1 trực tiếp qua script này (hoặc dùng endpoint nếu có - hiện tại chưa có admin endpoint)
            # Vì đây là test tích hợp, tôi sẽ dùng SQLAlchemy để chèn 1 line và 1 machine mẫu.
            from backend.database import SessionLocal, Machine, Line
            db = SessionLocal()
            if not db.query(Line).filter(Line.id == 1).first():
                db.add(Line(id=1, name="Line 1", description="Test Line"))
            if not db.query(Machine).filter(Machine.id == 1).first():
                db.add(Machine(id=1, name="Xray-01", line_id=1, ip_address="127.0.0.1"))
            db.commit()
            db.close()
            print("[OK] Test Machine created.")
            # Thử lại heartbeat
            response = requests.post(f"{API_URL}/heartbeat", json=hb_data)
        
        print(f"Heartbeat Result: {response.json()}")

        # 2. Test Scan Upload
        print("\n2. Testing Scan Upload...")
        # Tạo file ảnh giả
        test_img = "test_pcb.jpg"
        with open(test_img, "wb") as f:
            f.write(b"fake image data")
        
        with open(test_img, 'rb') as f:
            files = {'file': (test_img, f, 'image/jpeg')}
            data = {
                "pid": "PCB-TEST-001",
                "machine_id": 1,
                "result": "OK",
                "test_time": datetime.now().isoformat()
            }
            response = requests.post(f"{API_URL}/api/pcbs/upload-scan", data=data, files=files)
            print(f"Upload Result: {response.json()}")
        
        # 3. Verify in DB
        print("\n3. Verifying in Database...")
        from backend.database import SessionLocal, PCB
        db = SessionLocal()
        pcb = db.query(PCB).filter(PCB.pid == "PCB-TEST-001").first()
        if pcb:
            print(f"[SUCCESS]: Found PCB in database with ID: {pcb.id}, Path: {pcb.image_path}")
        else:
            print("[FAILURE]: PCB not found in database.")
        db.close()

    except Exception as e:
        print(f"Integration Error: {e}")
    finally:
        if os.path.exists("test_pcb.jpg"):
            os.remove("test_pcb.jpg")

if __name__ == "__main__":
    test_integration()

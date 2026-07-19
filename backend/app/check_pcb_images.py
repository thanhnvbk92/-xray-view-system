import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import PCB, PCBImage

DATABASE_URL = "mysql+pymysql://admin:111111@localhost:3306/XrayDB"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

# Tìm PCB có pid là '607HS115516' hoặc PCB unconfirmed của machine_id = 7
print("--- 5 PCB unconfirmed gần nhất của machine 7 ---")
pcbs = session.query(PCB).filter(PCB.machine_id == 7, PCB.user_confirmed == False).order_by(PCB.client_time.desc()).limit(5).all()
for pcb in pcbs:
    print(f"PCB ID: {pcb.id}, PID: {pcb.pid}, Time: {pcb.client_time}, Confirmed: {pcb.user_confirmed}")
    images = session.query(PCBImage).filter(PCBImage.pcb_id == pcb.id).all()
    print(f"  Số lượng ảnh liên kết: {len(images)}")
    for img in images[:5]:
        print(f"    Image ID: {img.id}, Type: {img.image_type}, Machine Result: {img.machine_result}, User Result: {img.user_result}, Path: {img.image_path}")
    if len(images) > 5:
        print(f"    ... và {len(images) - 5} ảnh khác")
session.close()

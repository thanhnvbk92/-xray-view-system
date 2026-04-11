import os

file_path = 'main.py'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Đoạn mã SQL Aggregation chính xác cho phần thống kê Shot
new_shot_logic = [
    "        # 3. Tỉ lệ lỗi theo Shot (Gia tốc 100x bằng SQL Aggregation)\n",
    "        unit_stats_q = db.query(\n",
    "            func.replace(func.substring_index(database.PCBImage.image_path, '_', -1), '.jpg', '').label('unit_id'),\n",
    "            func.count(database.PCBImage.id).label('total'),\n",
    "            func.sum(case((database.PCBImage.machine_result == 'NG', 1), else_=0)).label('ng_count')\n",
    "        ).join(database.PCB, database.PCBImage.pcb_id == database.PCB.id)\\\n",
    "         .filter(\n",
    "             database.PCB.system_time >= start_dt, \n",
    "             database.PCB.system_time <= end_dt,\n",
    "             database.PCBImage.image_path.not_like('%_o.jpg')\n",
    "         )\n",
    "        \n",
    "        if machine_id: unit_stats_q = unit_stats_q.filter(database.PCB.machine_id == machine_id)\n",
    "        if job_file: unit_stats_q = unit_stats_q.filter(database.PCB.job_file == job_file)\n",
    "\n",
    "        unit_results = unit_stats_q.group_by('unit_id').all()\n",
    "        \n",
    "        unit_data = [\n",
    "            {\n",
    "                'unit': r[0],\n",
    "                'total': r[1],\n",
    "                'ng': int(r[2]) if r[2] else 0,\n",
    "                'ng_rate': round((int(r[2])/r[1]*100), 2) if r[1] > 0 else 0\n",
    "            } for r in unit_results\n",
    "        ]\n",
    "        unit_data.sort(key=lambda x: int(x['unit']) if x['unit'] and x['unit'].isdigit() else 999)\n",
    "\n",
    "        return {\n",
    "            'overall': overall_stats,\n",
    "            'machines': machine_data,\n",
    "            'jobs': job_data,\n",
    "            'units': unit_data\n",
    "        }\n"
]

# Tìm vùng bị lỗi (Dựa trên nội dung quan sát được)
# Chúng ta sẽ thay thế từ dòng có chú thích "# 3. Tỉ lệ lỗi theo Shot" cho đến trước khối "except Exception"
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "# 3. Tỉ lệ lỗi theo Shot" in line:
        start_idx = i
    if "except Exception as e:" in line and start_idx != -1:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    # Thực hiện thay thế đoạn mã
    final_lines = lines[:start_idx] + new_shot_logic + lines[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(final_lines)
    print("REPAIR SUCCESS: main.py has been fixed with optimized SQL logic.")
else:
    print(f"REPAIR FAILED: Could not find markers (start: {start_idx}, end: {end_idx})")

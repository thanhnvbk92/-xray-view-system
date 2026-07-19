import requests
import time
import json

# URL của endpoint (giả sử backend đang chạy tại localhost:8000)
BASE_URL = "http://localhost:8000"
TOKEN = "" # Cần token nếu có auth

def get_auth_token():
    # Giả sử admin/admin
    try:
        res = requests.post(f"{BASE_URL}/api/v1/auth/login", data={"username": "admin", "password": "admin"})
        if res.status_code == 200:
            return res.json()["access_token"]
    except:
        pass
    return None

def test_cache():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    params = {
        "start_date": "2026-04-11",
        "end_date": "2026-04-18"
    }
    
    print("--- Lần gọi thứ nhất (chưa có cache) ---")
    start = time.time()
    res1 = requests.get(f"{BASE_URL}/api/v1/analysis/summary", params=params, headers=headers)
    end = time.time()
    if res1.status_code == 200:
        print(f"Lần 1 hoàn thành trong {end - start:.2f}s")
    else:
        print(f"Lần 1 lỗi: {res1.status_code} - {res1.text}")
        return

    print("\n--- Lần gọi thứ hai (hi vọng có cache hit) ---")
    start = time.time()
    res2 = requests.get(f"{BASE_URL}/api/v1/analysis/summary", params=params, headers=headers)
    end = time.time()
    if res2.status_code == 200:
        print(f"Lần 2 hoàn thành trong {end - start:.2f}s")
        if end - start < 0.1:
            print("=> Cache hit thành công!")
        else:
            print("=> Cảnh báo: Lần 2 vẫn mất nhiều thời gian, có thể cache chưa hoạt động.")
    else:
        print(f"Lần 2 lỗi: {res2.status_code}")

    print("\n--- Lần gọi thứ ba với tham số khác (fresh data) ---")
    params["machine_id"] = 1
    start = time.time()
    res3 = requests.get(f"{BASE_URL}/api/v1/analysis/summary", params=params, headers=headers)
    end = time.time()
    if res3.status_code == 200:
        print(f"Lần 3 hoànation trong {end - start:.2f}s")
    else:
        print(f"Lần 3 lỗi: {res3.status_code}")

if __name__ == "__main__":
    test_cache()

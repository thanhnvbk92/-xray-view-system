import urllib.request
import json

try:
    url = "http://127.0.0.1:8000/api/pcbs/unconfirmed/1"
    print(f"Requesting {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=5) as response:
        html = response.read()
        data = json.loads(html.decode('utf-8'))
        print("Total:", data.get("total"))
        pcbs = data.get("pcbs", [])
        if pcbs:
            print("First PCB:")
            first_pcb = pcbs[0]
            print(f"ID: {first_pcb.get('id')}, PID: {first_pcb.get('pid')}, final_result: {first_pcb.get('final_result')}")
            images = first_pcb.get("images", [])
            print(f"Number of images: {len(images)}")
            if images:
                print("First image:", json.dumps(images[0], indent=2))
        else:
            print("No PCBs found for machine 1")
except Exception as e:
    print("Error:", e)

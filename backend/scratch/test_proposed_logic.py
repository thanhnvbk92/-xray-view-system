from sqlalchemy import create_engine, text

DATABASE_URL = 'mysql+pymysql://admin:111111@127.0.0.1:3306/XrayDB'
engine = create_engine(DATABASE_URL)

def test_display_logic(pcb_images, only_show_ng=True):
    # Rule candidate 1:
    # Prefer marked images. But if an origin image is NG (or if shot has no marked image), include it.
    # Group images by shot_num
    shots = {}
    for img in pcb_images:
        s_num = img['shot_num'] or 1
        shots.setdefault(s_num, []).append(img)
    
    candidate_images = []
    for s_num, img_list in sorted(shots.items()):
        # If there's a marked image in this shot, use marked. If not, use origin.
        marked_imgs = [i for i in img_list if i['i_type'] != 'origin']
        origin_imgs = [i for i in img_list if i['i_type'] == 'origin']
        
        # If any image in shot is NG, prioritize the NG image(s)
        ng_imgs = [i for i in img_list if i['machine_result'] == 'NG']
        if ng_imgs:
            # Add all NG images in this shot (marked or origin)
            candidate_images.extend(ng_imgs)
        elif marked_imgs:
            candidate_images.extend(marked_imgs)
        else:
            candidate_images.extend(origin_imgs)
    
    # Filter by user_result == PENDING
    pending = [img for img in candidate_images if img['user_result'] == 'PENDING']
    
    if only_show_ng:
        ng_pending = [img for img in pending if img['machine_result'] == 'NG']
        if ng_pending:
            return ng_pending
        # Fallback: if PCB is NG but no individual image is NG (e.g. data anomaly), return all pending images so operator can inspect & confirm!
        return pending if pending else candidate_images

    return pending if pending else candidate_images

with engine.connect() as conn:
    pcbs = conn.execute(text('''
        SELECT p.id, p.pid, p.machine_id, p.final_result, p.user_confirmed
        FROM pcbs p
        WHERE p.final_result = 'NG' AND p.user_confirmed = 0
    ''')).mappings().all()

    stuck_count = 0
    for p in pcbs:
        images = conn.execute(text('''
            SELECT id, image_path, machine_result, user_result, shot_num, image_type, cause
            FROM pcb_images
            WHERE pcb_id = :pcb_id
        '''), {'pcb_id': p['id']}).mappings().all()

        normalized = []
        for img in images:
            path_lower = (img['image_path'] or "").lower()
            is_origin = '_o.' in path_lower or '_o.jpg' in path_lower or '_o.png' in path_lower
            i_type = 'origin' if is_origin else 'marked'
            normalized.append({**dict(img), 'i_type': i_type})

        res_ng = test_display_logic(normalized, only_show_ng=True)
        if not res_ng:
            stuck_count += 1
            print(f"STUCK: PCB {p['id']} ({p['pid']}) has {len(images)} images but 0 displayable")

    print(f"\nResult with proposed logic: Stuck PCBs = {stuck_count} / {len(pcbs)}")

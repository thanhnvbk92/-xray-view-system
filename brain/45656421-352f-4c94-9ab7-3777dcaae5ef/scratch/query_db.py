import pymysql
import json

try:
    conn = pymysql.connect(
        host='localhost',
        user='admin',
        password='111111',
        database='XrayDB',
        port=3306,
        cursorclass=pymysql.cursors.DictCursor
    )
    with conn.cursor() as cursor:
        cursor.execute("SELECT id, username, full_name, role, is_approved FROM users")
        users = cursor.fetchall()
        print("=== USERS ===")
        for u in users:
            print(json.dumps(u, ensure_ascii=True))
finally:
    conn.close()

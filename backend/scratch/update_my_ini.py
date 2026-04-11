import os

ini_path = r'C:\ProgramData\MySQL\MySQL Server 8.0\my.ini'
if not os.path.exists(ini_path):
    print(f"Error: {ini_path} not found")
    exit(1)

with open(ini_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

new_lines = []
params_to_update = {
    'innodb_buffer_pool_size': 'innodb_buffer_pool_size=32G\n',
    'innodb_log_file_size': 'innodb_log_file_size=4G\n',
    'innodb_flush_log_at_trx_commit': 'innodb_flush_log_at_trx_commit=2\n',
    'innodb_buffer_pool_instances': 'innodb_buffer_pool_instances=32\n'
}
updated_keys = set()

for line in lines:
    matched = False
    for key, value in params_to_update.items():
        if line.strip().startswith(key + '='):
            new_lines.append(value)
            updated_keys.add(key)
            matched = True
            break
    if not matched:
        new_lines.append(line)

# Thêm những tham số chưa có vào mục [mysqld]
if len(updated_keys) < len(params_to_update):
    final_lines = []
    mysqld_found = False
    for line in new_lines:
        final_lines.append(line)
        if line.strip() == '[mysqld]' and not mysqld_found:
            mysqld_found = True
            for key, value in params_to_update.items():
                if key not in updated_keys:
                    final_lines.append(value)
    new_lines = final_lines

with open(ini_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("my.ini updated successfully with optimized parameters.")

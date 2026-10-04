import zlib
import os
from database import get_connection

# Folder where compressed files are saved
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COMPRESSED_DIR = os.path.join(BASE_DIR, 'compressed')
os.makedirs(COMPRESSED_DIR, exist_ok=True)

# ---------------------------------------------------
# FUNCTION 1: Compress a file and save it
# ---------------------------------------------------
def compress_file(filepath):
    if not os.path.exists(filepath):
        return {'success': False, 'error': 'File not found'}

    filename = os.path.basename(filepath)
    original_size = os.path.getsize(filepath)

    with open(filepath, 'rb') as f:
        original_data = f.read()

    compressed_data = zlib.compress(original_data, level=9)
    compressed_size = len(compressed_data)

    compressed_path = os.path.join(COMPRESSED_DIR, filename + '.zlib')
    with open(compressed_path, 'wb') as f:
        f.write(compressed_data)

    ratio = get_compression_ratio(original_size, compressed_size)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO compression_logs (filename, original_size, compressed_size, ratio)
        VALUES (?, ?, ?, ?)
    ''', (filename, original_size, compressed_size, ratio))
    conn.commit()
    conn.close()

    return {
        'success': True,
        'filename': filename,
        'original_size': original_size,
        'compressed_size': compressed_size,
        'ratio': ratio,
        'compressed_path': compressed_path
    }

# ---------------------------------------------------
# FUNCTION 2: Calculate compression ratio (% saved)
# ---------------------------------------------------
def get_compression_ratio(original_size, compressed_size):
    if original_size == 0:
        return 0
    saved = original_size - compressed_size
    return round((saved / original_size) * 100, 2)

# ---------------------------------------------------
# FUNCTION 3: Decompress a .zlib file and restore it
# ---------------------------------------------------
def decompress_file(compressed_path):
    if not os.path.exists(compressed_path):
        return {'success': False, 'error': 'Compressed file not found'}

    with open(compressed_path, 'rb') as f:
        compressed_data = f.read()

    original_data = zlib.decompress(compressed_data)

    # Remove the .zlib extension to restore original filename
    restored_filename = os.path.basename(compressed_path)
    if restored_filename.endswith('.zlib'):
        restored_filename = restored_filename[:-5]

    restored_path = os.path.join(COMPRESSED_DIR, 'restored_' + restored_filename)
    with open(restored_path, 'wb') as f:
        f.write(original_data)

    return {'success': True, 'restored_path': restored_path}

# ---------------------------------------------------
# FUNCTION 4: Get all compression history from DB
# ---------------------------------------------------
def get_compression_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT filename, original_size, compressed_size, ratio, compressed_at
        FROM compression_logs
        ORDER BY compressed_at DESC
    ''')
    rows = cursor.fetchall()
    conn.close()

    return [{
        'filename': r[0],
        'original_size': r[1],
        'compressed_size': r[2],
        'ratio': r[3],
        'compressed_at': r[4]
    } for r in rows]

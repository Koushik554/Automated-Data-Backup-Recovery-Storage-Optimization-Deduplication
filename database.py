import sqlite3
import os

# Always save the database in the same folder as this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'storage.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    return conn

def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scanned_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            filepath TEXT,
            filesize INTEGER,
            filehash TEXT,
            scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS compression_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            original_size INTEGER,
            compressed_size INTEGER,
            ratio REAL,
            compressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("Database and tables created successfully!")
    print("DB saved at:", DB_PATH)

def get_analytics():
    conn = get_connection()
    cursor = conn.cursor()

    # Total files scanned
    cursor.execute('SELECT COUNT(*) FROM scanned_files')
    total_files = cursor.fetchone()[0]

    # Total storage scanned
    cursor.execute('SELECT SUM(filesize) FROM scanned_files')
    total_storage = cursor.fetchone()[0] or 0

    # Total duplicate groups
    cursor.execute('''
        SELECT COUNT(*) FROM (
            SELECT filehash FROM scanned_files
            GROUP BY filehash HAVING COUNT(*) > 1
        )
    ''')
    total_dupe_groups = cursor.fetchone()[0]

    # Total wasted space (size × extra copies)
    cursor.execute('''
        SELECT SUM((copies - 1) * size) FROM (
            SELECT COUNT(*) as copies, MIN(filesize) as size
            FROM scanned_files
            GROUP BY filehash
            HAVING copies > 1
        )
    ''')
    wasted_res = cursor.fetchone()[0]
    total_wasted = wasted_res or 0

    # Total space saved by compression
    cursor.execute('SELECT SUM(original_size - compressed_size) FROM compression_logs')
    saved_result = cursor.fetchone()[0]
    total_saved = saved_result or 0

    # Top 5 largest duplicate groups
    cursor.execute('''
        SELECT filehash, COUNT(*) as copies, MIN(filesize) as size
        FROM scanned_files
        GROUP BY filehash
        HAVING copies > 1
        ORDER BY size DESC
        LIMIT 5
    ''')
    top_dupes = [{'hash': r[0][:12], 'copies': r[1], 'size': r[2]} for r in cursor.fetchall()]

    # Last 10 compression operations
    cursor.execute('''
        SELECT filename, original_size, compressed_size, ratio, compressed_at
        FROM compression_logs
        ORDER BY compressed_at DESC
        LIMIT 10
    ''')
    compression_history = [{
        'filename': r[0],
        'original_size': r[1],
        'compressed_size': r[2],
        'ratio': r[3],
        'compressed_at': r[4]
    } for r in cursor.fetchall()]

    conn.close()

    return {
        'total_files': total_files,
        'total_storage': total_storage,
        'total_dupe_groups': total_dupe_groups,
        'total_wasted': total_wasted,
        'total_saved': total_saved,
        'top_dupes': top_dupes,
        'compression_history': compression_history
    }

if __name__ == '__main__':
    create_tables()

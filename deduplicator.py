import hashlib
import os
from database import get_connection

# -----------------------------------------
# STEP 1: Generate a unique hash for a file
# -----------------------------------------
def hash_file(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

# -----------------------------------------
# STEP 2: Scan a folder, hash every file
# -----------------------------------------
def scan_folder(folder_path):
    conn = get_connection()
    cursor = conn.cursor()

    # Clear old scan results
    cursor.execute('DELETE FROM scanned_files')

    scanned = []

    for root, dirs, files in os.walk(folder_path):
        for filename in files:
            filepath = os.path.join(root, filename)
            filesize = os.path.getsize(filepath)
            filehash = hash_file(filepath)

            cursor.execute('''
                INSERT INTO scanned_files (filename, filepath, filesize, filehash)
                VALUES (?, ?, ?, ?)
            ''', (filename, filepath, filesize, filehash))

            scanned.append({
                'filename': filename,
                'filepath': filepath,
                'filesize': filesize,
                'filehash': filehash
            })

    conn.commit()
    conn.close()
    return scanned

# -----------------------------------------
# STEP 3: Find duplicates from scanned data
# -----------------------------------------
def find_duplicates():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT filehash, COUNT(*) as count
        FROM scanned_files
        GROUP BY filehash
        HAVING count > 1
    ''')

    duplicate_hashes = cursor.fetchall()
    duplicates = []

    for filehash, count in duplicate_hashes:
        cursor.execute('''
            SELECT filename, filepath, filesize
            FROM scanned_files
            WHERE filehash = ?
        ''', (filehash,))

        files = cursor.fetchall()
        duplicates.append({
            'hash': filehash,
            'count': count,
            'files': [{'filename': f[0], 'filepath': f[1], 'filesize': f[2]} for f in files],
            'wasted_space': files[0][2] * (count - 1)
        })

    conn.close()
    return duplicates

# -----------------------------------------
# STEP 4: Delete a file from disk + database
# -----------------------------------------
def delete_file(filepath):
    try:
        if not os.path.exists(filepath):
            return {'success': False, 'error': 'File not found'}

        os.remove(filepath)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM scanned_files WHERE filepath = ?', (filepath,))
        conn.commit()
        conn.close()

        return {'success': True, 'deleted': filepath}
    except Exception as e:
        return {'success': False, 'error': str(e)}

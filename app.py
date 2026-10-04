from flask import Flask, render_template, request, jsonify
from database import create_tables, get_analytics
from deduplicator import scan_folder, find_duplicates, delete_file
from compressor import compress_file, decompress_file, get_compression_stats

app = Flask(__name__)
create_tables()

@app.route('/')
def index():
    return render_template('index.html')

# ── Scan ──────────────────────────────────────────────
@app.route('/api/scan', methods=['POST'])
def scan():
    data = request.get_json()
    folder = data.get('folder_path', '')
    if not folder:
        return jsonify({'error': 'No folder path provided'}), 400
    scanned = scan_folder(folder)
    return jsonify({'scanned_count': len(scanned)})

# ── Duplicates ────────────────────────────────────────
@app.route('/api/duplicates', methods=['GET'])
def duplicates():
    dupes = find_duplicates()
    return jsonify(dupes)

@app.route('/api/delete', methods=['POST'])
def delete():
    data = request.get_json()
    filepath = data.get('filepath', '')
    result = delete_file(filepath)
    return jsonify(result)

# ── Compression ───────────────────────────────────────
@app.route('/api/compress', methods=['POST'])
def compress():
    data = request.get_json()
    filepath = data.get('filepath', '')
    result = compress_file(filepath)
    return jsonify(result)

@app.route('/api/decompress', methods=['POST'])
def decompress():
    data = request.get_json()
    compressed_path = data.get('compressed_path', '')
    result = decompress_file(compressed_path)
    return jsonify(result)

@app.route('/api/compression-stats', methods=['GET'])
def compression_stats():
    stats = get_compression_stats()
    return jsonify(stats)

# ── Analytics ─────────────────────────────────────────
@app.route('/api/analytics', methods=['GET'])
def analytics():
    data = get_analytics()
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True)

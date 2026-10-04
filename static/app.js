// ===== HELPER: Format bytes into KB, MB, GB =====
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ===== HELPER: Update the status badge in navbar =====
function setStatus(text, type = 'ready') {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = 'nav-status ' + type;
}

// Chart references
let storageChartInstance = null;
let compressionChartInstance = null;

// ===== STEP 1: Scan a folder =====
async function startScan() {
    const folder = document.getElementById('folderInput').value.trim();
    if (!folder) {
        alert('Please enter a folder path first!');
        return;
    }

    const btn = document.getElementById('scanBtn');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    setStatus('Scanning...', 'scanning');
    document.getElementById('duplicatesContainer').innerHTML =
        '<p class="loading">⏳ Scanning files and computing SHA-256 hashes...</p>';

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: folder })
        });

        const data = await response.json();

        if (data.error) {
            setStatus('Error', 'error');
            alert('Error: ' + data.error);
        } else {
            document.getElementById('statTotal').textContent = data.scanned_count;
            setStatus('Scan Complete', 'ready');
            await loadDuplicates();
            await loadAnalytics();
        }
    } catch (err) {
        setStatus('Error', 'error');
        alert('Could not connect to server: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Start Scan';
    }
}

// ===== STEP 2: Load and display duplicates =====
async function loadDuplicates() {
    const container = document.getElementById('duplicatesContainer');
    container.innerHTML = '<p class="loading">⏳ Loading duplicates...</p>';

    try {
        const response = await fetch('/api/duplicates');
        const dupes = await response.json();

        document.getElementById('statDupes').textContent = dupes.length;

        const totalWasted = dupes.reduce((sum, g) => sum + g.wasted_space, 0);
        document.getElementById('statWasted').textContent = formatSize(totalWasted);

        if (dupes.length === 0) {
            container.innerHTML = '<p class="empty-state">✅ No duplicates found! All scanned files are unique.</p>';
            return;
        }

        container.innerHTML = dupes.map(group => `
            <div class="dupe-group">
                <div class="dupe-group-header">
                    <span class="hash">#${group.hash.substring(0, 12)}...</span>
                    <span>${group.count} copies &nbsp;|&nbsp;</span>
                    <span class="wasted-badge">Wasted: ${formatSize(group.wasted_space)}</span>
                </div>
                ${group.files.map((file, index) => {
                    const escapedPath = file.filepath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    return `
                    <div class="dupe-file-row">
                        <span class="file-path">📄 ${file.filepath}</span>
                        <span class="file-size">${formatSize(file.filesize)}</span>
                        <div class="dupe-actions">
                            <button class="btn-compact btn-compress" title="Compress this file" onclick="compressFile('${escapedPath}', this)">
                                🗜 Compress
                            </button>
                            ${index > 0 ? `
                                <button class="btn-compact btn-danger" onclick="deleteFile('${escapedPath}', this)">
                                    🗑 Delete
                                </button>` :
                                '<span class="keep-badge">✔ Keep</span>'
                            }
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = '<p class="empty-state">❌ Failed to load duplicates.</p>';
    }
}

// ===== STEP 3: Delete a duplicate file =====
async function deleteFile(filepath, btn) {
    if (!confirm('Permanently delete this duplicate file?\n\n' + filepath)) return;

    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath: filepath })
        });

        const result = await response.json();

        if (result.success) {
            const row = btn.closest('.dupe-file-row');
            if (row) {
                row.style.opacity = '0.3';
                setTimeout(() => {
                    row.remove();
                    loadDuplicates();
                    loadAnalytics();
                }, 400);
            }
        } else {
            alert('Delete failed: ' + result.error);
            btn.disabled = false;
            btn.textContent = '🗑 Delete';
        }
    } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.textContent = '🗑 Delete';
    }
}

// ===== STEP 4: Compress a specific file =====
async function compressFile(filepath, btn) {
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Compressing...';

    try {
        const response = await fetch('/api/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath: filepath })
        });

        const result = await response.json();

        if (result.success) {
            alert(`🎉 Compressed successfully!\nOriginal: ${formatSize(result.original_size)}\nCompressed: ${formatSize(result.compressed_size)}\nRatio saved: ${result.ratio}%`);
            await loadAnalytics();
        } else {
            alert('Compression error: ' + (result.error || 'Failed'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

// Compress from the dedicated card input
async function compressSingleFile() {
    const input = document.getElementById('compressInput');
    const path = input.value.trim();
    if (!path) {
        alert('Please enter a file path to compress!');
        return;
    }
    const btn = document.getElementById('compressBtn');
    await compressFile(path, btn);
    input.value = '';
}

// ===== STEP 5: Decompress a file =====
async function decompressFile(compressedPath, btn) {
    btn.disabled = true;
    btn.textContent = 'Restoring...';

    try {
        const response = await fetch('/api/decompress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ compressed_path: compressedPath })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ File successfully restored to:\n' + result.restored_path);
        } else {
            alert('Decompression failed: ' + (result.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Unpack';
    }
}

// ===== STEP 6: Load and display analytics & render charts =====
async function loadAnalytics() {
    try {
        const response = await fetch('/api/analytics');
        const data = await response.json();

        // Update Stat Cards
        document.getElementById('statTotal').textContent = data.total_files || 0;
        document.getElementById('statDupes').textContent = data.total_dupe_groups || 0;
        document.getElementById('statWasted').textContent = formatSize(data.total_wasted || 0);
        document.getElementById('statSaved').textContent = formatSize(data.total_saved || 0);

        // --- Top Duplicate Groups Table ---
        const topDupesEl = document.getElementById('topDupesContainer');
        if (!data.top_dupes || data.top_dupes.length === 0) {
            topDupesEl.innerHTML = '<p class="empty-state">No duplicate groups found yet.</p>';
        } else {
            topDupesEl.innerHTML = `
                <table class="analytics-table">
                    <thead>
                        <tr>
                            <th>Hash Preview</th>
                            <th>Copies</th>
                            <th>File Size</th>
                            <th>Wasted Space</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.top_dupes.map(d => `
                            <tr>
                                <td class="mono">#${d.hash}…</td>
                                <td><span class="badge-neutral">${d.copies}</span></td>
                                <td>${formatSize(d.size)}</td>
                                <td class="danger-text">${formatSize((d.copies - 1) * d.size)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        }

        // --- Compression History Table ---
        const histEl = document.getElementById('compressionHistoryContainer');
        if (!data.compression_history || data.compression_history.length === 0) {
            histEl.innerHTML = '<p class="empty-state">No compressions logged yet.</p>';
        } else {
            histEl.innerHTML = `
                <table class="analytics-table">
                    <thead>
                        <tr>
                            <th>File Name</th>
                            <th>Original Size</th>
                            <th>Compressed Size</th>
                            <th>Saved Ratio</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.compression_history.map(h => {
                            const compressedFilePath = `compressed/${h.filename}.zlib`.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                            return `
                            <tr>
                                <td class="file-name-cell" title="${h.filename}">📄 ${h.filename}</td>
                                <td>${formatSize(h.original_size)}</td>
                                <td>${formatSize(h.compressed_size)}</td>
                                <td><span class="badge-success">${(h.ratio || 0).toFixed(1)}%</span></td>
                                <td class="mono">${new Date(h.compressed_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn-compact btn-secondary" onclick="decompressFile('${compressedFilePath}', this)">
                                        Unpack
                                    </button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
        }

        // --- Render Visual Charts via Chart.js ---
        renderCharts(data);

    } catch (err) {
        console.error('Failed to load analytics:', err);
    }
}

// ===== STEP 7: Render Interactive Chart.js Charts =====
function renderCharts(data) {
    if (typeof Chart === 'undefined') return;

    // --- Chart 1: Storage Breakdown (Donut) ---
    const ctxStorage = document.getElementById('storageChart');
    if (ctxStorage) {
        const totalStorage = data.total_storage || 0;
        const totalWasted = data.total_wasted || 0;
        const totalSaved = data.total_saved || 0;
        const cleanStorage = Math.max(0, totalStorage - totalWasted);

        const chartData = {
            labels: ['Unique Storage', 'Wasted Duplicates', 'Compression Saved'],
            datasets: [{
                data: [cleanStorage, totalWasted, totalSaved],
                backgroundColor: ['#58a6ff', '#f85149', '#3fb950'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        };

        if (storageChartInstance) {
            storageChartInstance.data = chartData;
            storageChartInstance.update();
        } else {
            storageChartInstance = new Chart(ctxStorage, {
                type: 'doughnut',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#8b949e', font: { family: 'Inter', size: 12 } }
                        }
                    },
                    cutout: '70%'
                }
            });
        }
    }

    // --- Chart 2: Recent Compression Ratio (% Saved) ---
    const ctxComp = document.getElementById('compressionChart');
    if (ctxComp) {
        const history = (data.compression_history || []).slice(0, 6).reverse();
        const labels = history.map(h => h.filename.length > 12 ? h.filename.substring(0, 10) + '…' : h.filename);
        const ratios = history.map(h => (h.ratio || 0).toFixed(1));

        const compData = {
            labels: labels.length > 0 ? labels : ['No data'],
            datasets: [{
                label: '% Storage Saved',
                data: ratios.length > 0 ? ratios : [0],
                backgroundColor: 'rgba(63, 185, 80, 0.4)',
                borderColor: '#3fb950',
                borderWidth: 2,
                borderRadius: 6
            }]
        };

        if (compressionChartInstance) {
            compressionChartInstance.data = compData;
            compressionChartInstance.update();
        } else {
            compressionChartInstance = new Chart(ctxComp, {
                type: 'bar',
                data: compData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                color: '#8b949e',
                                callback: val => val + '%'
                            },
                            grid: { color: '#21262d' }
                        },
                        x: {
                            ticks: { color: '#8b949e' },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }
}

// ===== ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    loadAnalytics();
    loadDuplicates();
});

const BACKEND_URL = window.__BACKEND_URL || '';
const socket = io(BACKEND_URL || undefined);

// UI Elements
const adminAuth = document.getElementById('admin-auth');
const adminUi = document.getElementById('admin-ui');
const passInput = document.getElementById('admin-pass');
const loginBtn = document.getElementById('admin-login-btn');
const errorText = document.getElementById('admin-error');

const usersGrid = document.getElementById('users-grid');
const reportsList = document.getElementById('reports-list');
const historyList = document.getElementById('history-list');
const totalUsers = document.getElementById('total-users');

let currentHistoryData = []; // State cache for exports

// Auto-login from main index redirect
const urlParams = new URLSearchParams(window.location.search);
const autoPass = urlParams.get('pass');

if (autoPass) {
    passInput.value = autoPass;
}

socket.on('connect', () => {
    if (autoPass) {
        socket.emit('login', { password: autoPass, isAdmin: true });
    }
});

// Inter-navigate logic feature requested
document.getElementById('jump-user-btn').addEventListener('click', () => {
    const p = passInput.value;
    window.location.href = `index.html?admin_pass=${encodeURIComponent(p)}`;
});

// Auth
document.getElementById('logout-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

loginBtn.addEventListener('click', () => {
    const password = passInput.value;
    
    if (!password) {
        errorText.innerText = "Password required.";
        return;
    }
    
    socket.emit('login', { password, isAdmin: true });
});

socket.on('login_error', (msg) => { errorText.innerText = msg; });

socket.on('login_success', (data) => {
    if (data.isAdmin) {
        adminAuth.classList.add('hidden');
        adminUi.classList.remove('hidden');
    }
});

// Admin Data Sync
socket.on('admin_update', (data) => {
    totalUsers.innerText = data.onlineCount;
    renderUsers(data.users);
    renderReports(data.reports);
    currentHistoryData = data.history;
    renderHistory(data.history);
});

const frameCache = {};

// Live Video Frame Updates
socket.on('stream_update', (data) => {
    frameCache[data.id] = data.frame;
    const imgEl = document.getElementById(`preview-${data.id}`);
    if (imgEl) {
        imgEl.src = data.frame;
    }
});

function renderUsers(users) {
    usersGrid.innerHTML = '';
    users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';
        
        // Extract from hot-cache to entirely prevent flicker during global re-renders
        const cleanFrame = frameCache[user.id] || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

        card.innerHTML = `
            <div class="preview-container">
                <img id="preview-${user.id}" src="${cleanFrame}" alt="Waiting for stream..." style="width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:6px;">
            </div>
            <div class="user-info">
                <div class="email">${user.email}</div>
                <div class="details">User: ${user.info.name.toUpperCase()}</div>
                <div class="status-badge ${user.status}">${user.status.toUpperCase()}</div>
                <button class="kick-btn" onclick="kickUser('${user.id}')">KICK / DISCONNECT</button>
            </div>
        `;
        usersGrid.appendChild(card);
    });
}

function renderReports(reports) {
    reportsList.innerHTML = '';
    if (reports.length === 0) {
        reportsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No reports yet.</div>';
        return;
    }
    
    // Reverse to show newest first
    [...reports].reverse().forEach(report => {
        const card = document.createElement('div');
        card.className = 'report-card';
        card.innerHTML = `
            <span class="r-time">${report.time}</span>
            <span class="r-target">Reported: ${report.reportedEmail}</span>
            <span class="r-by">By: ${report.reporter}</span>
        `;
        reportsList.appendChild(card);
    });
}

function renderHistory(histData) {
    historyList.innerHTML = '';
    if (histData.length === 0) {
        historyList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No history yet.</div>';
        return;
    }
    
    // Render newest first
    [...histData].reverse().forEach(record => {
        const card = document.createElement('div');
        card.className = 'report-card';
        card.style.borderLeft = '3px solid var(--primary)';
        card.style.padding = '12px';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span class="r-target" style="color: var(--primary); font-size:1rem; font-weight:bold;">👤 ${record.name.toUpperCase()}</span>
                <span class="r-time" style="color: var(--magenta); font-weight:bold;">🕒 ${record.timestamp}</span>
            </div>
            ${record.photo ? `<div style="margin: 12px 0; display:flex; justify-content:center;"><img src="${record.photo}" style="width: 100%; max-width: 280px; height: auto; object-fit: cover; border-radius: 12px; border: 3px solid var(--primary); box-shadow: 0 6px 16px rgba(0,0,0,0.6);" /></div>` : ''}
            <div style="font-size: 0.85rem; margin-bottom:3px;"><strong style="color:var(--text-muted)">Mail:</strong> ${record.email}</div>
            <div style="font-size: 0.85rem; margin-bottom:5px;"><strong style="color:var(--text-muted)">Details:</strong> ${record.dept.toUpperCase()} Dept • Year ${record.year}</div>
            ${record.ip ? `<div style="font-size: 0.75rem; margin-bottom:2px; color:var(--text-muted)"><strong>IP Tracer:</strong> ${record.ip}</div>` : ''}
            ${record.os ? `<div style="font-size: 0.75rem; color:var(--text-muted); line-height:1.2; word-break:break-all;"><strong>Client/OS:</strong> ${record.os}</div>` : ''}
        `;
        historyList.appendChild(card);
    });
}

// --- EXPORT LOGIC ---
document.getElementById('export-json-btn').addEventListener('click', () => {
    if (currentHistoryData.length === 0) return alert("No history to export.");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentHistoryData, null, 2));
    downloadDataUri(dataStr, "system_log_history.json");
});

document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (currentHistoryData.length === 0) return alert("No history to export.");
    const headers = ["Name", "Email", "Dept", "Year", "IP Address", "Device/OS", "Timestamp"];
    const csvRows = [headers.join(",")];
    currentHistoryData.forEach(r => {
        let row = [`"${r.name}"`, `"${r.email}"`, `"${r.dept}"`, `"${r.year}"`, `"${r.ip || ''}"`, `"${r.os || ''}"`, `"${r.timestamp}"`];
        csvRows.push(row.join(","));
    });
    const csvStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
    downloadDataUri(csvStr, "system_log_history.csv");
});

document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (currentHistoryData.length === 0) return alert("No history to export.");
    const printWindow = window.open('', '_blank');
    let html = `<html><head><title>System Login History</title><style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #38bdf8; color: #fff; padding: 10px; text-align: left; }
        td { border-bottom: 1px solid #ddd; padding: 8px; font-size: 0.9rem; }
        tr:nth-child(even) { background-color: #f8fafc; }
    </style></head><body>`;
    
    html += `<h2>CIT Secure Terminal - Master Access Logs</h2>`;
    html += `<table><tr><th>Name</th><th>Email</th><th>Dept</th><th>Year</th><th>IP Address</th><th>Target User-Agent</th><th>Time</th></tr>`;
    
    currentHistoryData.forEach(r => {
        html += `<tr><td><strong>${r.name.toUpperCase()}</strong></td><td>${r.email}</td><td>${r.dept.toUpperCase()}</td><td>${r.year}</td><td><code>${r.ip || '-'}</code></td><td>${r.os || '-'}</td><td>${r.timestamp}</td></tr>`;
    });
    html += `</table><script>window.onload = function() { window.print(); };</script></body></html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
});

function downloadDataUri(uri, filename) {
    const a = document.createElement('a');
    a.href = uri; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
}

// Global function for inline click handler
window.kickUser = function(socketId) {
    if(confirm('Are you sure you want to forcibly disconnect this user?')) {
        socket.emit('kick_user', socketId);
    }
};

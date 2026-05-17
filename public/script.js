'use strict';

// ── Socket ────────────────────────────────────────────────────────────────────
// Auto-detect backend: if served from Vercel (different origin), use BACKEND_URL.
// If served from Railway/localhost (same origin), connect to self.
const BACKEND_URL = window.__BACKEND_URL || ''; // Set in index.html for Vercel deploy
const socket = io(BACKEND_URL || undefined, { transports: ['websocket', 'polling'] });

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const authOverlay     = $('auth-overlay');
const mainUi          = $('main-ui');
const emailInput      = $('email-input');
const adminPassInput  = $('admin-pass');
const adminPassGroup  = $('admin-pass-group');
const loginBtn        = $('login-btn');
const authError       = $('auth-error');
const statusEl        = $('status');
const statusChip      = $('status-chip');
const onlineCount     = $('online-count');
const nextBtn         = $('next-btn');
const reportBtn       = $('report-btn');
const panicBtn        = $('panic-btn');
const blockBtn        = $('block-btn');
const messagesDiv     = $('messages');
const msgInput        = $('msgInput');
const sendBtn         = $('send-btn');
const attachBtn       = $('attach-btn');
const fileInput       = $('fileInput');
const localVideo      = $('local-video');
const remoteVideo     = $('remote-video');
const remoteNocam     = $('remote-nocam');
const localNocam      = $('local-nocam');
const searchOverlay   = $('searching-overlay');
const searchTitle     = $('search-title');
const searchSub       = $('search-sub');
const sOnline         = $('s-online');
const sQueue          = $('s-queue');
const typingIndicator = $('typing-indicator');
const chatDot         = $('chat-dot');
const qualityBadge    = $('quality-badge');
const qualityLabel    = $('quality-label');
const qualityBars     = document.querySelectorAll('.qb');
const volSlider       = $('volume-slider');
const streamCanvas    = $('stream-canvas');
const thumbCtx        = streamCanvas.getContext('2d');
const notifToast      = $('notif-toast');
const icebreakerBar   = $('icebreaker-bar');
const icebreakerText  = $('icebreaker-text');
const toggleAdminBtn  = $('toggle-admin-btn');
const returnDashBtn   = $('return-dash-btn');

// ── State ─────────────────────────────────────────────────────────────────────
let localStream       = null;
let peerConnection    = null;
let currentPartnerId  = null;
let camEnabled        = true;
let micEnabled        = true;
let facingMode        = 'user';
let thumbInterval     = null;
let typingTimeout     = null;
let statsInterval     = null;
let isSearching       = false;

// ── ICE Config — STUN + free TURN (Open Relay) ───────────────────────────────
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// ── Icebreakers ───────────────────────────────────────────────────────────────
const ICEBREAKERS = [
    'What project are you currently building? 💻',
    'Favourite coding language and why? 🔥',
    'CS or non-CS? What do you study? 📚',
    'Best movie you watched recently? 🎬',
    'Would you rather: unlimited RAM or unlimited SSD? 😂',
    'What song is on repeat right now? 🎵',
    'Favourite professor at CIT? 👨‍🏫',
    'Tea or coffee during exams? ☕',
    'What game are you playing these days? 🎮',
    'Morning class or evening class preference? ⏰'
];
let icebreakerIndex = 0;

// ── Admin URL shortcut ────────────────────────────────────────────────────────
const urlParams      = new URLSearchParams(window.location.search);
const quickAdminPass = urlParams.get('admin_pass');
if (quickAdminPass) {
    adminPassInput.value = quickAdminPass;
    adminPassGroup.style.display = 'block';
    returnDashBtn.classList.remove('hidden-force');
    returnDashBtn.onclick = () => { window.location.href = `admin.html?pass=${encodeURIComponent(quickAdminPass)}`; };
}

socket.on('connect', () => {
    if (quickAdminPass) {
        socket.emit('login', { password: quickAdminPass, isAdmin: false, overrideAsUser: true });
    }
});

// ── Admin toggle ──────────────────────────────────────────────────────────────
toggleAdminBtn.addEventListener('click', () => {
    const shown = adminPassGroup.style.display !== 'none';
    adminPassGroup.style.display = shown ? 'none' : 'block';
    toggleAdminBtn.textContent = shown ? 'Show admin field' : 'Hide admin field';
});

// ── Interest chips ────────────────────────────────────────────────────────────
document.querySelectorAll('.interest-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
});

// ── Auth ──────────────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', doLogin);
emailInput.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
    authError.textContent = '';
    const email = emailInput.value.trim().toLowerCase();
    const pass  = adminPassInput.value.trim();

    if (email === 'admin' || (!email && pass)) {
        if (!pass) { authError.textContent = 'Enter admin password.'; return; }
        if (email === 'admin') {
            returnDashBtn.classList.remove('hidden-force');
            returnDashBtn.onclick = () => { window.location.href = `admin.html?pass=${encodeURIComponent(pass)}`; };
            socket.emit('login', { password: pass, isAdmin: false, overrideAsUser: true });
        } else {
            window.location.href = `admin.html?pass=${encodeURIComponent(pass)}`;
        }
        return;
    }

    const re = /^(.+)\.([a-z]+)(\d{4})@citchennai\.(net|edu)$/;
    if (!re.test(email)) {
        authError.textContent = 'Invalid format. Use: name.dept2026@citchennai.net';
        return;
    }
    socket.emit('login', { email, isAdmin: false });
}

socket.on('login_error', msg => { authError.textContent = msg; });
socket.on('show_admin_btn', () => {
    returnDashBtn.classList.remove('hidden-force');
});

socket.on('login_success', () => {
    authOverlay.classList.add('hidden');
    mainUi.classList.remove('hidden');
    initMedia();
});

// ── Logout ────────────────────────────────────────────────────────────────────
$('logout-btn').addEventListener('click', () => { window.location.href = window.location.pathname; });

// ── Media ─────────────────────────────────────────────────────────────────────
async function initMedia() {
    try {
        setStatus('Requesting camera...', 'searching');

        const constraints = {
            video: { width:{ideal:1280,max:1920}, height:{ideal:720,max:1080}, facingMode },
            audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
            // Fallback: audio only or basic video
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
            } catch {
                localStream = await navigator.mediaDevices.getUserMedia({ audio:true });
                showNoCam(true);
            }
        }

        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.onloadedmetadata = () => localVideo.play().catch(() => {});

        // Admin thumbnail — every 3s for live admin preview
        if (thumbInterval) clearInterval(thumbInterval);
        thumbInterval = setInterval(sendThumbnail, 3000);

        // Face capture once after 3s
        setTimeout(captureFace, 3000);

    } catch (err) {
        console.error('Media error:', err);
        showNoCam(true);
        setStatus('No camera — text-only mode', 'disconnected');
    }
}

function sendThumbnail() {
    if (!localVideo.readyState) return;
    streamCanvas.width = 320; streamCanvas.height = 240;
    thumbCtx.drawImage(localVideo, 0, 0, 320, 240);
    socket.emit('thumbnail', streamCanvas.toDataURL('image/jpeg', 0.5));
}

function captureFace() {
    if (!localStream || !localVideo.readyState) return;
    const c = document.createElement('canvas');
    c.width = 240; c.height = 180;
    c.getContext('2d').drawImage(localVideo, 0, 0, 240, 180);
    socket.emit('register_face_capture', c.toDataURL('image/jpeg', 0.75));
}

function showNoCam(local) {
    if (local) { localNocam.classList.remove('hidden'); }
}

// Camera / Mic toggles
$('toggle-cam-btn').addEventListener('click', () => {
    if (!localStream) return;
    camEnabled = !camEnabled;
    localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
    $('toggle-cam-btn').classList.toggle('muted', !camEnabled);
    localNocam.classList.toggle('hidden', camEnabled);
});

$('toggle-mic-btn').addEventListener('click', () => {
    if (!localStream) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    $('toggle-mic-btn').classList.toggle('muted', !micEnabled);
});

$('switch-cam-btn').addEventListener('click', async () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    if (localStream) {
        localStream.getVideoTracks().forEach(t => t.stop());
    }
    await initMedia();
    if (peerConnection && localStream) {
        const vTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender && vTrack) sender.replaceTrack(vTrack);
    }
});

// Volume
volSlider.addEventListener('input', () => {
    remoteVideo.volume = volSlider.value / 100;
});

// ── WebRTC ────────────────────────────────────────────────────────────────────
function closePeer() {
    clearInterval(statsInterval);
    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    remoteNocam.classList.remove('hidden');
    currentPartnerId = null;
    qualityBadge.classList.add('hidden');
    disableChat();
}

function createPeer(partnerId, initiator) {
    closePeer();
    currentPartnerId = partnerId;
    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    }

    // Remote track
    peerConnection.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
        remoteNocam.classList.add('hidden');
        startQualityMonitor();
    };

    // ICE
    peerConnection.onicecandidate = e => {
        if (e.candidate) socket.emit('webrtc_ice_candidate', { partnerId, candidate: e.candidate });
    };

    // Connection state
    peerConnection.onconnectionstatechange = () => {
        const s = peerConnection?.connectionState;
        if (s === 'failed' || s === 'disconnected') {
            showToast('⚠ Connection unstable — reconnecting...');
        }
    };

    if (initiator) {
        peerConnection.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true })
            .then(o => peerConnection.setLocalDescription(o))
            .then(() => {
                socket.emit('webrtc_offer', { partnerId, offer: peerConnection.localDescription });
                // Boost video bitrate for max HD quality
                setBitrate(2500);
            })
            .catch(console.error);
    }
}

// Set video bitrate for better quality
async function setBitrate(kbps) {
    if (!peerConnection) return;
    try {
        const senders = peerConnection.getSenders();
        for (const sender of senders) {
            if (sender.track?.kind === 'video') {
                const params = sender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0].maxBitrate = kbps * 1000;
                await sender.setParameters(params);
            }
        }
    } catch(e) { console.warn('Bitrate set failed:', e); }
}

// Connection quality monitor
function startQualityMonitor() {
    clearInterval(statsInterval);
    qualityBadge.classList.remove('hidden');
    statsInterval = setInterval(async () => {
        if (!peerConnection) return;
        try {
            const stats = await peerConnection.getStats();
            stats.forEach(r => {
                if (r.type === 'inbound-rtp' && r.kind === 'video') {
                    const loss = r.packetsLost || 0;
                    const recv = r.packetsReceived || 1;
                    const ratio = loss / (loss + recv);
                    let bars = 4, label = 'Excellent', col = 'var(--green)';
                    if (ratio > 0.15) { bars = 1; label = 'Poor';   col = 'var(--danger)'; }
                    else if (ratio > 0.08) { bars = 2; label = 'Fair'; col = 'var(--yellow)'; }
                    else if (ratio > 0.03) { bars = 3; label = 'Good'; col = 'var(--cyan)'; }
                    qualityLabel.textContent = label;
                    qualityBars.forEach((b, i) => {
                        b.classList.toggle('active', i < bars);
                        if (i < bars) b.style.background = col;
                    });
                }
            });
        } catch {}
    }, 3000);
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('pong', () => {}); // heartbeat ack

socket.on('online_count', n => {
    onlineCount.textContent = n;
    sOnline.textContent = n;
});

socket.on('waiting_status', data => {
    closePeer();
    isSearching = true;
    searchOverlay.classList.remove('hidden');
    setStatus('Searching...', 'searching');
    panicBtn.disabled = true;
    reportBtn.disabled = true;
    blockBtn.disabled  = true;

    if (data.type === 'no_users') {
        searchTitle.textContent = data.message || 'Waiting for users...';
        searchSub.textContent   = 'You\'ll be matched automatically when someone joins!';
    } else {
        searchTitle.textContent = '🔍 Searching for strangers...';
        searchSub.textContent   = 'Finding you the best match...';
    }
    if (data.online !== undefined) sOnline.textContent = data.online;
    if (data.queue  !== undefined) sQueue.textContent  = data.queue;
});

socket.on('partner_found', data => {
    isSearching = false;
    searchOverlay.classList.add('hidden');
    setStatus('🟢 Connected to a stranger', 'connected');
    panicBtn.disabled  = false;
    reportBtn.disabled = false;
    blockBtn.disabled  = false;
    createPeer(data.partnerId, data.initiator);
    enableChat();
    sysMsg('You are now connected with a stranger. Say hi! 👋');
    showToast('🎉 Stranger connected!');
    icebreakerBar.classList.remove('hidden');
});

socket.on('partner_disconnected', () => {
    setStatus('Stranger disconnected', 'disconnected');
    sysMsg('Stranger has disconnected.');
    closePeer();
    panicBtn.disabled  = true;
    reportBtn.disabled = true;
    blockBtn.disabled  = true;
    showToast('👋 Stranger left. Click Next to find another!');
    isSearching = false;
    searchOverlay.classList.add('hidden');
});

socket.on('cooldown', data => {
    showToast(`⏳ Wait ${Math.ceil(data.ms / 1000)}s before skipping again`);
});

socket.on('kicked', () => {
    alert('You have been removed by an Administrator.');
    window.location.reload();
});

// WebRTC signaling
socket.on('webrtc_offer', async data => {
    if (!peerConnection || currentPartnerId !== data.partnerId) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const ans = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(ans);
        socket.emit('webrtc_answer', { partnerId: currentPartnerId, answer: peerConnection.localDescription });
    } catch (e) { console.error(e); }
});

socket.on('webrtc_answer', async data => {
    if (peerConnection && currentPartnerId === data.partnerId) {
        try { await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer)); }
        catch (e) { console.error(e); }
    }
});

socket.on('webrtc_ice_candidate', async data => {
    if (peerConnection && currentPartnerId === data.partnerId) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); }
        catch (e) { console.error(e); }
    }
});

// Chat
socket.on('chat', data => {
    appendMsg(data, 'msg-stranger');
    if (data.id) socket.emit('chat_received', data.id);
});

socket.on('chat_received', id => {
    const tick = document.getElementById('tick-' + id);
    if (tick) { tick.textContent = '✓✓'; tick.style.color = 'var(--cyan)'; }
});

// Typing
let remoteTypingTimer = null;
socket.on('typing', isTyping => {
    if (isTyping) {
        typingIndicator.classList.add('show');
        clearTimeout(remoteTypingTimer);
        remoteTypingTimer = setTimeout(() => typingIndicator.classList.remove('show'), 3000);
    } else {
        typingIndicator.classList.remove('show');
    }
});

// File transfer
socket.on('file_transfer', data => {
    appendFile(data, 'msg-stranger');
    if (data.id) socket.emit('chat_received', data.id);
});

// ── Chat Controls ─────────────────────────────────────────────────────────────
function enableChat() {
    msgInput.disabled  = false;
    sendBtn.disabled   = false;
    attachBtn.disabled = false;
    document.querySelectorAll('.emoji-btn').forEach(b => b.disabled = false);
    messagesDiv.innerHTML = '';
    chatDot.classList.add('connected');
}

function disableChat() {
    msgInput.disabled  = true;
    sendBtn.disabled   = true;
    attachBtn.disabled = true;
    document.querySelectorAll('.emoji-btn').forEach(b => b.disabled = true);
    msgInput.value = '';
    chatDot.classList.remove('connected');
    typingIndicator.classList.remove('show');
}

function sendMessage() {
    const txt = msgInput.value.trim();
    if (!txt || !currentPartnerId) return;
    const payload = { id: 'msg-' + Date.now(), text: txt };
    socket.emit('chat', payload);
    appendMsg(payload, 'msg-self');
    msgInput.value = '';
    socket.emit('typing', false);
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

// Typing detection
let selfTypingTimer = null;
msgInput.addEventListener('input', () => {
    if (!currentPartnerId) return;
    socket.emit('typing', true);
    clearTimeout(selfTypingTimer);
    selfTypingTimer = setTimeout(() => socket.emit('typing', false), 2000);
});

function appendMsg(data, cls) {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    const txt   = typeof data === 'string' ? data : data.text;
    const msgId = typeof data === 'string' ? null  : data.id;
    if (cls === 'msg-self' && msgId) {
        const sp  = document.createElement('span'); sp.textContent = txt;
        const tic = document.createElement('span');
        tic.id = 'tick-' + msgId;
        tic.textContent = '✓';
        tic.style.cssText = 'font-size:.72rem;color:#64748b;margin-left:7px;float:right;';
        div.appendChild(sp); div.appendChild(tic);
    } else { div.textContent = txt; }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sysMsg(txt) {
    const div = document.createElement('div');
    div.className = 'msg msg-system';
    div.textContent = txt;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ── Next / Report / Panic ─────────────────────────────────────────────────────
nextBtn.addEventListener('click', () => {
    socket.emit('next');
    closePeer();
});

panicBtn.addEventListener('click', () => {
    if (confirm('Panic exit — disconnect and reload?')) window.location.reload();
});

reportBtn.addEventListener('click', () => {
    const reason = prompt('Reason for report (optional):') || 'No reason';
    socket.emit('report_user', reason);
    sysMsg('User reported. Skipping...');
    socket.emit('next');
    closePeer();
});

blockBtn.addEventListener('click', () => {
    showToast('🚫 User blocked for this session.');
    socket.emit('next');
    closePeer();
});

// ── File Transfer ─────────────────────────────────────────────────────────────
attachBtn.addEventListener('click', () => { if (currentPartnerId) fileInput.click(); });

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('⚠ Max file size is 10MB'); fileInput.value=''; return; }

    sysMsg('⏳ Sending: ' + file.name + '...');
    const reader = new FileReader();
    reader.onload = e => {
        const fileData = { id:'file-'+Date.now(), filename:file.name, filedata:e.target.result, type:file.type };
        socket.emit('file_transfer', fileData);
        appendFile(fileData, 'msg-self');
        sysMsg('✅ Sent: ' + file.name);
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
});

function appendFile(data, cls) {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    const btnStyle = 'display:inline-block;margin-top:7px;padding:5px 11px;background:var(--cyan);color:#060b18;font-weight:700;border-radius:5px;font-size:0.82rem;text-decoration:none;';
    const tickHtml = (cls==='msg-self' && data.id) ? `<span id="tick-${data.id}" style="font-size:.72rem;color:#64748b;display:block;text-align:right;margin-top:4px;">✓</span>` : '';
    if (data.type?.startsWith('image/')) {
        div.innerHTML = `<strong>Image:</strong><br><img src="${data.filedata}" alt="${data.filename}" style="max-width:100%;border-radius:8px;margin-top:5px;cursor:pointer;" onclick="window.open('${data.filedata}','_blank')"><br><a href="${data.filedata}" download="${data.filename}" style="${btnStyle}">📥 Download</a>${tickHtml}`;
    } else {
        div.innerHTML = `<div style="background:rgba(0,0,0,0.25);padding:9px;border-radius:7px;"><span>📎 ${data.filename}</span><br><a href="${data.filedata}" download="${data.filename}" style="${btnStyle}">📥 Download</a>${tickHtml}</div>`;
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ── Icebreaker ────────────────────────────────────────────────────────────────
icebreakerBar.addEventListener('click', () => {
    if (!currentPartnerId) return;
    const q = ICEBREAKERS[icebreakerIndex++ % ICEBREAKERS.length];
    icebreakerText.textContent = q;
    const payload = { id:'msg-'+Date.now(), text:'🧊 ' + q };
    socket.emit('chat', payload);
    appendMsg(payload, 'msg-self');
});

// ── Emoji Reactions ───────────────────────────────────────────────────────────
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentPartnerId) return;
        const emoji = btn.dataset.emoji;
        const payload = { id:'msg-'+Date.now(), text: emoji };
        socket.emit('chat', payload);
        appendMsg(payload, 'msg-self');
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(txt, state) {
    statusEl.textContent = txt;
    statusChip.className = 'status-chip ' + (state || 'searching');
}

let toastTimer = null;
function showToast(msg) {
    notifToast.textContent = msg;
    notifToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notifToast.classList.remove('show'), 3500);
}

// Anti-freeze: reassign stream if remote video stalls
let lastRemoteTime = -1;
setInterval(() => {
    if (currentPartnerId && remoteVideo.srcObject && remoteVideo.currentTime > 0) {
        if (remoteVideo.currentTime === lastRemoteTime) {
            const s = remoteVideo.srcObject;
            remoteVideo.srcObject = null;
            remoteVideo.srcObject = s;
            remoteVideo.play().catch(() => {});
        }
        lastRemoteTime = remoteVideo.currentTime;
    }
}, 4000);
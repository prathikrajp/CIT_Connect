const socket = io();

// UI Elements
const authOverlay = document.getElementById('auth-overlay');
const mainUi = document.getElementById('main-ui');
const emailInput = document.getElementById('email-input');
const loginBtn = document.getElementById('login-btn');
const authError = document.getElementById('auth-error');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusText = document.getElementById('status');
const onlineCount = document.getElementById('online-count');
const nextBtn = document.getElementById('next-btn');
const reportBtn = document.getElementById('report-btn');

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('fileInput');
const streamCanvas = document.getElementById('stream-canvas');
const ctx = streamCanvas.getContext('2d');

let localStream;
let peerConnection;
let currentPartnerId = null;
let streamInterval;

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Quick login from dashboard logic
const urlParams = new URLSearchParams(window.location.search);
const quickAdminPass = urlParams.get('admin_pass');

if (quickAdminPass) {
    document.getElementById('admin-pass').value = quickAdminPass;
    const btn = document.getElementById('return-dash-btn');
    btn.classList.remove('hidden-force');
    btn.onclick = () => window.location.href = `admin.html?pass=${encodeURIComponent(quickAdminPass)}`;
}

socket.on('connect', () => {
    if (quickAdminPass) {
        socket.emit('login', { password: quickAdminPass, isAdmin: false, overrideAsUser: true });
    }
});

// --- AUTHENTICATION ---
document.getElementById('logout-btn').addEventListener('click', () => {
    window.location.href = window.location.pathname;
});

loginBtn.addEventListener('click', () => {
    const email = emailInput.value.trim().toLowerCase();
    const passInput = document.getElementById('admin-pass');
    
    // Standard User Login (Protected from secret Chrome autofill collisions)
    if (email && email !== 'admin') {
        const emailRegex = /^(.+)\.([a-z]+)(\d{4})@citchennai\.(net|edu)$/;
        if (!emailRegex.test(email)) {
            authError.innerText = "Invalid format (e.g., name.dept2026@citchennai.net)";
            return;
        }
        socket.emit('login', { email, isAdmin: false });
        return;
    }

    // Admin Override Branch
    if (passInput && passInput.value) {
        if (email === 'admin') {
            // Join pool as User Simulator
            const btn = document.getElementById('return-dash-btn');
            btn.classList.remove('hidden-force');
            btn.onclick = () => window.location.href = `admin.html?pass=${encodeURIComponent(passInput.value)}`;

            socket.emit('login', { password: passInput.value, isAdmin: false, overrideAsUser: true });
        } else {
            // Bypass to Dashboard
            window.location.href = `admin.html?pass=${encodeURIComponent(passInput.value)}`;
        }
        return;
    }

    authError.innerText = "College mail id is required.";
});

socket.on('login_error', (msg) => { authError.innerText = msg; });

socket.on('login_success', () => {
    authOverlay.classList.add('hidden');
    mainUi.classList.remove('hidden');
    
    // Detach unblocked parallel execution constraint to provide absolutely instant 0-load visual feedback
    initMedia().catch(console.error);
});

// --- MEDIA & ADMIN STREAMING ---
async function initMedia() {
    try {
        statusText.innerText = "Requesting media...";
        
        // Fallback-safe constraints
        const constraints = {
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: { echoCancellation: true, noiseSuppression: true }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            console.log("Ideal constraints failed, trying basic video/audio", e);
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }

        localVideo.srcObject = localStream;
        
        // Explicitly play the video (fixes black screen on many browsers)
        localVideo.onloadedmetadata = () => {
            localVideo.play().catch(e => console.error("Auto-play failed:", e));
        };
        
        // Accelerated Ultra-Clear Admin Preview Feeds:
        streamCanvas.width = 480; 
        streamCanvas.height = 360;
        streamInterval = setInterval(() => {
            if (localVideo.readyState === localVideo.HAVE_ENOUGH_DATA) {
                ctx.drawImage(localVideo, 0, 0, streamCanvas.width, streamCanvas.height);
                // JPEG compression at Fast Quality (Low Delay)
                const frameData = streamCanvas.toDataURL('image/jpeg', 0.8);
                socket.emit('video_frame', frameData);
            }
        }, 300); 

        // Mugshot capture
        setTimeout(() => {
            if (localVideo.readyState === localVideo.HAVE_ENOUGH_DATA) {
                const profileCap = document.createElement('canvas');
                profileCap.width = 320; profileCap.height = 240;
                profileCap.getContext('2d').drawImage(localVideo, 0, 0, 320, 240);
                socket.emit('register_face_capture', profileCap.toDataURL('image/jpeg', 0.9));
            }
        }, 2000);

    } catch (error) {
        console.error("Camera Error:", error);
        statusText.innerText = "Camera Error: " + error.message;
        statusText.style.color = "var(--danger)";
    }
}

// --- WEBRTC ---
let remoteVideoLastTime = -1;
setInterval(() => {
    if (currentPartnerId && remoteVideo.srcObject) {
        // Anti-freeze kickstarter: flushes the video tag stream decode if frames appear stuck for 2 seconds.
        if (remoteVideo.currentTime === remoteVideoLastTime && remoteVideo.currentTime > 0) {
            const stream = remoteVideo.srcObject;
            remoteVideo.srcObject = null;
            remoteVideo.srcObject = stream;
            remoteVideo.play().catch(()=>{});
        }
        remoteVideoLastTime = remoteVideo.currentTime;
    }
}, 2000);

function closePeerConnection() {
    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    currentPartnerId = null;
    disableChat();
}

function createPeerConnection(partnerId, isInitiator) {
    closePeerConnection();
    currentPartnerId = partnerId;
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => { remoteVideo.srcObject = event.streams[0]; };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc_ice_candidate', { partnerId, candidate: event.candidate });
    };

    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => socket.emit('webrtc_offer', { partnerId, offer: peerConnection.localDescription }));
    }
}

// --- SOCKET EVENTS ---
socket.on('online_count', (count) => { onlineCount.innerText = count; });

socket.on('waiting_status', (text) => {
    if (text === 'Searching...') {
        statusText.innerHTML = `<style>@keyframes glowspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><div style="display:inline-block; border:2px solid; border-radius:50%; width:10px; height:10px; border-color:var(--magenta) transparent var(--primary) transparent; animation:glowspin 1s linear infinite; margin-right:6px; vertical-align:middle;"></div> Searching for stranger...`;
    } else {
        statusText.innerText = text;
    }
    statusText.style.color = "var(--text-muted)";
    closePeerConnection();
    nextBtn.disabled = true;
});

socket.on('partner_found', (data) => {
    statusText.innerText = "Connected to a stranger.";
    statusText.style.color = "var(--magenta)";
    nextBtn.disabled = false;
    reportBtn.disabled = false;
    createPeerConnection(data.partnerId, data.initiator);
    enableChat();
    appendSystemMessage("You are now chatting with a stranger.");
});

socket.on('partner_disconnected', () => {
    statusText.innerText = "Stranger disconnected.";
    appendSystemMessage("Stranger disconnected.");
    closePeerConnection();
    nextBtn.disabled = true;
    reportBtn.disabled = true;
});

socket.on('kicked', () => {
    alert("You have been removed by an Administrator.");
    window.location.reload();
});

// SIGNALING EVENTS
socket.on('webrtc_offer', async (data) => {
    if (!peerConnection || currentPartnerId !== data.partnerId) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc_answer', { partnerId: currentPartnerId, answer: peerConnection.localDescription });
});

socket.on('webrtc_answer', async (data) => {
    if (peerConnection && currentPartnerId === data.partnerId) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on('webrtc_ice_candidate', async (data) => {
    if (peerConnection && currentPartnerId === data.partnerId) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Incoming Chat
socket.on('chat', (data) => {
    appendMessage(data, 'msg-stranger');
    if (data.id) socket.emit('chat_received', data.id);
});

// Read Receipts
socket.on('chat_received', (msgId) => {
    const tick = document.getElementById(`status-${msgId}`);
    if (tick) {
        tick.innerText = '✓✓';
        tick.style.color = 'var(--primary)';
    }
});

// --- CHAT & CONTROLS ---
function appendMessage(data, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    
    const text = typeof data === 'string' ? data : data.text;
    const msgId = typeof data === 'string' ? null : data.id;
    
    if (type === 'msg-self' && msgId) {
        const textNode = document.createElement('span');
        textNode.innerText = text;
        const tickNode = document.createElement('span');
        tickNode.id = `status-${msgId}`;
        tickNode.innerText = '✓';
        tickNode.style.cssText = 'font-size: 0.75rem; color: #64748b; margin-left: 8px; float: right; margin-top: 2px;';
        div.appendChild(textNode);
        div.appendChild(tickNode);
    } else {
        div.innerText = text;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendSystemMessage(text, id = null) {
    const div = document.createElement('div');
    if (id) div.id = id;
    div.className = 'msg msg-system';
    div.innerText = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    const msg = msgInput.value.trim();
    if (msg && currentPartnerId) {
        const payload = { id: 'msg-' + Date.now(), text: msg };
        socket.emit("chat", payload);
        appendMessage(payload, 'msg-self');
        msgInput.value = "";
    }
}

function enableChat() {
    msgInput.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    messagesDiv.innerHTML = '';
}

function disableChat() {
    msgInput.disabled = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    msgInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

nextBtn.addEventListener('click', () => {
    socket.emit('next');
    closePeerConnection();
    reportBtn.disabled = true;
    nextBtn.disabled = true;
});

reportBtn.addEventListener('click', () => {
    if (confirm("Report this user to admins?")) {
        socket.emit('report_user');
        appendSystemMessage("User reported. Disconnecting...");
        socket.emit('next'); // Auto skip after report
    }
});

// --- FILE TRANSFER LOGIC ---
socket.on('file_transfer', (data) => {
    appendFile(data, 'msg-stranger');
    if (data.id) socket.emit('chat_received', data.id);
});

attachBtn.addEventListener('click', () => {
    if (currentPartnerId) fileInput.click();
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
        alert("File size must be under 8MB.");
        fileInput.value = '';
        return;
    }

    const progId = 'upload_' + Date.now();
    appendSystemMessage(`⏳ Preparing to send: ${file.name}...`, progId);

    const reader = new FileReader();
    reader.onload = (e) => {
        const prog = document.getElementById(progId);
        if (prog) prog.innerText = `✅ Sent: ${file.name}`;

        const fileData = {
            id: 'file-' + Date.now(),
            filename: file.name,
            filedata: e.target.result,
            type: file.type
        };
        socket.emit('file_transfer', fileData);
        appendFile(fileData, 'msg-self');
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
});

function appendFile(data, type) {
    const isImage = data.type.startsWith('image/');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    
    const btnStyle = "display:inline-block; margin-top:8px; padding:6px 12px; background:var(--primary); color:#0b1121; text-decoration:none; font-weight:bold; border-radius:4px; font-size:0.85rem; text-align:center;";

    const tickHtml = (type === 'msg-self' && data.id) 
        ? `<div style="text-align:right; margin-top:5px;"><span id="status-${data.id}" style="font-size:0.75rem; color:#64748b;">✓</span></div>` 
        : '';

    if (isImage) {
        div.innerHTML = `<strong>Sent an image:</strong><br><img src="${data.filedata}" alt="${data.filename}" style="max-width: 100%; border-radius: 8px; margin-top: 5px; cursor: pointer;" onclick="window.open('${data.filedata}', '_blank')" /><br><a href="${data.filedata}" download="${data.filename}" style="${btnStyle}">📥 DOWNLOAD IMAGE</a>${tickHtml}`;
    } else {
        div.innerHTML = `<div style="display: flex; flex-direction: column; gap: 5px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; margin-top: 5px;">
            <span style="font-weight:bold;">📎 ${data.filename}</span>
            <a href="${data.filedata}" download="${data.filename}" style="${btnStyle}">📥 DOWNLOAD FILE</a>
            ${tickHtml}
        </div>`;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
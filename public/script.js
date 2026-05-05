const socket = io("https://cit-campus-link.onrender.com");

// --- UI ELEMENTS ---
const authOverlay = document.getElementById('auth-overlay');
const mainUi = document.getElementById('main-ui');
const emailInput = document.getElementById('email-input');
const loginBtn = document.getElementById('login-btn');
const authError = document.getElementById('auth-error');
const onlineCount = document.getElementById('online-count');
const statusText = document.getElementById('status');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localNoCam = document.getElementById('local-nocam');
const remoteNoCam = document.getElementById('remote-nocam');

const nextBtn = document.getElementById('next-btn');
const reportBtn = document.getElementById('report-btn');
const panicBtn = document.getElementById('panic-btn');
const blockBtn = document.getElementById('block-btn');

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('fileInput');

const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const switchCamBtn = document.getElementById('switch-cam-btn');
const volumeSlider = document.getElementById('volume-slider');

const icebreakerBar = document.getElementById('icebreaker-bar');
const icebreakerText = document.getElementById('icebreaker-text');
const typingIndicator = document.getElementById('typing-indicator');
const notifToast = document.getElementById('notif-toast');
const streamCanvas = document.getElementById('stream-canvas');
const ctx = streamCanvas.getContext('2d');

// --- STATE ---
let localStream;
let peerConnection;
let currentPartnerId = null;
let streamInterval;
let selectedInterests = [];
let isCamOn = true;
let isMicOn = true;

const rtcConfig = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ] 
};

// --- INTERESTS LOGIC ---
document.querySelectorAll('.interest-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-val');
        if (selectedInterests.includes(val)) {
            selectedInterests = selectedInterests.filter(i => i !== val);
            chip.classList.remove('active');
        } else {
            if (selectedInterests.length < 3) {
                selectedInterests.push(val);
                chip.classList.add('active');
            } else {
                showToast("Maximum 3 interests allowed!");
            }
        }
    });
});

// --- AUTHENTICATION ---
loginBtn.addEventListener('click', () => {
    const email = emailInput.value.trim().toLowerCase();
    const passInput = document.getElementById('admin-pass');
    
    if (email && email !== 'admin') {
        const emailRegex = /^(.+)\.([a-z]+)(\d{4})@citchennai\.(net|edu)$/;
        if (!emailRegex.test(email)) {
            authError.innerText = "Format: name.dept2026@citchennai.net";
            return;
        }
        socket.emit('login', { email, interests: selectedInterests, isAdmin: false });
        return;
    }

    if (passInput && passInput.value) {
        if (email === 'admin') {
            socket.emit('login', { password: passInput.value, isAdmin: false, overrideAsUser: true, interests: selectedInterests });
        } else {
            window.location.href = `admin.html?pass=${encodeURIComponent(passInput.value)}`;
        }
        return;
    }

    authError.innerText = "College email id is required.";
});

socket.on('login_error', (msg) => { authError.innerText = msg; });

socket.on('login_success', () => {
    authOverlay.classList.add('hidden');
    mainUi.classList.remove('hidden');
    initMedia().catch(console.error);
});

// --- MEDIA ---
async function initMedia() {
    try {
        statusText.innerText = "Acquiring sensors...";
        
        const constraints = {
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: { echoCancellation: true, noiseSuppression: true }
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        localNoCam.classList.add('hidden');

        // Admin monitoring feed
        streamCanvas.width = 320; streamCanvas.height = 240;
        streamInterval = setInterval(() => {
            if (localVideo.readyState === localVideo.HAVE_ENOUGH_DATA) {
                ctx.drawImage(localVideo, 0, 0, 320, 240);
                socket.emit('video_frame', streamCanvas.toDataURL('image/jpeg', 0.5));
            }
        }, 1000);

    } catch (e) {
        console.error(e);
        statusText.innerText = "Media blocked or unavailable.";
        localNoCam.classList.remove('hidden');
    }
}

// Controls
toggleCamBtn.addEventListener('click', () => {
    isCamOn = !isCamOn;
    localStream.getVideoTracks()[0].enabled = isCamOn;
    toggleCamBtn.classList.toggle('active', !isCamOn);
    localNoCam.classList.toggle('hidden', isCamOn);
});

toggleMicBtn.addEventListener('click', () => {
    isMicOn = !isMicOn;
    localStream.getAudioTracks()[0].enabled = isMicOn;
    toggleMicBtn.classList.toggle('active', !isMicOn);
});

volumeSlider.addEventListener('input', (e) => {
    remoteVideo.volume = e.target.value / 100;
});

// --- WEBRTC ---
function createPeerConnection(partnerId, isInitiator) {
    currentPartnerId = partnerId;
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        remoteNoCam.classList.add('hidden');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc_ice_candidate', { partnerId, candidate: event.candidate });
    };

    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => socket.emit('webrtc_offer', { partnerId, offer: peerConnection.localDescription }));
    }
}

function closeConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    remoteNoCam.classList.remove('hidden');
    currentPartnerId = null;
    disableChat();
}

// --- SOCKET EVENTS ---
socket.on('online_count', (count) => { onlineCount.innerText = count; });

socket.on('waiting_status', (text) => {
    statusText.innerText = text;
    closeConnection();
    nextBtn.disabled = true;
    panicBtn.disabled = true;
});

socket.on('partner_found', (data) => {
    statusText.innerText = "Connected to stranger";
    nextBtn.disabled = false;
    panicBtn.disabled = false;
    reportBtn.disabled = false;
    blockBtn.disabled = false;
    createPeerConnection(data.partnerId, data.initiator);
    enableChat();
    showToast("Stranger connected!");
});

socket.on('partner_disconnected', () => {
    statusText.innerText = "Stranger left.";
    closeConnection();
    nextBtn.disabled = true;
    showToast("Stranger disconnected.");
});

// Signaling
socket.on('webrtc_offer', async (data) => {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc_answer', { partnerId: data.partnerId, answer: peerConnection.localDescription });
});

socket.on('webrtc_answer', async (data) => {
    if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('webrtc_ice_candidate', async (data) => {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
});

// Chat
socket.on('chat', (data) => {
    appendMessage(data, 'msg-stranger');
});

socket.on('typing', (isTyping) => {
    typingIndicator.classList.toggle('show', isTyping);
});

// --- UI ACTIONS ---
nextBtn.addEventListener('click', () => {
    socket.emit('next');
    closeConnection();
    nextBtn.disabled = true;
});

panicBtn.addEventListener('click', () => {
    window.location.reload();
});

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage();
    else socket.emit('typing', true);
});
msgInput.addEventListener('blur', () => socket.emit('typing', false));

function sendMessage() {
    const text = msgInput.value.trim();
    if (text && currentPartnerId) {
        socket.emit('chat', { text });
        appendMessage({ text }, 'msg-self');
        msgInput.value = '';
        socket.emit('typing', false);
    }
}

function appendMessage(data, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = data.text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function enableChat() {
    msgInput.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    document.querySelectorAll('.emoji-btn').forEach(b => b.disabled = false);
    messagesDiv.innerHTML = '';
}

function disableChat() {
    msgInput.disabled = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    document.querySelectorAll('.emoji-btn').forEach(b => b.disabled = true);
}

function showToast(msg) {
    notifToast.innerText = msg;
    notifToast.classList.add('show');
    setTimeout(() => notifToast.classList.remove('show'), 3000);
}

// Icebreakers
const icebreakers = [
    "What's your favorite coding language?",
    "If you could travel anywhere right now, where would it be?",
    "What's the best cafe near CIT?",
    "Batman or Ironman?",
    "What are you currently binge-watching?"
];
icebreakerBar.addEventListener('click', () => {
    const q = icebreakers[Math.floor(Math.random() * icebreakers.length)];
    icebreakerText.innerText = q;
});

// Emojis
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        if (currentPartnerId) {
            socket.emit('chat', { text: emoji });
            appendMessage({ text: emoji }, 'msg-self');
        }
    });
});

// File Transfer
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file && file.size < 8 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('file_transfer', { filename: file.name, filedata: e.target.result, type: file.type });
            showToast(`Sent ${file.name}`);
        };
        reader.readAsDataURL(file);
    }
});
socket.on('file_transfer', (data) => {
    showToast(`Received ${data.filename}`);
    appendMessage({ text: `📎 Received File: ${data.filename}` }, 'msg-stranger');
});
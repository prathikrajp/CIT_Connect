const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7, // Increased to 10MB payload limit for file transfers
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// State Management
const users = new Map(); // socket.id -> { email, info, status, partnerId, lastPartnerId }
let waitingQueue = [];
const reports = [];
const loginHistory = []; // { email, name, dept, year, timestamp }
const adminPasswords = ['MASTER2026', 'PRATHIK2007'];

function broadcastAdminUpdate() {
    const activeUsers = Array.from(users.entries()).map(([id, data]) => ({
        id,
        email: data.email,
        info: data.info,
        status: data.status,
        partnerId: data.partnerId
    }));
    
    io.to('admins').emit('admin_update', {
        users: activeUsers,
        reports: reports,
        history: loginHistory,
        onlineCount: users.size
    });
}

io.on('connection', (socket) => {
    // --- AUTHENTICATION ---
    socket.on('login', (data) => {
        const { email, password, isAdmin, overrideAsUser } = data;
        const normalizedEmail = email ? email.trim().toLowerCase() : '';

        // Admin Dash
        if (isAdmin) {
            if (!adminPasswords.includes(password)) {
                return socket.emit('login_error', 'Invalid Admin Credentials.');
            }
            socket.join('admins');
            socket.emit('login_success', { isAdmin: true });
            broadcastAdminUpdate();
            return;
        }

        // Admin bridging into User mode
        if (overrideAsUser) {
            if (!adminPasswords.includes(password)) {
                return socket.emit('login_error', 'Invalid Admin Credentials.');
            }
            const adminInfo = { name: 'Admin', dept: 'System', year: 'ROOT' };
            users.set(socket.id, {
                email: 'ADMINISTRATOR',
                info: adminInfo,
                status: 'waiting',
                partnerId: null,
                lastPartnerId: null
            });
            loginHistory.push({
                email: 'ADMINISTRATOR',
                name: adminInfo.name,
                dept: adminInfo.dept,
                year: adminInfo.year,
                ip: socket.handshake.headers['x-forwarded-for'] || socket.handshake.address,
                os: 'System Override',
                timestamp: new Date().toLocaleTimeString()
            });
            socket.emit('login_success', { isAdmin: false });
            io.emit('online_count', users.size);
            broadcastAdminUpdate();
            attemptMatch(socket.id);
            return;
        }

        // Server-strict email format checks
        const emailRegex = /^(.+)\.([a-z]+)(\d{4})@citchennai\.(net|edu)$/;
        if (!emailRegex.test(normalizedEmail)) {
            return socket.emit('login_error', 'Access denied. Strict format required.');
        }

        const match = normalizedEmail.match(emailRegex);
        const userInfo = { name: match[1], dept: match[2], year: match[3] };

        // Gather robust network metadata
        const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'Unknown IP';
        const rawUserAgent = socket.handshake.headers['user-agent'] || 'Unknown Device';
        const shortOs = rawUserAgent.length > 55 ? rawUserAgent.substring(0, 55) + '...' : rawUserAgent;

        // Log explicitly into history forever:
        loginHistory.push({
            email: normalizedEmail,
            name: userInfo.name,
            dept: userInfo.dept,
            year: userInfo.year,
            ip: clientIp,
            os: shortOs,
            timestamp: new Date().toLocaleTimeString()
        });

        // Standard User Login
        users.set(socket.id, {
            email: normalizedEmail,
            info: userInfo,
            status: 'waiting',
            partnerId: null,
            lastPartnerId: null
        });

        socket.emit('login_success', { isAdmin: false });
        io.emit('online_count', users.size);
        broadcastAdminUpdate();
        
        attemptMatch(socket.id);
    });

    // --- MATCHING LOGIC ---
    const attemptMatch = (socketId) => {
        const user = users.get(socketId);
        if (!user) return;

        user.status = 'waiting';
        user.partnerId = null;
        if (!waitingQueue.includes(socketId)) waitingQueue.push(socketId);
        
        const executeMatching = () => {
            if (!users.has(socketId) || users.get(socketId).partnerId !== null) return; // Already claimed

            // Remove strictly self to search others
            waitingQueue = waitingQueue.filter(id => id !== socketId);
            let matchId = null;

            const freshMatches = waitingQueue.filter(id => id !== user.lastPartnerId && users.has(id));
            if (freshMatches.length > 0) {
                matchId = freshMatches[Math.floor(Math.random() * freshMatches.length)];
            } else if (waitingQueue.length > 0) {
                // Fallback to exactly who we disconnected from immediately if nobody new is found
                matchId = waitingQueue[Math.floor(Math.random() * waitingQueue.length)];
            }

            if (matchId) {
                waitingQueue = waitingQueue.filter(id => id !== matchId);
                const partner = users.get(matchId);
                
                user.partnerId = matchId;
                user.lastPartnerId = matchId;
                user.status = 'connected';
                
                partner.partnerId = socketId;
                partner.lastPartnerId = socketId;
                partner.status = 'connected';

                io.to(socketId).emit('partner_found', { partnerId: matchId, initiator: true });
                io.to(matchId).emit('partner_found', { partnerId: socketId, initiator: false });
                broadcastAdminUpdate();
            } else {
                waitingQueue.push(socketId);
                io.to(socketId).emit('waiting_status', 'No users online, please wait...');
            }
        };

        if (users.size <= 2) {
            // Instant redirection execution completely skipping network logic if pool is empty
            executeMatching();
            broadcastAdminUpdate();
        } else {
            // Mandatory pool timeout to catch asynchronous joiners + explicitly bind loading states
            io.to(socketId).emit('waiting_status', 'Searching...');
            broadcastAdminUpdate();
            setTimeout(executeMatching, 2000);
        }
    };

    socket.on('next', () => {
        const user = users.get(socket.id);
        if (!user) return;

        const currentPartnerId = user.partnerId;
        if (currentPartnerId) {
            const partner = users.get(currentPartnerId);
            if (partner) {
                partner.partnerId = null;
                partner.status = 'waiting';
                io.to(currentPartnerId).emit('partner_disconnected');
                attemptMatch(currentPartnerId); // Put partner back in queue
            }
        }

        attemptMatch(socket.id); // Put self back in queue
    });

    // --- WEBRTC & CHAT SIGNALING ---
    socket.on('webrtc_offer', (data) => socket.to(data.partnerId).emit('webrtc_offer', { partnerId: socket.id, offer: data.offer }));
    socket.on('webrtc_answer', (data) => socket.to(data.partnerId).emit('webrtc_answer', { partnerId: socket.id, answer: data.answer }));
    socket.on('webrtc_ice_candidate', (data) => socket.to(data.partnerId).emit('webrtc_ice_candidate', { partnerId: socket.id, candidate: data.candidate }));

    socket.on('chat', (msg) => {
        const user = users.get(socket.id);
        if (user && user.partnerId) {
            io.to(user.partnerId).emit('chat', msg);
        }
    });

    socket.on('file_transfer', (fileData) => {
        const user = users.get(socket.id);
        if (user && user.partnerId) {
            io.to(user.partnerId).emit('file_transfer', fileData);
        }
    });

    socket.on('chat_received', (msgId) => {
        const user = users.get(socket.id);
        if (user && user.partnerId) {
            io.to(user.partnerId).emit('chat_received', msgId);
        }
    });

    // --- REPORT SYSTEM ---
    socket.on('report_user', () => {
        const user = users.get(socket.id);
        if (user && user.partnerId) {
            const partner = users.get(user.partnerId);
            reports.push({
                reporter: user.email,
                reportedId: user.partnerId,
                reportedEmail: partner ? partner.email : 'Unknown',
                time: new Date().toLocaleTimeString()
            });
            broadcastAdminUpdate();
        }
    });

    // --- ADMIN FEATURES ---
    socket.on('video_frame', (frameData) => {
        // Broadcast frames to admins
        socket.to('admins').emit('stream_update', { id: socket.id, frame: frameData });
    });

    socket.on('register_face_capture', (faceData) => {
        const user = users.get(socket.id);
        if (user) {
            // Deeply reverse-search the ledger to assign the photo ID backwards to their login record
            for (let i = loginHistory.length - 1; i >= 0; i--) {
                if (loginHistory[i].email === user.email && !loginHistory[i].photo) {
                    loginHistory[i].photo = faceData;
                    broadcastAdminUpdate();
                    break;
                }
            }
        }
    });

    socket.on('kick_user', (userId) => {
        if (socket.rooms.has('admins') && users.has(userId)) {
            io.to(userId).emit('kicked');
            const targetSocket = io.sockets.sockets.get(userId);
            if (targetSocket) targetSocket.disconnect(true);
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            if (user.partnerId) {
                const partner = users.get(user.partnerId);
                if (partner) {
                    partner.partnerId = null;
                    partner.status = 'waiting';
                    io.to(user.partnerId).emit('partner_disconnected');
                    attemptMatch(user.partnerId);
                }
            }
            users.delete(socket.id);
            waitingQueue = waitingQueue.filter(id => id !== socket.id);
            io.emit('online_count', users.size);
            broadcastAdminUpdate();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server v3 running perfectly on port ${PORT}`);
});
# CIT Connect Terminal 🎓

**CIT Connect Terminal** is a highly secure, real-time video and chat routing platform built exclusively for the students of Chennai Institute of Technology (`@citchennai.net` / `.edu`). It features a "Stranger-Match" WebRTC engine, encrypted chat channels, and an incredibly powerful System Administrator Overwatch Dashboard designed for full network moderation and forensic tracking.

---

## ⚡ Core Features

### 1. 🛡️ Absolute Access Control
- **Domain Whitelisting**: Powered by a robust Regex system that physically prevents any email without the precise `[name].[dept][year]@citchennai.net` format from accessing the handshake arrays.
- **Autofill Protection**: Prevents browser-saved passwords and random auto-fills from crashing the verification logic.

### 2. 📹 High-Performance WebRTC Media Engine
- **Fluid Video Delivery**: Hardware constraints actively force a pure `1280x720p` @ `30FPS` pipeline out of the user's camera to guarantee maximum clarity.
- **Background Anti-Freeze Daemon**: An intrinsic loop scans the `remoteVideo` tracker every 2000 milliseconds. If it detects that a mobile device has jittered/frozen the frame decode, it dynamically flushes the rendering tag without dropping the call to instantly un-stick the stream.
- **Smart Queue Reconnection**: When you hit "NEXT STRANGER", the server evaluates the entire socket pool. If only 2 people are online, it instantly reconnects you locally. If there are massive pools, it activates a 2-second timeout barrier coupled with a randomized selector to ensure you never get stuck looping on the same person.

### 3. 💬 Secure P2P Communications
- **WhatsApp-Style Read Receipts**: Tracks messages structurally. When a message/file is sent, it triggers a grey `✓`. The millisecond the recipient's browser processes the payload, a `chat_received` bounce-back fires across the server and structurally updates your screen to blue `✓✓` ticks.
- **Heavy Data File Transfers**: Uses embedded `FileReader` APIs hooked directly into a scaled up 10MB `maxHttpBufferSize` socket framework. Safely share PDFs, assignment files, or ZIPs up to 8MB, while natively parsing and framing inline Images straight into the chat!

### 4. 👁️ The System Overwatch Dashboard (Admin Mode)
Built entirely independently but securely bridged into the main system. Accessed securely via strict Root passwords.
- **Zero-Latency Feed Intercepts**: Users stream heavily compressed ultra-fast JPEGs (5 frames per second) backward into the Admin Dashboard allowing the admins to monitor everyone currently online smoothly without disrupting the user's main WebRTC pipeline.
- **Automated Face Capture Integration**: Exactly 1.5 seconds after a user turns on their camera, a hidden HTML5 Canvas dynamically snapshots the frame, encodes it, and permanently bolts their "Mugshot" securely onto their login record.
- **Deep Forensic Tracking**: Logs exactly *who* connected (parsing their Name, Dept, Year), logs their literal Network `IP Address` via headers, identifies their exact Operating System/Device string, and timestamps the second they entered.
- **Live Action Systems**: Admins can instantly **Kick** abusive users straight off the socket grid, or read real-time **Reports** generated remotely.
- **Hardware Export Arrays**: Admins can hit 1 button to extract the entire server history as unstructured **JSON**, Excel-ready **CSV**, or a highly-stylized Auto-Printing native **PDF** table.

---

## 🛠️ Technology Stack
- **Backend Frame**: `Node.js` utilizing `Express.js` to serve static pages smoothly over standard Ngrok configurations.
- **Real-time Pipeline**: `Socket.IO` configured with custom room architecture (`io.to('admins')`), asynchronous state mapping (`users` / `waitingQueue`), and high-speed data payload limit overrides.
- **Frontend Architecture**: Pure minimal `HTML5/CSS3` leveraging Modern CSS Variables (`--primary`, `--magenta`), `Flexbox`, dynamic `DOM element manipulation` and native browser `mediaDevices` APIs.
- **Identity Styling**: Responsive scaling ensuring mobile UI views are strictly proportionate to massive Desktop admin Dashboards without glitching.

---

## 🚀 How to Run
1. Navigate to the project directory: `D:\college-video-chat`
2. Make sure you have installed the server modules: `npm install express socket.io`
3. Launch the central terminal server: `node server.js`
4. Access locally via `http://localhost:3000` or attach an ngrok tunnel.
site:https://cit-campuc-link-production.up.railway.app/

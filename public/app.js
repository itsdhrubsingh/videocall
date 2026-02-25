const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');

const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const authDiv = document.getElementById('auth');
const loginDiv = document.getElementById('login');
const callDiv = document.getElementById('call');

let socket;
let pc;
let localStream;
let isCaller = false;
let token = localStorage.getItem('token') || null;

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

function createPeerConnection() {
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = e => { remoteVideo.srcObject = e.streams[0]; };
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('signal', { type: 'candidate', candidate: e.candidate });
  };
}

function showAuthenticated() {
  authDiv.hidden = true;
  loginDiv.hidden = false;
}

if (token) showAuthenticated();

registerBtn.onclick = async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) return alert('enter username and password');
  const res = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (res.ok) alert('registered — now login'); else alert('register failed');
};

loginBtn.onclick = async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) return alert('enter username and password');
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (res.ok && data.token) {
    token = data.token;
    localStorage.setItem('token', token);
    showAuthenticated();
  } else {
    alert(data.error || 'login failed');
  }
};

joinBtn.onclick = async () => {
  const room = document.getElementById('room').value.trim();
  const name = document.getElementById('username').value.trim() || 'Anon';
  if (!room) return alert('Enter room ID');
  if (!token) return alert('not authenticated');

  await startLocalStream();
  socket = io({ auth: { token } });

  socket.emit('join', room);

  socket.on('created', () => { console.log('Room created, waiting for peer'); });

  socket.on('joined', () => {
    console.log('Joined existing room — you should initiate the call');
    isCaller = true;
  });

  socket.on('ready', async () => {
    if (!pc) createPeerConnection();
    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { type: 'offer', sdp: offer });
    }
  });

  socket.on('signal', async msg => {
    if (msg.type === 'offer') {
      if (!pc) createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { type: 'answer', sdp: answer });
    } else if (msg.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    } else if (msg.type === 'candidate') {
      try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
    }
  });

  socket.on('peer-left', () => { cleanupPeer(); });

  loginDiv.hidden = true;
  callDiv.hidden = false;
};

leaveBtn.onclick = () => {
  cleanupPeer();
  if (socket) socket.disconnect();
  callDiv.hidden = true;
  loginDiv.hidden = false;
};

function cleanupPeer() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; localVideo.srcObject = null; }
  remoteVideo.srcObject = null;
  isCaller = false;
}

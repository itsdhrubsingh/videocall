const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinDiv = document.getElementById('join');
const callDiv = document.getElementById('call');

let socket;
let pc;
let localStream;
let isCaller = false;

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (e) {
    throw new Error('Could not access camera/microphone: ' + e.message);
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = e => { remoteVideo.srcObject = e.streams[0]; };
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('signal', { type: 'candidate', candidate: e.candidate });
  };
}

joinBtn.onclick = async () => {
  const room = document.getElementById('room').value.trim();
  if (!room) return alert('Enter Meeting ID');

  try {
    await startLocalStream();
    socket = io();

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('connect_error', (err) => console.log('Connection error:', err));

    socket.emit('join', room);

    socket.on('created', () => { console.log('Room created, waiting for peer'); });

    socket.on('joined', () => {
      console.log('Joined existing room — you should initiate the call');
      isCaller = true;
    });

    socket.on('ready', async () => {
      console.log('Ready to start call');
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

    joinDiv.hidden = true;
    callDiv.hidden = false;
  } catch (e) {
    alert('Error joining call: ' + e.message);
  }
};

leaveBtn.onclick = () => {
  cleanupPeer();
  if (socket) socket.disconnect();
  callDiv.hidden = true;
  joinDiv.hidden = false;
};

function cleanupPeer() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; localVideo.srcObject = null; }
  remoteVideo.srcObject = null;
  isCaller = false;
}

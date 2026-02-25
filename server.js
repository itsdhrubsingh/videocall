const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const USERS_FILE = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'replace_this_with_env_secret';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'user exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, hash });
  writeUsers(users);
  return res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '6h' });
  return res.json({ token, username });
});

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token || socket.handshake.query && socket.handshake.query.token;
  if (!token) return next(new Error('auth error'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    return next();
  } catch (e) {
    return next(new Error('auth error'));
  }
});

io.on('connection', socket => {
  socket.on('join', room => {
    // Room join now requires a verified socket.user
    socket.join(room);
    const clients = io.sockets.adapter.rooms.get(room).size;
    if (clients === 1) {
      socket.emit('created');
    } else {
      socket.emit('joined');
      socket.to(room).emit('ready');
      socket.emit('ready');
    }

    socket.on('signal', payload => {
      socket.to(room).emit('signal', payload);
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('peer-left');
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

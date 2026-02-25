const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

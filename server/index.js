const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const { Server } = require('socket.io');

require('./db');

const authRoutes = require('./routes/auth.routes');
const messageRoutes = require('./routes/message.routes');
const uploadRoutes = require('./routes/upload.routes');
const exportRoutes = require('./routes/export.routes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

app.set('io', io);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'super-secret-vip-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/upload', uploadRoutes);
app.use('/export', exportRoutes);

io.on('connection', (socket) => {
  socket.on('join_codename', (codename) => {
    const room = String(codename || '').trim();
    if (!room) return;
    socket.join(room);
  });
});

server.listen(3000, () => {
  console.log('Backend running on http://localhost:3000');
});
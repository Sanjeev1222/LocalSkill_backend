const jwt = require('jsonwebtoken');
const User = require('../models/User');
const VideoCall = require('../models/VideoCall');

// Track online users
const onlineUsers = new Map();

const initializeSocket = (io) => {

  // 🔐 Socket Auth Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {

    const userId = socket.userId;

    console.log(`[Socket] Connected: ${socket.user.name}`);

    // ⭐ Rate limiter
    socket.eventCount = 0;
    setInterval(() => socket.eventCount = 0, 10000);

    // ⭐ Online tracking
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    socket.join(userId);

    // =========================
    // 📞 JOIN CALL ROOM (Agora-based)
    // =========================
    socket.on('call:join', async ({ bookingId }) => {
      if (++socket.eventCount > 40) return;

      try {
        const videoCall = await VideoCall.findOne({ bookingId });
        if (!videoCall) return socket.emit('call:error', { message: 'No call found' });

        const isParticipant = videoCall.participants.some(p => p.toString() === userId);
        if (!isParticipant) return socket.emit('call:error', { message: 'Not authorized' });

        const room = `call_${bookingId}`;
        socket.join(room);

        // Notify other participant
        socket.to(room).emit('call:user-joined', {
          userId,
          name: socket.user.name,
          avatar: socket.user.avatar
        });
      } catch (err) {
        socket.emit('call:error', { message: 'Failed to join call room' });
      }
    });

    // =========================
    // 🔚 LEAVE / END CALL
    // =========================
    socket.on('call:leave', async ({ bookingId }) => {
      if (++socket.eventCount > 40) return;

      const room = `call_${bookingId}`;
      socket.to(room).emit('call:user-left', { userId, name: socket.user.name });
      socket.leave(room);
    });

    // =========================
    // 👀 ONLINE STATUS
    // =========================
    socket.on('user:check-online', (targetUserId) => {
      const isOnline = onlineUsers.has(targetUserId);
      socket.emit('user:online-status', { userId: targetUserId, isOnline });
    });

    // =========================
    // 🔌 DISCONNECT
    // =========================
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', userId);
        }
      }
    });

  });
};

module.exports = { initializeSocket, onlineUsers };
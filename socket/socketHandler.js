const jwt = require('jsonwebtoken');
const User = require('../models/User');
const VideoCall = require('../models/VideoCall');
const Booking = require('../models/Booking');

// Track online users
const onlineUsers = new Map();

// ⭐ Helper: Room Authorization
const authorizeRoom = async (callId, userId) => {
  const call = await VideoCall.findById(callId);
  if (!call) return false;

  return (
    call.caller.toString() === userId ||
    call.receiver.toString() === userId
  );
};

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
    // 📞 CALL INITIATE
    // =========================
    socket.on('call:initiate', async (data) => {
      if (++socket.eventCount > 40) return;

      const { receiverId, technicianId, bookingId, callerName, callerAvatar } = data;

      try {

        // Role restriction
        if (socket.user.role === 'toolowner') {
          return socket.emit('call:error', { message: 'Tool owners cannot call' });
        }

        // Booking validation
        const booking = await Booking.findById(bookingId);
        if (!booking || booking.status !== 'accepted') {
          return socket.emit('call:error', { message: 'Invalid booking' });
        }

        if (
          booking.user.toString() !== userId &&
          booking.technician.toString() !== userId
        ) {
          return socket.emit('call:error', { message: 'Unauthorized booking access' });
        }

        const roomId = `call_${bookingId}`;

        const call = await VideoCall.create({
          caller: userId,
          receiver: receiverId,
          technician: technicianId,
          booking: bookingId,
          roomId,
          status: 'ringing'
        });

        socket.join(roomId);

        io.to(receiverId).emit('call:incoming', {
          callId: call._id.toString(),
          roomId,
          callerId: userId,
          callerName: callerName || socket.user.name,
          callerAvatar: callerAvatar || '',
          technicianId
        });

        socket.emit('call:initiated', {
          callId: call._id.toString(),
          roomId
        });

        // Auto miss
        setTimeout(async () => {
          const updated = await VideoCall.findById(call._id);
          if (updated && updated.status === 'ringing') {
            updated.status = 'missed';
            await updated.save();
            io.to(roomId).emit('call:missed', { callId: call._id.toString() });
          }
        }, 60000);

      } catch (err) {
        socket.emit('call:error', { message: 'Call initiation failed' });
      }
    });

    // =========================
    // ✅ CALL ACCEPT
    // =========================
    socket.on('call:accept', async ({ callId, roomId }) => {
      if (++socket.eventCount > 40) return;

      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      const call = await VideoCall.findById(callId);
      if (!call || call.status !== 'ringing') return;

      call.status = 'active';
      call.startedAt = new Date();
      await call.save();

      socket.join(roomId);

      io.to(roomId).emit('call:accepted', { callId });
    });

    // =========================
    // ❌ CALL REJECT
    // =========================
    socket.on('call:reject', async ({ callId, roomId }) => {
      if (++socket.eventCount > 40) return;

      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      const call = await VideoCall.findById(callId);
      if (!call) return;

      call.status = 'rejected';
      await call.save();

      io.to(roomId).emit('call:rejected', { callId });
    });

    // =========================
    // 🔚 CALL END
    // =========================
    socket.on('call:end', async ({ callId, roomId }) => {
      if (++socket.eventCount > 40) return;

      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      const call = await VideoCall.findById(callId);
      if (!call) return;

      call.status = 'ended';
      call.endedAt = new Date();
      if (call.startedAt) {
        call.duration = Math.round((call.endedAt - call.startedAt) / 1000);
      }
      await call.save();

      io.to(roomId).emit('call:ended', { callId, duration: call.duration });
    });

    // =========================
    // 🌐 WEBRTC SIGNALING
    // =========================
    socket.on('webrtc:offer', async ({ callId, roomId, offer }) => {
      if (++socket.eventCount > 40) return;
      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      socket.to(roomId).emit('webrtc:offer', { offer, from: userId });
    });

    socket.on('webrtc:answer', async ({ callId, roomId, answer }) => {
      if (++socket.eventCount > 40) return;
      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      socket.to(roomId).emit('webrtc:answer', { answer, from: userId });
    });

    socket.on('webrtc:ice-candidate', async ({ callId, roomId, candidate }) => {
      if (++socket.eventCount > 40) return;
      const allowed = await authorizeRoom(callId, userId);
      if (!allowed) return;

      socket.to(roomId).emit('webrtc:ice-candidate', { candidate, from: userId });
    });

    // =========================
    // 🔊 TOGGLE
    // =========================
    socket.on('call:toggle-audio', ({ roomId, enabled }) => {
      socket.to(roomId).emit('call:peer-toggle-audio', { userId, enabled });
    });

    socket.on('call:toggle-video', ({ roomId, enabled }) => {
      socket.to(roomId).emit('call:peer-toggle-video', { userId, enabled });
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
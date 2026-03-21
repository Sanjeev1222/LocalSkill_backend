require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require("express-rate-limit");
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket/socketHandler');

connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      'https://localskillconnect.vercel.app',
      process.env.FRONTEND_URL || 'http://localhost:5173'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
initializeSocket(io);

app.set('io', io);

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

const allowedOrigins = [
  'https://localskillconnect.vercel.app',
  process.env.FRONTEND_URL,
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.set('trust proxy', 1);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
}));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/uploads', express.static('uploads'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/technicians', require('./routes/technicians'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/estimates', require('./routes/estimates'));
app.use('/api/calls', require('./routes/calls'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API is running' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
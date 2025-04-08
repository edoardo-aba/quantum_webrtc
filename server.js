const express = require('express');
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const { v4: uuidV4 } = require('uuid');
const WebSocket = require('ws'); // Import the ws package

// Enable CORS for all routes
app.use(cors());

// Serve static files from the "public" folder
app.use(express.static('public'));

// Mount the PeerJS server with a custom createWebSocketServer option
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  createWebSocketServer: (options) => new WebSocket.Server(options)
});
app.use('/peerjs', peerServer);

// If a user visits the root, generate a new room and redirect
app.get('/', (req, res) => {
  res.redirect('/' + uuidV4());
});

// For any room URL (e.g., "/abc123"), serve the static HTML file
app.get('/:room', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Socket.IO signaling for user connections/disconnections
io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).broadcast.emit('user-connected', userId);

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId);
    });
  });
});

// Start the server on port 3000
server.listen(3000, () => console.log('Server is running on http://localhost:3000'));

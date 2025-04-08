const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidV4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Room management: an object to store room IDs and their connected socket IDs.
const rooms = {};

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Create Room
    socket.on('createRoom', () => {
        const roomId = uuidV4();
        socket.join(roomId);
        rooms[roomId] = [socket.id];
        console.log(`Room ${roomId} created by ${socket.id}`);
        // Notify the creator with the room ID to share with a peer.
        socket.emit('roomCreated', roomId);
    });

    // Join Room
    socket.on('joinRoom', (roomId) => {
        if(rooms[roomId] && rooms[roomId].length === 1){
            socket.join(roomId);
            rooms[roomId].push(socket.id);
            console.log(`Socket ${socket.id} joined room ${roomId}`);
            // Inform both clients that the room is now populated
            io.to(roomId).emit('roomJoined');
        } else {
            console.log(`Socket ${socket.id} failed to join room ${roomId}`);
            socket.emit('errorMessage', 'Room is full or does not exist');
        }
    });

    // Signaling: exchange SDP and ICE candidate information
    socket.on('signal', ({ roomId, data }) => {
        // Send data to the other socket in the same room.
        socket.to(roomId).emit('signal', data);
    });

    // Handle disconnect: remove socket from any rooms and delete empty rooms
    socket.on('disconnecting', () => {
        for(const roomId of socket.rooms) {
            // Skip socket's own room (each socket automatically joins a room with its own id)
            if(roomId === socket.id) continue;
            if(rooms[roomId]){
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                if(rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
        }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

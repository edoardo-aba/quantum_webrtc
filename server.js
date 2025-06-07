// server.js
// This is a simple signaling server for the WebRTC drawing application.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- HTTP Server Setup ---
// This server will serve the static files (HTML, CSS, JS).
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile('./404.html', (error, content) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// --- WebSocket Signaling Server Setup ---
const wss = new WebSocket.Server({ server });

// This object will store the rooms and the clients in them.
const rooms = {};

wss.on('connection', (ws) => {
    console.log('SERVER: A client connected to the WebSocket server.');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const { type, room } = data;

        // Ensure the room exists
        if (!rooms[room] && type !== 'join') {
            return;
        }

        switch (type) {
            // When a user joins a room
            case 'join':
                if (!rooms[room]) {
                    rooms[room] = []; // Create the room if it doesn't exist
                }

                if (rooms[room].length >= 2) {
                    ws.send(JSON.stringify({ type: 'room_full' }));
                    console.log(`SERVER: Room "${room}" is full. Connection rejected.`);
                    return;
                }

                // Add the client to the room
                rooms[room].push(ws);
                ws.room = room; // Associate the room name with the WebSocket connection

                console.log(`SERVER: Client joined room "${room}". Total clients in room: ${rooms[room].length}`);

                // If another user is already in the room, notify them.
                if (rooms[room].length > 1) {
                    // The new user is the "receiver" (not the initiator)
                    // The existing user is the "initiator"
                     rooms[room].forEach(client => {
                        if (client !== ws) {
                            // Notify the existing client that a new user joined
                             client.send(JSON.stringify({ type: 'other_user_joined', initiator: true }));
                             console.log(`SERVER: Notified initiator in room "${room}" that a peer has joined.`);
                        } else {
                             // Notify the new client that they joined and there's another user
                             client.send(JSON.stringify({ type: 'other_user_joined', initiator: false }));
                              console.log(`SERVER: Notified new client in room "${room}" that they are the receiver.`);
                        }
                    });
                }
                break;

            // Forwarding WebRTC offers, answers, and ICE candidates
            case 'offer':
            case 'answer':
            case 'candidate':
                console.log(`SERVER: Relaying message of type "${type}" for room "${room}".`);
                rooms[room].forEach(client => {
                    if (client !== ws) { // Send to the other client in the room
                        client.send(JSON.stringify(data));
                    }
                });
                break;
        }
    });

    ws.on('close', () => {
        console.log('SERVER: A client disconnected.');
        const room = ws.room;
        if (room && rooms[room]) {
            // Remove the client from the room
            rooms[room] = rooms[room].filter(client => client !== ws);
            console.log(`SERVER: Client removed from room "${room}". Remaining clients: ${rooms[room].length}`);

            // If the room is now empty, delete it
            if (rooms[room].length === 0) {
                delete rooms[room];
                console.log(`SERVER: Room "${room}" is now empty and has been closed.`);
            } else {
                // Notify the remaining client that the other user has left
                rooms[room].forEach(client => {
                    client.send(JSON.stringify({ type: 'user_left' }));
                     console.log(`SERVER: Notified remaining client in room "${room}" that the other user has left.`);
                });
            }
        }
    });

    ws.on('error', (error) => {
        console.error('SERVER: WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} in your browser.`);
});

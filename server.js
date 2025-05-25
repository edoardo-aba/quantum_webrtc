const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './public/index.html';
    } else if (!filePath.startsWith('./public/')) {
        filePath = './public/' + filePath.substring(filePath.lastIndexOf('/') + 1);
    }


    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(path.join(__dirname, filePath), (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(__dirname, './public/404.html'), (error404, content404) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content404 || '404 Not Found', 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + err.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

const rooms = {}; // Store rooms and their clients

wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentRoom = null;
    let userId = Date.now().toString(); // Simple unique ID for the user in this session

    ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        console.log('Received from client:', data);

        switch (data.type) {
            case 'join':
                currentRoom = data.room;
                ws.userId = userId; // Assign userId to ws connection
                if (!rooms[currentRoom]) {
                    rooms[currentRoom] = [];
                }

                if (rooms[currentRoom].length >= 2) {
                    ws.send(JSON.stringify({ type: 'room_full' }));
                    console.log(`Room ${currentRoom} is full. Connection rejected for ${userId}`);
                    return;
                }

                rooms[currentRoom].push(ws);
                console.log(`User ${userId} joined room ${currentRoom}. Users in room: ${rooms[currentRoom].length}`);

                if (rooms[currentRoom].length === 2) {
                    // Notify both users that the other has joined
                    // The first client (index 0) will be the initiator
                    rooms[currentRoom].forEach((client, index) => {
                        client.send(JSON.stringify({
                            type: 'other_user_joined',
                            initiator: index === 0 // First client is initiator
                        }));
                    });
                    console.log(`Room ${currentRoom} is now full with 2 users. Signaling can begin.`);
                } else {
                     console.log(`User ${userId} is waiting in room ${currentRoom}.`);
                }
                break;

            case 'offer':
            case 'answer':
            case 'candidate':
                if (currentRoom && rooms[currentRoom]) {
                    rooms[currentRoom].forEach(client => {
                        // Send to the other client, not back to the sender
                        if (client !== ws) {
                            client.send(JSON.stringify(data));
                            console.log(`Relaying ${data.type} from ${ws.userId} to other user in room ${currentRoom}`);
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.userId || 'unknown'} disconnected`);
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(client => client !== ws);
            console.log(`User ${ws.userId || 'unknown'} removed from room ${currentRoom}. Users left: ${rooms[currentRoom].length}`);

            if (rooms[currentRoom].length < 2 && rooms[currentRoom].length > 0) {
                 // Notify remaining user that the other has left
                rooms[currentRoom].forEach(client => {
                    client.send(JSON.stringify({ type: 'user_left' }));
                });
                console.log(`Notified remaining user in ${currentRoom} about peer leaving.`);
            }

            if (rooms[currentRoom].length === 0) {
                console.log(`Room ${currentRoom} is now empty. Deleting room.`);
                delete rooms[currentRoom];
            }
        }
        currentRoom = null;
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.userId || 'unknown'}:`, error);
        // Handle cleanup similar to 'close' if necessary, though 'close' usually follows 'error'
    });
});

server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
    console.log(`WebSocket signaling server is running on port ${PORT}`);
});
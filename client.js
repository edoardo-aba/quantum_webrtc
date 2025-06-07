// client.js [CORRECTED]
// This script handles the client-side logic for WebRTC connection and canvas drawing.

// --- DOM Elements ---
const roomNameInput = document.getElementById('roomName');
const connectButton = document.getElementById('connectButton');
const statusDiv = document.getElementById('status');
const canvas = document.getElementById('sharedCanvas');
const colorPicker = document.getElementById('colorPicker');
const ctx = canvas.getContext('2d');

// --- Canvas and Drawing State ---
canvas.width = 800;
canvas.height = 600;
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// --- WebRTC and WebSocket State ---
let peerConnection;
let dataChannel;
let ws;
let localRoomName;
let iceCandidatesQueue = []; // Queue for ICE candidates that arrive early
const STUN_SERVER = 'stun:stun.l.google.com:19302';

// --- Event Listeners ---

// Connect to the signaling server and room
connectButton.addEventListener('click', () => {
    localRoomName = roomNameInput.value.trim();
    if (!localRoomName) {
        alert('Please enter a room name.');
        return;
    }
    connectWebSocket();
    connectButton.disabled = true;
    roomNameInput.disabled = true;
    statusDiv.textContent = `Status: Connecting to room "${localRoomName}"...`;
});

// Canvas drawing event listeners
canvas.addEventListener('mousedown', (e) => {
    if (dataChannel && dataChannel.readyState === 'open') {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const color = colorPicker.value;
    const x = e.offsetX;
    const y = e.offsetY;
    
    // Draw on the local canvas
    drawLine(lastX, lastY, x, y, color);

    // Send drawing data over the data channel
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'draw', x1: lastX, y1: lastY, x2: x, y2: y, color: color }));
    }
    
    [lastX, lastY] = [x, y];
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

// --- Drawing Function ---
function drawLine(x1, y1, x2, y2, color, lineWidth = 5) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.closePath();
}

// --- WebSocket Connection ---
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('CLIENT: WebSocket connection established.');
        ws.send(JSON.stringify({ type: 'join', room: localRoomName }));
    };

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        console.log('CLIENT: Received WebSocket message:', data.type, data);

        switch (data.type) {
            case 'room_full':
                alert('Room is full. Try a different room name.');
                ws.close();
                break;
            case 'other_user_joined':
                statusDiv.textContent = `Status: Peer joined. Initializing WebRTC...`;
                // **FIX**: Initialize PC for both users as soon as peer is detected.
                initializePeerConnection();
                // The first user in the room is the initiator
                if (data.initiator) {
                    console.log('CLIENT: I am the initiator. Creating offer.');
                    await createOffer();
                } else {
                    console.log('CLIENT: I am the receiver. Waiting for offer.');
                }
                break;
            case 'offer':
                console.log('CLIENT: Received offer.');
                if (!peerConnection) {
                    // This is a fallback, but the 'other_user_joined' case should handle it
                    initializePeerConnection();
                }
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                await processQueuedCandidates(); // Process any early candidates
                await createAnswer();
                break;
            case 'answer':
                console.log('CLIENT: Received answer.');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                await processQueuedCandidates(); // Process any early candidates
                break;
            case 'candidate':
                 console.log('CLIENT: Received ICE candidate.');
                 if (peerConnection && peerConnection.remoteDescription) {
                     // If remote description is set, add candidate immediately
                     await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                 } else {
                     // Otherwise, queue it
                     iceCandidatesQueue.push(data.candidate);
                     console.log('CLIENT: Remote description not set. Queuing ICE candidate.');
                 }
                 break;
            case 'user_left':
                statusDiv.textContent = `Status: Peer left the room.`;
                closePeerConnection();
                break;
        }
    };

    ws.onerror = (error) => {
        console.error('CLIENT: WebSocket error:', error);
        statusDiv.textContent = 'Status: WebSocket error. Check console.';
    };

    ws.onclose = () => {
        console.log('CLIENT: WebSocket connection closed.');
        statusDiv.textContent = 'Status: Disconnected from server.';
        closePeerConnection();
        connectButton.disabled = false;
        roomNameInput.disabled = false;
    };
}

// --- WebRTC Peer Connection and Data Channel ---
function initializePeerConnection() {
    console.log('CLIENT: Initializing RTCPeerConnection...');
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: STUN_SERVER }]
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('CLIENT: Generated local ICE candidate. Sending to server.');
            ws.send(JSON.stringify({ type: 'candidate', room: localRoomName, candidate: event.candidate }));
        } else {
            console.log('CLIENT: All local ICE candidates have been gathered.');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('CLIENT: ICE connection state change:', peerConnection.iceConnectionState);
        statusDiv.textContent = `Status: ICE State - ${peerConnection.iceConnectionState}`;
    };
    
    peerConnection.ondatachannel = (event) => {
        console.log('CLIENT: Data channel received by remote peer!');
        dataChannel = event.channel;
        setupDataChannelEvents();
    };
}

async function createOffer() {
    console.log('CLIENT: Initiator creating DataChannel.');
    // The initiator creates the data channel
    dataChannel = peerConnection.createDataChannel('drawingChannel');
    setupDataChannelEvents();

    console.log('CLIENT: Initiator creating offer.');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    console.log('CLIENT: Sending offer to server.');
    ws.send(JSON.stringify({ type: 'offer', room: localRoomName, offer }));
    statusDiv.textContent = 'Status: Offer sent. Waiting for answer...';
}

async function createAnswer() {
    console.log('CLIENT: Creating answer.');
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log('CLIENT: Sending answer to server.');
    ws.send(JSON.stringify({ type: 'answer', room: localRoomName, answer }));
    statusDiv.textContent = 'Status: Answer sent.';
}

async function processQueuedCandidates() {
    console.log(`CLIENT: Processing ${iceCandidatesQueue.length} queued ICE candidates...`);
    while(iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        console.log('CLIENT: Adding queued ICE candidate:', candidate);
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function setupDataChannelEvents() {
    console.log('CLIENT: Setting up DataChannel event listeners.');
    dataChannel.onopen = () => {
        console.log('CLIENT: Data channel is OPEN!');
        statusDiv.textContent = 'Status: Connected! Ready to draw.';
    };

    dataChannel.onclose = () => {
        console.log('CLIENT: Data channel is CLOSED!');
        statusDiv.textContent = 'Status: Data channel closed.';
    };

    dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'draw') {
            // Draw on the canvas when a message is received
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color);
        }
    };

    dataChannel.onerror = (error) => {
        console.error('CLIENT: Data channel error:', error);
    };
}

function closePeerConnection() {
    console.log('CLIENT: Closing peer connection and data channel.');
    isDrawing = false;
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    iceCandidatesQueue = []; // Clear queue
}

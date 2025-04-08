const socket = io();

let localStream;
let remoteStream;
let peerConnection;
let roomId = null;

const configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createRoomButton = document.getElementById('createRoom');
const joinRoomButton = document.getElementById('joinRoom');
const roomIdInput = document.getElementById('roomIdInput');
const messagesDiv = document.getElementById('messages');

// Event Listener for Room Creation
createRoomButton.addEventListener('click', async () => {
    roomId = null;
    await startMedia();
    socket.emit('createRoom');
});

// Event Listener for Joining a Room
joinRoomButton.addEventListener('click', async () => {
    roomId = roomIdInput.value.trim();
    if (!roomId) {
        displayMessage('Please enter a room ID.');
        return;
    }
    await startMedia();
    socket.emit('joinRoom', roomId);
});

// Socket event: Room created
socket.on('roomCreated', (id) => {
    roomId = id;
    displayMessage(`Room created. Share this Room ID: ${roomId}`);
});

// Socket event: Room joined (both users in room)
socket.on('roomJoined', () => {
    displayMessage('A peer has joined the room. Starting connection...');
    initiatePeerConnection();
    // As the room creator, start the offer process
    if (peerConnection && localStream) {
        createOffer();
    }
});

// Socket event: Signal received
socket.on('signal', async (data) => {
    if (!peerConnection) {
        initiatePeerConnection();
    }
    // If the data contains session description
    if (data.sdp) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', { roomId, data: { sdp: peerConnection.localDescription } });
            }
        } catch (error) {
            console.error('Error handling SDP:', error);
        }
    } 
    // If the data contains an ICE candidate
    else if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

// Start media: access camera and microphone
async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accessing media devices.', error);
        displayMessage('Could not access camera or microphone.');
    }
}

// Initialize the RTCPeerConnection and add media tracks
function initiatePeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add each track from the local stream to the peer connection.
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Listen for remote tracks and display them.
    peerConnection.addEventListener('track', event => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
    });

    // When an ICE candidate is generated, send it to the signaling server.
    peerConnection.addEventListener('icecandidate', event => {
        if (event.candidate) {
            socket.emit('signal', { roomId, data: { candidate: event.candidate } });
        }
    });

    peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
    });
}

// Create and send an SDP offer to the peer.
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { roomId, data: { sdp: peerConnection.localDescription } });
    } catch (error) {
        console.error('Error creating an offer:', error);
    }
}

// Simple utility to display messages or error prompts to the user.
function displayMessage(message) {
    messagesDiv.textContent = message;
}

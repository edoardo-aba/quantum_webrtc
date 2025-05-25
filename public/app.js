const roomNameInput = document.getElementById('roomName');
const connectButton = document.getElementById('connectButton');
const generatePointButton = document.getElementById('generatePointButton');
const canvas = document.getElementById('sharedCanvas');
const statusDiv = document.getElementById('status');
const ctx = canvas.getContext('2d');

canvas.width = 400;
canvas.height = 300;

let peerConnection;
let dataChannel;
let ws;
let localRoomName;

const STUN_SERVER = 'stun:stun.l.google.com:19302';

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

generatePointButton.addEventListener('click', () => {
    const x = Math.floor(Math.random() * canvas.width);
    const y = Math.floor(Math.random() * canvas.height);
    drawPoint(x, y, 'blue'); // Draw local point
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'point', x, y }));
        console.log('Sent point via DataChannel:', { x, y });
    } else {
        console.warn('Data channel not open. Cannot send point.');
    }
});

function drawPoint(x, y, color = 'red') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
}

function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('CLIENT: WebSocket connection established.');
        ws.send(JSON.stringify({ type: 'join', room: localRoomName }));
        statusDiv.textContent = `Status: Joined room "${localRoomName}". Waiting for peer...`;
    };

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        console.log('CLIENT: Received WebSocket message:', data);

        switch (data.type) {
            case 'room_full':
                alert('Room is full. Try a different room name.');
                statusDiv.textContent = 'Status: Room full. Disconnected.';
                ws.close();
                connectButton.disabled = false;
                roomNameInput.disabled = false;
                break;
            case 'other_user_joined':
                statusDiv.textContent = `Status: Peer joined. Initializing WebRTC...`;
                if (data.initiator) {
                    console.log('CLIENT: I am the initiator.');
                    await initializePeerConnection(true);
                } else {
                    console.log('CLIENT: I am the receiver.');
                }
                break;
            case 'offer':
                if (!peerConnection) { 
                    await initializePeerConnection(false);
                }
                console.log('CLIENT: Received offer, setting remote description.');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log('CLIENT: Creating answer.');
                const answer = await peerConnection.createAnswer();
                console.log('CLIENT: Setting local description (answer).');
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'answer', room: localRoomName, answer }));
                console.log('CLIENT: Sent answer.');
                statusDiv.textContent = 'Status: Offer received, sent answer.';
                break;
            case 'answer':
                console.log('CLIENT: Received answer, setting remote description.');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                statusDiv.textContent = 'Status: Answer received. Connection established soon.';
                // Queued candidates might be processed now if remoteDescription is set
                await processQueuedCandidates();
                break;
            case 'candidate':
                console.log('CLIENT: Received ICE candidate:', data.candidate);
                if (peerConnection && peerConnection.remoteDescription) {
                    try {
                        console.log('CLIENT: Attempting to add ICE candidate immediately.');
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log('CLIENT: Successfully added ICE candidate.');
                    } catch (e) {
                        console.error('CLIENT: Error adding received ICE candidate:', e, data.candidate);
                    }
                } else {
                    console.warn('CLIENT: Remote description not set or no peerConnection, queuing ICE candidate.');
                    if (!peerConnection) peerConnection = {}; // Ensure queue exists even if PC init is delayed
                    if (!peerConnection.queuedCandidates) peerConnection.queuedCandidates = [];
                    peerConnection.queuedCandidates.push(data.candidate);
                }
                break;
            case 'user_left':
                statusDiv.textContent = `Status: Peer left the room.`;
                closePeerConnection();
                // connectButton.disabled = false; // Optional: allow rejoining
                // roomNameInput.disabled = false;
                break;
            default:
                console.log('CLIENT: Unknown WebSocket message type:', data.type);
        }
    };

    ws.onerror = (error) => {
        console.error('CLIENT: WebSocket error:', error);
        statusDiv.textContent = 'Status: WebSocket error. Check console.';
        connectButton.disabled = false;
        roomNameInput.disabled = false;
    };

    ws.onclose = () => {
        console.log('CLIENT: WebSocket connection closed.');
        if (statusDiv.textContent.includes("Connecting") || statusDiv.textContent.includes("Joined")) {
            statusDiv.textContent = 'Status: Disconnected from server.';
        }
        closePeerConnection();
        connectButton.disabled = false;
        roomNameInput.disabled = false;
    };
}

async function initializePeerConnection(isInitiator) {
    console.log('CLIENT: Initializing RTCPeerConnection. isInitiator:', isInitiator);
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: STUN_SERVER }]
    });
    peerConnection.queuedCandidates = []; // Initialize queue

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('CLIENT: Local ICE candidate generated by this peer:', event.candidate);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'candidate', room: localRoomName, candidate: event.candidate }));
                console.log('CLIENT: Sent local ICE candidate to signaling server.');
            } else {
                console.error('CLIENT: WebSocket not open. Cannot send ICE candidate.');
            }
        } else {
            console.log('CLIENT: All local ICE candidates have been gathered for this peer.');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('CLIENT: ICE connection state change:', peerConnection.iceConnectionState);
        statusDiv.textContent = `Status: ICE State - ${peerConnection.iceConnectionState}`;
        checkAndEnableButton();
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
            generatePointButton.disabled = true; // Ensure it's disabled
            statusDiv.textContent = `Status: Disconnected from peer (${peerConnection.iceConnectionState}).`;
        }
    };

     peerConnection.onconnectionstatechange = () => { 
        console.log('CLIENT: Peer Connection state change:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            // This is another good point to check if everything is ready
            checkAndEnableButton();
        }
    };

    peerConnection.ondatachannel = (event) => {
        console.log('CLIENT: Data channel received by remote peer!');
        dataChannel = event.channel;
        setupDataChannelEvents();
    };

    if (isInitiator) {
        console.log('CLIENT: Initiator creating DataChannel.');
        dataChannel = peerConnection.createDataChannel('coordinatesChannel');
        setupDataChannelEvents(); // Setup handlers before offer

        console.log('CLIENT: Initiator creating offer.');
        const offer = await peerConnection.createOffer();
        console.log('CLIENT: Initiator setting local description (offer).');
        await peerConnection.setLocalDescription(offer);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'offer', room: localRoomName, offer }));
            console.log('CLIENT: Sent offer.');
            statusDiv.textContent = 'Status: Offer sent. Waiting for answer...';
        } else {
            console.error("CLIENT: WebSocket not open when trying to send offer.");
        }
    }
    await processQueuedCandidates(); // Process any candidates that arrived early
}

async function processQueuedCandidates() {
    if (peerConnection && peerConnection.remoteDescription && peerConnection.queuedCandidates && peerConnection.queuedCandidates.length > 0) {
        console.log(`CLIENT: Processing ${peerConnection.queuedCandidates.length} queued ICE candidates...`);
        while(peerConnection.queuedCandidates.length > 0) {
            const candidate = peerConnection.queuedCandidates.shift();
            try {
                console.log('CLIENT: Attempting to add queued ICE candidate:', candidate);
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('CLIENT: Successfully added queued ICE candidate.');
            } catch (e) {
                console.error('CLIENT: Error adding queued ICE candidate:', e, candidate);
            }
        }
    }
}


function setupDataChannelEvents() {
    if (!dataChannel) {
        console.error("CLIENT: setupDataChannelEvents called but dataChannel is null!");
        return;
    }
    console.log('CLIENT: Setting up DataChannel event listeners.');
    dataChannel.onopen = () => {
        console.log('CLIENT: Data channel OPENED! Current readyState:', dataChannel.readyState);
        checkAndEnableButton();
        if (!(peerConnection && (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed'))) {
           // This message might be quickly overwritten by ICE state or checkAndEnableButton success
            // statusDiv.textContent = 'Status: Data channel open, waiting for ICE connection.';
        }
    };

    dataChannel.onclose = () => {
        console.log('CLIENT: Data channel CLOSED!');
        generatePointButton.disabled = true;
        statusDiv.textContent = 'Status: Data channel closed.';
    };

    dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'point') {
            console.log('CLIENT: Received point via DataChannel:', data);
            drawPoint(data.x, data.y, 'red');
        }
    };

    dataChannel.onerror = (error) => {
        console.error('CLIENT: Data channel error:', error);
    };
}

function checkAndEnableButton() {
    const iceConnected = peerConnection && (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed');
    const dcOpen = dataChannel && dataChannel.readyState === 'open';

    // console.log(`CLIENT: checkAndEnableButton - ICE Connected: ${iceConnected}, DC Open: ${dcOpen}`);

    if (iceConnected && dcOpen) {
        generatePointButton.disabled = false;
        statusDiv.textContent = 'Status: Connected with peer! Ready to share points.';
        console.log('CLIENT: SUCCESS! Button enabled. ICE state:', peerConnection.iceConnectionState, 'DataChannel state:', dataChannel.readyState);
    } else {
        generatePointButton.disabled = true; // Ensure it's disabled if conditions not met
        // console.log('CLIENT: Button remains disabled. ICE state:', peerConnection ? peerConnection.iceConnectionState : 'N/A',
        //             'DataChannel state:', dataChannel ? dataChannel.readyState : 'N/A');
    }
}

function closePeerConnection() {
    console.log('CLIENT: Closing peer connection and data channel.');
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    generatePointButton.disabled = true; // Ensure button is disabled
    // Status will be updated by ws.onclose or other events
}

// Initial state
ctx.fillStyle = '#e9f5ff'; // Match canvas background from CSS
ctx.fillRect(0, 0, canvas.width, canvas.height);
statusDiv.textContent = 'Status: Not Connected';
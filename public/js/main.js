'use strict';

// Defining some global utility 

let isChannelReady = false; 
let isInitiator = false; // if client created the room 
let isStarted = false; // if peer connection has started
let localStream; // holds the webcam and audio stream
let pc; // for the RTCPeerConnection object
let remoteStream; // stream if received from the other peer
let turnReady;

// Initialize turn/stun server configuration to move to google
let turn_stun_config = turnConfig;

// This allows the browser to capture audio and video
let localStreamConstraints = {
    audio: true,
    video: true
};

// Prompting for room name:
let room = prompt('Enter room name:');

// Initializing socket.io
let socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

// Defining socket connections for signalling

// Function: on created event - Sets the peer as the initiator if the room is created
socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

// Function: on full event - Logs that the room is full
socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

// Function: on join event - Indicates a join request from another peer and sets readiness
socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

// Function: on joined event - Confirms a peer has joined the room and sets channel ready
socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

// Function: on log event - Logs an array of messages to console
socket.on('log', function(array) {
  console.log.apply(console, array);
});

// Driver code for handling signalling messages

// Function: socket.on('message')
// Handles all incoming signaling messages to initiate, answer or manage the call.
socket.on('message', function(message, room) {
    console.log('Client received message:', message,  room);
    if (message === 'got user media') {
      maybeStart();
    } else if (message.type === 'offer') {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
      let candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
      handleRemoteHangup();
    }
});
  
// ---------------------------------------------------------------------
// Function: sendMessage
// Description: Sends a signaling message to the specified room using socket.io.
function sendMessage(message, room) {
  console.log('Client sending message: ', message, room);
  socket.emit('message', message, room);
}

// ---------------------------------------------------------------------
// Function: gotStream
// Description: Handles the local media stream once it is available, displays it
// on the local video element and notifies the other peer.
function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media', room);
  if (isInitiator) {
    maybeStart();
  }
}

// Displaying Local Stream and Remote Stream on webpage
let localVideo = document.querySelector('#localVideo');
let remoteVideo = document.querySelector('#remoteVideo');
console.log("Going to find Local media");

navigator.mediaDevices.getUserMedia(localStreamConstraints)
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

console.log('Getting user media with constraints', localStreamConstraints);

// ---------------------------------------------------------------------
// Function: maybeStart
// Description: Checks whether all prerequisites are met (local stream ready, channel ready)
// and then starts the peer connection process.
function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

// Sending bye if user closes the window
window.onbeforeunload = function() {
  sendMessage('bye', room);
};

// Creates a new RTCPeerConnection, assigns event handlers for ICE candidates,
// remote stream addition and removal, and logs the connection creation.
function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(turn_stun_config);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

// Handles the ICE candidate event by sending the candidate details
// to the peer via the signaling server.
function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }, room);
  } else {
    console.log('End of candidates.');
  }
}

// Handles any errors that occur during the creation of an offer.
function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

// Initiates the call by creating an offer to be sent to the peer.
function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}


// Sends an answer back to the peer in response to receiving an offer.
function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

// Sets the session description as the local description and sends it to the peer.
function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription, room);
}

// Logs an error that occurred when attempting to create a session description.
function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

// Adds the remote stream to the remote video element when it is received.
function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

// Handles the removal of the remote stream.
function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

// Ends the call by stopping the peer connection and notifying the peer.
function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye', room);
}

// Handles the event when the remote peer hangs up, terminating the session.
function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

// Stops the peer connection by closing it and cleaning up the associated state.
function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}

'use strict';


let isInitiator = false; // if client created the room successfully
let isChannelReady = false; // when the other peer joined the room

let isStarted = false; // if peer connection has started
let localStream; // holds the webcam and audio stream
let pc; // for the RTCPeerConnection object
let remoteStream; // stream if received from the other peer
let turnReady;


//!!!!!!!!!!!!!!!!!!!!!! SIGNALLING !!!!!!!!!!!!!!!!!!!!!!

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

// on created event - Sets the peer as the initiator if the room is created
socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});



// on full event - Logs that the room is full
socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
  alert('Room ' + room + ' is full');
});

// on join event - Indicates a join request from another peer and sets readiness
socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

// on joined event - Confirms a peer has joined the room 
socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

// on ready event - Confirms that the other peer successfully joined the room, and now the channel is ready for the communication
socket.on('ready', function(room) {
  console.log("Both of the peers are in the room: ", room )
})

// Function: on log event - Logs an array of messages to console
socket.on('log', function(array) {
  console.log.apply(console, array);
});

// Driver code for handling signalling messages

// Function: socket.on('message')
// Handles all incoming signaling messages to initiate, answer or manage the call.
socket.on('message', function(message, room) {
    console.log('Server says:', message, message.type, room);
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
      pc.addIceCandidate(candidate); // adds theis network route to the peer connection and tries to access it 
    } else if (message === 'bye' && isStarted) {
      handleRemoteHangup();
    }
});

//!!!!!!!!!!!!!!!!!!!!!! AUDIO VIDEO STREAM !!!!!!!!!!!!!!!!!!!!!!
// Sends a signaling message to the specified room using socket.io.
function sendMessage(message, room) {
  console.log('Client sending message: ', message, room);
  socket.emit('message', message, room);
}

// ---------------------------------------------------------------------
// Handles the local media stream once it is available, displays it
// on the local video element and notifies the other peer.
function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream; // so it gets dispayed in the HTML
  sendMessage('got user media', room); 
  if (isInitiator) { //! only called by the first peer when connects
    maybeStart();
  }
}

// Displaying Local Stream and Remote Stream on webpage
let localVideo = document.querySelector('#localVideo');
let remoteVideo = document.querySelector('#remoteVideo');
console.log("Going to find Local media");

navigator.mediaDevices.getUserMedia(localStreamConstraints) // audio and video
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name); // error displayed when the flag is not enabled 
});

console.log('Getting user media with constraints', localStreamConstraints);

// ---------------------------------------------------------------------
// Function: maybeStart
// Description: Checks whether all prerequisites are met (local stream ready, channel ready)
// and then starts the peer connection process.
function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  
  // check if the requisites to start a connection are satisfied e.g the other peer joined
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) { // sdp offer from the first peer 
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
    pc = new RTCPeerConnection(turn_stun_config); // this object manages all the connection
    console.log("RTCPeerConnection Object: ", pc);

    //! Assigning the methods to call to the object
    pc.onicecandidate = handleIceCandidate; // it automatically start to collect ice candidates
    pc.onaddstream = handleRemoteStreamAdded; // this is activated when the other peer media stream is received
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
    console.log("List of ICE Candidates: ", event.candidate.candidate) // print all the candidates it can find

    // send the ice candidate to the other peer so they can excahnge the ice candidates
    // and find a way to communicate
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex, // passing 1 for video
      id: event.candidate.sdpMid,           // chrome identified set it to 1 for video 
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
  // PeerConnection to create an SDP offer on success calls SetLocalAndSendMessage,
  // if something fails  handleCreateOfferError is triggered
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
  sendMessage(sessionDescription, room); // type offere automatically generated
}

// Logs an error that occurred when attempting to create a session description.
function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

// Adds the remote stream to the remote video element when it is received.
function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.', event.stream);
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

// Handles the removal of the remote stream.
function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

// Handles the event when the remote peer hangs up, terminating the session.
function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;

  const remoteDiv = document.getElementById("div2");
  if(remoteDiv){
    remoteDiv.style.display = 'none'
  }
}

// Stops the peer connection by closing it and cleaning up the associated state.
function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}

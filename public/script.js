const socket = io('/');
const videoGrid = document.getElementById('video-grid');

// Create a new PeerJS instance connecting to our server
const myPeer = new Peer(undefined, {
  host: '/',
  port: 3000,
  path: '/peerjs'
});

const myVideo = document.createElement('video');
myVideo.muted = true; // Mute your own video stream to avoid echo
const peers = {};

// Get access to the user's video/audio stream
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  addVideoStream(myVideo, stream);

  // Answer incoming calls and add their video stream to the grid
  myPeer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
  });

  // When a new user connects, call them and send your stream
  socket.on('user-connected', userId => {
    connectToNewUser(userId, stream);
  });
});

// Remove video stream when a user disconnects
socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close();
});

// When PeerJS is open, join the room using the room id from the URL
myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id);
});

// Function to connect to a new user by calling them via PeerJS
function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement('video');
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream);
  });
  call.on('close', () => {
    video.remove();
  });
  peers[userId] = call;
}

// Helper function to add a video stream to the grid
function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
  videoGrid.append(video);
}

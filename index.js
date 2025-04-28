'use strict';

//Loading dependencies & initializing express
let express = require('express');
let fs = require('fs');
let app = express();
let http = require('http');
let https = require('https'); // needed if you want to avoid the security flags
let path = require('path');

const options = {
	key: fs.readFileSync(path.join(__dirname, 'CA', 'key.pem')),
	cert: fs.readFileSync(path.join(__dirname, 'CA', 'cert.pem'))
}

//For signalling in WebRTC we use a custom signalling server
let socketIO = require('socket.io');

app.use(express.static('public'))

app.get("/", function (req, res) {
	res.render("index.ejs"); // automatically looks in views folder
});

let server = https.createServer(options, app);

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});

let io = socketIO(server);

io.sockets.on('connection', function (socket) {


	// Convenience function to log server messages on the client.
	function log() {
		let array = ['Message from server:'];
		array.push.apply(array, arguments);
		socket.emit('log', array);
	}


	//Defining Socket Connections
	socket.on('message', function (message, room) {
		log('Client said: ', message);
		// very important this farward the message only to all the members present
		// in the room, is for broadcast, all the members except himself(who triggered message call) 
		socket.in(room).emit('message', message, room);
	});

	socket.on('create or join', function (room) {
		log('Received request to create or join room ' + room);

		let clientsInRoom = io.sockets.adapter.rooms[room]; // undefined on on creation
		let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0; // if it does existist count the number of clients in the room
		log('Room ' + room + ' now has ' + numClients + ' client(s)');

		if (numClients === 0) { // create a new room
			socket.join(room);
			log('Client ID ' + socket.id + ' created room ' + room);
			socket.emit('created', room, socket.id);

		} else if (numClients === 1) {
			log('Client ID ' + socket.id + ' joined room ' + room);
			io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room, socket.id);
			io.sockets.in(room).emit('ready', room);
		} else { // max two clients
			socket.emit('full', room);
		}
	});



	socket.on('bye', function () {
		console.log('received bye');
	});

});
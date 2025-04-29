## Notes
- Up to now the Implementation works perfectly on Chrome, on Firefox it does not since, Firefox has stricter security requirements for accessing getUserMedia over HTTPS. 
- A self-signed certificate is rejected by Firefox while being accepted by Chrome (once manually accepted).

## Running the app on development server
* `npm install`
* `node index.js`
* go to `https://localhost:8000` and procede to the  or to `http://localhost:8000` (not https)
* !!! The application should display at the start a Dialog box if NOT refresh the page


# Prerequisite (Old version NO HTTPS)
- if on Chrome, paste this in the url: chrome://flags/#unsafely-treat-insecure-origin-as-secure, and then enable it
- On Firefox, paste this in the urr: about:config, set to true media.devices.insecure.enabled and media.getusermedia.insecure.enabled
- Visit this website for more reference: https://stackoverflow.com/questions/60957829/navigator-mediadevices-is-undefined

# Video/Audio istance of webRTC communication
* Only two persons can join in one room

## Obtaining TURN/STUN credentials using Xiysys 
* Go to https://xirsys.com/
* Sign Up 
* Log in to your account
* Click on `+` beside `MyFirstApp`
* Click on `static TURN Credentials` Button located below `Account Type`.
* Accept the warning by click on `+` that appears just after you clicked on `static TURN Credentials`.
* Copy the text(begins with `iceservers`) that appears below `static TURN Credentials`  and paste in `config.js` as shown in `config.js`.

## Obtaining STUN credentials using Google
* Search online for Google STUN server 

## Connection flow

Here’s a concise, step-by-step description of exactly what happens—from the moment Peer 1 joins until both peers are fully connected:

---

**COMPLETE CONNECTION FLOW**

1. **Peer 1 Connects First**  
   1.1. User is prompted for a room name and calls: socket.emit('create or join', room);
   1.2. Server sees no one in the room and emits `'created'` back to Peer 1.  
   1.3. Peer 1 sets `isInitiator = true`.  
   1.4. Peer 1 calls: getUserMedia({ audio: true, video: true }).then(gotStream);
   1.5. In `gotStream()`:  
   - Local video is displayed (`localVideo.srcObject = stream`).  
   - Sends `'got user media'` to the room.  
   - Because `isInitiator` is true, calls `maybeStart()`.  
   1.6. Inside `maybeStart()`:  
   - `isStarted` is false, `localStream` exists, but `isChannelReady` is still false.  
   - does **not** create the `RTCPeerConnection` yet.

2. **Peer 2 Connects**  
   2.1. Peer 2 also emits: socket.emit('create or join', room);
   2.2. Server sees one client already in the room and:  
   - Emits `'join'` to Peer 1 → Peer 1 sets `isChannelReady = true`.  
   - Emits `'joined'` to Peer 2 → Peer 2 sets `isChannelReady = true`.  
   - Emits `'ready'` to both.

3. **Both Peers Have Media & Channel Is Ready**  
   3.1. Peer 2’s `getUserMedia` resolves → `gotStream()` runs:  
   - Displays Peer 2’s local video.  
   - Sends `'got user media'` to the room.  
   - Does not call `maybeStart()` (because `isInitiator` is false).  
   3.2. Peer 1 receives Peer 2’s `'got user media'` message → calls `maybeStart()` again:  
   - Now `isStarted` is false, `localStream` exists, and `isChannelReady` is true.  
   - Creates the `RTCPeerConnection` via `createPeerConnection()`:  
     - Sets up ICE handlers (`onicecandidate`) and stream handlers (`onaddstream`, `onremovestream`).  
   - Calls `pc.addStream(localStream)` to attach Peer 1’s media.  
   - Sets `isStarted = true`.  
   - Because `isInitiator` is true, immediately calls `doCall()`.

4. **Peer 1 Creates & Sends SDP Offer**  
   4.1. In `doCall()`, Peer 1 calls `pc.createOffer()`.  
   4.2. The browser generates an SDP offer describing Peer 1’s media and ICE settings.  
   4.3. The callback `setLocalAndSendMessage(offer)` runs:  
   - Calls `pc.setLocalDescription(offer)`.  
   - Emits the offer to Peer 2 via `sendMessage(offer, room)`.

5. **Peer 2 Receives the SDP Offer**  
   5.1. Peer 2’s `socket.on('message')` sees an `offer` and—because `!isInitiator && !isStarted`—calls `maybeStart()`:  
   - Creates its own `RTCPeerConnection`.  
   - Adds its local stream.  
   - Sets `isStarted = true`.  
   5.2. Peer 2 then sets the remote description to the received offer:  
        pc.setRemoteDescription(new RTCSessionDescription(offer));
   5.3. Calls `doAnswer()`, which invokes `pc.createAnswer()`.  
   5.4. The answer is passed to `setLocalAndSendMessage(answer)`:  
   - Calls `pc.setLocalDescription(answer)`.  
   - Sends the answer back to Peer 1.

6. **Peer 1 Receives SDP Answer**  
   6.1. Peer 1 gets the `'answer'` message.  
   6.2. Calls: pc.setRemoteDescription(new RTCSessionDescription(answer));
   - now each peer knows the other’s media parameters.

7. **ICE Candidate Exchange**  
   7.1. Both browsers automatically begin gathering ICE candidates.  
   7.2. Each time a candidate is discovered, the `onicecandidate` handler fires and sends it via `sendMessage({ type: 'candidate', … }, room)`.  
   7.3. The receiving peer’s `socket.on('message')` sees `message.type === 'candidate'` and calls:   pc.addIceCandidate(new RTCIceCandidate({ sdpMLineIndex: label, candidate }));
   7.4. WebRTC performs connectivity checks on these candidates and, once a working path is found, media flows directly peer-to-peer.

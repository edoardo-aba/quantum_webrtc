# Prerequisite
- if on Chrome, paste this in the url: chrome://flags/#unsafely-treat-insecure-origin-as-secure, and then enable it
- On Firefox, paste this in the urr: about:config, set to true media.devices.insecure.enabled and media.getusermedia.insecure.enabled
- Visit this website for more reference: https://stackoverflow.com/questions/60957829/navigator-mediadevices-is-undefined

# Video Chat Application
* Only two persons can join in one room

## Running the app on development server
* `npm install`
* `node index.js`
* open `localhost:8000` 
* !!! The application should display at the start a Dialog box if NOT refresh the page

## Obtaining TURN/STUN credentials using Xiysys, soon switching to google one
* Go to https://xirsys.com/
* Sign Up 
* Log in to your account
* Click on `+` beside `MyFirstApp`
* Click on `static TURN Credentials` Button located below `Account Type`.
* Accept the warning by click on `+` that appears just after you clicked on `static TURN Credentials`.
* Copy the text(begins with `iceservers`) that appears below `static TURN Credentials`  and paste in `config.js` as shown in `config.js`.

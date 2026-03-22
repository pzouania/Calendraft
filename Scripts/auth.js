import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { 
getAuth,
signInWithEmailAndPassword,
createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDJIec8d-Iyg7fzShmmt4f45jLpfbRsoG8",
    authDomain: "arcs-amalius-calendar-sy-c9bf2.firebaseapp.com",
    projectId: "arcs-amalius-calendar-sy-c9bf2",
    storageBucket: "arcs-amalius-calendar-sy-c9bf2.firebasestorage.app",
    messagingSenderId: "922200770812",
    appId: "1:922200770812:web:98778d9e336f58e331af79"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

window.loginUser = function(){

const email = document.getElementById("userEmail").value;
const password = document.getElementById("userPassword").value;

signInWithEmailAndPassword(auth,email,password)
.then(()=>{

window.location.href = "dashboard.html";

})
.catch(error=>{

alert(error.message);

});

}

window.registerUser = function(){

const email = document.getElementById("userEmail").value;
const password = document.getElementById("userPassword").value;

createUserWithEmailAndPassword(auth,email,password)
.then(()=>{

window.location.href = "dashboard.html";

})
.catch(error=>{

alert(error.message);

});

}
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {

if(user){

window.location.href = "dashboard.html";

}

});
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
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // ✅ Vérification des champs
    if (!email || !password || !confirmPassword) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    // ✅ Vérification mot de passe identique
    if (password !== confirmPassword) {
        alert("Les mots de passe ne correspondent pas.");
        return;
    }

    // ✅ Vérification longueur minimale (option mais recommandé)
    if (password.length < 6) {
        alert("Le mot de passe doit contenir au moins 6 caractères.");
        return;
    }

    // 👉 Si tout est OK → création du compte
    // (Firebase ou autre logique existante)
    createUserWithEmailAndPassword(auth, email, password)
        .then(() => {
            alert("Compte créé avec succès !");
            window.location.href = "index.html";
        })
        .catch((error) => {
            alert(error.message);
        });
}

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {

if(user){

window.location.href = "dashboard.html";

}

});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
getAuth,
signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
getFirestore,
collection,
addDoc,
query,
where,
getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
const db = getFirestore(app);
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth,(user)=>{
    if(!user){
        window.location.href="index.html";
    } else {
        document.getElementById("userEmail").innerText = user.email;
    }
});

lucide.createIcons();

window.logoutUser = function(){
signOut(auth).then(()=>{
window.location.href = "index.html";
});
}

window.createCalendar = async function(){
const user = auth.currentUser;
const docRef = await addDoc(collection(db,"calendars"),{
name:"Nouveau calendrier",
ownerId: user.uid,
events:[],
created:new Date()
});
window.location.href = "editor.html?id="+docRef.id;
}

async function loadCalendars(){
const user = auth.currentUser;
const q = query(
collection(db,"calendars"),
where("ownerId","==",user.uid)
);
const querySnapshot = await getDocs(q);
document.getElementById("calendarCount").innerText =
    querySnapshot.size + " calendriers au total";
const list = document.getElementById("calendarList");

if (querySnapshot.empty) {
    list.innerHTML = "<p class='empty-message'>Aucun calendrier pour le moment.</p>";
    return;
}
    
querySnapshot.forEach((doc)=>{
const data = doc.data();
const div = document.createElement("div");
div.classList.add("calendar-card");

div.innerHTML = `
    <div class="card-top"></div>
        <div class="card-top-image">
            <img src="${data.preview || 'image/default-preview.png'}" alt="Aperçu calendrier" />
        </div>
    <div class="card-content">
        <div class="card-title">${data.name}</div>
        <div class="card-date">Modifié aujourd'hui</div>
    </div>
`;

div.onclick = () => {
    window.location.href = "editor.html?id=" + doc.id;
};

list.appendChild(div);
});
lucide.createIcons();    
}

setTimeout(loadCalendars,500);

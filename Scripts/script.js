import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const storage = getStorage();
const params = new URLSearchParams(window.location.search);
const calendarId = params.get("id");

console.log("Calendrier chargé :", calendarId);
// ===============================
// ÉTAT GLOBAL
// ===============================
let events = [];
let currentYear = 2026;

// ===============================
// STOCKAGE
// ===============================
function loadEvents() {
    const stored = localStorage.getItem('calendarEvents');
    if (stored) {
        events = JSON.parse(stored);
    }
}

function saveEvents() {
    localStorage.setItem('calendarEvents', JSON.stringify(events));
    autoCloudSync();
}
// ===============================
// OUTILS DATE / ISO
// ===============================
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateFromWeek(year, week, day) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = new Date(simple);

    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }

    ISOweekStart.setDate(ISOweekStart.getDate() + day - 1);
    return ISOweekStart;
}

// ===============================
// GÉNÉRATION DES ÉVÉNEMENTS
// ===============================
function generateEventOccurrences(event, year) {

    const occurrences = [];

    let currentDate = getDateFromWeek(
        event.startYear,
        event.startWeek,
        event.startDay
    );

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    while (currentDate <= yearEnd) {

        for (let i = 0; i < event.duration; i++) {

            const d = new Date(currentDate);
            d.setDate(d.getDate() + i);

            if (d >= yearStart && d <= yearEnd) {
                occurrences.push({
                    date: d,
                    color: event.color,
                    name: event.name
                });
            }
        }

        if (event.frequency === 'day') {
            currentDate.setDate(currentDate.getDate() + event.repeat);
        }

        if (event.frequency === 'week') {
            currentDate.setDate(currentDate.getDate() + event.repeat * 7);
        }

        if (event.frequency === 'month') {
            currentDate.setMonth(currentDate.getMonth() + event.repeat);
        }
    }

    return occurrences;
}


function getAllEventOccurrences(year) {
    return events.flatMap(e => generateEventOccurrences(e, year));
}

function getEventsForDate(date, occurrences) {
    return occurrences.filter(o =>
        o.date.getFullYear() === date.getFullYear() &&
        o.date.getMonth() === date.getMonth() &&
        o.date.getDate() === date.getDate()
    );
}

// ===============================
// STEP 3 : segments continus dans un mois
// (évite de relier plusieurs occurrences séparées)
// ===============================
function daysToSegments(sortedDays) {
    const segs = [];
    if (!sortedDays.length) return segs;

    let start = sortedDays[0];
    let prev = sortedDays[0];

    for (let i = 1; i < sortedDays.length; i++) {
        const cur = sortedDays[i];
        if (cur === prev + 1) {
            prev = cur;
        } else {
            segs.push([start, prev]);
            start = cur;
            prev = cur;
        }
    }
    segs.push([start, prev]);
    return segs;
}

// ===============================
// CALENDRIER
// ===============================
function generateCalendar(year) {
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';

    const occurrences = getAllEventOccurrences(year);

    const months = [
        'Janvier','Février','Mars','Avril','Mai','Juin',
        'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
    ];

    // STEP 1 : lettres des jours (0 = dimanche)
    const dayLetters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    for (let m = 0; m < 12; m++) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'month';

        const header = document.createElement('div');
        header.className = 'month-header';
        header.textContent = months[m];
        monthDiv.appendChild(header);

        const daysDiv = document.createElement('div');
        daysDiv.className = 'days';

        const daysInMonth = new Date(year, m + 1, 0).getDate();

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, m, d);
            const dayDiv = document.createElement('div');
            dayDiv.className = 'day';

            if (date.getDay() === 0 || date.getDay() === 6) {
                dayDiv.classList.add('weekend');
            }

            // STEP 1 : lettre du jour
            const letter = document.createElement('span');
            letter.className = 'day-letter';
            letter.textContent = dayLetters[date.getDay()];
            dayDiv.appendChild(letter);

            const number = document.createElement('span');
            number.className = 'day-number';
            number.textContent = d;
            dayDiv.appendChild(number);

            if (date.getDay() === 1) {
                const week = document.createElement('span');
                week.className = 'week-number';
                week.textContent = `S${getWeekNumber(date)}`;
                dayDiv.appendChild(week);
            }

            const dayEvents = getEventsForDate(date, occurrences);

            daysDiv.appendChild(dayDiv);
        }

        monthDiv.appendChild(daysDiv);
        calendar.appendChild(monthDiv);

        // ===============================
        // STEP 3 : SVG overlay lignes continues
        // ===============================
        if (events.length && daysDiv.children.length) {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.classList.add('month-svg');

            // Position du SVG juste sous le header (dynamique, pas “au pif”)
            svg.style.top = header.offsetHeight + 'px';

            // Taille = hauteur réelle des jours
            const daysHeight = daysDiv.offsetHeight;
            svg.setAttribute('height', daysHeight);

            // Largeur : on prend la largeur du mois
            const monthWidth = monthDiv.clientWidth;
            svg.setAttribute('width', monthWidth);
            svg.setAttribute('viewBox', `0 0 ${monthWidth} ${daysHeight}`);
            svg.setAttribute('preserveAspectRatio', 'none');

            const dayHeight = daysDiv.children[0].offsetHeight;

            // “pistes” (position X) à droite
            const TRACKS = 4;
            const xBase = monthWidth - 10;   // proche du bord droit
            const xGap = 8;                 // écart entre pistes

            events.forEach((ev, index) => {
                // jours de ce mois pour CET événement (toutes occurrences)
                const occ = generateEventOccurrences(ev, year)
                    .filter(o => o.date.getMonth() === m);

                if (!occ.length) return;

                const dayNums = occ.map(o => o.date.getDate()).sort((a, b) => a - b);
                const segments = daysToSegments(dayNums);

                // piste stable par événement
                const track = index % TRACKS;
                const x = xBase - track * xGap;

                // chaque segment = une ligne (évite l'effet “on relie tout”)
                segments.forEach(([startDay, endDay]) => {

                    // Détection continuation (mois précédent / suivant)
                    const occSet = new Set(occ.map(o => o.date.toDateString()));
                
                    const startDate = new Date(year, m, startDay);
                    const endDate = new Date(year, m, endDay);
                
                    const prevDate = new Date(startDate);
                    prevDate.setDate(prevDate.getDate() - 1);
                
                    const nextDate = new Date(endDate);
                    nextDate.setDate(nextDate.getDate() + 1);
                
                    const continuesFromPrev = occSet.has(prevDate.toDateString());
                    const continuesToNext = occSet.has(nextDate.toDateString());
                
                    // Position Y (centre du jour)
                    const yStartCenter = (startDay - 1) * dayHeight + dayHeight / 2;
                    const yEndCenter   = (endDay - 1) * dayHeight + dayHeight / 2;
                
                    // Si ça continue du mois précédent : on part du haut
                    // Si ça continue au mois suivant : on va jusqu'en bas
                    let y1 = continuesFromPrev ? 0 : yStartCenter;
                    let y2 = continuesToNext ? daysHeight : yEndCenter;
                
                    // ✅ Évite le "petit point SVG" (ligne de longueur 0)
                    // Si segment 1 jour ET pas une continuation, on ne dessine rien
                    if (y1 === y2) {
                        const MIN_HEIGHT = 6; // petite hauteur visible
                        y1 = y1 - MIN_HEIGHT / 2;
                        y2 = y2 + MIN_HEIGHT / 2;
                    }
                    
                
                    const line = document.createElementNS(svgNS, 'line');
                    line.setAttribute('x1', x);
                    line.setAttribute('x2', x);
                    line.setAttribute('y1', y1);
                    line.setAttribute('y2', y2);
                    line.setAttribute('stroke', ev.color);
                
                    svg.appendChild(line);
                });
                
            });

            monthDiv.appendChild(svg);
        }
    }

    generateLegend();
}

// ===============================
// LÉGENDE & LISTE
// ===============================
function generateLegend() {
    const legend = document.getElementById('legendContent');
    legend.innerHTML = '';

    if (!events.length) {
        legend.innerHTML = '<p style="color:#999">Aucun événement</p>';
        return;
    }

    events.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'legend-item';

        const dot = document.createElement('div');
        dot.className = 'legend-dot';
        dot.style.backgroundColor = ev.color;

        const name = document.createElement('div');
        name.className = 'legend-name';
        name.textContent = ev.name;

        item.append(dot, name);
        legend.appendChild(item);
    });
}

function renderEventsList() {
    const list = document.getElementById('eventsList');
    list.innerHTML = '';

    if (!events.length) {
        list.innerHTML = '<p style="color:#999">Aucun événement créé</p>';
        return;
    }

    events.forEach((ev, i) => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.style.borderLeftColor = ev.color;

        item.innerHTML = `
            <div class="event-item-color" style="background:${ev.color}"></div>
            <div class="event-item-info">
                <strong>${ev.name}</strong><br>
                Début : ${ev.startYear} S${ev.startWeek} – Durée : ${ev.duration} jour(s)
            </div>
        `;

        const del = document.createElement('button');
        del.className = 'event-item-delete';
        del.textContent = 'Supprimer';
        del.onclick = () => {
            events.splice(i, 1);
            saveEvents();
            renderEventsList();
            generateCalendar(currentYear);
        };

        item.appendChild(del);
        list.appendChild(item);
    });
}

// ===============================
// AJOUT ÉVÉNÉMENT
// ===============================
function addEvent() {
    const name = eventName.value.trim();
    if (!name) return alert('Nom obligatoire');

    events.push({
        name,
        color: eventColor.value,
        duration: +eventDuration.value,
        startYear: +eventYear.value,
        startWeek: +eventWeek.value,
        startDay: +eventDay.value,
        frequency: eventFrequency.value,
        repeat: +eventRepeat.value
    });

    saveEvents();
    renderEventsList();
    generateCalendar(currentYear);
    eventName.value = '';
}

// ===============================
// EXPORT PDF
// ===============================
function exportToPDF() {
    const printArea = document.getElementById('printArea');

    // Forcer une largeur stable pour éviter les surprises
    const originalStyle = printArea.style.cssText;
    printArea.style.width = '1600px';
    printArea.style.background = '#ffffff';

    html2canvas(printArea, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true
    }).then(canvas => {
        // Restaurer le style original
        printArea.style.cssText = originalStyle;

        const imgData = canvas.toDataURL('image/png');

        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a3'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // On ajuste l’image pour TOUT faire tenir sur une page
        const margin = 5;
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Si jamais ça dépasse un peu, on réduit proportionnellement
        const finalHeight = Math.min(imgHeight, pageHeight - margin * 2);

        pdf.addImage(
            imgData,
            'PNG',
            margin,
            margin,
            imgWidth,
            finalHeight
        );

        pdf.save(`calendrier_${currentYear}.pdf`);
    });
}

// ===============================
// INITIALISATION
// ===============================
generateBtn.onclick = () => {
    currentYear = +yearSelect.value;
    calendarYear.textContent = currentYear;
    generateCalendar(currentYear);
};

addEventBtn.onclick = addEvent;
exportBtn.onclick = exportToPDF;

loadEvents();
renderEventsList();
generateCalendar(currentYear);

// ===============================
// SAUVEGARDE CLOUD
// ===============================

function cloudSaveEvents() {

    const user = auth.currentUser;

    if (!user) return;

    db.collection("calendars")
    .doc(user.uid)
    .set({
        events: events
    })
    .then(() => {
        console.log("Calendrier sauvegardé cloud");
    });
}


// ===============================
// CHARGEMENT CLOUD
// ===============================

function cloudLoadEvents() {

    const user = auth.currentUser;

    if (!user) return;

    db.collection("calendars")
    .doc(user.uid)
    .get()
    .then(doc => {

        if (doc.exists) {

            events = doc.data().events || [];

            saveEvents();
            renderEventsList();
            generateCalendar(currentYear);

        }

    });

}


// ===============================
// SYNC AUTOMATIQUE
// ===============================

function autoCloudSync() {

    if (!auth || !auth.currentUser) return;

    cloudSaveEvents();

}


// ===============================
// 🔥 PREVIEW OPTIMISÉE BASE64
// ===============================

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔹 Génère une miniature légère
async function generateOptimizedPreview() {

    const element = document.querySelector("#calendar"); // ⚠️ adapte si besoin

    if (!element) {
        console.error("❌ Element #calendar introuvable");
        return null;
    }

    const canvas = await html2canvas(element, {
        scale: 0.3, // 🔥 réduction massive
        backgroundColor: "#ffffff",
        useCORS: true
    });

    // 🎯 créer une version miniature
    const smallCanvas = document.createElement("canvas");
    const ctx = smallCanvas.getContext("2d");

    const width = 300;
    const height = canvas.height * (300 / canvas.width);

    smallCanvas.width = width;
    smallCanvas.height = height;

    ctx.drawImage(canvas, 0, 0, width, height);

    // 🔥 compression JPEG
    return smallCanvas.toDataURL("image/jpeg", 0.5);
}


// 🔹 Anti spam (important)
let lastPreview = 0;

// 🔹 Sauvegarde dans Firestore
async function savePreview(calendarId) {

    const now = Date.now();

    // ⛔ évite spam (15 secondes)
    if (now - lastPreview < 15000) return;

    lastPreview = now;

    const preview = await generateOptimizedPreview();

    if (!preview) return;

    try {
        await updateDoc(doc(db, "calendars", calendarId), {
            preview: preview,
            updated: new Date()
        });

        console.log("✅ Preview mise à jour");
    } catch (err) {
        console.error("❌ Erreur preview :", err);
    }
}
// ===============================
// DETECTION CONNEXION
// ===============================

if (typeof firebase !== "undefined") {

    auth.onAuthStateChanged(user => {

        if (user) {

            console.log("Utilisateur connecté :", user.email);
            cloudLoadEvents();

        } else {

            console.log("Utilisateur non connecté");

        }

    });

}
console.log("Firebase connecté");

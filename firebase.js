// firebase.js
// ----------------------
// Firebase Initialization for PlayChat App
// ----------------------

const firebaseConfig = {
    apiKey: "AIzaSyAzD8rKBMqEUsxYZD97kff7dWH_wb7VGSk",
    authDomain: "game-8c270.firebaseapp.com",
    databaseURL: "https://game-8c270-default-rtdb.firebaseio.com",
    projectId: "game-8c270"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase Services
const auth = firebase.auth();
const db = firebase.database();

// ----------------------
// 🔥 Presence System (SAFE, BACKWARDS COMPATIBLE)
// ----------------------

// This is only activated after login via setUserPresence()
// Keeping it optional prevents breaking older flows
async function setUserPresence(user) {
    if (!user) return;

    const userStatusRef = db.ref("users/" + user.uid + "/online");
    const lastSeenRef = db.ref("users/" + user.uid + "/lastSeen");

    // Triggered when connection state changes
    const connectedRef = db.ref(".info/connected");
    connectedRef.on("value", snapshot => {
        if (snapshot.val() === false) return;

        // Mark the user online
        userStatusRef.set(true);
        userStatusRef.onDisconnect().set(false);

        // Update last seen on disconnect
        lastSeenRef.onDisconnect().set(new Date().toISOString());
    });
}

// 👉 Export presence helper globally without touching existing exports
window.setUserPresence = setUserPresence;

// Export globally for other scripts
window.auth = auth;
window.db = db;

console.log("%c🔥 Firebase Initialized Successfully for PlayChat!", "color:#4CAF50;font-size:14px;font-weight:bold;");

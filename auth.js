// auth.js
// ----------------------
// Login, Signup, Logout Logic
// ----------------------

// Signup function
async function signup(email, password, username) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Save user info in Realtime Database
        await db.ref('users/' + user.uid).set({
            username: username,
            email: email,
            createdAt: new Date().toISOString(),
            online: true,                // NEW
            lastSeen: new Date().toISOString() // NEW
        });

        // Activate presence system
        setUserPresence(user);

        // Redirect to Feed page after signup
        window.location.href = 'app.html';
    } catch (error) {
        alert(error.message);
    }
}

// Login function
async function login(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Mark user online immediately
        db.ref("users/" + user.uid).update({
            online: true,
            lastSeen: new Date().toISOString()
        });

        // Activate presence tracking
        setUserPresence(user);

        // Redirect to Feed page after login
        window.location.href = 'app.html';
    } catch (error) {
        alert(error.message);
    }
}

// Logout function
function logout() {
    const user = auth.currentUser;

    if (user) {
        // Update last seen before logout
        db.ref("users/" + user.uid).update({
            online: false,
            lastSeen: new Date().toISOString()
        });
    }

    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

// Export globally
window.signup = signup;
window.login = login;
window.logout = logout;

// Auth check
auth.onAuthStateChanged(user => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        loadProfile(user);
    }
});

// Load user profile from Firebase
function loadProfile(user) {
    const userRef = db.ref('users/' + user.uid);
    userRef.once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('displayName').value = data.name || '';
            document.getElementById('username').value = data.username || '';
        }
    });
}

// Update user profile
function updateProfile() {
    const user = auth.currentUser;
    if (!user) return alert('User not logged in.');

    const name = document.getElementById('displayName').value.trim();
    const username = document.getElementById('username').value.trim();

    if (!name || !username) return alert('Please fill both fields.');

    db.ref('users/' + user.uid).update({
        name: name,
        username: username
    }).then(() => {
        alert('Profile updated successfully!');
    }).catch(err => {
        console.error(err);
        alert('Error updating profile.');
    });
}

// Logout
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch(err => console.error(err));
}

// Bottom nav functions
function goHome() { window.location.href = 'app.html'; }
function goChats() { window.location.href = 'chat.html'; }
function goGames() { window.location.href = 'games.html'; }
function goProfile() { window.location.href = 'profile.html'; }
function goFriends() { window.location.href = 'friends.html'; }
// Auth check
auth.onAuthStateChanged(user => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        loadProfile(user);
    }
});

// Load user profile from Firebase
function loadProfile(user) {
    const userRef = db.ref('users/' + user.uid);

    userRef.once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('displayName').value = data.name || '';
            document.getElementById('username').value = data.username || '';
            document.getElementById('bio').value = data.bio || '';

            document.getElementById('link1').value = data.link1 || '';
            document.getElementById('link2').value = data.link2 || '';
            document.getElementById('link3').value = data.link3 || '';

            document.getElementById('avatar').src = data.avatar || 'icons/avatar.png';
        }
    });
}

// Update user profile
function updateProfile() {
    const user = auth.currentUser;
    if (!user) return alert('User not logged in.');

    const name = document.getElementById('displayName').value.trim();
    const username = document.getElementById('username').value.trim();
    const bio = document.getElementById('bio').value.trim();

    const link1 = document.getElementById('link1').value.trim();
    const link2 = document.getElementById('link2').value.trim();
    const link3 = document.getElementById('link3').value.trim();

    if (!name || !username) return alert('Please fill both fields.');

    db.ref('users/' + user.uid).update({
        name: name,
        username: username,
        bio: bio,
        link1: link1,
        link2: link2,
        link3: link3
    }).then(() => {
        alert('Profile updated successfully!');
    }).catch(err => {
        console.error(err);
        alert('Error updating profile.');
    });
}

// Upload avatar
function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const base64 = reader.result;
        document.getElementById('avatar').src = base64;

        const user = auth.currentUser;
        if (user) {
            db.ref('users/' + user.uid + '/avatar').set(base64);
        }
    };
    reader.readAsDataURL(file);
}

// Logout
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch(err => console.error(err));
}

// Bottom nav functions
function goHome() { window.location.href = 'app.html'; }
function goChats() { window.location.href = 'chat.html'; }
function goGames() { window.location.href = 'games.html'; }
function goProfile() { window.location.href = 'profile.html'; }
function goFriends() { window.location.href = 'friends.html'; }

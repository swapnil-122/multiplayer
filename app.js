// Firebase Auth check
auth.onAuthStateChanged(user => {
    if (!user) {
        // User not logged in, redirect to login
        window.location.href = 'index.html';
    }
});

// Logout function
function logout() {
    auth.signOut()
    .then(() => {
        window.location.href = 'index.html';
    })
    .catch(err => {
        console.error('Logout Error:', err);
        alert('Error logging out.');
    });
}

// Navigation functions
function goHome() {
    setActiveNav('Home');
    window.location.href = 'app.html';
}

function goChats() {
    setActiveNav('Chats');
    window.location.href = 'chat.html';
}

function goProfile() {
    setActiveNav('Profile');
    window.location.href = 'profile.html';
}

function goGames() {
    setActiveNav('Games');
    window.location.href = 'games.html';
}

function goFriends() {
    setActiveNav('Friends');
    window.location.href = 'friends.html';
}

// Highlight active bottom nav button
function setActiveNav(name) {
    const buttons = document.querySelectorAll('.bottom-nav button');
    buttons.forEach(btn => btn.classList.remove('active'));

    const navMap = {
        Home: 0,
        Chats: 1,
        Games: 2,
        Profile: 3,
        Friends: 4
    };

    if (navMap[name] !== undefined) {
        buttons[navMap[name]].classList.add('active');
    }
}

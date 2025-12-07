// friends.js

// Keep using existing auth and db variables from your firebase.js / auth.js
auth.onAuthStateChanged(user => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        // Load lists and UI state
        loadFriends();
        loadIncomingRequests();
        loadFollowingSet();
    }
});

/* ---------------------------
   --- UI / Tab Management ---
   --------------------------- */
let activeTab = 'all'; // 'all' | 'following' | 'requests'
function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const el = document.getElementById('tab-' + tab);
    if (el) el.classList.add('active');

    // re-render based on current data already in memory (or re-load)
    loadFriends();
}

function openRequestsView() {
    switchTab('requests');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearSearch() {
    document.getElementById('searchFriend').value = '';
    searchFriends();
}

/* ---------------------------
   --- Data caches (local) ---
   --------------------------- */
const CACHE = {
    users: {},            // uid -> userObj
    friendsOfMe: {},      // friendId -> true  (as stored previously in your DB)
    incomingRequests: {}, // requesterUid -> requestObj
    sentRequests: {},     // targetUid -> true
    followingSet: {},     // uid -> true (people I follow)
    followersSet: {},     // uid -> true (people who follow me)
};

/* ---------------------------
   --- Loaders / Renderers ---
   --------------------------- */

// Original loadFriends function preserved (wrapper) for compatibility
function loadFriends() {
    // preserve previous external contract but delegate to modern loader
    loadAllUsersAndRender();
}

/**
 * Loads all users and renders the friends list according to current tab and search
 * - Does not change existing Firebase logic
 */
function loadAllUsersAndRender() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const friendsList = document.getElementById('friendsList');
    friendsList.innerHTML = '';

    db.ref('users').once('value').then(snapshot => {
        const users = snapshot.val();
        if (!users) return;

        CACHE.users = users;

        // load current friends of me (existing path used by original code)
        db.ref('friends/' + currentUser.uid).once('value').then(fsnap => {
            const fdata = fsnap.val() || {};
            CACHE.friendsOfMe = fdata;

            // also load sentRequests (outgoing), followers/following for UI
            const promises = [
                db.ref('sentRequests/' + currentUser.uid).once('value'),
                db.ref('friendRequests/' + currentUser.uid).once('value'),
                db.ref('following/' + currentUser.uid).once('value'),
                db.ref('followers/' + currentUser.uid).once('value')
            ];
            return Promise.all(promises);
        }).then(results => {
            const [sentSnap, incomingSnap, followingSnap, followersSnap] = results;
            CACHE.sentRequests = sentSnap.val() || {};
            CACHE.incomingRequests = incomingSnap.val() || {};
            CACHE.followingSet = followingSnap.val() || {};
            CACHE.followersSet = followersSnap.val() || {};

            renderFriendsList(); // final UI render
        }).catch(err => console.error('Error loading friend-related nodes', err));
    }).catch(err=>console.error(err));
}

/**
 * Renders the list of users into #friendsList based on activeTab and search query
 */
function renderFriendsList() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const container = document.getElementById('friendsList');
    container.innerHTML = '';

    const query = (document.getElementById('searchFriend').value || '').toLowerCase();

    // iterate users
    Object.keys(CACHE.users).forEach(uid => {
        if (uid === currentUser.uid) return;

        const u = CACHE.users[uid];
        const displayName = (u.name || 'Unnamed').toLowerCase();
        const handle = ('@' + (u.username || 'username')).toLowerCase();

        if (query && !(displayName.includes(query) || handle.includes(query))) return;

        // Tab filters
        if (activeTab === 'following' && !CACHE.followingSet[uid]) return;
        if (activeTab === 'requests' && !CACHE.incomingRequests[uid]) return;

        // Build card
        const card = document.createElement('div');
        card.className = 'friend-card';
        card.setAttribute('data-uid', uid);

        const left = document.createElement('div');
        left.className = 'friend-left';
        left.innerHTML = `
            <img src="${u.profilePic || 'icons/default.png'}" alt="${escapeHtml(u.name||'User')}" />
            <div class="friend-meta">
                <div class="name">${escapeHtml(u.name || 'Unnamed')}</div>
                <div class="handle">@${escapeHtml(u.username || 'username')}</div>
            </div>
        `;

        // clicking left area goes to profile (preserve your navigation)
        left.addEventListener('click', () => viewProfile(uid));

        const actions = document.createElement('div');
        actions.className = 'friend-actions';

        // If incoming request exists for this user -> show Accept/Decline
        if (CACHE.incomingRequests[uid]) {
            const acceptBtn = createBtn('Accept', 'primary', () => acceptFriendRequest(uid));
            const declineBtn = createBtn('Decline', 'ghost', () => declineFriendRequest(uid));
            actions.appendChild(acceptBtn);
            actions.appendChild(declineBtn);
        } else {
            // Relationship buttons:
            // 1) If already friends (existing path), show "Message" + "Unfriend" (unfriend still uses original friends path)
            if (CACHE.friendsOfMe && CACHE.friendsOfMe[uid]) {
                const msgBtn = createIconBtn('💬', () => openChat(uid), 'Message');
                const unfBtn = createBtn('Unfriend', 'ghost', () => removeFriend(uid));
                actions.appendChild(msgBtn);
                actions.appendChild(unfBtn);
            } else {
                // Not friends: show primary action (send request) OR "Add" (preserve original addFriend call)
                // Prefer using friend-request flow. Keep old addFriend function available (compatibility).
                if (CACHE.sentRequests && CACHE.sentRequests[uid]) {
                    // already sent -> show "Requested" state
                    const cancelBtn = createBtn('Cancel Request', 'ghost', () => cancelSentRequest(uid));
                    actions.appendChild(createBadge('Requested'));
                    actions.appendChild(cancelBtn);
                } else {
                    // Show "Request" primary; keep compatibility by leaving original addFriend function intact but prefer new send flow
                    const requestBtn = createBtn('Request', 'primary', () => sendFriendRequest(uid));
                    // Also keep option to add immediately by calling original addFriend
                    const addBtn = createBtn('Add (legacy)', 'ghost', () => addFriend(uid));
                    actions.appendChild(requestBtn);
                    actions.appendChild(addBtn);
                }
            }

            // Follow/unfollow toggle
            if (CACHE.followingSet && CACHE.followingSet[uid]) {
                const unfollow = createBtn('Unfollow', 'ghost', () => unfollowUser(uid));
                actions.appendChild(unfollow);
            } else {
                const follow = createBtn('Follow', 'ghost', () => followUser(uid));
                actions.appendChild(follow);
            }

            // Quick profile and chat icons
            const chatIcon = createIconBtn('💬', () => openChat(uid), 'Message');
            const profileIcon = createIconBtn('👤', () => viewProfile(uid), 'Profile');
            actions.appendChild(chatIcon);
            actions.appendChild(profileIcon);
        }

        card.appendChild(left);
        card.appendChild(actions);
        container.appendChild(card);
    });

    // Also render incoming requests section separately for the 'Requests' tab or to show incoming at bottom
    renderIncomingRequests();
}

/* ---------------------------
   --- Incoming Requests UI ---
   --------------------------- */
function loadIncomingRequests() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    db.ref('friendRequests/' + currentUser.uid).once('value').then(snap => {
        CACHE.incomingRequests = snap.val() || {};
        renderIncomingRequests();
    }).catch(err => console.error(err));
}

function renderIncomingRequests() {
    const list = document.getElementById('incomingRequestsList');
    list.innerHTML = ''; // reset

    const keys = Object.keys(CACHE.incomingRequests || {});
    if (!keys.length) return;

    // header
    const header = document.createElement('div');
    header.style.margin = '8px 0';
    header.style.color = '#fff';
    header.style.fontWeight = '700';
    header.textContent = 'Incoming Friend Requests';
    list.appendChild(header);

    keys.forEach(requesterUid => {
        const reqObj = CACHE.incomingRequests[requesterUid];
        const user = CACHE.users[requesterUid] || { name: 'Unknown', username: 'unknown', profilePic: 'icons/default.png' };

        const card = document.createElement('div');
        card.className = 'friend-card';
        card.style.justifyContent = 'space-between';

        card.innerHTML = `
            <div class="friend-left" style="cursor:pointer;">
                <img src="${user.profilePic || 'icons/default.png'}" />
                <div class="friend-meta">
                    <div class="name">${escapeHtml(user.name || 'Unknown')}</div>
                    <div class="handle">@${escapeHtml(user.username || 'unknown')}</div>
                </div>
            </div>
        `;

        // actions
        const actions = document.createElement('div');
        actions.className = 'friend-actions';

        const acceptBtn = createBtn('Accept', 'primary', () => acceptFriendRequest(requesterUid));
        const declineBtn = createBtn('Decline', 'ghost', () => declineFriendRequest(requesterUid));
        const viewBtn = createIconBtn('👤', () => viewProfile(requesterUid), 'Profile');

        actions.appendChild(acceptBtn);
        actions.appendChild(declineBtn);
        actions.appendChild(viewBtn);

        card.appendChild(actions);
        list.appendChild(card);
    });
}

/* ---------------------------
   --- Friend Request Flow ---
   --------------------------- */

/**
 * sendFriendRequest:
 * - Adds a friend request under friendRequests/<targetUid>/<fromUid>
 * - Adds a sentRequests/<fromUid>/<targetUid> for outgoing tracking
 * - DOES NOT alter existing 'friends' node (keeps original addFriend intact)
 */
function sendFriendRequest(targetUid) {
    const currentUser = auth.currentUser;
    if (!currentUser || !targetUid) return;

    if (targetUid === currentUser.uid) {
        alert("You can't send a request to yourself.");
        return;
    }

    // simple debounce: prevent sending twice
    if (CACHE.sentRequests && CACHE.sentRequests[targetUid]) {
        alert('Request already sent.');
        return;
    }

    const requestObj = {
        from: currentUser.uid,
        timestamp: Date.now(),
        status: 'pending'
    };

    // write to target's incoming requests
    db.ref('friendRequests/' + targetUid + '/' + currentUser.uid).set(requestObj)
        .then(() => {
            // write to sender's sentRequests node for convenience
            db.ref('sentRequests/' + currentUser.uid + '/' + targetUid).set({ to: targetUid, timestamp: Date.now() });

            // update local cache & re-render
            if (!CACHE.sentRequests) CACHE.sentRequests = {};
            CACHE.sentRequests[targetUid] = true;

            alert('Friend request sent.');
            renderFriendsList();
        })
        .catch(err => {
            console.error('Error sending friend request', err);
            alert('Failed to send request. Try again.');
        });
}

/**
 * cancelSentRequest(targetUid)
 * - Removes the sent request entry (both sides)
 */
function cancelSentRequest(targetUid) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    db.ref('friendRequests/' + targetUid + '/' + currentUser.uid).remove()
        .then(() => db.ref('sentRequests/' + currentUser.uid + '/' + targetUid).remove())
        .then(() => {
            if (CACHE.sentRequests) delete CACHE.sentRequests[targetUid];
            renderFriendsList();
        })
        .catch(err => console.error(err));
}

/**
 * acceptFriendRequest(requesterUid)
 * - Adds both sides under 'friends' node (mutual)
 * - Removes friendRequests entry
 * - Preserves original write style to 'friends' (keeps compatibility)
 */
function acceptFriendRequest(requesterUid) {
    const currentUser = auth.currentUser;
    if (!currentUser || !requesterUid) return;

    // Add friend for me
    db.ref('friends/' + currentUser.uid + '/' + requesterUid).set(true)
    .then(() => {
        // Also add reciprocal friend entry for requester (so both are friends)
        return db.ref('friends/' + requesterUid + '/' + currentUser.uid).set(true);
    })
    .then(() => {
        // Remove the incoming friendRequest and any sentRequests record
        const removes = [
            db.ref('friendRequests/' + currentUser.uid + '/' + requesterUid).remove(),
            db.ref('sentRequests/' + requesterUid + '/' + currentUser.uid).remove()
        ];
        return Promise.all(removes);
    })
    .then(() => {
        // Update caches and UI
        if (!CACHE.friendsOfMe) CACHE.friendsOfMe = {};
        CACHE.friendsOfMe[requesterUid] = true;
        if (CACHE.incomingRequests) delete CACHE.incomingRequests[requesterUid];
        renderFriendsList();
        alert('Friend request accepted!');
    })
    .catch(err => console.error('Error accepting request', err));
}

/**
 * declineFriendRequest(requesterUid)
 * - Removes the incoming request
 */
function declineFriendRequest(requesterUid) {
    const currentUser = auth.currentUser;
    if (!currentUser || !requesterUid) return;

    db.ref('friendRequests/' + currentUser.uid + '/' + requesterUid).remove()
    .then(() => db.ref('sentRequests/' + requesterUid + '/' + currentUser.uid).remove())
    .then(() => {
        if (CACHE.incomingRequests) delete CACHE.incomingRequests[requesterUid];
        renderFriendsList();
    })
    .catch(err => console.error('Error declining request', err));
}

/* ---------------------------
   --- Follow / Unfollow ---
   --------------------------- */

/**
 * followUser(uid)
 * - Writes to following/<myUid>/<targetUid> and followers/<targetUid>/<myUid>
 */
function followUser(targetUid) {
    const currentUser = auth.currentUser;
    if (!currentUser || !targetUid) return;
    db.ref('following/' + currentUser.uid + '/' + targetUid).set(true)
    .then(() => db.ref('followers/' + targetUid + '/' + currentUser.uid).set(true))
    .then(() => {
        if (!CACHE.followingSet) CACHE.followingSet = {};
        CACHE.followingSet[targetUid] = true;
        renderFriendsList();
    })
    .catch(err => console.error('Error following user', err));
}

/**
 * unfollowUser(uid)
 */
function unfollowUser(targetUid) {
    const currentUser = auth.currentUser;
    if (!currentUser || !targetUid) return;
    db.ref('following/' + currentUser.uid + '/' + targetUid).remove()
    .then(() => db.ref('followers/' + targetUid + '/' + currentUser.uid).remove())
    .then(() => {
        if (CACHE.followingSet) delete CACHE.followingSet[targetUid];
        renderFriendsList();
    })
    .catch(err => console.error('Error unfollowing user', err));
}

/**
 * loadFollowingSet - loads local following/followers caches
 */
function loadFollowingSet() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    db.ref('following/' + currentUser.uid).once('value').then(snap => {
        CACHE.followingSet = snap.val() || {};
        renderFriendsList();
    }).catch(err => console.error(err));

    db.ref('followers/' + currentUser.uid).once('value').then(snap => {
        CACHE.followersSet = snap.val() || {};
    }).catch(err => console.error(err));
}

/* ---------------------------
   --- Chat & Profile links ---
   --------------------------- */

/**
 * openChat(uid)
 * - Uses the existing chat.html (keeps navigation intact) and adds a query param
 * - You mentioned chat.html exists in same folder — we link to it.
 */
function openChat(uid) {
    if (!uid) return;
    // We pass uid as query param; chat.html can read it if implemented.
    window.location.href = 'chat.html?uid=' + encodeURIComponent(uid);
}

/**
 * viewProfile(uid) - keep existing profile page path, add uid param
 */
function viewProfile(uid) {
    if (!uid) return;
    window.location.href = 'profile.html?uid=' + encodeURIComponent(uid);
}

/* ---------------------------
   --- Compatibility / Legacy ---
   --------------------------- */

/**
 * addFriend(friendUid)
 * - ***UNCHANGED core behavior*** from your original code for compatibility.
 * - Leaves the original write to friends/<myUid>/<friendUid>.set(true)
 */
function addFriend(friendUid) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // original implementation preserved
    db.ref('friends/' + currentUser.uid + '/' + friendUid).set(true)
    .then(() => {
        alert('Friend added successfully!');
        // update cache & UI
        if (!CACHE.friendsOfMe) CACHE.friendsOfMe = {};
        CACHE.friendsOfMe[friendUid] = true;
        renderFriendsList();
    })
    .catch(err => console.error(err));
}

/**
 * removeFriend(friendUid)
 * - Symmetric removal of friendship (safe additive operation)
 */
function removeFriend(friendUid) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Remove my pointer and optionally remove reciprocal pointer (safer)
    db.ref('friends/' + currentUser.uid + '/' + friendUid).remove()
    .then(() => db.ref('friends/' + friendUid + '/' + currentUser.uid).remove())
    .then(() => {
        if (CACHE.friendsOfMe) delete CACHE.friendsOfMe[friendUid];
        renderFriendsList();
    })
    .catch(err => console.error(err));
}

/* ---------------------------
   --- Helpers & Small UX ---
   --------------------------- */

function searchFriends() {
    // keep compatibility: previous function filtered .friend-card elements
    // New implementation just triggers a re-render using current search query
    renderFriendsList();
}

// small helper to create buttons consistently
function createBtn(text, type = 'ghost', onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + (type === 'primary' ? 'primary' : 'ghost');
    b.textContent = text;
    b.onclick = onClick;
    return b;
}

function createIconBtn(iconText, onClick, title) {
    const b = document.createElement('button');
    b.className = 'btn icon-btn ghost';
    b.innerText = iconText;
    b.title = title || '';
    b.onclick = onClick;
    return b;
}

function createBadge(text) {
    const sp = document.createElement('span');
    sp.className = 'badge';
    sp.textContent = text;
    return sp;
}

// simple HTML escape to avoid inserting raw content into attributes
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* ---------------------------
   --- Misc / Nav / Auth ---
   --------------------------- */

// Bottom nav functions kept intact
function goHome() { window.location.href='app.html'; }
function goChats() { window.location.href='chat.html'; }
function goGames() { window.location.href='games.html'; }
function goProfile() { window.location.href='profile.html'; }
function goFriends() { window.location.href='friends.html'; }

function logout() {
    auth.signOut().then(()=>window.location.href='index.html').catch(err=>console.error(err));
}

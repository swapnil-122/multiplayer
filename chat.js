// chat.js - upgraded UI + features while preserving original functions, IDs and logic

let currentUser;
let chattingWith = null;
let emojiPicker = null;
let messageListeners = null;
let typingRef = null;
let typingTimeout = null;

// Check Login - (unchanged behavior)
auth.onAuthStateChanged(user => {
    if (!user) return window.location.href = "index.html";
    currentUser = user;
    initUI();
    loadChatList();
});

// Initialize extra UI features (emoji picker, events)
function initUI() {
    // Emoji picker (uses the Emoji Button library included via CDN)
    try {
        emojiPicker = new EmojiButton({
            position: 'top-end',
            zIndex: 99999,
            // small tweak for better look
            showPreview: false,
        });
        const emojiBtn = document.getElementById('emojiBtn');
        emojiPicker.on('emoji', emoji => {
            const input = document.getElementById('chatInput');
            input.value = input.value + emoji;
            input.focus();
        });
        emojiBtn.addEventListener('click', () => {
            emojiPicker.togglePicker(emojiBtn);
        });
    } catch (e) {
        console.warn('Emoji picker not available', e);
    }

    // Attach enter key send
    const input = document.getElementById('chatInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        } else {
            // indicate typing while user is typing
            indicateTyping(true);
        }
    });

    input.addEventListener('input', () => {
        indicateTyping(true);
    });

    // Stop typing when focus lost
    input.addEventListener('blur', () => indicateTyping(false));

    // Attach attachments button placeholder
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const attachPreview = document.getElementById('attachmentPreview');

    attachBtn.addEventListener('click', () => {
        // Re-use the hidden file input - this is non-breaking
        fileInput.value = '';
        fileInput.click();
    });

    // file input change -> show non-blocking preview chip
    fileInput.addEventListener('change', (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        showAttachInComposer(file);
    });

    // keyboard accessibility: allow Enter to send when focus in attachment preview (remove via backspace)
    attachPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            clearAttachmentPreview();
        }
    });

    // Long-press for mobile quick reaction anywhere on message box (delegated)
    const msgBox = document.getElementById('messageBox');
    let longPressTimer = null;
    let longPressTargetKey = null;
    msgBox.addEventListener('touchstart', (ev) => {
        const el = ev.target.closest('.msg[data-key]');
        if (!el) return;
        longPressTargetKey = el.getAttribute('data-key');
        longPressTimer = setTimeout(()=> {
            if (longPressTargetKey) showQuickReactionMenu(ev.touches[0].clientX, ev.touches[0].clientY, longPressTargetKey);
        }, 500);
    });
    msgBox.addEventListener('touchend', ()=> { if (longPressTimer) clearTimeout(longPressTimer); longPressTargetKey = null; });

    // small improvement: focus input on load
    setTimeout(()=> { input.focus(); }, 400);

    // smooth-scrolling when user resizes
    window.addEventListener('resize', () => { smoothScrollToBottom(); });
}

// TEMP: show temporary UI for an attachment selection
function showTemporaryAttachmentNotice(filename){
    const msgBox = document.getElementById('messageBox');
    const row = document.createElement('div');
    row.className = 'msg-row me animate__animated animate__fadeInUp';
    row.innerHTML = `
        <div class="mini-avatar"></div>
        <div class="msg me" style="max-width:60%;">
            <div style="font-weight:700;margin-bottom:6px;">Attachment ready</div>
            <div style="font-size:0.9rem;">${filename}</div>
            <small class="time">${formatTime(Date.now())} • Sending...</small>
        </div>
    `;
    msgBox.appendChild(row);
    msgBox.scrollTop = msgBox.scrollHeight;
}

// New: show attach preview chip in composer (non-breaking)
function showAttachInComposer(file){
    const preview = document.getElementById('attachmentPreview');
    preview.innerHTML = '';
    preview.style.display = 'flex';
    preview.setAttribute('aria-hidden', 'false');
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    chip.tabIndex = 0;
    chip.innerHTML = `<div style="font-weight:700;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(file.name)}</div>
                      <button title="Remove" aria-label="Remove attachment" style="background:transparent;border:none;color:var(--text);cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>`;
    chip.querySelector('button').addEventListener('click', clearAttachmentPreview);
    preview.appendChild(chip);

    // also show a subtle toast in the message area
    showTemporaryAttachmentNotice(file.name);
}

// Clear composer attachment UI
function clearAttachmentPreview(){
    const preview = document.getElementById('attachmentPreview');
    preview.innerHTML = '';
    preview.style.display = 'none';
    preview.setAttribute('aria-hidden', 'true');
}

// Load all friends (kept function name)
function loadChatList() {
    const list = document.getElementById("chatList");
    list.innerHTML = "";

    db.ref("friends/" + currentUser.uid).once("value").then(snap => {
        const friends = snap.val();
        if (!friends) {
            list.innerHTML = "<p style='padding:12px;color:rgba(255,255,255,0.9)'>No friends yet.</p>";
            return;
        }

        const uids = Object.keys(friends);
        // efficient fetching in parallel
        uids.forEach(uid => {
            db.ref("users/" + uid).once("value").then(u => {
                const user = u.val() || {};
                const lastSeen = user.lastOnline ? timeAgo(user.lastOnline) : 'Active';
                const card = document.createElement("div");
                card.className = "friend-card animate__animated animate__fadeInUp";
                card.tabIndex = 0;
                card.setAttribute('role','button');
                card.innerHTML = `
                    <div class="avatar"><img src="${user.profilePic || 'icons/default.png'}" alt=""></div>
                    <div class="meta">
                        <div class="name">${escapeHTML(user.name || 'Unknown')} <span style="font-weight:600;color:rgba(255,255,255,0.7);font-size:0.8rem">@${user.username||'user'}</span></div>
                        <div class="sub">${escapeHTML(user.status || 'Hey there! I am using PlayChat')}</div>
                    </div>
                    <div class="time">${lastSeen}</div>
                `;
                card.onclick = () => openChat(uid, user);
                card.onkeydown = (e) => { if (e.key === 'Enter') openChat(uid, user); };
                list.appendChild(card);

                // optionally show unread count if path exists
                db.ref(`unreads/${currentUser.uid}/${uid}`).once('value').then(unreadSnap=>{
                    const n = unreadSnap.val();
                    if (n && n > 0) {
                        const badge = document.createElement('div');
                        badge.className = 'badge';
                        badge.innerText = n > 99 ? '99+' : n;
                        card.appendChild(badge);
                    }
                });
            });
        });
    });
}

// Open chat window (kept function name & behaviors)
function openChat(uid, userData) {
    chattingWith = uid;

    // Keep existing DOM IDs intact
    document.getElementById("chatList").style.display = "block"; // keep visible on wide UI
    // Show right pane (already visible) - ensure header updates
    document.getElementById("chatUserImg").src = userData.profilePic || "icons/default.png";
    document.getElementById("chatUserName").innerText = userData.name || 'Unknown';
    document.getElementById("chatUserStatus").innerText = userData.status || (userData.lastOnline ? `Last seen ${timeAgo(userData.lastOnline)}` : 'Active');

    // Clear any composer attachment preview (safer)
    clearAttachmentPreview();

    // Clear existing messages and load messages
    loadMessages();

    // clear unreads for this conversation (non-breaking additive)
    db.ref(`unreads/${currentUser.uid}/${chattingWith}`).remove().catch(()=>{});
}

// Load messages real-time (kept function name, but improved rendering)
function loadMessages() {
    const msgBox = document.getElementById("messageBox");
    msgBox.innerHTML = "";

    const chatID = getChatID(currentUser.uid, chattingWith);

    // cleanup previous listener
    if (messageListeners) {
        messageListeners.off();
        messageListeners = null;
    }

    // Listen for messages under the chatID and render
    const ref = db.ref("messages/" + chatID);
    messageListeners = ref;
    ref.on("value", snap => {
        msgBox.innerHTML = "";
        const msgs = [];
        snap.forEach(m => {
            const msg = m.val();
            msg._key = m.key;
            msgs.push(msg);
        });

        // sort optionally by time
        msgs.sort((a,b)=> (a.time||0) - (b.time||0));

        msgs.forEach(msg => {
            appendMessageToUI(msg, msg._key);
        });

        // scroll to bottom after render
        setTimeout(()=>{ smoothScrollToBottom(); }, 60);
    });

    // typing indicator listener
    if (typingRef) typingRef.off();
    typingRef = db.ref(`typing/${chatID}`);
    typingRef.on('value', snap => {
        const val = snap.val() || {};
        // show if the other user is typing
        const otherTyping = Object.keys(val).find(k => k !== currentUser.uid && val[k] === true);
        if (otherTyping) {
            showTypingIndicator(true, document.getElementById('chatUserName').innerText);
        } else {
            showTypingIndicator(false);
        }
    });
}

// Append single message with new UI features (timestamp, reactions, status)
function appendMessageToUI(msg, messageKey) {
    const msgBox = document.getElementById("messageBox");
    const isMe = msg.from === currentUser.uid;
    const row = document.createElement('div');
    row.className = 'msg-row ' + (isMe ? 'me' : 'other') + ' animate__animated animate__fadeInUp';

    // avatar column (shows for other messages)
    const mini = document.createElement('div');
    mini.className = 'mini-avatar';
    if (!isMe) {
        // fetch user avatar (fast)
        db.ref(`users/${msg.from}`).once('value').then(snap=>{
            const u = snap.val();
            if (u && u.profilePic) mini.innerHTML = `<img src="${u.profilePic}" style="width:100%;height:100%;object-fit:cover;" alt="${escapeHTML(u.name||'User')}">`;
            else mini.innerHTML = `<div style="width:100%;height:100%;background:rgba(255,255,255,0.04);border-radius:8px;"></div>`;
        });
    } else {
        mini.innerHTML = `<div></div>`;
    }

    // bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (isMe ? 'me' : 'other');
    bubble.setAttribute('data-key', messageKey);
    bubble.setAttribute('tabindex', 0);
    bubble.setAttribute('role', 'group');

    // message text (escape)
    const safeText = escapeHTML(msg.text || '');
    // status tick for outgoing
    const statusIcon = (isMe && msg.status) ? renderStatusIcon(msg.status) : '';

    bubble.innerHTML = `<div class="body">${safeText}</div>
                        <small class="time"><span>${formatTime(msg.time || Date.now())}</span>${isMe ? '<span class="status-tick" aria-hidden="true">'+statusIcon+'</span>' : ''}</small>`;

    // reactions area
    const reactionArea = document.createElement('div');
    reactionArea.className = 'reaction-area';
    const reactionsHolder = document.createElement('div');
    reactionsHolder.className = 'reactions';
    reactionArea.appendChild(reactionsHolder);
    bubble.appendChild(reactionArea);

    // build row
    row.appendChild(mini);
    row.appendChild(bubble);
    msgBox.appendChild(row);

    // load reactions for message (non-blocking)
    db.ref(`messageReactions/${getChatID(currentUser.uid, chattingWith)}/${messageKey}`).on('value', snap => {
        const reactions = snap.val() || {};
        renderReactions(reactionsHolder, reactions, messageKey);
    });

    // add click handler for quick reaction
    bubble.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showQuickReactionMenu(e.clientX, e.clientY, messageKey);
    });
    bubble.addEventListener('dblclick', (e) => {
        // double-click to like (toggle)
        toggleReaction(messageKey, '❤️');
    });

    // keyboard: press 'r' to open reaction menu when bubble focused
    bubble.addEventListener('keydown', (e) => {
        if (e.key === 'r' || (e.key === 'Enter' && e.shiftKey)) {
            const rect = bubble.getBoundingClientRect();
            showQuickReactionMenu(rect.left + rect.width/2, rect.top, messageKey);
        }
    });

    // subtle highlight if unread (optional - if msg.unread true)
    if (msg.unread) {
        bubble.style.boxShadow = '0 14px 30px rgba(255,126,177,0.08)';
    }
}

// Render reaction pills
function renderReactions(container, reactions, messageKey) {
    container.innerHTML = '';
    const entries = Object.entries(reactions || {});
    if (entries.length === 0) return;
    entries.forEach(([emoji, users]) => {
        const userMap = users || {};
        const count = Object.keys(userMap).length;
        const pill = document.createElement('div');
        pill.className = 'reaction-pill';
        pill.innerHTML = `<span aria-hidden="true">${decodeURIComponent(emoji)}</span><span style="font-weight:700;">${count}</span>`;
        pill.onclick = () => toggleReaction(messageKey, decodeURIComponent(emoji));
        container.appendChild(pill);
    });
}

// Toggle reaction: adds or removes reaction from current user (stored at messageReactions/{chatID}/{msgKey}/{emoji}/{uid} = true)
function toggleReaction(messageKey, emoji){
    const chatID = getChatID(currentUser.uid, chattingWith);
    // use encoded emoji as path (non-breaking)
    const safeEmojiKey = encodeURIComponent(emoji);
    const path = `messageReactions/${chatID}/${messageKey}/${safeEmojiKey}/${currentUser.uid}`;
    const ref = db.ref(path);
    ref.once('value').then(snap=>{
        if (snap.exists()) {
            ref.remove();
        } else {
            ref.set(true);
        }
    });
}

// Quick reaction popup (simple)
function showQuickReactionMenu(x,y,messageKey){
    const emojis = ['❤️','👍','😂','🔥','😮','😢'];
    const box = document.createElement('div');
    box.style.position='fixed';
    // keep it inside viewport
    const left = Math.max(8, Math.min(window.innerWidth - 200, x - 80));
    const top = Math.max(8, Math.min(window.innerHeight - 80, y - 60));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.background='rgba(0,0,0,0.6)';
    box.style.padding='8px';
    box.style.borderRadius='20px';
    box.style.display='flex';
    box.style.gap='6px';
    box.style.zIndex=99999;
    box.style.backdropFilter = 'blur(6px)';
    emojis.forEach(e=>{
        const btn = document.createElement('button');
        btn.innerText = e;
        btn.style.fontSize='18px';
        btn.style.background='transparent';
        btn.style.border='none';
        btn.style.cursor='pointer';
        btn.style.padding = '6px';
        btn.style.borderRadius = '8px';
        btn.onclick = ()=> {
            toggleReaction(messageKey, e);
            if (box.parentNode) document.body.removeChild(box);
        };
        box.appendChild(btn);
    });
    document.body.appendChild(box);
    const removeBox = ()=>{ if (box.parentNode) document.body.removeChild(box); window.removeEventListener('click',removeBox); };
    setTimeout(()=> window.addEventListener('click',removeBox),10);
}

// Send Message (kept signature & DB write intact)
function sendMessage() {
    const input = document.getElementById("chatInput");
    let text = input.value.trim();
    if (!text) {
        // minor UX: if there's an attachment preview but no text, send a placeholder message (safe & non-breaking)
        const attachPreview = document.getElementById('attachmentPreview');
        if (attachPreview && attachPreview.children.length > 0) {
            text = '[Attachment]';
        } else {
            return;
        }
    }

    const chatID = getChatID(currentUser.uid, chattingWith);

    // Keep your exact push data (so logic and API remain unchanged)
    db.ref("messages/" + chatID).push({
        text,
        from: currentUser.uid,
        to: chattingWith,
        time: Date.now()
    });

    // Optionally update a 'lastMessage' snapshot for list preview (non-breaking)
    db.ref(`lastMessages/${chatID}`).set({
        text,
        from: currentUser.uid,
        time: Date.now()
    }).catch(()=>{});

    // Mark unread for receiver
    db.ref(`unreads/${chattingWith}/${currentUser.uid}`).transaction(current => (current || 0) + 1).catch(()=>{});

    // Reset input and typing
    input.value = "";
    indicateTyping(false);

    // Clear attachment preview, if any (non-breaking)
    clearAttachmentPreview();

    // small send animation / feedback
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.classList.add('animate__animated','animate__pulse');
    setTimeout(()=>{ sendBtn.classList.remove('animate__animated','animate__pulse'); }, 400);

    // ensure scroll to bottom after sending
    setTimeout(()=> smoothScrollToBottom(),120);
}

// Create same chatID for both users (kept function)
function getChatID(a, b) {
    return a < b ? a + "_" + b : b + "_" + a;
}

/* Typing indicator writes */
function indicateTyping(isTyping){
    if (!chattingWith) return;
    const chatID = getChatID(currentUser.uid, chattingWith);
    const path = `typing/${chatID}/${currentUser.uid}`;
    const ref = db.ref(path);

    if (isTyping) {
        ref.set(true);
        // clear any previous timeout
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(()=> {
            ref.set(false);
        }, 2000);
    } else {
        ref.set(false);
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

// Show typing UI
function showTypingIndicator(show, name){
    const el = document.getElementById('typingIndicator');
    if (show) {
        document.getElementById('typingName').innerText = name || 'Someone';
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
    } else {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }
}

/* Utilities */

// Smooth scroll helper
function smoothScrollToBottom(){
    const msgBox = document.getElementById('messageBox');
    if (!msgBox) return;
    try {
        msgBox.scrollTo({ top: msgBox.scrollHeight, behavior: 'smooth' });
    } catch (e) {
        msgBox.scrollTop = msgBox.scrollHeight;
    }
}

// small helper to render status icons for outgoing messages
function renderStatusIcon(status){
    // status values preserved: 'sent', 'delivered', 'read' or undefined
    if (!status) return '<i class="fa-regular fa-circle" style="opacity:0.7;"></i>';
    if (status === 'sent') return '<i class="fa-solid fa-check" title="Sent"></i>';
    if (status === 'delivered') return '<i class="fa-solid fa-check-double" title="Delivered"></i>';
    if (status === 'read') return '<i class="fa-solid fa-check-double" style="color:var(--ok);" title="Read"></i>';
    return `<span>${escapeHTML(status)}</span>`;
}

// format time
function formatTime(ts){
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
        return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } else {
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
}

// timeAgo helper for list preview
function timeAgo(ts){
    if (!ts) return '';
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

// escape HTML to avoid injection in text nodes
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* Bottom Navigation (kept functions) */
function goHome(){window.location.href="app.html";}
function goGames(){window.location.href="games.html";}
function goProfile(){window.location.href="profile.html";}
function goFriends(){window.location.href="friends.html";}

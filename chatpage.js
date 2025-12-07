const urlParams = new URLSearchParams(window.location.search);
const otherId = urlParams.get("user");
let myId;

firebase.auth().onAuthStateChanged(user => {
    if (!user) return;
    myId = user.uid;

    loadUserName();
    loadMessages();
});

function loadUserName() {
    firebase.database().ref("users/" + otherId).once("value", snap => {
        document.getElementById("chatUserName").innerText = snap.val().name;
    });
}

function loadMessages() {
    const chatId = myId < otherId ? myId + "_" + otherId : otherId + "_" + myId;

    firebase.database().ref("chats/" + chatId).on("value", snap => {
        const box = document.getElementById("messages");
        box.innerHTML = "";

        snap.forEach(msg => {
            let data = msg.val();
            let div = document.createElement("div");

            div.className = data.from === myId ? "msg my" : "msg other";
            div.innerText = data.text;

            box.appendChild(div);
        });

        box.scrollTop = box.scrollHeight;
    });
}

function sendMessage() {
    let text = document.getElementById("msgInput").value;
    if (!text.trim()) return;

    const chatId = myId < otherId ? myId + "_" + otherId : otherId + "_" + myId;

    firebase.database().ref("chats/" + chatId).push({
        text,
        from: myId,
        time: Date.now()
    });

    document.getElementById("msgInput").value = "";
}

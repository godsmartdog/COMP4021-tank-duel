// View switching and lobby signalling (Lab 6 pattern).
const socket = window.io ? window.io() : null;

export function showView(viewId) {
    document.querySelectorAll("main > section").forEach((view) => {
        view.hidden = view.id !== viewId;
    });
}
window.showView = showView;
window.socket = socket;

socket.on("lobbyReady", (data) => {
    $("#lobby-ready").prop("hidden", false);
    $("#lobby-message").text("READY - " + data.players.join(" vs "));
});

socket.on("lobbyError", (message) => {
    $("#lobby-message").text(message);
});

window.Auth.init();

$("#join-lobby-button").on("click", () => {
    const user = window.Auth.getUser();
    if (!user) return;
    $("#lobby-message").text("Waiting for another player...");
    socket.emit("joinLobby", user.username);

});

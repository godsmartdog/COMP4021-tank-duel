// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup
// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup
import { GameSprites } from "./sprite.js";
import { GameAudio } from "./audio.js";
import { GameOverUI } from "./gameover.js";

// Console error self-check: writes OK or the error into #error-check.
const consoleErrors = [];
const originalConsoleError = console.error;
console.error = function () {
    consoleErrors.push(Array.prototype.join.call(arguments, " "));
    originalConsoleError.apply(console, arguments);
};
window.addEventListener("error", (event) => {
    consoleErrors.push(event.message || "Resource failed to load");
});
window.addEventListener("unhandledrejection", (event) => {
    consoleErrors.push(String(event.reason));
});
window.addEventListener("load", () => {
    if (typeof window.jQuery !== "function") consoleErrors.push("jQuery failed to load");
});

function updateErrorCheck() {
    const div = document.getElementById("error-check");
    if (!div) return;
    if (consoleErrors.length === 0) {
        div.textContent = "OK";
        div.style.color = "green";
    } else {
        div.textContent = "ERROR: " + consoleErrors.join(" | ");
        div.style.color = "red";
    }
}
setInterval(updateErrorCheck, 500);
window.addEventListener("load", updateErrorCheck);

export const socket = window.io ? window.io() : null;

export function showView(viewId) {
  document.querySelectorAll("main > section").forEach((view) => {
    view.hidden = view.id !== viewId;
  });
}

// Role 3: Preload sprites & bind Game Over screen to shared socket
GameSprites.preload();
GameOverUI.init(socket, {
  showView,
  onBackToHome: () => {
    if (socket) socket.emit("getLobby");
  }
});

window.showView = showView;
window.socket = socket;

// Role 2: auth callback + lobby signalling (additive).
window.Auth.init((currentUser) => {
  GameOverUI.setCurrentUser(currentUser);
});

socket.on("lobbyReady", (data) => {
  $("#lobby-ready").prop("hidden", false);
  $("#lobby-message").text("READY - " + data.players.join(" vs "));
});

socket.on("lobbyError", (message) => {
  $("#lobby-message").text(message);
});

$("#join-lobby-button").on("click", () => {
  const signedInUser = window.Auth.getUser();
  if (!signedInUser) return;
  $("#lobby-message").text("Waiting for another player...");
  socket.emit("joinLobby", signedInUser.username);
});


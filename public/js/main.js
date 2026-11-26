// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup
import { GameSprites } from "./sprite.js";
import { GameOverUI } from "./gameover.js";
import { HomePage } from "./home.js";
import { PRACTICE, bootGame } from "./game_boot.js";

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

// In practice mode there is no server match, so don't open a real socket.
export const socket = (!PRACTICE && window.io) ? window.io() : null;
if (!PRACTICE && !socket) consoleErrors.push("Socket.IO failed to load");

export function showView(viewId) {
  document.querySelectorAll("main > section").forEach((view) => {
    view.hidden = view.id !== viewId;
  });
  window.scrollTo(0, 0);
}

// Preload sprites and bind the game-over screen to the shared socket.
// (Practice mode binds the game-over screen to the local match instead.)
GameSprites.preload();
if (!PRACTICE) {
  GameOverUI.init(socket, {
    showView,
    onBackToHome: () => {
      if (socket) socket.emit("getLobby");
    }
  });
}

window.showView = showView;
window.socket = socket;

if (!PRACTICE && socket) {
  HomePage.init(socket);

  window.Auth.init((currentUser) => {
    const user = window.Auth.getUser() || currentUser;
    GameOverUI.setCurrentUser(user);
    HomePage.setUser(user);
  });
}

// Canvas renderer, input, HUD and practice mode.
bootGame(socket, showView);

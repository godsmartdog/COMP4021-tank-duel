// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup
// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup
import { GameSprites } from "./sprite.js";
import { GameAudio } from "./audio.js";
import { GameOverUI } from "./gameover.js";

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


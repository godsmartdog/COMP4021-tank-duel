// View switching (Home <-> Game <-> GameOver) & Socket.IO client setup

const socket = window.io ? window.io() : null;

export function showView(viewId) {
  document.querySelectorAll("main > section").forEach((view) => {
    view.hidden = view.id !== viewId;
  });
}

window.showView = showView;
window.socket = socket;

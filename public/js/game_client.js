// HTML5 Canvas rendering loop, keyboard/mouse listeners, audio triggers

const canvas = document.getElementById("game-canvas");
const context = canvas?.getContext("2d");

export function render() {
  if (!context || !canvas) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  requestAnimationFrame(render);
}

render();

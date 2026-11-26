// Game-play page bootstrap. Keeps the shared `main.js` entry point small.
import { GameSprites } from "./sprite.js";
import { GameOverUI } from "./gameover.js";
import { GameClient } from "./game_client.js";

const params = new URLSearchParams(window.location.search);
export const PRACTICE = params.get("practice") === "1";

// The tank PNGs live one directory deeper than `SPRITE_CONFIG` says.
["blue", "green", "red", "yellow"].forEach((color) => {
    const tank = GameSprites.CONFIG && GameSprites.CONFIG.tanks[color];
    if (tank) tank.file = `tank/tank_${color}/tank_${color}.png`;
});

// Power-up sheet rows: 0 shield, 1 purple triple-shot, 2 orange speed boost.
if (GameSprites.CONFIG && GameSprites.CONFIG.powerup) {
    GameSprites.CONFIG.powerup.rowsByType = { shield: 0, speed: 2, triple: 1 };
}

// "Play vs Bot" on the home screen opens the local practice mode.
const playBotBtn = document.getElementById("play-bot-button");
if (playBotBtn) {
    playBotBtn.addEventListener("click", () => {
        window.location.href = `${window.location.pathname}?practice=1`;
    });
}

function showPracticeHome() {
    const authCard = document.getElementById("hs-auth-card");
    if (authCard) authCard.hidden = true;

    const quickCard = document.getElementById("hs-quick-card");
    if (quickCard) quickCard.hidden = true;

    const lobby = document.getElementById("lobby-section");
    if (lobby) lobby.hidden = false;

    const heading = document.getElementById("hs-lobby-heading");
    if (heading) heading.textContent = "Practice match";

    const msg = document.getElementById("lobby-message");
    if (msg) msg.textContent = "Practice mode — face the bot in a local match.";

    const joinBtn = document.getElementById("join-lobby-button");
    if (joinBtn) {
        joinBtn.textContent = "Start practice match";
        joinBtn.disabled = false;
    }

    const ready = document.getElementById("lobby-ready");
    if (ready) ready.hidden = true;

    const dot = document.getElementById("hs-lobby-dot");
    if (dot) dot.className = "hs-lobby-dot";

    const radar = document.getElementById("hs-radar");
    if (radar) radar.className = "hs-radar";
}

async function startPracticeMode(showView) {
    const { LocalMatch } = await import("./local_match.js");
    const net = LocalMatch.createNet();
    window.socket = net;

    GameClient.init(net, { showView });
    GameOverUI.init(net, {
        showView,
        onBackToHome: () => {
            GameClient.stop();
            LocalMatch.stop();
            showPracticeHome();
        }
    });

    // The game-over screen uses this to show "you" and win/lose correctly.
    GameOverUI.setCurrentUser({ username: "you", name: "You" });

    showPracticeHome();

    const joinBtn = document.getElementById("join-lobby-button");
    if (joinBtn) {
        joinBtn.addEventListener("click", () => {
            const msg = document.getElementById("lobby-message");
            if (msg) msg.textContent = "Practice match starting…";
            showView("game-view");
            LocalMatch.start(net);
        });
    }

    showView("game-view");
    LocalMatch.start(net);
}

export function bootGame(socket, showView) {
    if (PRACTICE) {
        startPracticeMode(showView);
        return;
    }

    if (socket) GameClient.init(socket, { showView });
}

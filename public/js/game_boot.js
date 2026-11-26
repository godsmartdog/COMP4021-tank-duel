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

// "Play vs Bot" on the home screen opens the local practice mode.
const playBotBtn = document.getElementById("play-bot-button");
if (playBotBtn) {
    playBotBtn.addEventListener("click", () => {
        window.location.href = `${window.location.pathname}?practice=1`;
    });
}

function showPracticeHome() {
    const authButtons = document.getElementById("auth-buttons");
    if (authButtons) authButtons.hidden = true;

    const playBotBtn = document.getElementById("play-bot-button");
    if (playBotBtn) playBotBtn.hidden = true;

    const signedInAs = document.getElementById("signed-in-as");
    if (signedInAs) signedInAs.textContent = "Practice mode — play against the bot.";

    const lobby = document.getElementById("lobby-section");
    if (lobby) lobby.hidden = false;

    const joinBtn = document.getElementById("join-lobby-button");
    if (joinBtn) joinBtn.textContent = "Start practice match";

    const ready = document.getElementById("lobby-ready");
    if (ready) ready.hidden = true;
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

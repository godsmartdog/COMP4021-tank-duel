/**
 * public/js/audio.js
 * Role 3 (FelixMau) - HTML5 <audio> Sound & BGM Manager
 */
const GameAudio = (function () {
    const BASE_PATH = "/assets/audio/";
    let muted = false;

    const tracks = {};
    const trackDefs = {
        bgm:       { file: "background.mp3", loop: true,  volume: 0.35 },
        shoot:     { file: "laserShoot.wav", loop: false, volume: 0.55 },
        bounce:    { file: "blipSelect.wav", loop: false, volume: 0.45 },
        powerup:   { file: "collect.mp3",    loop: false, volume: 0.65 },
        explosion: { file: "explosion.wav",  loop: false, volume: 0.75 },
        victory:   { file: "victory.wav",    loop: false, volume: 0.75 },
        gameover:  { file: "gameover.mp3",   loop: false, volume: 0.70 }
    };

    function initAudioTags() {
        Object.keys(trackDefs).forEach((name) => {
            if (tracks[name]) return;
            const def = trackDefs[name];
            const audioEl = new Audio(BASE_PATH + def.file);
            audioEl.preload = "auto";
            audioEl.loop = def.loop;
            audioEl.volume = def.volume;
            audioEl.style.display = "none";
            if (document.body) document.body.appendChild(audioEl);
            tracks[name] = audioEl;
        });
    }

    /**
     * Plays a sound effect from 0:00 (Lab 3 Section 6.1 convention)
     * @param {"shoot"|"bounce"|"powerup"|"explosion"|"victory"|"gameover"} name
     */
    function play(name) {
        initAudioTags();
        if (muted || !tracks[name]) return;
        tracks[name].currentTime = 0;
        tracks[name].play().catch(() => {});
    }

    function startBGM() {
        initAudioTags();
        if (muted || !tracks.bgm) return;
        ["victory", "gameover"].forEach((k) => {
            if (tracks[k]) {
                tracks[k].pause();
                tracks[k].currentTime = 0;
            }
        });
        tracks.bgm.currentTime = 0;
        tracks.bgm.play().catch(() => {});
    }

    function stopBGM() {
        if (tracks.bgm) {
            tracks.bgm.pause();
            tracks.bgm.currentTime = 0;
        }
    }

    /**
     * Stops BGM and plays `victory.wav` if the player won, or `gameover.mp3` if lost/draw.
     * @param {boolean} isVictory
     */
    function playGameEnd(isVictory) {
        stopBGM();
        play(isVictory ? "victory" : "gameover");
    }

    function toggleMute() {
        initAudioTags();
        muted = !muted;
        Object.values(tracks).forEach((t) => {
            t.muted = muted;
        });
        return muted;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAudioTags);
    } else {
        initAudioTags();
    }

    return {
        play,
        startBGM,
        stopBGM,
        playGameEnd,
        playGameOver: () => playGameEnd(false),
        toggleMute
    };
})();

const playSound = GameAudio.play;
window.GameAudio = GameAudio;
window.playSound = playSound;

export { GameAudio, playSound };

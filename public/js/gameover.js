
const GameOverUI = (function () {
    let socket = null;
    let currentRoomId = null;
    let currentUsername = null;
    let hooks = { showView: null, onBackToHome: null, onRematchStart: null };

    const byId = (id) => document.getElementById(id);

    function esc(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function formatTime(sec) {
        const s = Math.max(0, Number(sec || 0));
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
    }

    function switchView(viewId) {
        if (hooks.showView) return hooks.showView(viewId);
        document.querySelectorAll("main > section").forEach((view) => {
            view.hidden = view.id !== viewId;
        });
    }

    function showGameOver(data) {
        currentRoomId = data.roomId || null;

        // 1. Trigger victory.wav vs gameover.mp3
        const didWin = !data.isDraw && Boolean(
            currentUsername ? data.winner === currentUsername : data.winner
        );
        if (window.GameAudio) window.GameAudio.playGameEnd(didWin);
        if (window.GameSprites) window.GameSprites.resetAll();

        switchView("game-over-view");

        const players = data.players || [];
        const p1 = players[0] || { name: "Player 1", username: "p1", color: "blue", kills: 0, deaths: 0, shotsFired: 0, accuracy: 0, ricochetKills: 0, powerupsCollected: 0, outcome: "DRAW" };
        const p2 = players[1] || { name: "Player 2", username: "p2", color: "red", kills: 0, deaths: 0, shotsFired: 0, accuracy: 0, ricochetKills: 0, powerupsCollected: 0, outcome: "DRAW" };

        // 2. Top Banner & Match Conclusion
        const reasonLabels = {
            kills: "FIRST TO 3 KILLS",
            timeout: "3:00 TIME LIMIT REACHED",
            disconnect: "OPPONENT DISCONNECTED"
        };
        const titleEl = byId("go-title");
        titleEl.className = "io-title";

        if (data.isDraw) {
            titleEl.textContent = "DRAW MATCH!";
            titleEl.classList.add("is-draw");
        } else if (currentUsername) {
            const won = data.winner === currentUsername;
            titleEl.textContent = won ? "VICTORY!" : "DEFEAT";
            titleEl.classList.add(won ? "is-win" : "is-lose");
        } else {
            titleEl.textContent = `${data.winnerName || data.winner} WINS!`;
            titleEl.classList.add("is-win");
        }

        byId("go-outcome-pill").textContent = reasonLabels[data.reason] || "MATCH COMPLETE";
        byId("go-summary").textContent =
            `Match Duration: ${formatTime(data.durationSeconds)} • Arena ${data.roomId || "1v1"}`;

        // 3. 1v1 Head-to-Head Duel Scoreboard
        const renderSide = (pl, alignRight) => {
            const c = ["blue", "red", "green", "yellow"].includes(pl.color) ? pl.color : "blue";
            const tagCls = pl.outcome === "WIN" ? "tag-win" : pl.outcome === "DRAW" ? "tag-draw" : "tag-lose";
            const tagText = pl.outcome === "WIN" ? "👑 WINNER" : pl.outcome;
            const youLabel = currentUsername && pl.username === currentUsername ? " (YOU)" : "";
            return `
                <div class="io-vs-player ${alignRight ? "right" : ""}">
                    <div class="io-tank-dot tank-${c}">${esc((pl.name || "P")[0].toUpperCase())}</div>
                    <div>
                        <div class="io-vs-name">${esc(pl.name)}${youLabel}</div>
                        <span class="io-vs-tag ${tagCls}">${tagText}</span>
                    </div>
                </div>
            `;
        };
        byId("go-versus-card").innerHTML = `
            ${renderSide(p1, false)}
            <div class="io-vs-score">${p1.kills} : ${p2.kills}</div>
            ${renderSide(p2, true)}
        `;

        // 4. Personal Highlight KPI Tiles (shows signed-in player's stats, or winner's if spectator)
        const me = players.find((pl) => pl.username === currentUsername) || p1;
        byId("go-kpi-grid").innerHTML = `
            <div class="io-kpi-tile">
                <div class="io-kpi-val">${me.kills}</div>
                <div class="io-kpi-label">KILLS SCORED</div>
            </div>
            <div class="io-kpi-tile">
                <div class="io-kpi-val">${me.accuracy}%</div>
                <div class="io-kpi-label">SHOT ACCURACY</div>
            </div>
            <div class="io-kpi-tile">
                <div class="io-kpi-val">${me.ricochetKills}</div>
                <div class="io-kpi-label">RICOCHET KILLS</div>
            </div>
            <div class="io-kpi-tile">
                <div class="io-kpi-val">${me.powerupsCollected}</div>
                <div class="io-kpi-label">POWER-UPS</div>
            </div>
        `;

        // 5. Both Players' Full Match Statistics Table (10 Marks)
        byId("go-stats-tbody").innerHTML = players.map((pl) => {
            const isMe = currentUsername && pl.username === currentUsername;
            return `
                <tr class="${isMe ? "is-me" : ""}">
                    <td>${esc(pl.name)}${isMe ? " ★" : ""}</td>
                    <td>${pl.kills} / ${pl.deaths}</td>
                    <td>${pl.shotsFired}</td>
                    <td>${pl.accuracy}%</td>
                    <td>${pl.ricochetKills}</td>
                    <td>${pl.powerupsCollected}</td>
                </tr>
            `;
        }).join("");

        // 6. Diep.io Progress-Bar Global Ranking (10 Marks)
        const lb = data.leaderboard || [];
        const maxWins = Math.max(1, ...lb.map((r) => r.wins || 0));
        byId("go-rank-list").innerHTML = lb.map((r) => {
            const pct = Math.max(8, Math.round(((r.wins || 0) / maxWins) * 100));
            const rankCls = r.rank <= 3 ? `rank-${r.rank}` : "";
            const meCls = currentUsername && r.username === currentUsername ? "is-me" : "";
            return `
                <div class="io-rank-row ${rankCls} ${meCls}">
                    <div class="io-rank-bar" style="width: ${pct}%;"></div>
                    <div class="io-rank-content">
                        <div class="io-rank-left">
                            <span class="io-medal">#${r.rank}</span>
                            <span>${esc(r.name)}</span>
                        </div>
                        <div class="io-rank-metrics">
                            <span class="io-wins-pill">${r.wins}W</span>
                            <span>${r.kills} Kills</span>
                            <span>${r.accuracy}% Acc</span>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // 7. Reset Arcade Restart Button (10 Marks)
        const disconnected = data.reason === "disconnect";
        const restartBtn = byId("go-restart-btn");
        restartBtn.disabled = disconnected;
        restartBtn.textContent = "▶ PLAY AGAIN";
        byId("go-rematch-msg").textContent =
            disconnected ? "Opponent left the arena — click HOME LOBBY to pair up again." : "";
    }

    function init(sharedSocket, options = {}) {
        socket = sharedSocket;
        hooks = Object.assign(hooks, options);

        byId("go-restart-btn")?.addEventListener("click", () => {
            const btn = byId("go-restart-btn");
            btn.disabled = true;
            btn.textContent = "⏳ WAITING FOR OPPONENT...";
            if (socket) {
                socket.emit("requestRematch", { roomId: currentRoomId, username: currentUsername });
            }
        });

        byId("go-home-btn")?.addEventListener("click", () => {
            if (socket && currentRoomId) {
                socket.emit("leaveGameOver", { roomId: currentRoomId });
            }
            currentRoomId = null;
            switchView("home-view");
            if (hooks.onBackToHome) hooks.onBackToHome();
        });

        if (!socket) return;

        socket.on("gameOver", showGameOver);

        socket.on("rematchStatus", (info) => {
            byId("go-rematch-msg").textContent = info.message || "";
            if (info.status === "unavailable") byId("go-restart-btn").disabled = true;
        });

        socket.on("rematchStart", (matchData) => {
            currentRoomId = matchData.roomId;
            if (window.GameAudio) window.GameAudio.startBGM();
            switchView("game-view");
            if (hooks.onRematchStart) hooks.onRematchStart(matchData);
        });
    }

    function setCurrentUser(user) {
        currentUsername = user ? user.username : null;
    }

    return { init, setCurrentUser, showGameOver };
})();

window.GameOverUI = GameOverUI;
export { GameOverUI };

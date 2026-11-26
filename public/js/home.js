// Game start page: profile, matchmaking and leaderboard.
export const HomePage = (function () {
  let socket = null;
  let currentUser = null;
  let lobbyState = "idle";
  let leaderboard = [];
  let pairedTimer = 0;

  const byId = (id) => document.getElementById(id);

  function init(sharedSocket) {
    socket = sharedSocket || null;
    renderProfile();
    resetLobby();
    bindLobby();
    bindSocket();
    loadLeaderboard();
  }

  function setUser(user) {
    currentUser = user || null;
    renderProfile();
    renderLeaderboard();
    resetLobby();
    if (currentUser) loadLeaderboard();
  }

  /* ------------------------------------------------------------------
   * Profile / auth panel
   * ---------------------------------------------------------------- */

  function renderProfile() {
    const profile = byId("hs-profile");
    const guest = byId("hs-auth-guest");
    if (!profile || !guest) return;

    if (!currentUser) {
      profile.hidden = true;
      guest.hidden = false;
      return;
    }

    profile.hidden = false;
    guest.hidden = true;

    const name = currentUser.name || currentUser.username || "Player";
    const username = currentUser.username || "player";
    const color = ["blue", "red", "green", "yellow"].includes(currentUser.avatar)
      ? currentUser.avatar
      : "blue";

    const avatar = byId("hs-profile-avatar");
    if (avatar) {
      avatar.textContent = (name[0] || "P").toUpperCase();
      avatar.className = `hs-profile-avatar tank-${color}`;
    }

    const nameEl = byId("hs-profile-name");
    const usernameEl = byId("hs-profile-username");
    if (nameEl) nameEl.textContent = name;
    if (usernameEl) usernameEl.textContent = `@${username}`;
  }

  /* ------------------------------------------------------------------
   * Matchmaking
   * ---------------------------------------------------------------- */

  function bindLobby() {
    const joinBtn = byId("join-lobby-button");
    if (joinBtn) joinBtn.addEventListener("click", joinLobby);
  }

  function joinLobby() {
    if (!socket || !socket.connected) {
      setLobbyState("error", "Not connected to the server — try again.");
      return;
    }
    if (!currentUser) {
      setLobbyState("error", "Sign in before searching for a match.");
      return;
    }
    if (lobbyState === "searching" || lobbyState === "paired") return;

    setLobbyState("searching", "Searching for an opponent…");
    socket.emit("joinLobby", currentUser.username);
  }

  function bindSocket() {
    if (!socket) return;

    socket.on("lobbyReady", (data) => {
      const players = (data && data.players) || [];
      const text = players.length >= 2
        ? `Opponent found: ${players.join(" vs ")}`
        : "Opponent found!";

      setLobbyState("paired", text);

      clearTimeout(pairedTimer);
      pairedTimer = setTimeout(() => {
        const msg = byId("lobby-message");
        if (lobbyState === "paired" && msg) {
          msg.textContent = `${text} — waiting for the arena…`;
        }
      }, 1200);
    });

    socket.on("lobbyError", (message) => {
      setLobbyState("error", message || "Could not join the lobby.");
    });

    socket.on("matchStart", () => {
      clearTimeout(pairedTimer);
      setLobbyState("idle", "Match starting…");
      setTimeout(resetLobby, 900);
    });

    socket.on("gameOver", () => {
      clearTimeout(pairedTimer);
      resetLobby();
      setTimeout(loadLeaderboard, 500);
    });

    socket.on("disconnect", () => {
      setLobbyState("error", "Connection lost — reconnecting…");
    });

    socket.on("connect", () => {
      if (lobbyState === "error") {
        setLobbyState("idle", "Ready to search for an opponent.");
      }
    });
  }

  function setLobbyState(state, message) {
    lobbyState = state;

    const msg = byId("lobby-message");
    if (msg && message) msg.textContent = message;

    const ready = byId("lobby-ready");
    if (ready) {
      ready.hidden = state !== "paired";
      ready.textContent = state === "paired" ? "MATCH READY" : "";
    }

    const labels = { searching: "Searching…", paired: "Opponent Found" };
    const joinBtn = byId("join-lobby-button");
    if (joinBtn) {
      joinBtn.disabled = state === "searching" || state === "paired";
      joinBtn.textContent = labels[state] || "Find Match";
    }

    const suffix =
      { searching: " is-searching", paired: " is-ready", error: " is-error" }[
        state
      ] || "";

    const dot = byId("hs-lobby-dot");
    if (dot) dot.className = "hs-lobby-dot" + suffix;

    const radar = byId("hs-radar");
    if (radar) radar.className = "hs-radar" + suffix;
  }

  function resetLobby() {
    clearTimeout(pairedTimer);
    setLobbyState("idle", "Ready to search for an opponent.");
  }

  /* ------------------------------------------------------------------
   * Leaderboard
   * ---------------------------------------------------------------- */

  function loadLeaderboard() {
    fetch("/leaderboard")
      .then((res) => res.json())
      .then((json) => {
        const rows = Array.isArray(json.leaderboard) ? json.leaderboard : [];
        leaderboard = rows.filter(
          (row) =>
            row &&
            typeof row.username === "string" &&
            !row.username.startsWith("_") &&
            row.username !== "users"
        );
        renderLeaderboard();
      })
      .catch(() => {
        const el = byId("hs-leaderboard");
        if (el) el.innerHTML = '<p class="hs-muted">Leaderboard unavailable right now.</p>';
      });
  }

  function renderLeaderboard() {
    const el = byId("hs-leaderboard");
    if (!el) return;

    if (!leaderboard.length) {
      el.innerHTML = '<p class="hs-muted">No ranked commanders yet — be the first.</p>';
      return;
    }

    const maxWins = Math.max(1, ...leaderboard.map((row) => Number(row.wins) || 0));

    el.innerHTML = leaderboard
      .slice(0, 6)
      .map((row, index) => {
        const rank = Number(row.rank) || index + 1;
        const wins = Number(row.wins) || 0;
        const kills = Number(row.kills) || 0;
        const accuracy = Number(row.accuracy) || 0;
        const width = Math.max(6, Math.round((wins / maxWins) * 100));
        const me =
          currentUser && row.username === currentUser.username ? " is-me" : "";

        return `
          <div class="hs-lb-row${me}">
            <div class="hs-lb-bar" style="width:${width}%"></div>
            <div class="hs-lb-content">
              <div class="hs-lb-left">
                <span class="hs-lb-rank">#${rank}</span>
                <span class="hs-lb-name">${escapeHtml(row.name || row.username)}</span>
              </div>
              <div class="hs-lb-metrics">
                <span>${wins}W</span>
                <span>${kills}K</span>
                <span>${accuracy}%</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return { init, setUser, refreshLeaderboard: loadLeaderboard };
})();

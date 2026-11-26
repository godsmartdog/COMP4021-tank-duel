// HTML5 Canvas rendering loop, keyboard/mouse listeners, HUD & audio triggers
import { GameSprites } from "./sprite.js";
import { GameAudio, playSound } from "./audio.js";

const DEFAULTS = {
  arenaW: 1200,
  arenaH: 800,
  tile: 50,
  killsToWin: 3,
  matchSeconds: 180,
  tickMs: 1000 / 30
};

const KEYMAP = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right"
};

const COLORS = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308"
};

const TYPE_COLORS = {
  shield: "#22d3ee",
  speed: "#a855f7",
  triple: "#f59e0b"
};

export const GameClient = (function () {
  const S = {
    net: null,
    hooks: {},
    running: false,
    raf: 0,
    inputTimer: 0,

    you: null,
    roomId: null,
    order: [],
    config: Object.assign({}, DEFAULTS),
    walls: [],
    pads: [],
    spawns: [],

    prev: null,
    cur: null,
    curAt: 0,

    keys: { up: false, down: false, left: false, right: false },
    mouse: { x: 600, y: 400, inside: false },
    shooting: false,
    aim: 0,

    hud: null,
    pipEls: { p1: [], p2: [] },
    hudAt: 0,
    lastPhase: null,
    killRows: [],
    toastTimer: 0,
    hintTimer: 0,
    countdownTimer: 0,

    shakeUntil: 0,
    lastShootSound: 0,
    lastBounceSound: 0,
    flashes: [],

    canvas: null,
    ctx: null,
    dpr: 1,
    mazeCanvas: null,

    muted: false,
    audioUnlocked: false,
    reducedMotion: false,
    bound: false
  };

  const byId = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const validColor = (c) => (COLORS[c] ? c : "blue");

  function lerpAngle(a, b, t) {
    const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + d * t;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function secondsLabel(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${Math.ceil(n)}s` : "";
  }

  function nameOf(username) {
    const p = S.cur && (S.cur.players || []).find((x) => x.username === username);
    return p ? (p.name || p.username) : (username || "Unknown");
  }

  function getMe(state = S.cur) {
    if (!state) return null;
    return (state.players || []).find((p) => p.username === S.you) || null;
  }

  function getOpponent(state = S.cur) {
    if (!state) return null;
    return (state.players || []).find((p) => p.username !== S.you) || null;
  }

  /* ======================================================================
   * Public API
   * ==================================================================== */

  function init(net, hooks = {}) {
    S.net = net;
    S.hooks = hooks || {};
    S.canvas = byId("game-canvas");
    S.ctx = S.canvas ? S.canvas.getContext("2d") : null;
    S.reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    cacheHud();
    setupCanvas();
    restoreMute();
    bindInput();
    bindNet();
  }

  function startMatch(payload) {
    if (!payload) return;

    // Clear any previous loop / audio before starting the new match.
    stop();

    S.you =
      payload.you ||
      (payload.players && payload.players[0] && payload.players[0].username) ||
      null;
    S.roomId = payload.roomId || null;
    S.config = Object.assign({}, DEFAULTS, payload.config || {});
    S.walls = Array.isArray(payload.walls) ? payload.walls : [];
    S.pads = Array.isArray(payload.pads) ? payload.pads : [];
    S.spawns = (payload.players || []).map((p) => ({ x: p.x, y: p.y, color: p.color }));
    S.order = (payload.players || []).map((p) => p.username);

    S.prev = null;
    S.cur = null;
    S.curAt = performance.now();
    S.lastPhase = null;
    S.hudAt = 0;
    S.shakeUntil = 0;
    S.flashes = [];
    S.aim = 0;
    S.shooting = false;
    S.keys = { up: false, down: false, left: false, right: false };

    clearKillFeed();
    if (S.hud) {
      S.hud.toast.hidden = true;
      S.hud.connection.hidden = true;
      S.hud.dead.hidden = true;
      S.hud.countdown.hidden = true;
      S.hud.cheatBanner.hidden = true;
      S.hud.cheatBtn.classList.remove("is-on");
      S.hud.timer.className = "gp-timer";
      S.hud.timer.textContent = formatTime(S.config.matchSeconds);
      S.hud.goal.textContent = `FIRST TO ${S.config.killsToWin} KILLS`;
    }

    setupCanvas();
    buildMazeCache();
    renderMatchPlayers(payload.players || []);
    buildPips();

    // Default aim: face the opponent until the mouse moves.
    const me = (payload.players || []).find((p) => p.username === S.you);
    const opp = (payload.players || []).find((p) => p.username !== S.you);
    if (me && opp) S.aim = Math.atan2(opp.y - me.y, opp.x - me.x);

    if (S.hud && S.hud.hint) {
      S.hud.hint.classList.remove("is-hidden");
      clearTimeout(S.hintTimer);
      S.hintTimer = setTimeout(() => S.hud.hint.classList.add("is-hidden"), 8000);
    }

    GameSprites.resetAll();
    if (S.hooks.showView) S.hooks.showView("game-view");
    GameAudio.startBGM();

    // A synthetic first frame so the arena is visible during the countdown.
    S.cur = {
      roomId: S.roomId,
      phase: "countdown",
      timeLeft: S.config.matchSeconds,
      startsIn: Math.max(1, (payload.startsInMs || 3000) / 1000),
      players: (payload.players || []).map((p) => ({
        username: p.username,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        isMoving: false,
        hasShield: false,
        speedBoost: false,
        tripleShot: false,
        cheatMode: false,
        isDead: false,
        respawnIn: 0,
        invulnerable: false
      })),
      bullets: [],
      powerups: [],
      events: []
    };
    S.curAt = performance.now();
    S.lastPhase = "countdown";

    S.running = true;
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
    clearInterval(S.inputTimer);
    S.inputTimer = setInterval(sendInput, S.config.tickMs);
  }

  function pushState(state) {
    if (!state || !S.running) return;
    S.prev = S.cur;
    S.cur = state;
    S.curAt = performance.now();

    if (Array.isArray(state.events)) handleEvents(state.events);

    GameSprites.pruneEntities(
      (state.bullets || []).map((b) => b.id),
      (state.powerups || []).map((p) => p.id)
    );
  }

  function stop() {
    S.running = false;
    cancelAnimationFrame(S.raf);
    clearInterval(S.inputTimer);
    clearTimeout(S.hintTimer);
    clearTimeout(S.countdownTimer);

    S.shooting = false;
    S.keys = { up: false, down: false, left: false, right: false };

    GameAudio.stopBGM();
    if (S.hud) {
      S.hud.dead.hidden = true;
      S.hud.countdown.hidden = true;
    }
  }

  /* ======================================================================
   * Networking
   * ==================================================================== */

  function bindNet() {
    if (!S.net || typeof S.net.on !== "function") return;
    S.net.on("matchStart", startMatch);
    S.net.on("gameState", pushState);
    S.net.on("gameOver", stop);
    S.net.on("disconnect", () => {
      if (S.running && S.hud) S.hud.connection.hidden = false;
    });
    S.net.on("connect", () => {
      if (S.hud) S.hud.connection.hidden = true;
    });
  }

  /* ======================================================================
   * Input
   * ==================================================================== */

  function bindInput() {
    if (S.bound) return;
    S.bound = true;

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInput);
    window.addEventListener("mouseup", () => {
      S.shooting = false;
    });
    window.addEventListener("resize", () => setupCanvas());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearInput();
    });
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    if (S.canvas) {
      S.canvas.addEventListener("mousemove", onMouseMove);
      S.canvas.addEventListener("mouseenter", onMouseMove);
      S.canvas.addEventListener("mouseleave", () => {
        S.mouse.inside = false;
        S.shooting = false;
      });
      S.canvas.addEventListener("mousedown", onMouseDown);
      S.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    if (S.hud) {
      S.hud.cheatBtn.addEventListener("click", () => {
        if (S.running && S.net) S.net.emit("toggleCheat");
      });
      S.hud.muteBtn.addEventListener("click", toggleMute);
    }
  }

  function onKeyDown(e) {
    if (!S.running) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const mapped = KEYMAP[e.code];
    if (mapped) {
      S.keys[mapped] = true;
      e.preventDefault();
    }
    if (e.code === "Space") {
      S.shooting = true;
      e.preventDefault();
    }
    if (e.code === "KeyC" && !e.repeat && S.net) {
      S.net.emit("toggleCheat");
    }
  }

  function onKeyUp(e) {
    const mapped = KEYMAP[e.code];
    if (mapped) S.keys[mapped] = false;
    if (e.code === "Space") S.shooting = false;
  }

  function clearInput() {
    S.keys = { up: false, down: false, left: false, right: false };
    S.shooting = false;
  }

  function onMouseMove(e) {
    updateMouse(e);
    S.mouse.inside = true;
  }

  function onMouseDown(e) {
    if (!S.running || e.button !== 0) return;
    updateMouse(e);
    S.mouse.inside = true;
    S.shooting = true;
    e.preventDefault();
  }

  function updateMouse(e) {
    if (!S.canvas) return;
    const rect = S.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    S.mouse.x = clamp(
      ((e.clientX - rect.left) * S.config.arenaW) / rect.width,
      0,
      S.config.arenaW
    );
    S.mouse.y = clamp(
      ((e.clientY - rect.top) * S.config.arenaH) / rect.height,
      0,
      S.config.arenaH
    );
  }

  function sendInput() {
    if (!S.running || !S.net) return;

    const me = getMe();
    if (me) {
      if (S.mouse.inside) {
        S.aim = Math.atan2(S.mouse.y - me.y, S.mouse.x - me.x);
      } else {
        const opp = getOpponent();
        if (opp) S.aim = Math.atan2(opp.y - me.y, opp.x - me.x);
      }
    }

    S.net.emit("input", {
      up: S.keys.up,
      down: S.keys.down,
      left: S.keys.left,
      right: S.keys.right,
      aim: S.aim,
      shoot: S.shooting
    });
  }

  function unlockAudio() {
    if (S.audioUnlocked) return;
    S.audioUnlocked = true;
    if (S.running) GameAudio.startBGM();
  }

  /* ======================================================================
   * Frame loop
   * ==================================================================== */

  function frame(now) {
    if (!S.running) return;
    S.raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    render(now);
    updateHud(now);
  }

  function interpolate(now) {
    const alpha = clamp((now - S.curAt) / S.config.tickMs, 0, 1.25);
    const prevPlayers = new Map(
      ((S.prev && S.prev.players) || []).map((p) => [p.username, p])
    );
    const prevBullets = new Map(
      ((S.prev && S.prev.bullets) || []).map((b) => [b.id, b])
    );

    const players = ((S.cur && S.cur.players) || []).map((p) => {
      const q = prevPlayers.get(p.username);
      if (!q) return p;
      return {
        ...p,
        x: q.x + (p.x - q.x) * alpha,
        y: q.y + (p.y - q.y) * alpha,
        angle: lerpAngle(q.angle || 0, p.angle || 0, alpha)
      };
    });

    const bullets = ((S.cur && S.cur.bullets) || []).map((b) => {
      const q = prevBullets.get(b.id);
      if (!q) return b;
      return {
        ...b,
        x: q.x + (b.x - q.x) * alpha,
        y: q.y + (b.y - q.y) * alpha
      };
    });

    return { players, bullets, alpha };
  }

  function render(now) {
    if (!S.ctx || !S.cur) return;

    const ctx = S.ctx;
    const W = S.config.arenaW;
    const H = S.config.arenaH;
    const { players, bullets } = interpolate(now);

    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    // Screen shake (disabled for reduced-motion users).
    if (!S.reducedMotion && now < S.shakeUntil) {
      const k = Math.max(0, (S.shakeUntil - now) / 220);
      ctx.translate((Math.random() - 0.5) * 9 * k, (Math.random() - 0.5) * 9 * k);
    }

    // 1. Cached floor + walls + pads
    if (S.mazeCanvas) {
      ctx.drawImage(S.mazeCanvas, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#0b111e";
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Power-ups (spinning + bobbing)
    (S.cur.powerups || []).forEach((item, i) => {
      const bob = Math.sin(now / 300 + i * 1.7) * 3;
      const color = TYPE_COLORS[item.type] || "#a855f7";
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(now / 260 + i);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      GameSprites.drawPowerUp(ctx, { ...item, y: item.y + bob }, now);
    });

    // 3. Local aim laser sight
    drawAimSight(ctx, players, now);

    // 4. Bullets
    bullets.forEach((b) => {
      if (b.cheat) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      GameSprites.drawBullet(ctx, { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy }, now);
    });

    // 5. Muzzle flashes
    for (let i = S.flashes.length - 1; i >= 0; i--) {
      const f = S.flashes[i];
      const age = now - f.t;
      if (age > 120) {
        S.flashes.splice(i, 1);
        continue;
      }
      const k = 1 - age / 120;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = f.cheat ? "#facc15" : "#fde68a";
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4 + 9 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Tanks
    players.forEach((p) => drawTank(ctx, p, now));

    // 7. Explosions
    GameSprites.drawExplosions(ctx, now);

    ctx.restore();

    // 8. Low-time vignette
    if (S.cur.phase === "playing" && Number(S.cur.timeLeft) <= 10) {
      const pulse = 0.16 + 0.1 * Math.sin(now / 180);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, "rgba(220, 38, 38, 0)");
      g.addColorStop(1, `rgba(220, 38, 38, ${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 9. Crosshair
    drawCrosshair(ctx, players, now);
  }

  function drawTank(ctx, p, now) {
    if (!p || p.isDead) return;

    GameSprites.drawTank(
      ctx,
      {
        id: p.username,
        x: p.x,
        y: p.y,
        // The tank sheet faces UP, so +90 degrees maps angle 0 to "right".
        angle: (p.angle || 0) + Math.PI / 2,
        color: validColor(p.color),
        isMoving: !!p.isMoving,
        hasShield: !!p.hasShield,
        speedBoost: !!p.speedBoost,
        cheatMode: !!p.cheatMode
      },
      now
    );

    if (p.username === S.you) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -(now / 40) % 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (p.invulnerable) {
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now / 90);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 27, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawAimSight(ctx, players, now) {
    const me = players.find((p) => p.username === S.you);
    if (!me || me.isDead) return;

    const maxLen = 430;
    const dx = Math.cos(me.angle || 0);
    const dy = Math.sin(me.angle || 0);
    let ex = me.x + dx * maxLen;
    let ey = me.y + dy * maxLen;

    if (S.mouse.inside) {
      const mx = S.mouse.x;
      const my = S.mouse.y;
      const dist = Math.hypot(mx - me.x, my - me.y);
      if (dist < maxLen) {
        ex = mx;
        ey = my;
      }
    }

    const hit = raycast(me.x, me.y, ex, ey);
    if (hit) {
      ex = hit.x;
      ey = hit.y;
    }

    ctx.save();
    ctx.strokeStyle = me.cheatMode ? "rgba(250, 204, 21, 0.8)" : "rgba(125, 211, 252, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(now / 45) % 12;
    ctx.beginPath();
    ctx.moveTo(me.x + dx * 28, me.y + dy * 28);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = me.cheatMode ? "#facc15" : "#7dd3fc";
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCrosshair(ctx, players, now) {
    if (!S.mouse.inside) return;
    const me = players.find((p) => p.username === S.you);
    const color = me && me.cheatMode ? "#facc15" : "rgba(226, 232, 240, 0.9)";
    const { x, y } = S.mouse;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ======================================================================
   * HUD
   * ==================================================================== */

  function cacheHud() {
    S.hud = {
      timer: byId("gp-timer"),
      goal: byId("gp-goal"),
      cheatBanner: byId("gp-cheat-banner"),
      cheatBtn: byId("gp-cheat-btn"),
      muteBtn: byId("gp-mute-btn"),

      p1Avatar: byId("gp-p1-avatar"),
      p2Avatar: byId("gp-p2-avatar"),
      p1Name: byId("gp-p1-name"),
      p2Name: byId("gp-p2-name"),
      p1Kills: byId("gp-p1-kills"),
      p2Kills: byId("gp-p2-kills"),
      p1Pips: byId("gp-p1-pips"),
      p2Pips: byId("gp-p2-pips"),
      p1Badges: byId("gp-p1-badges"),
      p2Badges: byId("gp-p2-badges"),

      countdown: byId("gp-countdown"),
      countdownText: byId("gp-countdown-text"),
      dead: byId("gp-dead"),
      respawnIn: byId("gp-respawn-in"),
      killfeed: byId("gp-killfeed"),
      toast: byId("gp-toast"),
      hint: byId("gp-hint"),
      connection: byId("gp-connection")
    };
  }

  function renderMatchPlayers(players) {
    const p1 = players[0];
    const p2 = players[1];
    setPanel("p1", p1);
    setPanel("p2", p2);
  }

  function setPanel(side, p) {
    if (!p) return;
    const nameEl = S.hud[`${side}Name`];
    const avatarEl = S.hud[`${side}Avatar`];
    if (nameEl) nameEl.textContent = p.name || p.username || side.toUpperCase();
    if (avatarEl) {
      const label = String(p.name || p.username || side).trim();
      avatarEl.textContent = (label[0] || side[0]).toUpperCase();
      ["blue", "red", "green", "yellow"].forEach((c) =>
        avatarEl.classList.remove(`tank-${c}`)
      );
      avatarEl.classList.add(`tank-${validColor(p.color)}`);
    }
  }

  function buildPips() {
    S.pipEls = { p1: [], p2: [] };
    ["p1", "p2"].forEach((side) => {
      const el = S.hud[`${side}Pips`];
      if (!el) return;
      el.textContent = "";
      for (let i = 0; i < S.config.killsToWin; i++) {
        const dot = document.createElement("span");
        dot.className = "gp-pip";
        el.appendChild(dot);
        S.pipEls[side].push(dot);
      }
    });
  }

  function updatePips(side, kills) {
    const els = S.pipEls[side] || [];
    els.forEach((el, i) => el.classList.toggle("is-on", i < kills));
  }

  function updateHud(now) {
    if (!S.cur || !S.hud) return;
    if (now - S.hudAt < 100) return;
    S.hudAt = now;

    const st = S.cur;
    const players = st.players || [];
    const p1 = findOrdered(players, 0);
    const p2 = findOrdered(players, 1);
    const me = getMe(st);

    if (p1) {
      S.hud.p1Kills.textContent = p1.kills || 0;
      updatePips("p1", p1.kills || 0);
      renderBadges(S.hud.p1Badges, p1);
    }
    if (p2) {
      S.hud.p2Kills.textContent = p2.kills || 0;
      updatePips("p2", p2.kills || 0);
      renderBadges(S.hud.p2Badges, p2);
    }

    const t = Math.max(0, Math.ceil(Number(st.timeLeft) || 0));
    S.hud.timer.textContent = formatTime(t);
    S.hud.timer.className =
      "gp-timer" + (t <= 10 ? " is-critical" : t <= 30 ? " is-warning" : "");

    const cheater = players.find((p) => p.cheatMode);
    S.hud.cheatBanner.hidden = !cheater;
    if (cheater) {
      S.hud.cheatBanner.textContent = `⚡ CHEAT MODE — ${cheater.name || cheater.username}`;
    }
    S.hud.cheatBtn.classList.toggle("is-on", !!(me && me.cheatMode));

    if (me && me.isDead) {
      S.hud.dead.hidden = false;
      S.hud.respawnIn.textContent = Math.max(0, Math.ceil(Number(me.respawnIn) || 0));
    } else {
      S.hud.dead.hidden = true;
    }

    updateCountdown(st);
    S.lastPhase = st.phase;
  }

  function findOrdered(players, index) {
    const username = S.order[index];
    return players.find((p) => p.username === username) || players[index] || null;
  }

  function renderBadges(el, p) {
    if (!el) return;
    const parts = [];
    if (p.cheatMode) parts.push(`<span class="gp-badge gp-badge--cheat">CHEAT</span>`);
    if (p.hasShield) {
      parts.push(`<span class="gp-badge gp-badge--shield">🛡 ${secondsLabel(p.shieldRemaining)}</span>`);
    }
    if (p.speedBoost) {
      parts.push(`<span class="gp-badge gp-badge--speed">SPD ${secondsLabel(p.speedRemaining)}</span>`);
    }
    if (p.tripleShot) {
      parts.push(`<span class="gp-badge gp-badge--triple">TRI ${secondsLabel(p.tripleRemaining)}</span>`);
    }
    el.innerHTML = parts.join("");
  }

  function updateCountdown(st) {
    if (!S.hud) return;

    if (st.phase === "countdown") {
      S.hud.countdown.hidden = false;
      S.hud.countdownText.textContent = String(
        Math.max(1, Math.ceil(Number(st.startsIn) || 3))
      );
      return;
    }

    if (st.phase === "playing" && S.lastPhase === "countdown") {
      S.hud.countdown.hidden = false;
      S.hud.countdownText.textContent = "FIGHT!";
      clearTimeout(S.countdownTimer);
      S.countdownTimer = setTimeout(() => {
        S.hud.countdown.hidden = true;
      }, 700);
      return;
    }

    if (st.phase === "ended") S.hud.countdown.hidden = true;
  }

  /* ======================================================================
   * Events → SFX / effects / feed
   * ==================================================================== */

  function handleEvents(events) {
    const now = performance.now();

    events.forEach((e) => {
      switch (e.type) {
        case "shoot": {
          if (now - S.lastShootSound > 40) {
            playSound("shoot");
            S.lastShootSound = now;
          }
          const sx = Number(e.x);
          const sy = Number(e.y);
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            S.flashes.push({ x: sx, y: sy, cheat: !!e.cheat, t: now });
          }
          break;
        }
        case "bounce": {
          if (now - S.lastBounceSound > 60) {
            playSound("bounce");
            S.lastBounceSound = now;
          }
          break;
        }
        case "hit": {
          if (e.shield && now - S.lastBounceSound > 60) {
            playSound("bounce");
            S.lastBounceSound = now;
          }
          break;
        }
        case "death": {
          playSound("explosion");
          const victim = ((S.cur && S.cur.players) || []).find(
            (p) => p.username === e.target
          );
          const dx = Number(e.x);
          const dy = Number(e.y);
          const ex = Number.isFinite(dx) ? dx : victim ? victim.x : null;
          const ey = Number.isFinite(dy) ? dy : victim ? victim.y : null;
          if (ex !== null && ey !== null) {
            GameSprites.spawnExplosion(ex, ey);
          }
          if (!S.reducedMotion) S.shakeUntil = now + 220;
          pushKillRow(e);
          break;
        }
        case "powerup": {
          playSound("powerup");
          showToast(`${nameOf(e.by)} picked up ${String(e.kind || "power-up").toUpperCase()}`);
          break;
        }
        case "cheat": {
          showToast(
            `${nameOf(e.by)} ${e.on ? "activated" : "deactivated"} CHEAT MODE`
          );
          break;
        }
        case "matchPoint": {
          showToast("MATCH POINT");
          break;
        }
        case "respawn":
          break;
        default:
          break;
      }
    });
  }

  function pushKillRow(e) {
    if (!S.hud || !S.hud.killfeed) return;

    const row = document.createElement("div");
    row.className = "gp-kill-row";

    if (!e.by || e.by === e.target) {
      row.textContent = `${nameOf(e.target)} self-destructed`;
    } else {
      const by = document.createElement("span");
      by.className = "gp-kill-by";
      by.textContent = nameOf(e.by);

      const mid = document.createElement("span");
      mid.textContent = e.ricochet ? " ⟲⚡ " : " ⚡ ";

      const target = document.createElement("span");
      target.className = "gp-kill-victim";
      target.textContent = nameOf(e.target);

      row.append(by, mid, target);
    }

    S.hud.killfeed.appendChild(row);
    S.killRows.push(row);
    while (S.killRows.length > 4) {
      const old = S.killRows.shift();
      if (old) old.remove();
    }
    setTimeout(() => {
      row.remove();
      S.killRows = S.killRows.filter((r) => r !== row);
    }, 4000);
  }

  function clearKillFeed() {
    S.killRows.forEach((r) => r.remove());
    S.killRows = [];
    if (S.hud && S.hud.killfeed) S.hud.killfeed.textContent = "";
  }

  function showToast(text) {
    if (!S.hud || !S.hud.toast) return;
    S.hud.toast.textContent = text;
    S.hud.toast.hidden = false;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => {
      S.hud.toast.hidden = true;
    }, 1800);
  }

  /* ======================================================================
   * Audio mute
   * ==================================================================== */

  function restoreMute() {
    let saved = false;
    try {
      saved = localStorage.getItem("gp_muted") === "1";
    } catch (err) {
      saved = false;
    }
    if (saved) {
      S.muted = GameAudio.toggleMute();
      updateMuteIcon();
    }
  }

  function toggleMute() {
    S.muted = GameAudio.toggleMute();
    try {
      localStorage.setItem("gp_muted", S.muted ? "1" : "0");
    } catch (err) {
      /* storage may be unavailable */
    }
    updateMuteIcon();
  }

  function updateMuteIcon() {
    if (S.hud && S.hud.muteBtn) {
      S.hud.muteBtn.textContent = S.muted ? "🔇" : "🔊";
      S.hud.muteBtn.classList.toggle("is-on", S.muted);
    }
  }

  /* ======================================================================
   * Canvas / maze
   * ==================================================================== */

  function setupCanvas() {
    if (!S.canvas || !S.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.dpr = dpr;
    S.canvas.width = Math.round(S.config.arenaW * dpr);
    S.canvas.height = Math.round(S.config.arenaH * dpr);
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.ctx.imageSmoothingEnabled = true;
  }

  function buildMazeCache() {
    const W = S.config.arenaW;
    const H = S.config.arenaH;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");

    // Floor
    g.fillStyle = "#0b111e";
    g.fillRect(0, 0, W, H);

    const glow = g.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, Math.max(W, H) * 0.7);
    glow.addColorStop(0, "rgba(37, 99, 235, 0.10)");
    glow.addColorStop(1, "rgba(37, 99, 235, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // Grid
    g.strokeStyle = "rgba(148, 163, 184, 0.055)";
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += S.config.tile) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
      g.stroke();
    }
    for (let y = 0; y <= H; y += S.config.tile) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }

    // Power-up pads
    S.pads.forEach((pad) => {
      g.save();
      g.translate(pad.x, pad.y);
      g.strokeStyle = "rgba(56, 189, 248, 0.30)";
      g.lineWidth = 2;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(56, 189, 248, 0.06)";
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });

    // Spawn markers
    S.spawns.forEach((spawn) => {
      g.save();
      g.translate(spawn.x, spawn.y);
      g.strokeStyle = COLORS[validColor(spawn.color)] || "#38bdf8";
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      g.setLineDash([3, 5]);
      g.beginPath();
      g.arc(0, 0, 24, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    });

    // Walls
    S.walls.forEach((w) => {
      g.fillStyle = "rgba(0, 0, 0, 0.35)";
      g.fillRect(w.x + 3, w.y + 4, w.w, w.h);

      g.fillStyle = "#1b2638";
      g.fillRect(w.x, w.y, w.w, w.h);

      g.fillStyle = "#243349";
      g.fillRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);

      g.fillStyle = "rgba(255, 255, 255, 0.06)";
      g.fillRect(w.x + 2, w.y + 2, w.w - 4, 3);

      g.strokeStyle = "rgba(9, 14, 24, 0.85)";
      g.lineWidth = 1;
      g.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);

      g.strokeStyle = "rgba(9, 14, 24, 0.5)";
      g.beginPath();
      g.moveTo(w.x, w.y + w.h / 2);
      g.lineTo(w.x + w.w, w.y + w.h / 2);
      g.stroke();

      g.beginPath();
      g.moveTo(w.x + w.w / 2, w.y);
      g.lineTo(w.x + w.w / 2, w.y + w.h / 2);
      g.stroke();
    });

    // Arena border
    g.strokeStyle = "rgba(56, 189, 248, 0.22)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);

    S.mazeCanvas = canvas;
  }

  /* ======================================================================
   * Geometry helpers
   * ==================================================================== */

  function raycast(x1, y1, x2, y2) {
    let best = 1;
    for (const w of S.walls) {
      const t = segmentRect(x1, y1, x2, y2, w);
      if (t !== null && t < best) best = t;
    }
    if (best >= 1) return null;
    return { x: x1 + (x2 - x1) * best, y: y1 + (y2 - y1) * best };
  }

  // Liang–Barsky: returns the entry t in [0,1] or null.
  function segmentRect(x1, y1, x2, y2, w) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];

    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }
    return t0;
  }

  return { init, startMatch, pushState, stop };
})();

window.GameClient = GameClient;

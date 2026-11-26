// Local practice match (client-side).
// Speaks the same matchStart / gameState / gameOver contract as
// server/gameEngine.js, so the game play page works without a second player.
// Opened with `?practice=1` (Home -> "Start practice match").

const CONFIG = {
  arenaW: 1200,
  arenaH: 800,
  tile: 50,
  killsToWin: 3,
  matchSeconds: 180,
  tickMs: 1000 / 30,
  countdownMs: 3000,
  tankRadius: 18,
  tankSpeed: 190,
  bulletRadius: 6,
  bulletSpeed: 420,
  cheatBulletSpeed: 1000,
  bulletLifeMs: 5000,
  maxBounces: 3,
  fireCooldownMs: 420,
  cheatCooldownMs: 80,
  botCooldownMs: 1200,
  tripleSpread: 0.16,
  respawnMs: 2000,
  spawnProtectMs: 1500,
  powerUpIntervalMs: 10000,
  maxPowerUps: 3,
  shieldMs: 15000,
  speedMs: 8000,
  tripleMs: 8000
};

const MAZE = [
  "########################",
  "#......................#",
  "#..##..............##..#",
  "#..##..............##..#",
  "#......................#",
  "#....####......####....#",
  "#.......#......#.......#",
  "#.......#......#.......#",
  "#.......#......#.......#",
  "#....####......####....#",
  "#......................#",
  "#..##..............##..#",
  "#..##..............##..#",
  "#......................#",
  "#......................#",
  "########################"
];

const SPAWNS = [
  { x: 2 * 50 + 25, y: 7 * 50 + 25 },
  { x: 21 * 50 + 25, y: 7 * 50 + 25 }
];

const WALLS = buildWalls(MAZE, CONFIG.tile);

function buildWalls(rows, tile) {
  const walls = [];
  rows.forEach((row, ty) => {
    [...row].forEach((ch, tx) => {
      if (ch === "#") {
        walls.push({ x: tx * tile, y: ty * tile, w: tile, h: tile });
      }
    });
  });
  return walls;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function circleHitsRect(cx, cy, r, w) {
  const nx = clamp(cx, w.x, w.x + w.w);
  const ny = clamp(cy, w.y, w.y + w.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function circleHitsAny(x, y, r) {
  for (const w of WALLS) {
    if (circleHitsRect(x, y, r, w)) return true;
  }
  return false;
}

// Liang–Barsky segment/rect test, used so the bot does not shoot walls point blank.
function segmentHitsRect(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < 1;
}

function hasLineOfSight(ax, ay, bx, by) {
  for (const w of WALLS) {
    if (segmentHitsRect(ax, ay, bx, by, w)) return false;
  }
  return true;
}

export const LocalMatch = (function () {
  let net = null;
  let M = null;
  let loop = 0;

  /* ------------------------------------------------------------------
   * Socket-like adapter: enough of the Socket.IO surface for
   * GameClient / GameOverUI.
   * ---------------------------------------------------------------- */
  function createNet() {
    const handlers = new Map();

    return {
      id: "local_socket",

      on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(fn);
      },

      emit(event, data) {
        switch (event) {
          case "input":
            onInput(data);
            break;
          case "toggleCheat":
            onCheat();
            break;
          case "requestRematch":
            onRematch();
            break;
          case "leaveGameOver":
          case "getLobby":
            stop();
            break;
          default:
            break;
        }
      },

      fire(event, data) {
        (handlers.get(event) || []).forEach((fn) => fn(data));
      }
    };
  }

  function start(netInstance) {
    net = netInstance;
    reset();
  }

  function stop() {
    clearInterval(loop);
    loop = 0;
    M = null;
  }

  function reset() {
    if (!net) return;
    clearInterval(loop);

    M = newMatch();
    M.leaderboard = [];

    fetch("/leaderboard")
      .then((res) => res.json())
      .then((json) => {
        if (M && Array.isArray(json.leaderboard)) {
          // `users.json` also stores metadata keys (`_comment`, `users`);
          // keep only real accounts in the displayed leaderboard.
          M.leaderboard = json.leaderboard.filter(
            (row) =>
              row &&
              typeof row.username === "string" &&
              !row.username.startsWith("_") &&
              row.username !== "users"
          );
        }
      })
      .catch(() => {});

    net.fire("matchStart", buildMatchStart());
    loop = setInterval(tick, CONFIG.tickMs);
  }

  function newMatch() {
    const now = performance.now();
    return {
      roomId: "practice_room",
      phase: "countdown",
      startsAt: now + CONFIG.countdownMs,
      startedAt: 0,
      timeLeft: CONFIG.matchSeconds,
      tick: 0,
      lastTick: now,
      players: [
        makePlayer("you", "You", "blue", SPAWNS[0], 0, false),
        makePlayer("bot", "Practice Bot", "red", SPAWNS[1], Math.PI, true)
      ],
      bullets: [],
      powerups: [],
      nextBulletId: 1,
      nextPowerupId: 1,
      nextPowerupAt: now + 2500,
      events: [],
      botNextTurn: 0,
      botDir: { x: 0, y: 0 },
      ended: false,
      leaderboard: []
    };
  }

  function makePlayer(username, name, color, spawn, angle, isBot) {
    return {
      username,
      name,
      color,
      isBot,
      spawn: { x: spawn.x, y: spawn.y },
      x: spawn.x,
      y: spawn.y,
      angle,
      input: { up: false, down: false, left: false, right: false, shoot: false },
      isMoving: false,
      kills: 0,
      deaths: 0,
      shotsFired: 0,
      hits: 0,
      ricochetKills: 0,
      powerupsCollected: 0,
      shieldUntil: 0,
      speedUntil: 0,
      tripleUntil: 0,
      cheatMode: false,
      deadUntil: 0,
      invulnUntil: 0,
      cooldownUntil: performance.now() + 600
    };
  }

  function buildMatchStart() {
    return {
      roomId: M.roomId,
      you: "you",
      config: {
        arenaW: CONFIG.arenaW,
        arenaH: CONFIG.arenaH,
        tile: CONFIG.tile,
        killsToWin: CONFIG.killsToWin,
        matchSeconds: CONFIG.matchSeconds,
        tickMs: CONFIG.tickMs
      },
      walls: WALLS,
      pads: [],
      players: M.players.map((p) => ({
        username: p.username,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        kills: p.kills,
        deaths: p.deaths
      })),
      startsInMs: CONFIG.countdownMs
    };
  }

  /* ------------------------------------------------------------------
   * Inputs
   * ---------------------------------------------------------------- */
  function onInput(data = {}) {
    if (!M || M.phase === "ended") return;
    const p = M.players[0];
    p.input = {
      up: !!data.up,
      down: !!data.down,
      left: !!data.left,
      right: !!data.right,
      shoot: !!data.shoot
    };
    if (Number.isFinite(data.aim)) p.angle = data.aim;
  }

  function onCheat() {
    if (!M || M.phase === "ended") return;
    const p = M.players[0];
    p.cheatMode = !p.cheatMode;
  }

  function onRematch() {
    if (!net) return;
    const players = M
      ? M.players.map((p) => ({
          username: p.username,
          name: p.name,
          color: p.color,
          x: p.x,
          y: p.y,
          kills: p.kills,
          deaths: p.deaths
        }))
      : [];
    net.fire("rematchStatus", { status: "waiting", message: "Starting rematch…" });
    net.fire("rematchStart", { roomId: "practice_room", players });
    reset();
  }

  /* ------------------------------------------------------------------
   * Tick
   * ---------------------------------------------------------------- */
  function tick() {
    if (!M) return;

    const now = performance.now();
    const dt = Math.min((now - M.lastTick) / 1000, 0.05);
    M.lastTick = now;
    M.tick += 1;
    M.events = [];

    if (M.phase === "countdown") {
      if (now >= M.startsAt) {
        M.phase = "playing";
        M.startedAt = now;
        M.events.push({ type: "fight" });
        spawnPowerUp(now);
        spawnPowerUp(now);
      }
      emitState(now);
      return;
    }

    if (M.phase !== "playing") return;

    M.timeLeft = Math.max(0, CONFIG.matchSeconds - (now - M.startedAt) / 1000);

    updateHuman(now, dt);
    updateBot(now, dt);
    updateBullets(now, dt);
    updatePowerups(now);
    checkRespawns(now);
    separate(M.players[0], M.players[1]);

    const p1 = M.players[0];
    const p2 = M.players[1];

    let reason = null;
    let winner = null;

    if (p1.kills >= CONFIG.killsToWin) {
      reason = "kills";
      winner = p1.username;
    } else if (p2.kills >= CONFIG.killsToWin) {
      reason = "kills";
      winner = p2.username;
    } else if (M.timeLeft <= 0) {
      reason = "timeout";
      winner = p1.kills > p2.kills ? p1.username : p2.kills > p1.kills ? p2.username : null;
    }

    emitState(now);

    if (reason) endMatch(reason, winner, now);
  }

  function emitState(now) {
    net.fire("gameState", {
      roomId: M.roomId,
      tick: M.tick,
      serverNow: Date.now(),
      phase: M.phase,
      timeLeft: M.timeLeft,
      startsIn: M.phase === "countdown" ? Math.max(0, (M.startsAt - now) / 1000) : 0,
      players: M.players.map((p) => ({
        username: p.username,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        isMoving: p.isMoving,
        hasShield: p.shieldUntil > now,
        speedBoost: p.speedUntil > now,
        tripleShot: p.tripleUntil > now,
        cheatMode: p.cheatMode,
        isDead: p.deadUntil > now,
        respawnIn: p.deadUntil > now ? Math.max(0, (p.deadUntil - now) / 1000) : 0,
        invulnerable: p.invulnUntil > now,
        kills: p.kills,
        deaths: p.deaths,
        shieldRemaining: Math.max(0, (p.shieldUntil - now) / 1000),
        speedRemaining: Math.max(0, (p.speedUntil - now) / 1000),
        tripleRemaining: Math.max(0, (p.tripleUntil - now) / 1000)
      })),
      bullets: M.bullets.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        bounces: b.bounces,
        owner: b.owner,
        cheat: b.cheat
      })),
      powerups: M.powerups.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        type: p.type
      })),
      events: M.events
    });
  }

  /* ------------------------------------------------------------------
   * Players
   * ---------------------------------------------------------------- */
  function updateHuman(now, dt) {
    const p = M.players[0];
    if (p.deadUntil > now) {
      p.isMoving = false;
      return;
    }

    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    p.isMoving = len > 0;
    const speed = p.speedUntil > now ? CONFIG.tankSpeed * 1.5 : CONFIG.tankSpeed;
    movePlayer(p, dx * speed * dt, dy * speed * dt);

    if (p.input.shoot && now >= p.cooldownUntil) fire(p, now);
  }

  function updateBot(now, dt) {
    const bot = M.players[1];
    const human = M.players[0];

    if (bot.deadUntil > now) {
      bot.isMoving = false;
      return;
    }

    if (now >= M.botNextTurn) {
      M.botNextTurn = now + 900 + Math.random() * 900;

      if (Math.random() < 0.65 && human.deadUntil <= now) {
        const dx = human.x - bot.x;
        const dy = human.y - bot.y;
        const d = Math.hypot(dx, dy) || 1;
        M.botDir = { x: dx / d, y: dy / d };
      } else {
        const a = Math.random() * Math.PI * 2;
        M.botDir = { x: Math.cos(a), y: Math.sin(a) };
      }
    }

    let dx = M.botDir.x;
    let dy = M.botDir.y;

    if (circleHitsAny(bot.x + dx * 16, bot.y + dy * 16, CONFIG.tankRadius)) {
      const a = Math.random() * Math.PI * 2;
      M.botDir = { x: Math.cos(a), y: Math.sin(a) };
      dx = M.botDir.x;
      dy = M.botDir.y;
    }

    bot.isMoving = Math.abs(dx) + Math.abs(dy) > 0.01;
    const speed = CONFIG.tankSpeed * 0.82;
    movePlayer(bot, dx * speed * dt, dy * speed * dt);

    const canSee =
      human.deadUntil <= now && hasLineOfSight(bot.x, bot.y, human.x, human.y);

    if (canSee) {
      bot.angle =
        Math.atan2(human.y - bot.y, human.x - bot.x) + (Math.random() - 0.5) * 0.06;
      if (now >= bot.cooldownUntil) fire(bot, now);
    }
  }

  function movePlayer(p, dx, dy) {
    const r = CONFIG.tankRadius;

    p.x += dx;
    if (circleHitsAny(p.x, p.y, r)) p.x -= dx;

    p.y += dy;
    if (circleHitsAny(p.x, p.y, r)) p.y -= dy;

    p.x = clamp(p.x, r, CONFIG.arenaW - r);
    p.y = clamp(p.y, r, CONFIG.arenaH - r);
  }

  function separate(a, b) {
    if (!a || !b || a.deadUntil > performance.now() || b.deadUntil > performance.now()) {
      return;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const overlap = CONFIG.tankRadius * 2 - d;
    if (overlap <= 0) return;

    const ux = dx / d;
    const uy = dy / d;
    const ax = a.x - ux * (overlap / 2);
    const ay = a.y - uy * (overlap / 2);
    const bx = b.x + ux * (overlap / 2);
    const by = b.y + uy * (overlap / 2);

    if (!circleHitsAny(ax, ay, CONFIG.tankRadius)) {
      a.x = ax;
      a.y = ay;
    }
    if (!circleHitsAny(bx, by, CONFIG.tankRadius)) {
      b.x = bx;
      b.y = by;
    }
  }

  function checkRespawns(now) {
    M.players.forEach((p) => {
      if (!p.deadUntil || now < p.deadUntil) return;

      p.x = p.spawn.x;
      p.y = p.spawn.y;
      p.deadUntil = 0;
      p.invulnUntil = now + CONFIG.spawnProtectMs;
      p.isMoving = false;

      const other = M.players.find((o) => o !== p);
      if (other) p.angle = Math.atan2(other.y - p.y, other.x - p.x);

      M.events.push({ type: "respawn", by: p.username, x: p.x, y: p.y });
    });
  }

  /* ------------------------------------------------------------------
   * Bullets
   * ---------------------------------------------------------------- */
  function fire(p, now) {
    const cheat = p.cheatMode;
    const triple = p.tripleUntil > now;
    const speed = cheat ? CONFIG.cheatBulletSpeed : CONFIG.bulletSpeed;
    const angles = triple
      ? [p.angle - CONFIG.tripleSpread, p.angle, p.angle + CONFIG.tripleSpread]
      : [p.angle];

    p.cooldownUntil =
      now +
      (cheat
        ? CONFIG.cheatCooldownMs
        : p.isBot
        ? CONFIG.botCooldownMs
        : CONFIG.fireCooldownMs);

    angles.forEach((angle) => {
      const x = p.x + Math.cos(angle) * (CONFIG.tankRadius + 10);
      const y = p.y + Math.sin(angle) * (CONFIG.tankRadius + 10);

      M.bullets.push({
        id: `b${M.nextBulletId++}`,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        bounces: 0,
        owner: p.username,
        cheat,
        spawnedAt: now
      });

      p.shotsFired += 1;
      M.events.push({ type: "shoot", by: p.username, x, y, angle, cheat });
    });
  }

  function updateBullets(now, dt) {
    for (let i = M.bullets.length - 1; i >= 0; i--) {
      const b = M.bullets[i];
      const speed = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 8));
      const stepDt = dt / steps;
      let dead = false;

      for (let s = 0; s < steps && !dead; s++) {
        let bounced = false;

        const nx = b.x + b.vx * stepDt;
        if (circleHitsAny(nx, b.y, CONFIG.bulletRadius)) {
          if (b.bounces >= CONFIG.maxBounces) {
            dead = true;
            break;
          }
          b.vx = -b.vx;
          b.bounces += 1;
          bounced = true;
        } else {
          b.x = nx;
        }

        const ny = b.y + b.vy * stepDt;
        if (circleHitsAny(b.x, ny, CONFIG.bulletRadius)) {
          if (b.bounces >= CONFIG.maxBounces) {
            dead = true;
            break;
          }
          b.vy = -b.vy;
          b.bounces += 1;
          bounced = true;
        } else {
          b.y = ny;
        }

        if (bounced) M.events.push({ type: "bounce", x: b.x, y: b.y });

        for (const p of M.players) {
          if (p.deadUntil > now) continue;
          // A player is immune to their own shells so wall-adjacent shots do
          // not turn into instant suicides.
          if (p.username === b.owner) continue;

          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < CONFIG.tankRadius + CONFIG.bulletRadius) {
            handleHit(b, p, now);
            dead = true;
            break;
          }
        }
      }

      if (dead || now - b.spawnedAt > CONFIG.bulletLifeMs) {
        M.bullets.splice(i, 1);
      }
    }
  }

  function handleHit(bullet, victim, now) {
    const shooter = M.players.find((p) => p.username === bullet.owner) || null;
    if (shooter) shooter.hits += 1;

    if (victim.cheatMode || victim.invulnUntil > now) {
      M.events.push({
        type: "hit",
        by: bullet.owner,
        target: victim.username,
        x: bullet.x,
        y: bullet.y,
        shield: true
      });
      return;
    }

    if (victim.shieldUntil > now) {
      victim.shieldUntil = 0;
      M.events.push({
        type: "hit",
        by: bullet.owner,
        target: victim.username,
        x: bullet.x,
        y: bullet.y,
        shield: true
      });
      return;
    }

    killPlayer(victim, shooter, bullet.bounces > 0, now);
  }

  function killPlayer(victim, shooter, ricochet, now) {
    victim.deaths += 1;
    victim.deadUntil = now + CONFIG.respawnMs;
    victim.shieldUntil = 0;
    victim.speedUntil = 0;
    victim.tripleUntil = 0;
    victim.isMoving = false;

    if (shooter && shooter.username !== victim.username) {
      shooter.kills += 1;
      if (ricochet) shooter.ricochetKills += 1;
    }

    M.events.push({
      type: "death",
      by: shooter ? shooter.username : null,
      target: victim.username,
      x: victim.x,
      y: victim.y,
      ricochet: !!ricochet
    });
  }

  /* ------------------------------------------------------------------
   * Power-ups
   * ---------------------------------------------------------------- */
  function spawnPowerUp(now) {
    const position = randomPowerUpPosition(now);
    if (!position) return;

    const types = ["shield", "speed", "triple"];
    const type = types[Math.floor(Math.random() * types.length)];

    M.powerups.push({
      id: `p${M.nextPowerupId++}`,
      x: position.x,
      y: position.y,
      type
    });
  }

  // Pick a random open floor tile, away from walls, tanks and other power-ups.
  function randomPowerUpPosition(now) {
    const maxX = MAZE[0].length - 1;
    const maxY = MAZE.length - 1;

    for (let attempt = 0; attempt < 80; attempt++) {
      const tx = 1 + Math.floor(Math.random() * (maxX - 1));
      const ty = 1 + Math.floor(Math.random() * (maxY - 1));
      if (MAZE[ty][tx] !== ".") continue;

      const x = tx * CONFIG.tile + CONFIG.tile / 2;
      const y = ty * CONFIG.tile + CONFIG.tile / 2;

      // Keep the 30×30 sprite clear of walls.
      if (circleHitsAny(x, y, 20)) continue;

      if (
        M.powerups.some(
          (item) => Math.hypot(item.x - x, item.y - y) < 80
        )
      ) {
        continue;
      }

      if (
        M.players.some(
          (p) =>
            p.deadUntil <= now &&
            Math.hypot(p.x - x, p.y - y) < 70
        )
      ) {
        continue;
      }

      return { x, y };
    }

    return null;
  }

  function updatePowerups(now) {
    if (now >= M.nextPowerupAt) {
      M.nextPowerupAt = now + CONFIG.powerUpIntervalMs;
      if (M.powerups.length < CONFIG.maxPowerUps) spawnPowerUp(now);
    }

    for (let i = M.powerups.length - 1; i >= 0; i--) {
      const item = M.powerups[i];
      const picker = M.players.find(
        (p) =>
          p.deadUntil <= now &&
          Math.hypot(p.x - item.x, p.y - item.y) < CONFIG.tankRadius + 14
      );

      if (!picker) continue;

      applyPowerUp(picker, item.type, now);
      picker.powerupsCollected += 1;
      M.events.push({
        type: "powerup",
        by: picker.username,
        kind: item.type,
        x: item.x,
        y: item.y
      });
      M.powerups.splice(i, 1);
    }
  }

  function applyPowerUp(p, type, now) {
    if (type === "shield") p.shieldUntil = now + CONFIG.shieldMs;
    if (type === "speed") p.speedUntil = now + CONFIG.speedMs;
    if (type === "triple") p.tripleUntil = now + CONFIG.tripleMs;
  }

  /* ------------------------------------------------------------------
   * Match end
   * ---------------------------------------------------------------- */
  function endMatch(reason, winner, now) {
    if (!M || M.ended) return;
    M.ended = true;
    M.phase = "ended";
    clearInterval(loop);
    loop = 0;

    const durationSeconds = Math.max(
      0,
      Math.round((now - (M.startedAt || now)) / 1000)
    );

    const formatted = M.players.map((p) => ({
      username: p.username,
      name: p.name,
      color: p.color,
      socketId: null,
      kills: p.kills,
      deaths: p.deaths,
      shotsFired: p.shotsFired,
      hits: p.hits,
      accuracy: p.shotsFired
        ? Number(((p.hits / p.shotsFired) * 100).toFixed(1))
        : 0,
      ricochetKills: p.ricochetKills,
      powerupsCollected: p.powerupsCollected,
      outcome: winner === null ? "DRAW" : p.username === winner ? "WIN" : "LOSE"
    }));

    const payload = {
      roomId: M.roomId,
      reason,
      durationSeconds,
      isDraw: winner === null,
      winner,
      winnerName: winner
        ? (formatted.find((p) => p.username === winner) || {}).name || winner
        : null,
      players: formatted,
      leaderboard: M.leaderboard || []
    };

    if (net) net.fire("gameOver", payload);
  }

  return { createNet, start, stop };
})();

window.LocalMatch = LocalMatch;

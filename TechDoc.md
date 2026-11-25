# Gameover page API Reference (Sprites, Audio, Stats & Game Over)

## 1. Imports
* **Frontend (`public/js/game_client.js` or `auth.js`):**
  ```js
  import { GameSprites } from "./sprite.js";
  import { GameAudio, playSound } from "./audio.js";
  import { GameOverUI } from "./gameover.js";
  import { socket, showView } from "./main.js";
  ```
* **Backend (`server/gameEngine.js`):**
  ```js
  const statsAndRank = require("./statsAndRank");
  ```

---

## 2. Frontend Sprite & Audio Functions (`public/js/game_client.js`)

| Function | Input | Output / Effect |
|---|---|---|
| `GameSprites.drawTank(ctx, tank, now)` | `ctx`, `tank`: `{ id, x, y, angle, turretAngle?, color: "blue"\|"green"\|"red"\|"yellow", isMoving, hasShield, speedBoost, cheatMode, isDead }`, `now`: `performance.now()` | `void` — Draws normalized `44×34` animated tank, turret aim line, and shield/cheat rings. |
| `GameSprites.drawBullet(ctx, bullet, now)` | `ctx`, `bullet`: `{ id, x, y, vx, vy }`, `now`: `performance.now()` | `void` — Draws `20×10` 8-frame animated shell rotated along `(vx, vy)`. |
| `GameSprites.drawPowerUp(ctx, item, now)` | `ctx`, `item`: `{ id, x, y, type: "shield"\|"speed"\|"triple" }`, `now`: `performance.now()` | `void` — Draws `30×30` 4-frame spinning power-up crate. |
| `GameSprites.spawnExplosion(x, y)` | `x: number`, `y: number` | `void` — Spawns an explosion at `(x, y)` when a tank dies. |
| `GameSprites.drawExplosions(ctx, now)` | `ctx`, `now`: `performance.now()` | `void` — Call once at the end of every canvas frame to render active explosions. |
| `GameSprites.pruneEntities(bIds, pIds)` | `bIds: string[]`, `pIds: string[]` *(active IDs)* | `void` — Frees despawned bullet/powerup sprite instances. |
| `GameAudio.startBGM()` / `stopBGM()` | None | `void` — Starts/stops looping `background.mp3`. |
| `GameAudio.toggleMute()` | None | `boolean` — Toggles mute for all `<audio>` tags; returns `isMuted`. |
| `playSound(name)` | `name`: `"shoot"` \| `"bounce"` \| `"powerup"` \| `"explosion"` | `void` — Plays SFX from `0:00`. *(Win/Lose audio runs automatically on Game Over).* |

---

## 3. Backend Match End & Rematch Hook (`server/gameEngine.js`)

| Function | Who Calls / Exports | Input | Return Output |
|---|---|---|---|
| `statsAndRank.recordMatch(resultData)` | **Role 1 calls** when 3 kills or `0:00` hits | `{ roomId, reason: "kills"\|"timeout"\|"disconnect", durationSeconds, winner: username\|null, players: [p1, p2] }` *(each player: `{ username, name, color, socketId, kills, deaths, shotsFired, hits, ricochetKills, powerupsCollected }`)* | Returns `finalPayload` object $\rightarrow$ Role 1 immediately runs `io.to(roomId).emit("gameOver", finalPayload)`. |
| `gameEngine.startRoom(io, roomId, p1, p2)` | **Role 1 exports** *(auto-called by `server.js` on Play Again & Lobby pair)* | `io`, `roomId: string`, `p1`, `p2` | `void` — Starts 30 FPS game loop for `roomId`. |
| `gameEngine.registerSocketHandlers(io, socket)` | **Role 1 exports** *(auto-mounted in `server.js`)* | `io`, `socket` | `void` — Binds WASD/shoot/Cheat (`C`) socket events. |

---

## 4. Auth, Views & Shared `users.json` (`auth.js` & `server/authAndLobby.js`)

| Interface | Who Calls / Exports | Input | Output / Notes |
|---|---|---|---|
| `showView(viewId)` | Role 1 & Role 2 (`main.js`) | `"home-view"` \| `"game-view"` \| `"game-over-view"` | `void` — Switches active SPA screen (`GameOverUI` switches to `"game-over-view"` automatically on `gameOver`). |
| `GameOverUI.setCurrentUser(user)` | **Role 2 calls** on login / session check / logout | `{ username, name }` or `null` | `void` — Required so Game Over shows `VICTORY!` + plays `victory.wav` for the winner and `DEFEAT` + `gameover.mp3` for the loser. |
| `authAndLobby.registerRoutes(app)` | **Role 2 exports** *(auto-mounted in `server.js`)* | Express `app` | `void` — Mounts `/register`, `/signin`, `/signout`, `/validate`. |
| `authAndLobby.registerSocketHandlers(io, socket, gameEngine)` | **Role 2 exports** *(auto-mounted in `server.js`)* | `io`, `socket`, `gameEngine` | `void` — Listens for `"getLobby"` (emitted when returning from Game Over) and pairs 2 players into `gameEngine.startRoom(...)`. |
| `GET /leaderboard` | Public REST route *(already mounted)* | None | `{ success: true, leaderboard: [{ rank, username, name, avatar, wins, losses, draws, kills, accuracy }] }` |
| `data/users.json` | Shared file *(keep `stats` intact on write!)* | Keyed by `username` | `{ "tony": { "avatar": "blue", "name": "Tony Lee", "password": "<argon2>", "stats": { ... } } }` *(Pre-seeded: `tony`/`t`, `may`/`m`)*. |

// Node.js server (runs on http://localhost:8000)

/**
 * server.js — Shared Entry Point (Runs strictly on http://localhost:8000)
 * Mounts Express, Session, Socket.IO, Role 3 (statsAndRank), and safe hooks for Role 1 & Role 2.
 */
const express = require("express");
const session = require("express-session");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const statsAndRank = require("./server/statsAndRank");

// Safe loader so `node server.js` runs before Role 1 & Role 2 finish their files
function optionalRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") return null;
    throw err;
  }
}

const authAndLobby = optionalRequire("./server/authAndLobby"); // Role 2
const gameEngine = optionalRequire("./server/gameEngine");     // Role 1

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// 1. Express JSON & Static Middleware (Lab 5 convention)
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 2. Shared Session Middleware for both Express & Socket.IO (Lab 5 + Lab 6)
const chatSession = session({
  secret: "comp4021-tank-duel-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { maxAge: 300 * 1000 }
});
app.use(chatSession);
io.use((socket, next) => {
  chatSession(socket.request, {}, next);
});

// 3. Mount Role 3 Leaderboard API (`GET /leaderboard`)
statsAndRank.registerRoutes(app);

// 4. Mount Role 2 Auth Routes if Role 2's file exists
if (authAndLobby && typeof authAndLobby.registerRoutes === "function") {
  authAndLobby.registerRoutes(app);
}

// 5. Socket.IO Connection & Room Wiring
io.on("connection", (socket) => {
  // Role 2: Lobby & Pairing handlers (when available)
  if (authAndLobby && typeof authAndLobby.registerSocketHandlers === "function") {
    authAndLobby.registerSocketHandlers(io, socket, gameEngine);
  }

  // Gameplay input handlers (when available)
  if (gameEngine && typeof gameEngine.registerSocketHandlers === "function") {
    gameEngine.registerSocketHandlers(io, socket);
  }

  statsAndRank.registerSocketHandlers(io, socket, {
    onStartRematch: (ioInstance, newRoomId, player1, player2) => {
      if (gameEngine && typeof gameEngine.startRoom === "function") {
        gameEngine.startRoom(ioInstance, newRoomId, player1, player2);
      }
    }
  });

  // Dev Helper: Lets you test Role 3 Game Over + users.json saving from browser console
  socket.on("devTestGameOver", (mockData) => {
    socket.join("room_test");
    const finalPayload = statsAndRank.recordMatch(
      mockData || {
        roomId: "room_test",
        reason: "kills",
        durationSeconds: 74,
        winner: "tony",
        players: [
          { username: "tony", name: "Tony Lee", color: "blue", socketId: socket.id, kills: 3, deaths: 1, shotsFired: 10, hits: 3, ricochetKills: 1, powerupsCollected: 2 },
          { username: "may", name: "May Wong", color: "red", socketId: null, kills: 1, deaths: 3, shotsFired: 8, hits: 1, ricochetKills: 0, powerupsCollected: 1 }
        ]
      }
    );
    io.to("room_test").emit("gameOver", finalPayload);
  });
});

// 6. Seed Lab 5 test accounts (`tony`/`t`, `may`/`m`) and start Port 8000
const PORT = 8000;
statsAndRank.ensureSeedUsers().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Tank Duel server running at http://localhost:${PORT}`);
  });
});

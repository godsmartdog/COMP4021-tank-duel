
const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");

// Tracks rematch votes per finished room: roomId -> { players: { u1, u2 }, readySet: Set<username> }
const rematchRooms = new Map();

/**
 * Default cumulative stats object attached to each user in data/users.json
 */
function createDefaultStats() {
    return {
        wins: 0,
        losses: 0,
        draws: 0,
        gamesPlayed: 0,
        kills: 0,
        deaths: 0,
        shotsFired: 0,
        hits: 0,
        ricochetKills: 0,
        powerupsCollected: 0
    };
}

/**
 * Safely reads data/users.json (Lab 5 Step D convention)
 */
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
            fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), "utf8");
            return {};
        }
        const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("[statsAndRank] Error reading users.json:", err);
        return {};
    }
}

/**
 * Safely writes updated users object back to data/users.json (Lab 5 Step H convention)
 */
function writeUsers(users) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

/**
 * Ensures Lab 5 test accounts ("tony" password "t", "may" password "m") exist
 * with valid argon2 hashes and initialized stats fields if users.json is empty.
 */
async function ensureSeedUsers() {
    const users = readUsers();
    let modified = false;

    if (!users.tony) {
        users.tony = {
            avatar: "blue",
            name: "Tony Lee",
            password: await argon2.hash("t"),
            stats: createDefaultStats()
        };
        modified = true;
    }
    if (!users.may) {
        users.may = {
            avatar: "red",
            name: "May Wong",
            password: await argon2.hash("m"),
            stats: createDefaultStats()
        };
        modified = true;
    }

    // Ensure any account registered by Role 2 has a valid `stats` block
    for (const username of Object.keys(users)) {
        if (!users[username].stats) {
            users[username].stats = createDefaultStats();
            modified = true;
        }
    }

    if (modified) {
        writeUsers(users);
    }
}

/**
 * Builds the sorted Leaderboard array (strips password hashes!).
 * Ranked by Total Wins DESC -> Total Kills DESC -> Accuracy % DESC.
 */
function getLeaderboardList(limit = 20) {
    const users = readUsers();
    const list = Object.entries(users).map(([username, data]) => {
        const s = Object.assign(createDefaultStats(), data.stats || {});
        const accuracy = s.shotsFired > 0 ? Number(((s.hits / s.shotsFired) * 100).toFixed(1)) : 0;
        const winRate = s.gamesPlayed > 0 ? Number(((s.wins / s.gamesPlayed) * 100).toFixed(1)) : 0;

        return {
            username,
            name: data.name || username,
            avatar: data.avatar || "blue",
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
            gamesPlayed: s.gamesPlayed,
            kills: s.kills,
            ricochetKills: s.ricochetKills,
            accuracy,
            winRate
        };
    });

    list.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return b.accuracy - a.accuracy;
    });

    return list.slice(0, limit).map((entry, idx) => Object.assign({ rank: idx + 1 }, entry));
}

/**
 * ROLE 1 -> ROLE 3 PRIMARY HANDOFF FUNCTION
 * Called by server/gameEngine.js when a player reaches 3 kills or the 3:00 timer hits 0:00.
 *
 * Accepts flexible `resultData` from Role 1:
 * {
 *   roomId: "room_1",
 *   reason: "kills" | "timeout" | "disconnect",
 *   durationSeconds: 94,
 *   winner: "tony" | null, // null = Draw
 *   players: [             // Array OR Object keyed by username both supported!
 *     {
 *       username: "tony",
 *       name: "Tony Lee",
 *       color: "blue",
 *       kills: 3,
 *       deaths: 1,
 *       shotsFired: 12,
 *       hits: 3,
 *       ricochetKills: 1,
 *       powerupsCollected: 2
 *     },
 *     { ...player2 }
 *   ]
 * }
 *
 * @returns {Object} Enriched gameOver payload ready for `io.to(roomId).emit("gameOver", payload)`
 */
function recordMatch(resultData) {
    if (!resultData || !resultData.players) {
        throw new Error("[statsAndRank.recordMatch] Missing resultData.players");
    }

    const users = readUsers();

    // Normalize players list whether Role 1 passes an Array `[p1, p2]` or Object `{ u1: p1, u2: p2 }`
    const rawPlayers = Array.isArray(resultData.players)
        ? resultData.players
        : Object.values(resultData.players);

    // Auto-determine winner if Role 1 omitted `winner`
    let winnerUsername = resultData.winner !== undefined ? resultData.winner : null;
    if (winnerUsername === undefined && rawPlayers.length === 2) {
        if ((rawPlayers[0].kills || 0) > (rawPlayers[1].kills || 0)) {
            winnerUsername = rawPlayers[0].username;
        } else if ((rawPlayers[1].kills || 0) > (rawPlayers[0].kills || 0)) {
            winnerUsername = rawPlayers[1].username;
        } else {
            winnerUsername = null; // Draw
        }
    }
    const isDraw = !winnerUsername;

    const formattedPlayers = rawPlayers.map((p) => {
        const uname = p.username;
        const kills = Number(p.kills || 0);
        const deaths = Number(p.deaths || 0);
        const shotsFired = Number(p.shotsFired || 0);
        // If Role 1 doesn't track `hits` separately from `kills` (1-hit kill game!), default hits = kills
        const hits = p.hits !== undefined ? Number(p.hits) : kills;
        const ricochetKills = Number(p.ricochetKills || 0);
        const powerupsCollected = Number(
            p.powerupsCollected !== undefined ? p.powerupsCollected : p.powerups || 0
        );
        const accuracy = shotsFired > 0 ? Number(((hits / shotsFired) * 100).toFixed(1)) : 0;

        // Update persistent stats if user exists in data/users.json
        if (uname && users[uname]) {
            const s = Object.assign(createDefaultStats(), users[uname].stats || {});
            s.gamesPlayed += 1;
            if (isDraw) {
                s.draws += 1;
            } else if (uname === winnerUsername) {
                s.wins += 1;
            } else {
                s.losses += 1;
            }
            s.kills += kills;
            s.deaths += deaths;
            s.shotsFired += shotsFired;
            s.hits += hits;
            s.ricochetKills += ricochetKills;
            s.powerupsCollected += powerupsCollected;
            users[uname].stats = s;
        }

        return {
            username: uname,
            name: p.name || (users[uname] && users[uname].name) || uname,
            color: p.color || (users[uname] && users[uname].avatar) || "blue",
            socketId: p.socketId || null,
            kills,
            deaths,
            shotsFired,
            hits,
            accuracy,
            ricochetKills,
            powerupsCollected,
            outcome: isDraw ? "DRAW" : uname === winnerUsername ? "WIN" : "LOSE"
        };
    });

    writeUsers(users);

    const leaderboard = getLeaderboardList(10);

    // Register room for potential Quick Rematch
    if (resultData.roomId && formattedPlayers.length === 2) {
        rematchRooms.set(resultData.roomId, {
            players: formattedPlayers,
            readySet: new Set()
        });
    }

    return {
        roomId: resultData.roomId || null,
        reason: resultData.reason || "kills", // "kills" | "timeout" | "disconnect"
        durationSeconds: resultData.durationSeconds || 0,
        isDraw,
        winner: winnerUsername,
        winnerName: winnerUsername
            ? (formattedPlayers.find((p) => p.username === winnerUsername) || {}).name || winnerUsername
            : null,
        players: formattedPlayers,
        leaderboard
    };
}

/**
 * Mounts Role 3 REST endpoints onto Express `app` in server.js
 */
function registerRoutes(app) {
    const handler = (req, res) => {
        res.json({
            success: true,
            leaderboard: getLeaderboardList(20)
        });
    };
    app.get("/leaderboard", handler);
    app.get("/api/leaderboard", handler);
}

/**
 * Wires Quick Rematch & Leave Room Socket.IO events on each connected socket.
 *
 * @param {Server} io - Socket.IO server instance
 * @param {Socket} socket - Individual client socket
 * @param {Object} hooks - { onStartRematch: (io, newRoomId, player1, player2) => void }
 */
function registerSocketHandlers(io, socket, hooks = {}) {
    socket.on("requestRematch", (data = {}) => {
        const roomId = data.roomId;
        const sessionUser = socket.request && socket.request.session && socket.request.session.user;
        const username = (sessionUser && sessionUser.username) || data.username;

        if (!roomId || !username || !rematchRooms.has(roomId)) {
            socket.emit("rematchStatus", {
                status: "unavailable",
                message: "Opponent already left the room. Return to Home to pair up again."
            });
            return;
        }

        const entry = rematchRooms.get(roomId);
        // Update latest socketId for this player
        const pObj = entry.players.find((p) => p.username === username);
        if (pObj) pObj.socketId = socket.id;

        entry.readySet.add(username);

        if (entry.readySet.size < 2) {
            io.to(roomId).emit("rematchStatus", {
                status: "waiting",
                readyPlayers: Array.from(entry.readySet),
                message: `${username} wants a rematch! Waiting for opponent...`
            });
        } else {
            // Both players clicked Rematch -> start a fresh match!
            rematchRooms.delete(roomId);
            const newRoomId = `room_rematch_${Date.now()}`;
            const [p1, p2] = entry.players;

            // Ensure both sockets join the new roomId cleanly
            const s1 = p1.socketId ? io.sockets.sockets.get(p1.socketId) : null;
            const s2 = p2.socketId ? io.sockets.sockets.get(p2.socketId) : null;
            if (!s1 || !s2) {
                io.to(roomId).emit("rematchStatus", {
                    status: "unavailable",
                    message: "Opponent disconnected. Please return to Home Lobby."
                });
                return;
            }

            s1.leave(roomId);
            s2.leave(roomId);
            s1.join(newRoomId);
            s2.join(newRoomId);

            io.to(newRoomId).emit("rematchStart", {
                roomId: newRoomId,
                players: [p1, p2]
            });

            // Trigger Role 1's gameEngine.startRoom(...) via hook
            if (typeof hooks.onStartRematch === "function") {
                hooks.onStartRematch(io, newRoomId, p1, p2);
            }
        }
    });

    socket.on("leaveGameOver", (data = {}) => {
        const roomId = data && data.roomId;
        if (roomId && rematchRooms.has(roomId)) {
            rematchRooms.delete(roomId);
            socket.to(roomId).emit("rematchStatus", {
                status: "unavailable",
                message: "Opponent returned to the Home Page."
            });
            socket.leave(roomId);
        }
    });
}

module.exports = {
    ensureSeedUsers,
    readUsers,
    getLeaderboardList,
    recordMatch,
    registerRoutes,
    registerSocketHandlers
};

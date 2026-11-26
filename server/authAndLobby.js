// Auth + lobby (Lab 5/6 pattern). Mounted by server.js.
// Endpoints: /register, /signin, /signout, /validate.
// Lobby: two different signed-in accounts -> both see READY.
// One account cannot take two slots, even from a second browser.

const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const waiting = [];
const occupied = new Set();

function readUsers() {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    const users = {};
    for (const key of Object.keys(raw)) {
        if (key === "_comment" || key === "users") continue;
        const value = raw[key];
        if (value && typeof value === "object" && value.password) users[key] = value;
    }
    return users;
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function defaultStats() {
    return {
        wins: 0, losses: 0, draws: 0, gamesPlayed: 0,
        kills: 0, deaths: 0, shotsFired: 0, hits: 0,
        ricochetKills: 0, powerupsCollected: 0
    };
}

function wordCharsOnly(text) {
    return /^\w+$/.test(text);
}

function registerRoutes(app) {
    app.post("/register", async (req, res) => {
        const { username, avatar, name, password } = req.body;
        const users = readUsers();
        if (!username || !avatar || !name || !password) {
            res.json({ error: "Username/avatar/name/password cannot be empty." });
            return;
        }
        if (!wordCharsOnly(username)) {
            res.json({ error: "Username can only contain underscores, letters or numbers." });
            return;
        }
        if (users[username]) {
            res.json({ error: "Username has already been used." });
            return;
        }
        users[username] = { avatar, name, password: await argon2.hash(password), stats: defaultStats() };
        writeUsers(users);
        res.json({ success: true });
    });

    app.post("/signin", async (req, res) => {
        const { username, password } = req.body;
        const users = readUsers();
        const user = username ? users[username] : null;
        if (!user) {
            res.json({ error: "Incorrect username/password." });
            return;
        }
        const verified = await argon2.verify(user.password, password);
        if (!verified) {
            res.json({ error: "Incorrect username/password." });
            return;
        }
        req.session.user = { username, name: user.name || username, avatar: user.avatar || "blue" };
        res.json({ user: req.session.user });
    });

    app.post("/signout", (req, res) => {
        if (req.session.user) delete req.session.user;
        res.json({ success: true });
    });

    app.get("/validate", (req, res) => {
        if (!req.session.user) {
            res.status(401).json({ error: "You have not signed in." });
            return;
        }
        res.json({ user: req.session.user });
    });
}

function registerSocketHandlers(io, socket) {
    socket.on("joinLobby", (data) => {
        const session = socket.request && socket.request.session;
        const sessionUser = session && session.user;
        const username = typeof data === "string" ? data : (data && data.username) || (sessionUser && sessionUser.username);
        if (!username) {
            socket.emit("lobbyError", "You must be signed in.");
            return;
        }
        if (occupied.has(username)) {
            socket.emit("lobbyError", "Account already in lobby.");
            return;
        }
        if (waiting.some(function (w) { return w.username === username; })) return;

        waiting.push({ socketId: socket.id, username });
        if (waiting.length >= 2) {
            const pair = waiting.splice(0, 2);
            for (const player of pair) occupied.add(player.username);
            for (const player of pair) {
                const s = io.sockets.sockets.get(player.socketId);
                if (s) s.emit("lobbyReady", { players: pair.map((p) => p.username) });
            }
        }
    });

    socket.on("disconnect", () => {
        const index = waiting.findIndex(function (w) { return w.socketId === socket.id; });
        if (index >= 0) waiting.splice(index, 1);
        const session = socket.request && socket.request.session;
        const user = session && session.user;
        if (user) occupied.delete(user.username);
    });
}

module.exports = { registerRoutes, registerSocketHandlers };

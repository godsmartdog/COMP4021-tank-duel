

/* ============================================================================
 * PART A: Upgraded COMP 4021 Lab 3 Base Sprite Factory
 * Preserves all Lab 3 methods + adds rotation, multi-row grid wrapping, and
 * exact pixel display sizing so differently-sized sheets match hitboxes.
 * ============================================================================ */
const Sprite = function (ctx, x, y) {
    // Sheet image object
    const sheet = new Image();
    let sheetLoaded = false;
    sheet.onload = function () {
        sheetLoaded = true;
    };

    // Default sprite sequence (Lab 3 format + optional `columns` for multi-row sheets)
    let sequence = {
        x: 0,
        y: 0,
        width: 24,
        height: 25,
        count: 1,
        columns: 0, // 0 = single horizontal row (Lab 3 default); >0 = wrap every N columns
        timing: 100,
        loop: true
    };

    let index = 0;          // Current animation frame index
    let scale = 1;          // Uniform scale factor (Lab 3)
    let customSize = null;  // Optional { width, height } override for exact hitbox matching
    let rotation = 0;       // Rotation angle in radians (0 = facing right)
    let shadowScale = { x: 1, y: 0.25 };
    let lastUpdate = 0;

    const useSheet = function (spriteSheetUrl) {
        if (sheet.src.indexOf(spriteSheetUrl) === -1) {
            sheetLoaded = false;
            sheet.src = spriteSheetUrl;
        }
        return this;
    };

    const isReady = function () {
        return sheetLoaded && sheet.complete && sheet.naturalWidth > 0;
    };

    const getXY = function () {
        return { x, y };
    };

    const setXY = function (xvalue, yvalue) {
        x = xvalue;
        y = yvalue;
        return this;
    };

    /**
     * Switches animation sequence ONLY if sequence coordinates/settings changed,
     * preventing frame-0 flicker when called inside a 30/60 FPS render loop.
     */
    const setSequence = function (newSequence) {
        const isSame =
            sequence.x === newSequence.x &&
            sequence.y === newSequence.y &&
            sequence.width === newSequence.width &&
            sequence.height === newSequence.height &&
            sequence.count === newSequence.count &&
            (sequence.columns || 0) === (newSequence.columns || 0) &&
            sequence.timing === newSequence.timing &&
            sequence.loop === newSequence.loop;

        if (!isSame) {
            sequence = Object.assign({ columns: 0 }, newSequence);
            index = 0;
            lastUpdate = 0;
        }
        return this;
    };

    const setScale = function (value) {
        scale = value;
        customSize = null;
        return this;
    };

    /**
     * Forces exact rendered pixel width/height on canvas.
     * Crucial because tank_yellow.png is 280x211 while blue/green/red are 279x210.
     */
    const setDisplaySize = function (width, height) {
        customSize = { width, height };
        return this;
    };

    const setRotation = function (angleRadians) {
        rotation = angleRadians || 0;
        return this;
    };

    const setShadowScale = function (value) {
        shadowScale = value;
        return this;
    };

    const getDisplaySize = function () {
        if (customSize) {
            return { width: customSize.width, height: customSize.height };
        }
        return {
            width: sequence.width * scale,
            height: sequence.height * scale
        };
    };

    const getBoundingBox = function () {
        const size = getDisplaySize();
        const top = y - size.height / 2;
        const left = x - size.width / 2;
        const bottom = y + size.height / 2;
        const right = x + size.width / 2;

        return {
            getTop: () => top,
            getLeft: () => left,
            getBottom: () => bottom,
            getRight: () => right,
            isPointInBox: (px, py) => px >= left && px <= right && py >= top && py <= bottom
        };
    };

    const drawShadow = function () {
        const size = getDisplaySize();
        const shadowWidth = size.width * shadowScale.x;
        const shadowHeight = size.height * shadowScale.y;

        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.ellipse(x, y + size.height * 0.35, shadowWidth / 2, shadowHeight / 2, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    };

    const drawSprite = function (fallbackColor) {
        const size = getDisplaySize();

        // Compute source frame (sx, sy) supporting multi-row sprite sheets via `columns`
        let col = index;
        let row = 0;
        if (sequence.columns && sequence.columns > 0) {
            col = index % sequence.columns;
            row = Math.floor(index / sequence.columns);
        }
        const sx = sequence.x + col * sequence.width;
        const sy = sequence.y + row * sequence.height;

        ctx.save();
        ctx.translate(x, y);
        if (rotation !== 0) {
            ctx.rotate(rotation);
        }

        if (isReady()) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(
                sheet,
                sx,
                sy,
                sequence.width,
                sequence.height,
                -size.width / 2,
                -size.height / 2,
                size.width,
                size.height
            );
        } else {
            // Safe fallback shape while PNG loads so Role 1 can test immediately
            ctx.fillStyle = fallbackColor || "#4a90e2";
            ctx.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
        }
        ctx.restore();
    };

    const draw = function (withShadow = false, fallbackColor = null) {
        if (withShadow) drawShadow();
        drawSprite(fallbackColor);
        return this;
    };

    /**
     * Lab 3 Section 2.2 Frame Advancement Logic
     * @param {number} time - Current timestamp in ms (e.g., performance.now())
     */
    const update = function (time) {
        if (lastUpdate === 0) lastUpdate = time;

        if (sequence.timing > 0 && time - lastUpdate >= sequence.timing) {
            index++;
            if (index >= sequence.count) {
                if (sequence.loop) {
                    index = 0;
                } else {
                    index = sequence.count - 1;
                }
            }
            lastUpdate = time;
        }
        return this;
    };

    const getIndex = function () {
        return index;
    };

    return {
        useSheet,
        isReady,
        getXY,
        setXY,
        setSequence,
        setScale,
        setDisplaySize,
        setRotation,
        setShadowScale,
        getDisplaySize,
        getBoundingBox,
        draw,
        update,
        getIndex
    };
};

/* ============================================================================
 * PART B: Exact Sprite Sheet Metadata (Extracted from Teammate A's CSS files)
 * ============================================================================ */
// Inside public/js/sprite.js -> SPRITE_CONFIG:
const SPRITE_CONFIG = {
    basePath: "/assets/sprites/",

    tanks: {
        blue:   { file: "tank/tank_blue.png",   w: 279, h: 210, cols: 4, rows: 4, fallback: "#3b82f6" },
        green:  { file: "tank/tank_green.png",  w: 279, h: 210, cols: 4, rows: 4, fallback: "#22c55e" },
        red:    { file: "tank/tank_red.png",    w: 279, h: 210, cols: 4, rows: 4, fallback: "#ef4444" },
        yellow: { file: "tank/tank_yellow.png", w: 280, h: 211, cols: 4, rows: 4, fallback: "#eab308" }
    },

    bullet: {
        file: "bullet/bullet.png",
        w: 114,
        h: 53,
        cols: 4,
        count: 8,
        timing: 60
    },

    powerup: {
        file: "powerup/powerup.png",
        w: 119,
        h: 117,
        cols: 4,
        rowsByType: { shield: 0, speed: 1, triple: 2 },
        timing: 130
    },

    defaultSizes: {
        tankWidth: 44,
        tankHeight: 34,
        bulletWidth: 20,
        bulletHeight: 10,
        powerupSize: 30
    }
};


/* ============================================================================
 * PART C: GameSprites — Plug-and-Play Interface for Role 1 (game_client.js)
 * Maintains persistent Sprite instances keyed by entity ID so animation frame
 * indices advance smoothly across 30 FPS server state broadcasts!
 * ============================================================================ */
const GameSprites = (function () {
    const tankInstances = new Map();    // key: playerId/username -> Sprite
    const bulletInstances = new Map();  // key: bulletId -> Sprite
    const powerupInstances = new Map(); // key: powerupId -> Sprite
    const activeExplosions = [];        // Canvas particle/ring explosions on tank hit
    const preloadedImages = [];

    /**
     * Preloads all 6 sprite sheets on page load so there is zero pop-in when a match starts.
     * @param {Function} [onComplete] - Optional callback once all images finish loading
     */
    function preload(onComplete) {
        const files = [
            SPRITE_CONFIG.tanks.blue.file,
            SPRITE_CONFIG.tanks.green.file,
            SPRITE_CONFIG.tanks.red.file,
            SPRITE_CONFIG.tanks.yellow.file,
            SPRITE_CONFIG.bullet.file,
            SPRITE_CONFIG.powerup.file
        ];

        let remaining = files.length;
        files.forEach((file) => {
            const img = new Image();
            img.onload = img.onerror = () => {
                remaining--;
                if (remaining === 0 && typeof onComplete === "function") {
                    onComplete();
                }
            };
            img.src = SPRITE_CONFIG.basePath + file;
            preloadedImages.push(img);
        });
    }

    /**
     * Draws an animated tank + turret aim indicator + Shield / Cheat Mode visual rings.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} tankState
     *   {
     *     id: string,              // unique player id or username (required to track frame index)
     *     x: number,               // center X on canvas
     *     y: number,               // center Y on canvas
     *     angle: number,           // hull rotation in radians (0 = right)
     *     turretAngle?: number,    // optional independent mouse turret angle in radians
     *     color?: "blue"|"green"|"red"|"yellow",
     *     isMoving?: boolean,      // true = animate treads; false = idle frame
     *     row?: number,            // optional row selector (0..3) if using directional/recoil rows
     *     useAll16Frames?: boolean,// optional flag if sheet animates across all 16 cells
     *     hasShield?: boolean,     // draws cyan 1-Hit Shield ring
     *     speedBoost?: boolean,    // draws speed aura
     *     cheatMode?: boolean,     // draws gold Invincible Cheat Mode aura ('C' key)
     *     isDead?: boolean,        // skips drawing tank while respawning
     *     width?: number,          // optional canvas width override (default 44)
     *     height?: number          // optional canvas height override (default 34)
     *   }
     * @param {number} [now=performance.now()] - Current timestamp in ms
     */
    function drawTank(ctx, tankState, now = performance.now()) {
        if (!tankState || tankState.isDead) return;

        const id = tankState.id || tankState.username || "default_tank";
        const colorKey = SPRITE_CONFIG.tanks[tankState.color] ? tankState.color : "blue";
        const meta = SPRITE_CONFIG.tanks[colorKey];

        let sprite = tankInstances.get(id);
        if (!sprite) {
            sprite = Sprite(ctx, tankState.x, tankState.y);
            tankInstances.set(id, sprite);
        }

        const displayW = tankState.width || SPRITE_CONFIG.defaultSizes.tankWidth;
        const displayH = tankState.height || SPRITE_CONFIG.defaultSizes.tankHeight;
        const rowIndex = Number.isInteger(tankState.row) ? Math.max(0, Math.min(3, tankState.row)) : 0;

        // Animate treads when moving; hold steady frame when stationary
        const seq = tankState.useAll16Frames
            ? {
                  x: 0,
                  y: 0,
                  width: meta.w,
                  height: meta.h,
                  count: tankState.isMoving === false ? 1 : 16,
                  columns: 4,
                  timing: tankState.isMoving === false ? 0 : 65,
                  loop: true
              }
            : {
                  x: 0,
                  y: rowIndex * meta.h,
                  width: meta.w,
                  height: meta.h,
                  count: tankState.isMoving === false ? 1 : 4,
                  columns: 4,
                  timing: tankState.isMoving === false ? 0 : 85,
                  loop: true
              };

        sprite
            .useSheet(SPRITE_CONFIG.basePath + meta.file)
            .setXY(tankState.x, tankState.y)
            .setDisplaySize(displayW, displayH)
            .setRotation(tankState.angle || 0)
            .setSequence(seq);

        if (tankState.isMoving !== false) {
            sprite.update(now);
        }

        // 1. Optional Speed Boost glow underneath tank
        if (tankState.speedBoost) {
            ctx.save();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(tankState.x, tankState.y, Math.max(displayW, displayH) * 0.58, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Draw rotated animated tank sprite
        sprite.draw(true, meta.fallback);

        // 3. If Role 1 passes an independent mouse-aimed `turretAngle`, draw subtle aim barrel
        if (typeof tankState.turretAngle === "number" && tankState.turretAngle !== tankState.angle) {
            ctx.save();
            ctx.translate(tankState.x, tankState.y);
            ctx.rotate(tankState.turretAngle);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(4, 0);
            ctx.lineTo(displayW * 0.55, 0);
            ctx.stroke();
            ctx.restore();
        }

        // 4. Draw 1-Hit Shield bubble (Power-Up)
        if (tankState.hasShield) {
            const pulse = 2 * Math.sin(now / 120);
            ctx.save();
            ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
            ctx.fillStyle = "rgba(34, 211, 238, 0.16)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(tankState.x, tankState.y, Math.max(displayW, displayH) * 0.62 + pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 5. Draw Cheat Mode ('C' key) Invincible Golden Ring
        if (tankState.cheatMode) {
            const pulse = 2.5 * Math.cos(now / 90);
            ctx.save();
            ctx.strokeStyle = "#facc15";
            ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(tankState.x, tankState.y, Math.max(displayW, displayH) * 0.7 + pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    /**
     * Draws an 8-frame animated bouncing bullet aligned with its velocity vector.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} bulletState - { id, x, y, vx, vy, angle?, width?, height? }
     * @param {number} [now=performance.now()]
     */
    function drawBullet(ctx, bulletState, now = performance.now()) {
        if (!bulletState) return;

        const id = bulletState.id !== undefined ? bulletState.id : `${bulletState.x}_${bulletState.y}`;
        let sprite = bulletInstances.get(id);
        if (!sprite) {
            sprite = Sprite(ctx, bulletState.x, bulletState.y);
            bulletInstances.set(id, sprite);
        }

        const angle =
            typeof bulletState.angle === "number"
                ? bulletState.angle
                : Math.atan2(bulletState.vy || 0, bulletState.vx || 1);

        const meta = SPRITE_CONFIG.bullet;
        sprite
            .useSheet(SPRITE_CONFIG.basePath + meta.file)
            .setXY(bulletState.x, bulletState.y)
            .setDisplaySize(
                bulletState.width || SPRITE_CONFIG.defaultSizes.bulletWidth,
                bulletState.height || SPRITE_CONFIG.defaultSizes.bulletHeight
            )
            .setRotation(angle)
            .setSequence({
                x: 0,
                y: 0,
                width: meta.w,
                height: meta.h,
                count: meta.count,   // Cycles all 8 frames across both rows!
                columns: meta.cols,  // 4 frames per row -> wraps cleanly to row 2
                timing: meta.timing,
                loop: true
            })
            .update(now)
            .draw(false, "#f97316");
    }

    /**
     * Draws a 4-frame spinning Power-Up item ("shield" | "speed" | "triple").
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} itemState - { id, x, y, type: "shield"|"speed"|"triple", size? }
     * @param {number} [now=performance.now()]
     */
    function drawPowerUp(ctx, itemState, now = performance.now()) {
        if (!itemState) return;

        const id = itemState.id !== undefined ? itemState.id : `${itemState.type}_${itemState.x}_${itemState.y}`;
        let sprite = powerupInstances.get(id);
        if (!sprite) {
            sprite = Sprite(ctx, itemState.x, itemState.y);
            powerupInstances.set(id, sprite);
        }

        const meta = SPRITE_CONFIG.powerup;
        const row = meta.rowsByType[itemState.type] !== undefined ? meta.rowsByType[itemState.type] : 0;
        const size = itemState.size || SPRITE_CONFIG.defaultSizes.powerupSize;

        sprite
            .useSheet(SPRITE_CONFIG.basePath + meta.file)
            .setXY(itemState.x, itemState.y)
            .setDisplaySize(size, size)
            .setRotation(0)
            .setSequence({
                x: 0,
                y: row * meta.h,
                width: meta.w,
                height: meta.h,
                count: 4,
                columns: 4,
                timing: meta.timing,
                loop: true
            })
            .update(now)
            .draw(true, "#a855f7");
    }

    /**
     * Spawns an animated multi-ring fireball explosion at (x, y) when a tank is destroyed.
     */
    function spawnExplosion(x, y, now = performance.now()) {
        const particles = [];
        for (let i = 0; i < 12; i++) {
            const theta = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
            const speed = 1.4 + Math.random() * 2.2;
            particles.push({
                dx: Math.cos(theta) * speed,
                dy: Math.sin(theta) * speed,
                radius: 3 + Math.random() * 3
            });
        }
        activeExplosions.push({ x, y, startTime: now, duration: 480, particles });
    }

    /**
     * Updates and draws all active tank explosions on the canvas.
     * Role 1 calls this once at the end of each render frame.
     */
    function drawExplosions(ctx, now = performance.now()) {
        for (let i = activeExplosions.length - 1; i >= 0; i--) {
            const exp = activeExplosions[i];
            const elapsed = now - exp.startTime;
            if (elapsed >= exp.duration) {
                activeExplosions.splice(i, 1);
                continue;
            }

            const progress = elapsed / exp.duration; // 0.0 -> 1.0
            const alpha = 1 - progress;
            const frameStep = Math.floor(progress * 6); // Discrete visible explosion steps

            ctx.save();
            // Outer shockwave ring
            ctx.strokeStyle = `rgba(251, 146, 60, ${alpha})`;
            ctx.lineWidth = 4 * alpha;
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, 10 + frameStep * 6, 0, Math.PI * 2);
            ctx.stroke();

            // Inner fireball core
            ctx.fillStyle = frameStep % 2 === 0
                ? `rgba(254, 240, 138, ${alpha})`
                : `rgba(239, 68, 68, ${alpha})`;
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, Math.max(2, 18 * (1 - progress * 0.8)), 0, Math.PI * 2);
            ctx.fill();

            // Flying debris sparks
            exp.particles.forEach((p) => {
                const px = exp.x + p.dx * (elapsed * 0.09);
                const py = exp.y + p.dy * (elapsed * 0.09);
                ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, p.radius * alpha, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }
    }

    /**
     * Garbage-collects cached bullet/powerup Sprite instances that are no longer active
     * so memory stays flat during a 3-minute rapid-fire match.
     */
    function pruneEntities(activeBulletIds = [], activePowerUpIds = []) {
        const bSet = new Set(activeBulletIds);
        for (const id of bulletInstances.keys()) {
            if (!bSet.has(id)) bulletInstances.delete(id);
        }
        const pSet = new Set(activePowerUpIds);
        for (const id of powerupInstances.keys()) {
            if (!pSet.has(id)) powerupInstances.delete(id);
        }
    }

    function resetAll() {
        tankInstances.clear();
        bulletInstances.clear();
        powerupInstances.clear();
        activeExplosions.length = 0;
    }

    return {
        CONFIG: SPRITE_CONFIG,
        preload,
        drawTank,
        drawBullet,
        drawPowerUp,
        spawnExplosion,
        drawExplosions,
        pruneEntities,
        resetAll
    };
})();

// Expose globally for browser script tags in index.html
window.Sprite = Sprite;
window.GameSprites = GameSprites;
export { Sprite, GameSprites };

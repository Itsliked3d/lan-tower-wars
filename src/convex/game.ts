import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const COLORS = ["#fb7185", "#f59e0b", "#22d3ee", "#a78bfa"];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STARTING_GOLD = 30;
const BASE_INCOME = 2;
const GRID_WIDTH = 14;
const GRID_HEIGHT = 8;
const START_POINT = { x: 0, y: 4 };

type UnitConfig = {
  label: string;
  cost: number;
  income: number;
  hp: number;
  speed: number;
  damage: number;
  tier: "budget" | "mid" | "endgame";
  flying?: boolean;
  resistance?: "splash" | "slow" | "physical" | "all";
};

const UNIT_CONFIG: Record<string, UnitConfig> = {
  // ── Budget ──
  soldier: { label: "Foot Soldier", cost: 5, income: 1, hp: 14, speed: 1.25, damage: 8, tier: "budget" },
  scout: { label: "Scout", cost: 8, income: 1, hp: 8, speed: 1.8, damage: 5, tier: "budget" },
  runner: { label: "Runner", cost: 12, income: 1, hp: 6, speed: 2.6, damage: 6, tier: "budget" },
  grunt: { label: "Grunt", cost: 25, income: 2, hp: 30, speed: 0.8, damage: 12, tier: "budget", resistance: "splash" },
  slinger: { label: "Slinger", cost: 35, income: 3, hp: 10, speed: 1.2, damage: 10, tier: "budget", flying: true },
  // ── Mid-game ──
  brute: { label: "Brute", cost: 120, income: 8, hp: 200, speed: 0.5, damage: 40, tier: "mid" },
  raider: { label: "Raider", cost: 250, income: 15, hp: 80, speed: 2.0, damage: 25, tier: "mid", resistance: "slow" },
  juggernaut: { label: "Juggernaut", cost: 500, income: 25, hp: 500, speed: 0.35, damage: 65, tier: "mid", resistance: "all" },
  phantom: { label: "Phantom", cost: 350, income: 18, hp: 40, speed: 3.0, damage: 30, tier: "mid", flying: true },
  // ── Endgame ──
  siege_breaker: { label: "Siege Breaker", cost: 2000, income: 60, hp: 1200, speed: 0.3, damage: 120, tier: "endgame" },
  leviathan: { label: "Leviathan", cost: 5000, income: 120, hp: 3000, speed: 0.2, damage: 200, tier: "endgame", resistance: "splash" },
  wraith_lord: { label: "Wraith Lord", cost: 8000, income: 150, hp: 500, speed: 2.5, damage: 100, tier: "endgame", flying: true, resistance: "physical" },
  titan: { label: "Titan", cost: 20000, income: 350, hp: 8000, speed: 0.15, damage: 400, tier: "endgame", resistance: "all" },
  doomsday: { label: "Doomsday", cost: 50000, income: 500, hp: 15000, speed: 0.1, damage: 800, tier: "endgame" },
  abuse_control: { label: "Abuse Control", cost: 0, income: 0, hp: 18, speed: 1.45, damage: 2, tier: "budget" },
} as const;

const TOWER_CONFIG = {
  close: { label: "Pulse Tower", cost: 15, range: 1, damage: 10, splash: false, slow: false },
  far: { label: "Rail Tower", cost: 25, range: 3, damage: 4, splash: false, slow: false },
  splash: { label: "Arc Tower", cost: 35, range: 2, damage: 6, splash: true, slow: false },
  slow: { label: "Snare Tower", cost: 30, range: 2, damage: 3, splash: false, slow: true },
} as const;

const UPGRADE_COSTS = [30, 80, 200] as const;

type Player = Doc<"games">["players"][number];
type GridPoint = { x: number; y: number };
type TowerLike = {
  x?: number;
  y?: number;
  position: number;
  type?: keyof typeof TOWER_CONFIG;
  upgradeBranch?: "power" | "control";
  upgradeLevel?: number;
};

type ProjectileLike = {
  id: string;
  towerType: keyof typeof TOWER_CONFIG;
  targetUnitId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  damage: number;
  splash?: boolean;
};

function cleanName(name: string) {
  return name.trim().slice(0, 18) || "Player";
}

function cleanRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

function createRoomCode() {
  return Array.from({ length: 5 }, () =>
    ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)],
  ).join("");
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePlayer(player: Player) {
  return {
    ...player,
    gold: player.gold ?? STARTING_GOLD,
    income: player.income ?? BASE_INCOME,
    laneUnits: player.laneUnits ?? [],
    towers: player.towers ?? [],
    projectiles: player.projectiles ?? [],
  };
}

function createPlayer(userId: Player["userId"], name: string, color: string) {
  return {
    userId,
    name: cleanName(name),
    color,
    health: 100,
    units: 0,
    incoming: 0,
    shield: 0,
    sent: 0,
    defended: 0,
    gold: STARTING_GOLD,
    income: BASE_INCOME,
    laneUnits: [],
    towers: [],
    projectiles: [],
  };
}

function towerPoint(tower: TowerLike): GridPoint {
  return {
    x: tower.x ?? Math.round((tower.position / 100) * (GRID_WIDTH - 1)),
    y: tower.y ?? START_POINT.y,
  };
}

function unitPoint(unit: { x?: number; y?: number; position: number }): GridPoint {
  return {
    x: unit.x ?? Math.round((unit.position / 100) * (GRID_WIDTH - 1)),
    y: unit.y ?? START_POINT.y,
  };
}

function pointKey(point: GridPoint) {
  return `${point.x}:${point.y}`;
}

function findPath(towers: TowerLike[], start: GridPoint): GridPoint[] | null {
  const blocked = new Set(towers.map((tower) => pointKey(towerPoint(tower))));
  const startKey = pointKey(start);
  if (blocked.has(startKey)) return null;

  const queue: Array<{ point: GridPoint; path: GridPoint[] }> = [
    { point: start, path: [start] },
  ];
  const visited = new Set([startKey]);
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.point.x === GRID_WIDTH - 1) return current.path;

    for (const direction of directions) {
      const next = { x: current.point.x + direction.x, y: current.point.y + direction.y };
      if (
        next.x < 0 ||
        next.x >= GRID_WIDTH ||
        next.y < 0 ||
        next.y >= GRID_HEIGHT
      ) {
        continue;
      }
      const nextKey = pointKey(next);
      if (blocked.has(nextKey) || visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ point: next, path: [...current.path, next] });
    }
  }

  return null;
}

function pathForPlayer(towers: Player["towers"]) {
  return findPath(towers ?? [], START_POINT);
}

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx); 
  if (userId === null) throw new Error("Sign in first — even anonymous access counts.");
  return userId;
}

async function getGame(ctx: MutationCtx, roomCode: string) {
  const game = await ctx.db
    .query("games")
    .withIndex("by_room_code", (q) => q.eq("roomCode", cleanRoomCode(roomCode)))
    .unique();
  if (!game) throw new Error("Room not found. Check the code and try again.");
  return game;
}

export const getRoom = query({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_code", (q) => q.eq("roomCode", cleanRoomCode(args.roomCode)))
      .unique();
    return game
      ? { ...game, players: game.players.map((player) => normalizePlayer(player)) }
      : null;
  },
});

export const createRoom = mutation({
  args: { name: v.string(), maxPlayers: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const maxPlayers = Math.min(4, Math.max(2, Math.floor(args.maxPlayers)));
    let roomCode = createRoomCode();
    while (
      await ctx.db
        .query("games")
        .withIndex("by_room_code", (q) => q.eq("roomCode", roomCode))
        .unique()
    ) {
      roomCode = createRoomCode();
    }

    const now = Date.now();
    await ctx.db.insert("games", {
      roomCode,
      status: "lobby",
      maxPlayers,
      wave: 1,
      players: [createPlayer(userId, args.name, COLORS[0])],
      lastAction: "Match created. Draw a route through the grid when the room goes live.",
      updatedAt: now,
    });
    return roomCode;
  },
});

export const createPracticeRoom = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const roomCode = createRoomCode();
    const now = Date.now();

    // Create a bot player with a fake userId
    const botId = `bot-${createId("bot")}` as Doc<"users">["_id"];
    const botBase = createPlayer(botId, "BOT", COLORS[1]);
    const bot: Player = {
      ...botBase,
      gold: 20,
      towers: [
        { id: createId("tower"), type: "close" as const, position: 28, hp: 100, x: 4, y: 4, upgradeLevel: 0 },
        { id: createId("tower"), type: "far" as const, position: 57, hp: 100, x: 8, y: 3, upgradeLevel: 0 },
      ],
    };

    await ctx.db.insert("games", {
      roomCode,
      status: "playing",
      maxPlayers: 2,
      wave: 1,
      players: [createPlayer(userId, args.name, COLORS[0]), bot],
      lastAction: "Practice mode — hone your maze against the bot.",
      updatedAt: now,
      lastTick: now,
      lastAbuseControlSpawn: now,
      isPractice: true,
    });
    return roomCode;
  },
});

export const joinRoom = mutation({
  args: { roomCode: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "lobby") throw new Error("This game has already started.");
    if (game.players.some((player) => player.userId === userId)) return game.roomCode;
    if (game.players.length >= game.maxPlayers) throw new Error("That room is full.");

    const players = [
      ...game.players,
      createPlayer(userId, args.name, COLORS[game.players.length] ?? COLORS[0]),
    ];
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${cleanName(args.name)} joined the match.`,
      updatedAt: Date.now(),
    });
    return game.roomCode;
  },
});

export const leaveRoom = mutation({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    const leavingPlayer = game.players.find((player) => player.userId === userId);
    if (!leavingPlayer) return;

    const players = game.players.filter((player) => player.userId !== userId);
    if (players.length === 0) {
      await ctx.db.delete(game._id);
      return;
    }
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${leavingPlayer.name} left the match.`,
      updatedAt: Date.now(),
    });
  },
});

export const startGame = mutation({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.players[0]?.userId !== userId) throw new Error("Only the room host can start.");
    if (game.players.length < 2) throw new Error("Invite at least one other player first.");
    if (game.status !== "lobby") return;

    const now = Date.now();
    await ctx.db.patch(game._id, {
      status: "playing",
      lastTick: now,
      lastAbuseControlSpawn: now,
      lastAction: "The battle is live. Click empty grid cells to build a route around your towers.",
      updatedAt: now,
    });
  },
});

export const buildTower = mutation({
  args: {
    roomCode: v.string(),
    towerType: v.union(
      v.literal("close"),
      v.literal("far"),
      v.literal("splash"),
      v.literal("slow"),
    ),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The battle is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");

    const x = Math.floor(args.x ?? 1);
    const y = Math.floor(args.y ?? START_POINT.y);
    if (x <= 0 || x >= GRID_WIDTH - 1 || y < 0 || y >= GRID_HEIGHT) {
      throw new Error("Build inside the lane, leaving the spawn and goal columns open.");
    }

    const player = normalizePlayer(game.players[index]);
    const config = TOWER_CONFIG[args.towerType];
    if (player.gold < config.cost) throw new Error(`You need ${config.cost} gold for that tower.`);
    if (player.towers.some((tower) => pointKey(towerPoint(tower)) === `${x}:${y}`)) {
      throw new Error("That grid cell already contains a tower.");
    }
    if (player.laneUnits.some((unit) => pointKey(unitPoint(unit)) === `${x}:${y}`)) {
      throw new Error("A unit is occupying that cell. Let it pass before building there.");
    }

    const tower = {
      id: createId("tower"),
      type: args.towerType,
      position: (x / (GRID_WIDTH - 1)) * 100,
      hp: 100,
      x,
      y,
      upgradeLevel: 0,
    };
    const proposedTowers = [...player.towers, tower];
    if (!findPath(proposedTowers, START_POINT)) {
      throw new Error("That tower would seal the route. Leave at least one path to the goal.");
    }
    // Only check non-flying units for stranding
    if (player.laneUnits.some((unit) => !(unit.flying) && !findPath(proposedTowers, unitPoint(unit)))) {
      throw new Error("That tower would strand a ground unit already on the lane.");
    }

    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? { ...player, gold: player.gold - config.cost, towers: proposedTowers }
        : normalizePlayer(current),
    );
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} built a ${config.label}`,
      updatedAt: Date.now(),
    });
  },
});

export const upgradeTower = mutation({
  args: {
    roomCode: v.string(),
    towerId: v.string(),
    branch: v.union(v.literal("power"), v.literal("control")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The battle is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");

    const player = normalizePlayer(game.players[index]);
    const towerIndex = player.towers.findIndex((tower) => tower.id === args.towerId);
    if (towerIndex < 0) throw new Error("That tower is no longer on your lane.");
    const tower = player.towers[towerIndex];
    const level = tower.upgradeLevel ?? 0;
    if (level >= 3) throw new Error("That tower has reached maximum level.");
    if (tower.upgradeBranch && tower.upgradeBranch !== args.branch) {
      throw new Error("This tower is already committed to the other upgrade branch.");
    }
    const cost = UPGRADE_COSTS[level] ?? 200;
    if (player.gold < cost) throw new Error(`You need ${cost} gold for this upgrade.`);

    const towers = player.towers.map((current, currentIndex) =>
      currentIndex === towerIndex
        ? { ...current, upgradeBranch: args.branch, upgradeLevel: level + 1 }
        : current,
    );
    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? { ...player, gold: player.gold - cost, towers }
        : normalizePlayer(current),
    );
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} upgraded ${TOWER_CONFIG[tower.type].label} ${args.branch} → L${level + 1}`,
      updatedAt: Date.now(),
    });
  },
});

const ALL_SENDABLE_UNITS = v.union(
  v.literal("soldier"),
  v.literal("scout"),
  v.literal("runner"),
  v.literal("grunt"),
  v.literal("slinger"),
  v.literal("brute"),
  v.literal("raider"),
  v.literal("juggernaut"),
  v.literal("phantom"),
  v.literal("siege_breaker"),
  v.literal("leviathan"),
  v.literal("wraith_lord"),
  v.literal("titan"),
  v.literal("doomsday"),
);

export const sendUnit = mutation({
  args: {
    roomCode: v.string(),
    unitType: ALL_SENDABLE_UNITS,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The battle is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");

    const targetIndex = (index + 1) % game.players.length;
    const player = normalizePlayer(game.players[index]);
    const target = normalizePlayer(game.players[targetIndex]);
    const config = UNIT_CONFIG[args.unitType];
    if (!config) throw new Error("Unknown unit type.");
    if (player.gold < config.cost) throw new Error(`You need ${config.cost} gold for that unit.`);

    // Flying units ignore towers — they always have a direct path
    let path: GridPoint[] | null;
    if (config.flying) {
      path = [{ x: 0, y: START_POINT.y }];
      for (let px = 1; px < GRID_WIDTH; px++) {
        path.push({ x: px, y: START_POINT.y });
      }
    } else {
      path = pathForPlayer(target.towers);
      if (!path) throw new Error(`${target.name}'s route is blocked. They need to open a path first.`);
    }

    const unit = {
      id: createId(args.unitType),
      type: args.unitType,
      position: 0,
      hp: config.hp,
      x: START_POINT.x,
      y: START_POINT.y,
      path,
      pathIndex: 0,
      pathProgress: 0,
      flying: config.flying ?? false,
      resistance: config.resistance,
    };
    const players = game.players.map((current, currentIndex) => {
      if (currentIndex === index) {
        return {
          ...player,
          gold: player.gold - config.cost,
          income: player.income + config.income,
          sent: player.sent + 1,
        };
      }
      if (currentIndex === targetIndex) {
        return {
          ...target,
          laneUnits: [...target.laneUnits, unit],
          incoming: target.incoming + 1,
        };
      }
      return normalizePlayer(current);
    });
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} sent ${config.label} → ${target.name}`,
      updatedAt: Date.now(),
    });
  },
});

export const tick = mutation({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") return;

    const now = Date.now();
    const previousTick = game.lastTick ?? now;
    const elapsed = Math.min(3, Math.max(0, (now - previousTick) / 1000));
    if (elapsed < 0.8) return;

    const isPractice = game.isPractice === true;
    const previousAbuse = game.lastAbuseControlSpawn;
    const abuseDue = previousAbuse !== undefined && now - previousAbuse >= 10000;
    let abuseMessage = "";
    let leakMessage = "";

    const botPendingUnits: Array<Record<string, unknown>> = [];

    const players = game.players.map((player) => {
      const state = normalizePlayer(player);
      const isBot = String(player.userId).startsWith("bot-");

      // Bot AI: auto-build and send units
      let botGold = state.gold;
      let botTowers = state.towers;
      let botIncome = state.income;
      let botSent = state.sent;

      if (isPractice && isBot) {
        // Bot builds a tower every ~15s if it has gold
        if (Math.random() < 0.15 && botGold >= TOWER_CONFIG.close.cost) {
          const botX = Math.floor(Math.random() * (GRID_WIDTH - 2)) + 1;
          const botY = Math.floor(Math.random() * GRID_HEIGHT);
          const proposed = [...botTowers, { id: createId("tower"), type: "close" as const, position: 0, hp: 100, x: botX, y: botY, upgradeLevel: 0 }];
          if (findPath(proposed, START_POINT)) {
            botTowers = proposed;
            botGold -= TOWER_CONFIG.close.cost;
          }
        }
        // Bot sends a unit every ~8s
        if (Math.random() < 0.12) {
          const types = ["soldier", "scout", "runner", "grunt"];
          const pick = types[Math.floor(Math.random() * types.length)];
          const cfg = UNIT_CONFIG[pick];
          if (botGold >= cfg.cost) {
            botGold -= cfg.cost;
            botIncome += cfg.income;
            botSent += 1;
            const humanPlayer = game.players[0];
            const humanState = normalizePlayer(humanPlayer);
            const route = pathForPlayer(humanState.towers);
            if (route) {
              botPendingUnits.push({
                id: createId(pick),
                type: pick,
                position: 0,
                hp: cfg.hp,
                x: START_POINT.x,
                y: START_POINT.y,
                path: route,
                pathIndex: 0,
                pathProgress: 0,
                flying: cfg.flying ?? false,
                resistance: cfg.resistance,
              });
            }
          }
        }
      }

      const route = pathForPlayer(botTowers.length > 0 ? botTowers : state.towers);
      let laneUnits = isBot ? state.laneUnits : state.laneUnits;

      if (abuseDue && route) {
        laneUnits = [
          ...laneUnits,
          {
            id: createId("abuse-control"),
            type: "abuse_control" as const,
            position: 0,
            hp: UNIT_CONFIG.abuse_control.hp,
            x: START_POINT.x,
            y: START_POINT.y,
            path: route,
            pathIndex: 0,
            pathProgress: 0,
            flying: false,
          },
        ];
        abuseMessage = `Abuse Control: ${state.name}'s route reaches the goal.`;
      } else if (abuseDue) {
        abuseMessage = `Abuse Control: ${state.name}'s route is BLOCKED.`;
      }

      const currentTowers = isBot ? botTowers : state.towers;

      const movedUnits = laneUnits.map((unit) => {
        const start = unitPoint(unit);
        const path = unit.flying
          ? [{ x: 0, y: START_POINT.y }, ...Array.from({ length: GRID_WIDTH - 1 }, (_, i) => ({ x: i + 1, y: START_POINT.y }))]
          : findPath(currentTowers, start);
        if (!path) return { ...unit, x: start.x, y: start.y };

        let pathIndex = 0;
        let pathProgress = (unit.pathProgress ?? 0) + (UNIT_CONFIG[unit.type]?.speed ?? 1) * elapsed;
        while (pathIndex < path.length - 1 && pathProgress >= 1) {
          pathIndex += 1;
          pathProgress -= 1;
        }
        const point = path[pathIndex];
        return {
          ...unit,
          x: point.x,
          y: point.y,
          position: (point.x / (GRID_WIDTH - 1)) * 100,
          path,
          pathIndex,
          pathProgress,
        };
      });

      const nextProjectiles: ProjectileLike[] = [];
      for (const projectile of (state.projectiles ?? []) as ProjectileLike[]) {
        const progress = projectile.progress + projectile.speed * elapsed;
        if (progress < 1) {
          nextProjectiles.push({ ...projectile, progress });
          continue;
        }

        const targetIndex = movedUnits.findIndex((unit) => unit.id === projectile.targetUnitId);
        if (targetIndex < 0) continue;
        const targetUnit = movedUnits[targetIndex];

        // Handle resistances
        let effectiveDamage = projectile.damage;
        if (targetUnit.resistance === "all" || targetUnit.resistance === "physical") {
          effectiveDamage *= 0.5;
        }
        if (projectile.splash && targetUnit.resistance === "splash") {
          effectiveDamage *= 0.3;
        }

        if (projectile.splash) {
          const impactPoint = unitPoint(movedUnits[targetIndex]);
          movedUnits.forEach((unit, unitIndex) => {
            const location = unitPoint(unit);
            if (Math.abs(location.x - impactPoint.x) + Math.abs(location.y - impactPoint.y) <= 1) {
              let dmg = projectile.damage;
              if (unit.resistance === "all") dmg *= 0.5;
              if (unit.resistance === "splash") dmg *= 0.3;
              movedUnits[unitIndex] = { ...unit, hp: unit.hp - dmg };
            }
          });
        } else {
          movedUnits[targetIndex] = { ...targetUnit, hp: targetUnit.hp - effectiveDamage };
        }
      }

      for (const tower of currentTowers) {
        const config = TOWER_CONFIG[tower.type];
        const level = tower.upgradeLevel ?? 0;
        const range = config.range + (tower.upgradeBranch === "control" ? level : 0);
        const damage = config.damage * (1 + (tower.upgradeBranch === "power" ? level * 0.2 : 0));
        const towerLocation = towerPoint(tower);
        const inRange = movedUnits
          .map((unit, unitIndex) => ({ unit, unitIndex }))
          .filter(({ unit }) => {
            const location = unitPoint(unit);
            const distance = Math.abs(location.x - towerLocation.x) + Math.abs(location.y - towerLocation.y);
            return unit.hp > 0 && distance <= range;
          });
        const targets = config.splash ? inRange : inRange.slice(0, 1);
        for (const { unit, unitIndex } of targets) {
          const location = unitPoint(unit);
          // Slow effect is weaker now
          const slowFactor = config.slow && tower.upgradeBranch === "control" ? 0.75 - level * 0.05 : 1;
          if (unit.resistance !== "slow" && unit.resistance !== "all") {
            movedUnits[unitIndex] = {
              ...movedUnits[unitIndex],
              pathProgress: (movedUnits[unitIndex].pathProgress ?? 0) * slowFactor,
            };
          }
          nextProjectiles.push({
            id: createId("projectile"),
            towerType: tower.type,
            targetUnitId: unit.id,
            x: towerLocation.x,
            y: towerLocation.y,
            targetX: location.x,
            targetY: location.y,
            progress: 0,
            speed: 2.8,
            damage: damage * elapsed,
            splash: config.splash,
          });
        }
      }

      const leaked = movedUnits.filter((unit) => unit.x === GRID_WIDTH - 1 && unit.hp > 0);
      if (leaked.length > 0) {
        const damage = leaked.reduce((total, unit) => total + (UNIT_CONFIG[unit.type]?.damage ?? 5), 0);
        const abuseReached = leaked.some((unit) => unit.type === "abuse_control");
        leakMessage = abuseReached
          ? `Abuse Control reached ${state.name}'s goal — route confirmed.`
          : `${state.name} lost ${damage} integrity.`;
      }

      const remainingUnits = movedUnits.filter((unit) => unit.hp > 0 && unit.x < GRID_WIDTH - 1);
      return {
        ...state,
        gold: (isBot ? botGold : state.gold) + Math.floor((isBot ? botIncome : state.income) * elapsed),
        income: isBot ? botIncome : state.income,
        health: Math.max(0, state.health - leaked.reduce((total, unit) => total + (UNIT_CONFIG[unit.type]?.damage ?? 5), 0)),
        laneUnits: remainingUnits,
        incoming: remainingUnits.length,
        towers: isBot ? botTowers : state.towers,
        sent: isBot ? botSent : state.sent,
        projectiles: nextProjectiles,
      };
    });

    // Inject bot's pending units into the human player's lane
    const finalPlayers = players.map((p, idx) => {
      if (idx === 0 && game.isPractice && botPendingUnits.length > 0) {
        return {
          ...p,
          laneUnits: [...(p.laneUnits ?? []), ...botPendingUnits] as typeof p.laneUnits,
          incoming: (p.incoming ?? 0) + botPendingUnits.length,
        };
      }
      return p;
    });

    const ended = finalPlayers.some((p) => p.health <= 0);
    await ctx.db.patch(game._id, {
      players: finalPlayers,
      lastTick: now,
      lastAbuseControlSpawn: abuseDue ? now : previousAbuse,
      status: ended ? "ended" : "playing",
      lastAction: leakMessage || abuseMessage || game.lastAction,
      updatedAt: now,
    });
  },
});

// Legacy stubs
export const sendUnits = mutation({
  args: { roomCode: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("The battlefield now deploys one physical unit at a time.");
  },
});

export const defendIncoming = mutation({
  args: { roomCode: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Defenses now fire automatically from physical towers.");
  },
});

export const resolveWave = mutation({
  args: { roomCode: v.string() },
  handler: async () => {
    throw new Error("Waves now advance continuously on the physical battlefield.");
  },
});

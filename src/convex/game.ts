import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const COLORS = [
  "#fb7185",
  "#f59e0b",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#facc15",
];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STARTING_GOLD = 200;
const BASE_INCOME = 30;
const INCOME_INTERVAL_MS = 15_000;
const KILL_REWARD_RATE = 0.2;
const ATTACK_DELAY_MS = 30_000;
const GRID_WIDTH = 18;
const GRID_HEIGHT = 10;
const START_POINT = { x: 0, y: 5 };

function flyingPathFor(y: number): GridPoint[] {
  return Array.from({ length: GRID_WIDTH }, (_, x) => ({ x, y }));
}

type MageElement = "fire" | "frost" | "storm" | "void";

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
  runner: { label: "Runner", cost: 12, income: 2, hp: 6, speed: 2.6, damage: 6, tier: "budget" },
  grunt: { label: "Grunt", cost: 25, income: 5, hp: 30, speed: 0.8, damage: 12, tier: "budget", resistance: "splash" },
  slinger: { label: "Slinger", cost: 35, income: 7, hp: 10, speed: 1.2, damage: 10, tier: "budget", flying: true },
  // ── Mid-game ──
  brute: { label: "Brute", cost: 120, income: 24, hp: 200, speed: 0.5, damage: 40, tier: "mid" },
  raider: { label: "Raider", cost: 250, income: 50, hp: 80, speed: 2.0, damage: 25, tier: "mid", resistance: "slow" },
  juggernaut: { label: "Juggernaut", cost: 500, income: 100, hp: 500, speed: 0.35, damage: 65, tier: "mid", resistance: "all" },
  phantom: { label: "Phantom", cost: 350, income: 70, hp: 40, speed: 3.0, damage: 30, tier: "mid", flying: true },
  // ── Endgame ──
  siege_breaker: { label: "Siege Breaker", cost: 2000, income: 400, hp: 1200, speed: 0.3, damage: 120, tier: "endgame" },
  leviathan: { label: "Leviathan", cost: 5000, income: 1000, hp: 3000, speed: 0.2, damage: 200, tier: "endgame", resistance: "splash" },
  wraith_lord: { label: "Wraith Lord", cost: 8000, income: 1600, hp: 500, speed: 2.5, damage: 100, tier: "endgame", flying: true, resistance: "physical" },
  titan: { label: "Titan", cost: 20000, income: 4000, hp: 8000, speed: 0.15, damage: 400, tier: "endgame", resistance: "all" },
  doomsday: { label: "Doomsday", cost: 50000, income: 10000, hp: 15000, speed: 0.1, damage: 800, tier: "endgame" },

} as const;

const MAGE_ELEMENT_CONFIG: Record<MageElement, { label: string; damageMultiplier: number }> = {
  fire: { label: "Fire", damageMultiplier: 1 },
  frost: { label: "Frost", damageMultiplier: 0.8 },
  storm: { label: "Storm", damageMultiplier: 1.15 },
  void: { label: "Void", damageMultiplier: 0.95 },
};

const TOWER_CONFIG = {
  close: { label: "Pulse Tower", cost: 15, range: 1, damage: 10, splash: false, slow: false },
  far: { label: "Rail Tower", cost: 25, range: 3, damage: 4, splash: false, slow: false },
  slow: { label: "Snare Tower", cost: 30, range: 2, damage: 3, splash: false, slow: true },
  // Stored as "splash" for compatibility with rooms created before this replacement.
  splash: { label: "Mage Tower", cost: 45, range: 2, damage: 6, splash: false, slow: false },
} as const;

const UPGRADE_COSTS = [75, 225, 600] as const;

type Player = Doc<"games">["players"][number];
type GridPoint = { x: number; y: number };
type TowerLike = {
  x?: number;
  y?: number;
  position: number;
  type?: keyof typeof TOWER_CONFIG;
  element?: MageElement;
  upgradeBranch?: "power" | "control";
  upgradeLevel?: number;
};

type ProjectileLike = {
  id: string;
  towerType: keyof typeof TOWER_CONFIG;
  element?: MageElement;
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

function spawnPointFor(target: Player): GridPoint {
  const occupiedEntryRows = new Set(
    (target.laneUnits ?? [])
      .map(unitPoint)
      .filter((point) => point.x === 0)
      .map((point) => point.y),
  );
  const preferredY = (target.laneUnits ?? []).length % GRID_HEIGHT;
  for (let offset = 0; offset < GRID_HEIGHT; offset += 1) {
    const y = (preferredY + offset) % GRID_HEIGHT;
    if (!occupiedEntryRows.has(y)) return { x: 0, y };
  }
  return { x: 0, y: preferredY };
}

function mageDamageMultiplier(element: MageElement, unit: { type: string; flying?: boolean; resistance?: UnitConfig["resistance"] }) {
  const unitConfig = UNIT_CONFIG[unit.type];
  if (element === "fire" && unit.resistance === "splash") return 1.6;
  if (element === "frost" && ((unitConfig?.speed ?? 0) >= 2 || unit.flying)) return 1.45;
  if (element === "storm" && unit.flying) return 1.7;
  if (element === "void" && (unit.resistance === "all" || unit.resistance === "physical")) return 1.8;
  return 1;
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
    const maxPlayers = Math.min(8, Math.max(2, Math.floor(args.maxPlayers)));
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
      gold: STARTING_GOLD,
      towers: [
        { id: createId("tower"), type: "close" as const, position: 22, hp: 100, x: 4, y: 5, upgradeLevel: 0 },
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
      startedAt: now,
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
      startedAt: now,
      lastAction: "The battle is live. Build your route now; attacks unlock in 30 seconds.",
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
    mageElement: v.optional(v.union(
      v.literal("fire"),
      v.literal("frost"),
      v.literal("storm"),
      v.literal("void"),
    )),
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
    if (player.health <= 0) throw new Error("You have been eliminated and can only spectate.");
    if (game.players.filter((candidate) => candidate.health > 0).length <= 1) throw new Error("The match is over. You can only spectate.");
    const config = TOWER_CONFIG[args.towerType];
    const mageElement = args.towerType === "splash" ? (args.mageElement ?? "fire") : undefined;
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
      element: mageElement,
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

export const removeTower = mutation({
  args: {
    roomCode: v.string(),
    towerId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The battle is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");

    const player = normalizePlayer(game.players[index]);
    if (player.health <= 0) throw new Error("You have been eliminated and can only spectate.");
    if (game.players.filter((candidate) => candidate.health > 0).length <= 1) throw new Error("The match is over. You can only spectate.");
    const tower = player.towers.find((current) => current.id === args.towerId);
    if (!tower) throw new Error("That tower is no longer on your lane.");

    const level = tower.upgradeLevel ?? 0;
    const investedGold = TOWER_CONFIG[tower.type].cost +
      UPGRADE_COSTS.slice(0, level).reduce((total, cost) => total + cost, 0);
    const refund = Math.floor(investedGold * 0.75);
    const towers = player.towers.filter((current) => current.id !== args.towerId);
    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? { ...player, gold: player.gold + refund, towers }
        : normalizePlayer(current),
    );

    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} removed a ${TOWER_CONFIG[tower.type].label} (+${refund}g refund)`,
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
    if (player.health <= 0) throw new Error("You have been eliminated and can only spectate.");
    if (game.players.filter((candidate) => candidate.health > 0).length <= 1) throw new Error("The match is over. You can only spectate.");
    const towerIndex = player.towers.findIndex((tower) => tower.id === args.towerId);
    if (towerIndex < 0) throw new Error("That tower is no longer on your lane.");
    const tower = player.towers[towerIndex];
    const level = tower.upgradeLevel ?? 0;
    if (level >= 3) throw new Error("That tower has reached maximum level.");
    if (tower.upgradeBranch && tower.upgradeBranch !== args.branch) {
      throw new Error("This tower is already committed to the other upgrade branch.");
    }
    const cost = UPGRADE_COSTS[level] ?? 600;
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

    const player = normalizePlayer(game.players[index]);
    if (player.health <= 0) throw new Error("You have been eliminated and can only spectate.");
    if (game.players.filter((candidate) => candidate.health > 0).length <= 1) throw new Error("The match is over. You can only spectate.");
    if (game.startedAt !== undefined && Date.now() - game.startedAt < ATTACK_DELAY_MS) {
      const secondsLeft = Math.ceil((game.startedAt + ATTACK_DELAY_MS - Date.now()) / 1000);
      throw new Error(`Attacks unlock in ${secondsLeft}s.`);
    }
    const targetIndex = Array.from({ length: game.players.length - 1 }, (_, offset) =>
      (index + offset + 1) % game.players.length,
    ).find((candidateIndex) => game.players[candidateIndex].health > 0);
    if (targetIndex === undefined) throw new Error("No opposing player remains.");
    const target = normalizePlayer(game.players[targetIndex]);
    const config = UNIT_CONFIG[args.unitType];
    if (!config) throw new Error("Unknown unit type.");
    if (player.gold < config.cost) throw new Error(`You need ${config.cost} gold for that unit.`);

    const spawn = spawnPointFor(target);
    // Each unit enters through a different open tile in the first column.
    // Flying units keep a straight line on their own spawn row.
    let path: GridPoint[] | null;
    if (config.flying) {
      path = flyingPathFor(spawn.y);
    } else {
      path = findPath(target.towers, spawn);
      if (!path) throw new Error(`${target.name}'s route is blocked. They need to open a path first.`);
    }

    const unit = {
      id: createId(args.unitType),
      type: args.unitType,
      position: 0,
      hp: config.hp,
      x: spawn.x,
      y: spawn.y,
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
    if (game.players.filter((player) => player.health > 0).length <= 1) return;

    const now = Date.now();
    const attackUnlocked = game.startedAt === undefined || now - game.startedAt >= ATTACK_DELAY_MS;
    const previousTick = game.lastTick ?? now;
    const elapsed = Math.min(3, Math.max(0, (now - previousTick) / 1000));
    if (elapsed < 0.8) return;
    const incomePayouts = Math.max(
      0,
      Math.floor(now / INCOME_INTERVAL_MS) - Math.floor(previousTick / INCOME_INTERVAL_MS),
    );

    const isPractice = game.isPractice === true;
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

      if (isPractice && isBot && state.health > 0) {
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
        if (attackUnlocked && Math.random() < 0.12) {
          const types = ["soldier", "scout", "runner", "grunt"];
          const pick = types[Math.floor(Math.random() * types.length)];
          const cfg = UNIT_CONFIG[pick];
          if (botGold >= cfg.cost) {
            botGold -= cfg.cost;
            botIncome += cfg.income;
            botSent += 1;
            const humanPlayer = game.players[0];
            const humanState = normalizePlayer(humanPlayer);
            const spawn = spawnPointFor(humanState);
            const route = cfg.flying ? flyingPathFor(spawn.y) : findPath(humanState.towers, spawn);
            if (route) {
              botPendingUnits.push({
                id: createId(pick),
                type: pick,
                position: 0,
                hp: cfg.hp,
                x: spawn.x,
                y: spawn.y,
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

      const currentTowers = isBot ? botTowers : state.towers;
      const groundPathCache = new Map<string, GridPoint[] | null>();
      const groundPathFor = (start: GridPoint) => {
        const key = pointKey(start);
        if (!groundPathCache.has(key)) groundPathCache.set(key, findPath(currentTowers, start));
        return groundPathCache.get(key) ?? null;
      };

      const movedUnits = state.laneUnits.map((unit) => {
        const start = unitPoint(unit);
        const path = unit.flying ? flyingPathFor(start.y) : groundPathFor(start);
        if (!path) return { ...unit, x: start.x, y: start.y };

        // Flying units use a stable origin-to-goal path and keep cumulative
        // progress. Ground units recalculate from their current cell.
        let pathIndex = unit.flying ? (unit.pathIndex ?? 0) : 0;
        let pathProgress = (unit.pathProgress ?? 0) + (UNIT_CONFIG[unit.type]?.speed ?? 1) * elapsed;
        while (pathIndex < path.length - 1 && pathProgress >= 1) {
          pathIndex += 1;
          pathProgress -= 1;
        }
        const point = path[Math.min(pathIndex, path.length - 1)];
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
        const ignoresResistance = projectile.towerType === "splash" && projectile.element === "void";
        if (!ignoresResistance && (targetUnit.resistance === "all" || targetUnit.resistance === "physical")) {
          effectiveDamage *= 0.5;
        }
        if (projectile.splash && targetUnit.resistance === "splash") {
          effectiveDamage *= 0.3;
        }
        if (projectile.towerType === "splash" && projectile.element) {
          effectiveDamage *= mageDamageMultiplier(projectile.element, targetUnit);
        }

        if (projectile.splash) {
          const impactPoint = unitPoint(movedUnits[targetIndex]);
          movedUnits.forEach((unit, unitIndex) => {
            const location = unitPoint(unit);
            if (Math.abs(location.x - impactPoint.x) + Math.abs(location.y - impactPoint.y) <= 1) {
              let dmg = projectile.damage;
              if (projectile.element === "void") {
                dmg *= mageDamageMultiplier(projectile.element, unit);
              } else {
                if (unit.resistance === "all") dmg *= 0.5;
                if (unit.resistance === "splash") dmg *= 0.3;
              }
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
        const mageElement = tower.type === "splash" ? (tower.element ?? "fire") : undefined;
        const elementDamage = mageElement ? MAGE_ELEMENT_CONFIG[mageElement].damageMultiplier : 1;
        const range = config.range + (tower.upgradeBranch === "control" ? level : 0);
        const damage = config.damage * elementDamage * (1 + (tower.upgradeBranch === "power" ? level * 0.2 : 0));
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
          const slowFactor = mageElement === "frost"
            ? 0.7 - level * 0.04
            : config.slow && tower.upgradeBranch === "control" ? 0.75 - level * 0.05 : 1;
          if (slowFactor < 1 && unit.resistance !== "slow" && unit.resistance !== "all") {
            movedUnits[unitIndex] = {
              ...movedUnits[unitIndex],
              pathProgress: (movedUnits[unitIndex].pathProgress ?? 0) * slowFactor,
            };
          }
          nextProjectiles.push({
            id: createId("projectile"),
            towerType: tower.type,
            element: mageElement,
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
        leakMessage = `${state.name} lost ${damage} integrity.`;
      }

      const killedUnits = movedUnits.filter((unit) => unit.hp <= 0);
      const killGold = killedUnits.reduce((total, unit) => {
        const unitCost = UNIT_CONFIG[unit.type]?.cost ?? 0;
        return total + Math.max(1, Math.floor(unitCost * KILL_REWARD_RATE));
      }, 0);
      const remainingUnits = movedUnits.filter((unit) => unit.hp > 0 && unit.x < GRID_WIDTH - 1);
      return {
        ...state,
        gold: (isBot ? botGold : state.gold) + incomePayouts * (isBot ? botIncome : state.income) + killGold,
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

    const survivors = finalPlayers.filter((p) => p.health > 0);
    const matchComplete = survivors.length <= 1;
    const winnerMessage = survivors[0]
      ? `${survivors[0].name} is the last player standing.`
      : "No player survived the battle.";
    await ctx.db.patch(game._id, {
      players: finalPlayers,
      lastTick: now,
      status: "playing",
      lastAction: matchComplete ? winnerMessage : leakMessage || game.lastAction,
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

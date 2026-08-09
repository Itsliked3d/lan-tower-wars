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

const UNIT_CONFIG = {
  soldier: { label: "Foot soldier", cost: 5, income: 1, hp: 14, speed: 1.25, damage: 8 },
  scout: { label: "Scout", cost: 8, income: 1, hp: 8, speed: 1.8, damage: 5 },
  brute: { label: "Brute", cost: 18, income: 2, hp: 42, speed: 0.72, damage: 18 },
  runner: { label: "Runner", cost: 12, income: 1, hp: 6, speed: 2.6, damage: 6 },
  abuse_control: { label: "Abuse Control", cost: 0, income: 0, hp: 18, speed: 1.45, damage: 2 },
} as const;

const TOWER_CONFIG = {
  close: { label: "Pulse Tower", cost: 15, range: 1, damage: 10, splash: false, slow: false },
  far: { label: "Rail Tower", cost: 25, range: 3, damage: 4, splash: false, slow: false },
  splash: { label: "Arc Tower", cost: 35, range: 2, damage: 6, splash: true, slow: false },
  slow: { label: "Snare Tower", cost: 30, range: 2, damage: 3, splash: false, slow: true },
} as const;

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
  if (userId === null) throw new Error("You need to be signed in to play.");
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
    if (player.laneUnits.some((unit) => !findPath(proposedTowers, unitPoint(unit)))) {
      throw new Error("That tower would strand a unit already on the lane.");
    }

    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? { ...player, gold: player.gold - config.cost, towers: proposedTowers }
        : normalizePlayer(current),
    );
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} built a ${config.label} at grid ${x + 1}/${y + 1}. The route remains open.`,
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
    const cost = 20 + level * 15;
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
      lastAction: `${player.name} upgraded a ${TOWER_CONFIG[tower.type].label} on the ${args.branch} branch to level ${level + 1}.`,
      updatedAt: Date.now(),
    });
  },
});

export const sendUnit = mutation({
  args: {
    roomCode: v.string(),
    unitType: v.union(
      v.literal("soldier"),
      v.literal("scout"),
      v.literal("brute"),
      v.literal("runner"),
    ),
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
    if (player.gold < config.cost) throw new Error(`You need ${config.cost} gold for that unit.`);
    const path = pathForPlayer(target.towers);
    if (!path) throw new Error(`${target.name}'s route is blocked. They need to open a path first.`);

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
      lastAction: `${player.name} deployed a ${config.label} to ${target.name}. Income increased by ${config.income}.`,
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

    const previousAbuse = game.lastAbuseControlSpawn;
    const abuseDue = previousAbuse !== undefined && now - previousAbuse >= 10000;
    let abuseMessage = "";
    let leakMessage = "";
    const players = game.players.map((player) => {
      const state = normalizePlayer(player);
      const route = pathForPlayer(state.towers);
      let laneUnits = state.laneUnits;

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
          },
        ];
        abuseMessage = `Abuse Control scan: PASS — ${state.name}'s route reaches the goal.`;
      } else if (abuseDue) {
        abuseMessage = `Abuse Control scan: FAIL — ${state.name}'s route is blocked.`;
      }

      const movedUnits = laneUnits.map((unit) => {
        const start = unitPoint(unit);
        const path = findPath(state.towers, start);
        if (!path) return { ...unit, x: start.x, y: start.y };

        let pathIndex = 0;
        let pathProgress = (unit.pathProgress ?? 0) + UNIT_CONFIG[unit.type].speed * elapsed;
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
        if (projectile.splash) {
          const impactPoint = unitPoint(movedUnits[targetIndex]);
          movedUnits.forEach((unit, unitIndex) => {
            const location = unitPoint(unit);
            if (Math.abs(location.x - impactPoint.x) + Math.abs(location.y - impactPoint.y) <= 1) {
              movedUnits[unitIndex] = { ...unit, hp: unit.hp - projectile.damage };
            }
          });
        } else {
          const target = movedUnits[targetIndex];
          movedUnits[targetIndex] = { ...target, hp: target.hp - projectile.damage };
        }
      }

      for (const tower of state.towers) {
        const config = TOWER_CONFIG[tower.type];
        const level = tower.upgradeLevel ?? 0;
        const range = config.range + (tower.upgradeBranch === "control" ? level : 0);
        const damage = config.damage * (1 + (tower.upgradeBranch === "power" ? level * 0.35 : 0));
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
          const slowFactor = config.slow && tower.upgradeBranch === "control" ? 0.65 : 1;
          movedUnits[unitIndex] = {
            ...movedUnits[unitIndex],
            pathProgress: (movedUnits[unitIndex].pathProgress ?? 0) * slowFactor,
          };
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
        const damage = leaked.reduce((total, unit) => total + UNIT_CONFIG[unit.type].damage, 0);
        const abuseReached = leaked.some((unit) => unit.type === "abuse_control");
        leakMessage = abuseReached
          ? `Abuse Control reached ${state.name}'s goal — route confirmed.`
          : `${state.name} lost ${damage} tower integrity to a lane breach.`;
      }

      const remainingUnits = movedUnits.filter((unit) => unit.hp > 0 && unit.x < GRID_WIDTH - 1);
      return {
        ...state,
        gold: state.gold + Math.floor(state.income * elapsed),
        health: Math.max(0, state.health - leaked.reduce((total, unit) => total + UNIT_CONFIG[unit.type].damage, 0)),
        laneUnits: remainingUnits,
        incoming: remainingUnits.length,
        projectiles: nextProjectiles,
      };
    });

    const ended = players.some((player) => player.health <= 0);
    await ctx.db.patch(game._id, {
      players,
      lastTick: now,
      lastAbuseControlSpawn: abuseDue ? now : previousAbuse,
      status: ended ? "ended" : "playing",
      lastAction: leakMessage || abuseMessage || game.lastAction,
      updatedAt: now,
    });
  },
});

// Keep the former action names available while already-open clients upgrade.
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

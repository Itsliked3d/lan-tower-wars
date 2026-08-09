import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const COLORS = ["#fb7185", "#f59e0b", "#22d3ee", "#a78bfa"];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STARTING_GOLD = 30;
const BASE_INCOME = 2;
const TOWER_SLOTS = [18, 39, 60, 81];

const UNIT_CONFIG = {
  soldier: { label: "Foot soldier", cost: 5, income: 1, hp: 14, speed: 6, damage: 8 },
  scout: { label: "Scout", cost: 8, income: 1, hp: 8, speed: 10, damage: 5 },
} as const;

const TOWER_CONFIG = {
  close: { label: "Close-range tower", cost: 15, range: 22, damage: 10 },
  far: { label: "Long-range tower", cost: 25, range: 48, damage: 4 },
} as const;

type Player = Doc<"games">["players"][number];
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
  };
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
      lastAction: "Match created. Build your defense when the room goes live.",
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

    await ctx.db.patch(game._id, {
      status: "playing",
      lastTick: Date.now(),
      lastAction: "The battle is live. Buy towers, send units, and protect your lane.",
      updatedAt: Date.now(),
    });
  },
});

export const buildTower = mutation({
  args: {
    roomCode: v.string(),
    towerType: v.union(v.literal("close"), v.literal("far")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The battle is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");

    const player = normalizePlayer(game.players[index]);
    const config = TOWER_CONFIG[args.towerType];
    if (player.gold < config.cost) throw new Error(`You need ${config.cost} gold for that tower.`);
    const position = TOWER_SLOTS[player.towers.length];
    if (position === undefined) throw new Error("Your lane has no open tower slots.");

    const tower = {
      id: createId("tower"),
      type: args.towerType,
      position,
      hp: 100,
    };
    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? { ...normalizePlayer(current), gold: player.gold - config.cost, towers: [...player.towers, tower] }
        : normalizePlayer(current),
    );
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} built a ${config.label} for ${config.cost} gold.`,
      updatedAt: Date.now(),
    });
  },
});

export const sendUnit = mutation({
  args: {
    roomCode: v.string(),
    unitType: v.union(v.literal("soldier"), v.literal("scout")),
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

    const unit = {
      id: createId(args.unitType),
      type: args.unitType,
      position: 0,
      hp: config.hp,
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

    let leakMessage = "";
    const players = game.players.map((player) => {
      const state = normalizePlayer(player);
      const laneUnits = state.laneUnits.map((unit) => ({
        ...unit,
        position: unit.position + UNIT_CONFIG[unit.type].speed * elapsed,
      }));

      for (const tower of state.towers) {
        const config = TOWER_CONFIG[tower.type];
        const targetIndex = laneUnits.findIndex(
          (unit) =>
            unit.hp > 0 &&
            unit.position >= tower.position - config.range &&
            unit.position <= tower.position + config.range,
        );
        if (targetIndex >= 0) {
          const target = laneUnits[targetIndex];
          laneUnits[targetIndex] = {
            ...target,
            hp: target.hp - config.damage * elapsed,
          };
        }
      }

      const leaked = laneUnits.filter((unit) => unit.position >= 100 && unit.hp > 0);
      if (leaked.length > 0) {
        const damage = leaked.reduce(
          (total, unit) => total + UNIT_CONFIG[unit.type].damage,
          0,
        );
        leakMessage = `${state.name} lost ${damage} tower integrity to a lane breach.`;
      }

      const remainingUnits = laneUnits.filter((unit) => unit.hp > 0 && unit.position < 100);
      return {
        ...state,
        gold: state.gold + Math.floor(state.income * elapsed),
        health: Math.max(0, state.health - leaked.reduce((total, unit) => total + UNIT_CONFIG[unit.type].damage, 0)),
        laneUnits: remainingUnits,
        incoming: remainingUnits.length,
      };
    });

    const ended = players.some((player) => player.health <= 0);
    await ctx.db.patch(game._id, {
      players,
      lastTick: now,
      status: ended ? "ended" : "playing",
      lastAction: leakMessage || game.lastAction,
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

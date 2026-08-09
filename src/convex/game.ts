import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const COLORS = ["#fb7185", "#f59e0b", "#22d3ee", "#a78bfa"];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
    return await ctx.db
      .query("games")
      .withIndex("by_room_code", (q) => q.eq("roomCode", cleanRoomCode(args.roomCode)))
      .unique();
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
      players: [
        {
          userId,
          name: cleanName(args.name),
          color: COLORS[0],
          health: 100,
          units: 12,
          incoming: 0,
          shield: 3,
          sent: 0,
          defended: 0,
        },
      ],
      lastAction: "Room created. Waiting for your crew.",
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
      {
        userId,
        name: cleanName(args.name),
        color: COLORS[game.players.length] ?? COLORS[0],
        health: 100,
        units: 12,
        incoming: 0,
        shield: 3,
        sent: 0,
        defended: 0,
      },
    ];
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${cleanName(args.name)} joined the relay.`,
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
      lastAction: `${leavingPlayer.name} left the room.`,
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
      lastAction: "The relay is live. Send units clockwise and cover your neighbor.",
      updatedAt: Date.now(),
    });
  },
});

export const sendUnits = mutation({
  args: { roomCode: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The relay is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");
    const amount = Math.floor(args.amount);
    const player = game.players[index];
    if (amount < 1 || amount > 5) throw new Error("Send between 1 and 5 units.");
    if (player.units < amount) throw new Error("You do not have enough units ready.");

    const targetIndex = (index + 1) % game.players.length;
    const target = game.players[targetIndex];
    const players = game.players.map((current, currentIndex) => {
      if (currentIndex === index) {
        return { ...current, units: current.units - amount, sent: current.sent + amount };
      }
      if (currentIndex === targetIndex) {
        return { ...current, incoming: current.incoming + amount };
      }
      return current;
    });
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} sent ${amount} ${amount === 1 ? "unit" : "units"} to ${target.name}.`,
      updatedAt: Date.now(),
    });
  },
});

export const defendIncoming = mutation({
  args: { roomCode: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.status !== "playing") throw new Error("The relay is not live yet.");
    const index = game.players.findIndex((player) => player.userId === userId);
    if (index < 0) throw new Error("You are not in this room.");
    const player = game.players[index];
    const amount = Math.floor(args.amount);
    if (amount < 1 || amount > 5) throw new Error("Defend between 1 and 5 units.");
    if (player.incoming < amount) throw new Error("There are not that many units at your gate.");
    if (player.shield < amount) throw new Error("You need more shield charge.");

    const players = game.players.map((current, currentIndex) =>
      currentIndex === index
        ? {
            ...current,
            incoming: current.incoming - amount,
            shield: current.shield - amount,
            defended: current.defended + amount,
          }
        : current,
    );
    await ctx.db.patch(game._id, {
      players,
      lastAction: `${player.name} intercepted ${amount} ${amount === 1 ? "unit" : "units"} at the gate.`,
      updatedAt: Date.now(),
    });
  },
});

export const resolveWave = mutation({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const game = await getGame(ctx, args.roomCode);
    if (game.players[0]?.userId !== userId) throw new Error("Only the room host can resolve a wave.");
    if (game.status !== "playing") throw new Error("The relay is not live.");

    const players = game.players.map((player) => ({
      ...player,
      health: Math.max(0, player.health - player.incoming * 7),
      units: player.units + 4,
      incoming: 0,
      shield: Math.min(5, player.shield + 2),
    }));
    const isOver = players.some((player) => player.health <= 0);
    await ctx.db.patch(game._id, {
      players,
      wave: game.wave + 1,
      status: isOver ? "ended" : "playing",
      lastAction: isOver
        ? "A gate fell. The relay is over."
        : `Wave ${game.wave} cleared. Supply crates restored 4 units and 2 shield charge.`,
      updatedAt: Date.now(),
    });
  },
});

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const unitTypeValidator = v.union(
  v.literal("soldier"),
  v.literal("scout"),
);

const towerTypeValidator = v.union(
  v.literal("close"),
  v.literal("far"),
);

const laneUnitValidator = v.object({
  id: v.string(),
  type: unitTypeValidator,
  position: v.number(),
  hp: v.number(),
});

const towerValidator = v.object({
  id: v.string(),
  type: towerTypeValidator,
  position: v.number(),
  hp: v.number(),
});

const playerValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),
  health: v.number(),
  // Legacy pass-along counters remain so existing rooms can migrate safely.
  units: v.number(),
  incoming: v.number(),
  shield: v.number(),
  sent: v.number(),
  defended: v.number(),
  gold: v.optional(v.number()),
  income: v.optional(v.number()),
  laneUnits: v.optional(v.array(laneUnitValidator)),
  towers: v.optional(v.array(towerValidator)),
});

const schema = defineSchema(
  {
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    games: defineTable({
      roomCode: v.string(),
      status: v.union(
        v.literal("lobby"),
        v.literal("playing"),
        v.literal("ended"),
      ),
      maxPlayers: v.number(),
      wave: v.number(),
      players: v.array(playerValidator),
      lastAction: v.string(),
      updatedAt: v.number(),
      // The simulation advances lazily when a connected client calls tick.
      lastTick: v.optional(v.number()),
    }).index("by_room_code", ["roomCode"]),
  },
  { schemaValidation: false },
);

export default schema;

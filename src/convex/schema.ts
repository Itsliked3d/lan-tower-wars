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
  v.literal("brute"),
  v.literal("runner"),
  v.literal("grunt"),
  v.literal("slinger"),
  v.literal("raider"),
  v.literal("juggernaut"),
  v.literal("phantom"),
  v.literal("aura"),
  v.literal("siege_breaker"),
  v.literal("leviathan"),
  v.literal("wraith_lord"),
  v.literal("siege_tank"),
  v.literal("titan"),
  v.literal("doomsday"),
);

const unitChargeValidator = v.object({
  type: unitTypeValidator,
  charges: v.number(),
  lastRechargeAt: v.number(),
});

const towerTypeValidator = v.union(
  v.literal("close"),
  v.literal("far"),
  v.literal("splash"),
  v.literal("slow"),
);

const mageElementValidator = v.union(
  v.literal("fire"),
  v.literal("frost"),
  v.literal("storm"),
  v.literal("void"),
);

const upgradeBranchValidator = v.union(
  v.literal("power"),
  v.literal("control"),
);

const gridPointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

const laneUnitValidator = v.object({
  id: v.string(),
  type: unitTypeValidator,
  // The original sender keeps ownership when a unit loops through later lanes.
  ownerId: v.optional(v.id("users")),
  // Legacy horizontal position is kept for old rooms and simple telemetry.
  position: v.number(),
  hp: v.number(),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  path: v.optional(v.array(gridPointValidator)),
  pathIndex: v.optional(v.number()),
  pathProgress: v.optional(v.number()),
  flying: v.optional(v.boolean()),
  straightLine: v.optional(v.boolean()),
  towerBreaker: v.optional(v.boolean()),
  resistance: v.optional(v.union(v.literal("splash"), v.literal("slow"), v.literal("physical"), v.literal("all"))),
});

const towerValidator = v.object({
  id: v.string(),
  type: towerTypeValidator,
  // Legacy horizontal position is kept for old rooms.
  position: v.number(),
  hp: v.number(),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  element: v.optional(mageElementValidator),
  upgradeBranch: v.optional(upgradeBranchValidator),
  upgradeLevel: v.optional(v.number()),
});

const projectileValidator = v.object({
  id: v.string(),
  towerType: towerTypeValidator,
  element: v.optional(mageElementValidator),
  targetUnitId: v.string(),
  x: v.number(),
  y: v.number(),
  targetX: v.number(),
  targetY: v.number(),
  progress: v.number(),
  speed: v.number(),
  damage: v.number(),
  splash: v.optional(v.boolean()),
});

const playerValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),
  health: v.number(),
  units: v.number(),
  incoming: v.number(),
  shield: v.number(),
  sent: v.number(),
  defended: v.number(),
  gold: v.optional(v.number()),
  income: v.optional(v.number()),
  unitCharges: v.optional(v.array(unitChargeValidator)),
  laneUnits: v.optional(v.array(laneUnitValidator)),
  towers: v.optional(v.array(towerValidator)),
  projectiles: v.optional(v.array(projectileValidator)),
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
      lastTick: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      isPractice: v.optional(v.boolean()),
    }).index("by_room_code", ["roomCode"]),
  },
  { schemaValidation: false },
);

export default schema;

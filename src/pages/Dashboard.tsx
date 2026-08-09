import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { Bird, Castle, Coins, Crosshair, Crown, Flame, Footprints, Ghost, Hammer, HelpCircle, LogOut, Radar, Radio, Ruler, Shield, Skull, Snowflake, Sparkles, Swords, Target, Trash2, TrendingUp, Turtle, Users, Wand, Zap } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Game = Doc<"games">;
type Player = Game["players"][number];
type TowerType = "close" | "far" | "splash" | "slow";
type MageElement = "fire" | "frost" | "storm" | "void";
type UnitType = "soldier" | "scout" | "runner" | "grunt" | "slinger" | "brute" | "raider" | "juggernaut" | "phantom" | "siege_breaker" | "leviathan" | "wraith_lord" | "titan" | "doomsday";

type GridPoint = { x: number; y: number };
type Projectile = NonNullable<Player["projectiles"]>[number];
type TowerRecord = NonNullable<Player["towers"]>[number];

function towerInfoFor(type: TowerRecord["type"]) {
  return TOWER_INFO[type];
}

function mageElementFor(tower: TowerRecord | Projectile): MageElement {
  return tower.element ?? "fire";
}

const GRID_WIDTH = 18;
const GRID_HEIGHT = 10;
const ATTACK_DELAY_SECONDS = 30;

const TOWER_INFO: Record<TowerType, { short: string; cost: number; range: string; rangeCells: number; icon: typeof Target }> = {
  close: { short: "Pulse", cost: 15, range: "r1 · 10dps", rangeCells: 1, icon: Target },
  far: { short: "Rail", cost: 25, range: "r3 · 4dps", rangeCells: 3, icon: Radar },
  splash: { short: "Mage", cost: 45, range: "r2 · adaptive", rangeCells: 2, icon: Sparkles },
  slow: { short: "Snare", cost: 30, range: "r2 · 3dps · slow", rangeCells: 2, icon: Ruler },
};

const MAGE_ELEMENT_INFO: Record<MageElement, { label: string; counter: string; icon: typeof Flame; text: string; border: string; background: string; glow: string }> = {
  fire: { label: "Fire", counter: "breaks splash resist", icon: Flame, text: "text-orange-200", border: "border-orange-300/40", background: "bg-orange-300/10", glow: "shadow-[0_0_10px_2px_rgba(251,146,60,0.35)]" },
  frost: { label: "Frost", counter: "checks fast units", icon: Snowflake, text: "text-sky-200", border: "border-sky-300/40", background: "bg-sky-300/10", glow: "shadow-[0_0_10px_2px_rgba(56,189,248,0.35)]" },
  storm: { label: "Storm", counter: "hunts flyers", icon: Zap, text: "text-yellow-200", border: "border-yellow-300/40", background: "bg-yellow-300/10", glow: "shadow-[0_0_10px_2px_rgba(250,204,21,0.35)]" },
  void: { label: "Void", counter: "pierces heavy resist", icon: Wand, text: "text-fuchsia-200", border: "border-fuchsia-300/40", background: "bg-fuchsia-300/10", glow: "shadow-[0_0_10px_2px_rgba(217,70,239,0.35)]" },
};

const UNIT_INFO: Record<UnitType, { short: string; cost: number; hp: number; income: number; tier: string; maxCharges: number; rechargeSeconds: number; icon: typeof Footprints; flying?: boolean; resistance?: string }> = {
  soldier: { short: "Foot Soldier", cost: 5, hp: 14, income: 1, tier: "budget", maxCharges: 50, rechargeSeconds: 2, icon: Footprints },
  scout: { short: "Scout", cost: 8, hp: 8, income: 1, tier: "budget", maxCharges: 35, rechargeSeconds: 4, icon: Zap },
  runner: { short: "Runner", cost: 12, hp: 6, income: 2, tier: "budget", maxCharges: 25, rechargeSeconds: 5, icon: Bird },
  grunt: { short: "Grunt", cost: 25, hp: 30, income: 5, tier: "budget", maxCharges: 18, rechargeSeconds: 8, icon: Shield, resistance: "splash" },
  slinger: { short: "Slinger", cost: 35, hp: 10, income: 7, tier: "budget", maxCharges: 12, rechargeSeconds: 10, icon: Bird, flying: true },
  brute: { short: "Brute", cost: 120, hp: 200, income: 24, tier: "mid", maxCharges: 10, rechargeSeconds: 14, icon: Turtle },
  raider: { short: "Raider", cost: 250, hp: 80, income: 50, tier: "mid", maxCharges: 8, rechargeSeconds: 16, icon: Flame, resistance: "slow" },
  juggernaut: { short: "Juggernaut", cost: 500, hp: 500, income: 100, tier: "mid", maxCharges: 6, rechargeSeconds: 22, icon: Shield, resistance: "all" },
  phantom: { short: "Phantom", cost: 350, hp: 40, income: 70, tier: "mid", maxCharges: 3, rechargeSeconds: 24, icon: Ghost, flying: true },
  siege_breaker: { short: "Siege Breaker", cost: 2000, hp: 1200, income: 400, tier: "endgame", maxCharges: 2, rechargeSeconds: 30, icon: Castle },
  leviathan: { short: "Leviathan", cost: 5000, hp: 3000, income: 1000, tier: "endgame", maxCharges: 2, rechargeSeconds: 42, icon: Skull, resistance: "splash" },
  wraith_lord: { short: "Wraith Lord", cost: 8000, hp: 300, income: 800, tier: "endgame", maxCharges: 1, rechargeSeconds: 60, icon: Ghost, flying: true, resistance: "physical" },
  titan: { short: "Titan", cost: 20000, hp: 8000, income: 4000, tier: "endgame", maxCharges: 1, rechargeSeconds: 55, icon: Castle, resistance: "all" },
  doomsday: { short: "Doomsday", cost: 50000, hp: 15000, income: 10000, tier: "endgame", maxCharges: 1, rechargeSeconds: 75, icon: Skull },
};
const UNIT_MAX_HP: Record<string, number> = Object.fromEntries(Object.entries(UNIT_INFO).map(([k, v]) => [k, v.hp]));

const UPGRADE_COSTS = [75, 225, 600];

function friendlyError(error: unknown) { return error instanceof Error ? error.message.replace(/^Error: /, "") : "Something went wrong."; }
function goldOf(player: Player) { return player.gold ?? 200; }
function incomeOf(player: Player) { return player.income ?? 30; }
function unitsOf(player: Player) { return player.laneUnits ?? []; }
function towersOf(player: Player) { return player.towers ?? []; }
function projectilesOf(player: Player): Projectile[] { return player.projectiles ?? []; }
function unitChargeInfo(player: Player, type: UnitType, clock: number) {
  const info = UNIT_INFO[type];
  const saved = player.unitCharges?.find((entry) => entry.type === type);
  if (!saved) return { charges: info.maxCharges, nextSeconds: 0 };
  const rechargeMs = info.rechargeSeconds * 1000;
  const elapsed = Math.max(0, clock - saved.lastRechargeAt);
  const charges = Math.min(info.maxCharges, saved.charges + Math.floor(elapsed / rechargeMs));
  if (charges >= info.maxCharges) return { charges, nextSeconds: 0 };
  return {
    charges,
    nextSeconds: Math.max(1, Math.ceil((rechargeMs - (elapsed % rechargeMs)) / 1000)),
  };
}
function towerPoint(tower: NonNullable<Player["towers"]>[number]): GridPoint { return { x: tower.x ?? Math.round((tower.position / 100) * (GRID_WIDTH - 1)), y: tower.y ?? 5 }; }
function unitPoint(unit: NonNullable<Player["laneUnits"]>[number]): GridPoint { return { x: unit.x ?? Math.round((unit.position / 100) * (GRID_WIDTH - 1)), y: unit.y ?? 5 }; }
function pointKey(point: GridPoint) { return `${point.x}:${point.y}`; }

function findVisualPath(towers: Player["towers"]): Set<string> {
  return findPathThroughTowers(towers);
}

function findPathThroughTowers(towers: Player["towers"]): Set<string> {
  const blocked = new Set((towers ?? []).map((tower) => pointKey(towerPoint(tower))));
  const start = { x: 0, y: 5 };
  const queue: Array<{ point: GridPoint; path: GridPoint[] }> = [{ point: start, path: [start] }];
  const visited = new Set([pointKey(start)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.point.x === GRID_WIDTH - 1) return new Set(current.path.map(pointKey));
    for (const next of [{ x: current.point.x + 1, y: current.point.y }, { x: current.point.x - 1, y: current.point.y }, { x: current.point.x, y: current.point.y + 1 }, { x: current.point.x, y: current.point.y - 1 }]) {
      if (next.x < 0 || next.x >= GRID_WIDTH || next.y < 0 || next.y >= GRID_HEIGHT) continue;
      const nextKey = pointKey(next);
      if (blocked.has(nextKey) || visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ point: next, path: [...current.path, next] });
    }
  }
  return new Set();
}

function StatBar({ value, color = "bg-cyan-300" }: { value: number; color?: string }) {
  return <div className="h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10" aria-label={`HP ${Math.round(value)}`}><div className={`h-full rounded-full transition-[width] duration-500 ${color} shadow-[0_0_10px_2px_currentColor]`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function EconomyStrip({ player, clock }: { player: Player; clock: number }) {
  const gold = goldOf(player);
  const income = incomeOf(player);
  const secondsUntilIncome = Math.ceil((15_000 - (clock % 15_000)) / 1_000);
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-gradient-to-r from-[#0b1120] via-[#0d1528] to-[#0b1120] px-4 py-3 shadow-lg">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-400/15 to-amber-500/5 shadow-[0_0_10px_1px_rgba(251,191,36,0.15)]"><Coins className="size-4 text-amber-300" /></span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-500">Gold</p>
        <p className="truncate font-mono text-xl font-bold leading-tight text-amber-100">{gold}<span className="ml-1 text-[10px] font-medium text-amber-300/50">g</span></p>
      </div>
    </div>
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/15 to-emerald-500/5 shadow-[0_0_10px_1px_rgba(52,211,153,0.15)]"><TrendingUp className="size-4 text-emerald-300" /></span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-500">Income / 15s</p>
        <p className="font-mono text-xl font-bold leading-tight text-emerald-100">+{income}<span className="ml-1 text-[10px] font-medium text-emerald-300/50">g</span></p>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span className="hidden rounded-lg border border-emerald-300/10 bg-emerald-300/[0.04] px-2 py-1 text-[9px] font-medium text-emerald-300/70 md:block" title="Gold payout every 15 seconds">+{income}g / 15s</span>
        <span className="font-mono text-[9px] font-semibold tabular-nums text-slate-400">next in <strong className="text-emerald-200">{secondsUntilIncome}s</strong></span>
      </div>
    </div>
  </div>;
}

function ProjectileLayer({ projectiles }: { projectiles: Projectile[] }) {
  return <>{projectiles.map((p) => { const progress = Math.max(0, Math.min(1, p.progress)); const x = p.x + (p.targetX - p.x) * progress; const y = p.y + (p.targetY - p.y) * progress; const color = p.towerType === "far" ? "bg-violet-300" : p.towerType === "splash" ? "bg-fuchsia-300" : p.towerType === "slow" ? "bg-emerald-300" : "bg-cyan-300"; return <span key={p.id} className={`pointer-events-none absolute z-20 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_8px_3px_currentColor] ${color}`} style={{ left: `${((x + 0.5) / GRID_WIDTH) * 100}%`, top: `${((y + 0.5) / GRID_HEIGHT) * 100}%` }} />; })}</>;
}

function GridLane({ player, compact = false, selectedTowerType, selectedMageElement, placementPoint, onCellClick, onCellHover, onTowerClick, selectedTowerId }: { player: Player; compact?: boolean; selectedTowerType?: TowerType | null; selectedMageElement?: MageElement; placementPoint?: GridPoint | null; onCellClick?: (x: number, y: number) => void; onCellHover?: (point: GridPoint | null) => void; onTowerClick?: (towerId: string) => void; selectedTowerId?: string | null }) {
  const towers = towersOf(player);
  const units = unitsOf(player);
  const projectiles = projectilesOf(player);
  const selectedTower = selectedTowerId ? towers.find((tower) => tower.id === selectedTowerId) : null;
  const selectedTowerPoint = selectedTower ? towerPoint(selectedTower) : null;
  const selectedRange = selectedTower ? TOWER_INFO[selectedTower.type].rangeCells + (selectedTower.upgradeBranch === "control" ? (selectedTower.upgradeLevel ?? 0) : 0) : 0;
  const placementRange = selectedTowerType ? TOWER_INFO[selectedTowerType].rangeCells : 0;
  const activeRangePoint = selectedTowerPoint ?? placementPoint ?? null;
  const activeRange = selectedTowerPoint ? selectedRange : placementRange;
  const towerSignature = towers.map((tower) => `${tower.id}:${tower.x ?? ""}:${tower.y ?? ""}:${tower.type}:${tower.element ?? ""}:${tower.upgradeBranch ?? ""}:${tower.upgradeLevel ?? 0}`).join("|");
  const route = useMemo(() => findVisualPath(player.towers), [towerSignature]);
  const towerMap = useMemo(() => new Map(towers.map((tower) => [pointKey(towerPoint(tower)), tower])), [towerSignature]);

  return <div className="relative aspect-[18/10] overflow-hidden rounded-lg border border-white/[0.06] bg-[#040810]">
    <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.8) 1px, transparent 1px)", backgroundSize: `${100 / GRID_WIDTH}% ${100 / GRID_HEIGHT}%` }} />

    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_HEIGHT}, minmax(0, 1fr))` }}>
      {Array.from({ length: GRID_WIDTH * GRID_HEIGHT }).map((_, index) => {
        const x = index % GRID_WIDTH;
        const y = Math.floor(index / GRID_WIDTH);
        const cellKey = `${x}:${y}`;
        const tower = towerMap.get(cellKey);
        const isStart = x === 0;
        const isGoal = x === GRID_WIDTH - 1;
        const canBuild = !compact && !tower && !isStart && !isGoal && Boolean(onCellClick);
        const onPath = route.has(cellKey);

        return <div
          key={cellKey}
          role={canBuild || tower ? "button" : undefined}
          tabIndex={canBuild || tower ? 0 : -1}
          onClick={() => { if (canBuild) onCellClick?.(x, y); if (tower && onTowerClick) onTowerClick(tower.id); }}
          onMouseEnter={() => onCellHover?.(canBuild ? { x, y } : null)}
          onMouseLeave={() => onCellHover?.(null)}
          className={`relative border-r border-b border-white/[0.025] transition-all duration-150 ${
            isStart ? "bg-gradient-to-r from-cyan-400/[0.06] to-transparent"
            : isGoal ? "goal-glow bg-gradient-to-l from-rose-400/[0.06] to-transparent"
            : onPath ? "bg-emerald-400/[0.03]"
            : ""
          } ${canBuild ? "cursor-crosshair hover:bg-cyan-300/25 hover:border-cyan-300/15" : ""} ${tower && onTowerClick ? "cursor-pointer hover:brightness-[1.4]" : ""} ${tower && tower.id === selectedTowerId ? "ring-1 ring-cyan-300/70 z-[5]" : ""} ${tower && tower.type === "splash" ? MAGE_ELEMENT_INFO[mageElementFor(tower)].glow : ""}`}
          title={canBuild ? `Place ${selectedTowerType ? TOWER_INFO[selectedTowerType].short : "tower"}${selectedTowerType === "splash" ? ` · ${MAGE_ELEMENT_INFO[selectedMageElement ?? "fire"].label}` : ""} at ${x + 1}/${y + 1}` : tower ? `${towerInfoFor(tower.type).short}${tower.type === "splash" ? ` · ${MAGE_ELEMENT_INFO[mageElementFor(tower)].label}` : ""}${(tower.upgradeLevel ?? 0) > 0 ? ` LV.${tower.upgradeLevel}` : ""} — click to upgrade` : undefined}
        >
          {isStart && !compact && <span className="absolute left-0.5 top-0.5 text-[7px] font-mono text-cyan-200/40 tracking-[0.15em]">IN</span>}
          {isGoal && !compact && <span className="absolute right-0.5 top-0.5 text-[7px] font-mono text-rose-200/40 tracking-[0.15em]">OUT</span>}
          {onPath && !tower && !isStart && !isGoal && !compact && (
            <span className="absolute inset-0 flex items-center justify-center text-[7px] text-emerald-300/15 font-mono">·</span>
          )}

          {tower && tower.type === "close" && (
            <div className="flex size-full items-center justify-center tower-pulse">
              <div className="flex size-[60%] items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/[0.08]">
                <Target className={compact ? "size-2.5 text-cyan-300/90 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]" : "size-3.5 text-cyan-300/90 drop-shadow-[0_0_3px_rgba(34,211,238,0.6)]"} />
              </div>
            </div>
          )}

          {tower && tower.type === "far" && (
            <div className="flex size-full items-center justify-center tower-rail">
              <div className={compact ? "size-[50%] rotate-45 items-center justify-center border border-violet-300/20 bg-violet-300/[0.06]" : "size-[55%] rotate-45 items-center justify-center border border-violet-300/20 bg-violet-300/[0.06]"}>
                <Radar className={compact ? "size-2.5 -rotate-45 text-violet-300/90 drop-shadow-[0_0_3px_rgba(167,139,250,0.5)]" : "size-3.5 -rotate-45 text-violet-300/90 drop-shadow-[0_0_3px_rgba(167,139,250,0.5)]"} />
              </div>
            </div>
          )}

          {tower && tower.type === "slow" && (
            <div className="flex size-full items-center justify-center tower-snare">
              <div className={compact ? "size-[55%] items-center justify-center rounded border border-emerald-300/20 bg-emerald-300/[0.05]" : "size-[60%] items-center justify-center rounded border border-emerald-300/20 bg-emerald-300/[0.05]"} style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}>
                <Ruler className={compact ? "size-2.5 text-emerald-300/90 drop-shadow-[0_0_3px_rgba(110,231,183,0.5)]" : "size-3 text-emerald-300/90 drop-shadow-[0_0_3px_rgba(110,231,183,0.5)]"} />
              </div>
            </div>
          )}

          {tower && tower.type === "splash" && (
            <div className="flex size-full items-center justify-center tower-mage">
              <div className={cn(compact ? "size-[58%]" : "size-[62%]", "items-center justify-center rounded-lg border", MAGE_ELEMENT_INFO[mageElementFor(tower)].border, MAGE_ELEMENT_INFO[mageElementFor(tower)].background)} style={{ color: "currentColor" }}>
                {React.createElement(MAGE_ELEMENT_INFO[mageElementFor(tower)].icon, { className: cn(compact ? "size-2.5" : "size-3.5", MAGE_ELEMENT_INFO[mageElementFor(tower)].text, "drop-shadow-[0_0_4px_currentColor]") })}
              </div>
            </div>
          )}

          {tower && !compact && (tower.upgradeLevel ?? 0) > 0 && (
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400/20 px-1 text-[6px] font-mono leading-tight text-cyan-300/90 backdrop-blur-sm">L{tower.upgradeLevel}</span>
          )}
        </div>;
      })}
    </div>

    {!compact && activeRangePoint && activeRange > 0 && (
      <div
        className="pointer-events-none absolute z-[1] rounded-[18%] border border-dashed border-cyan-200/20 bg-cyan-200/[0.012]"
        style={{
          left: `${((activeRangePoint.x - activeRange) / GRID_WIDTH) * 100}%`,
          top: `${((activeRangePoint.y - activeRange) / GRID_HEIGHT) * 100}%`,
          width: `${((activeRange * 2 + 1) / GRID_WIDTH) * 100}%`,
          height: `${((activeRange * 2 + 1) / GRID_HEIGHT) * 100}%`,
        }}
        aria-label={`Range ${activeRange}`}
      />
    )}

    {units.map((unit) => {
      const pt = unitPoint(unit);
      const info = UNIT_INFO[unit.type];
      const hpPct = Math.max(0, Math.min(100, (unit.hp / (info?.hp || UNIT_MAX_HP[unit.type] || 10)) * 100));
      const isFlying = !!(unit as { flying?: boolean }).flying;
      const Icon = info?.icon || HelpCircle;
      const isBig = unit.type === "titan" || unit.type === "doomsday";
      const isLarge = unit.type === "leviathan" || unit.type === "siege_breaker";
      const isMedium = unit.type === "juggernaut" || unit.type === "brute";

      const sizeClass = isBig ? "size-11" : isLarge ? "size-9" : isMedium ? "size-7" : isFlying ? "size-7" : "size-6";
      const borderClass = isFlying ? "border-sky-400/60 bg-sky-500/[0.15] text-sky-100"
        : isBig ? "border-red-500/60 bg-red-600/[0.22] text-red-100"
        : isLarge ? "border-amber-400/50 bg-amber-500/[0.2] text-amber-100"
        : isMedium ? "border-orange-400/50 bg-orange-500/[0.18] text-orange-100"
        : "border-slate-400/40 bg-slate-500/[0.15] text-slate-100";

      return (
        <div key={unit.id} className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-700 ease-linear ${isFlying ? "unit-fly" : "unit-bob"}`}
          style={{
            left: `${((pt.x + 0.5) / GRID_WIDTH) * 100}%`,
            top: `${((pt.y + 0.5) / GRID_HEIGHT) * 100}%`,
          }}>
          <div className={`relative flex items-center justify-center rounded-full border-2 shadow-lg ${sizeClass} ${borderClass}`}>
            <Icon className={`${isBig ? "size-4" : isLarge ? "size-3.5" : "size-3"}`} />
          </div>
          {!compact && (
            <div className="absolute -top-3 left-1/2 h-1.5 w-9 -translate-x-1/2 overflow-hidden rounded-full bg-black/80 ring-1 ring-white/20 shadow-[0_0_5px_1px_rgba(0,0,0,0.55)]" aria-label="Unit HP">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${hpPct > 60 ? "bg-gradient-to-r from-emerald-400 to-emerald-300" : hpPct > 30 ? "bg-gradient-to-r from-amber-400 to-amber-300" : "bg-gradient-to-r from-red-500 to-red-400"}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          )}
        </div>
      );
    })}

    <ProjectileLayer projectiles={projectiles} />

  </div>;
}

function TowerUpgradeModal({ tower, player, onUpgrade, onBulkUpgrade, onRemove, onClose, isBusy }: { tower: NonNullable<Player["towers"]>[number]; player: Player; onUpgrade: (branch: "power" | "control") => void; onBulkUpgrade?: (type: TowerType, level: number, branch: "power" | "control") => void; onRemove: () => void; onClose: () => void; isBusy: boolean }) {
  const level = tower.upgradeLevel ?? 0; const locked = tower.upgradeBranch; const cost = UPGRADE_COSTS[level] ?? 600; const gold = goldOf(player); const info = towerInfoFor(tower.type); const refund = Math.floor((info.cost + UPGRADE_COSTS.slice(0, level).reduce((total, value) => total + value, 0)) * 0.75);
  const rangeMatching = towersOf(player).filter((current) => current.type === tower.type && (current.upgradeLevel ?? 0) === level && (!current.upgradeBranch || current.upgradeBranch === "control")).length;
  const damageMatching = towersOf(player).filter((current) => current.type === tower.type && (current.upgradeLevel ?? 0) === level && (!current.upgradeBranch || current.upgradeBranch === "power")).length;
  return <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3"><div className="rounded-xl border border-white/10 bg-[#0f1729] p-4 shadow-lg"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><info.icon className="size-4 text-cyan-200" /><span className="text-sm font-semibold text-white">{info.short}</span><span className="font-mono text-[10px] text-cyan-300">LV.{level}</span></div><button type="button" onClick={onClose} className="text-lg text-slate-500 hover:text-white">&times;</button></div><p className="mb-2 text-[11px] text-slate-400">Range {info.range} · dashed outline shows coverage</p>{locked && <p className="mb-2 text-[10px] text-slate-500">Locked to <span className="text-cyan-300">{locked}</span></p>}{level < 3 && <div className="grid grid-cols-2 gap-2"><button type="button" disabled={isBusy || gold < cost || (Boolean(locked) && locked !== "power")} onClick={() => onUpgrade("power")} className="rounded-lg border border-orange-300/20 bg-orange-300/[0.06] px-2 py-2 text-xs text-orange-100 disabled:opacity-30">POWER · {cost}g</button><button type="button" disabled={isBusy || gold < cost || (Boolean(locked) && locked !== "control")} onClick={() => onUpgrade("control")} className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-2 text-xs text-emerald-100 disabled:opacity-30">CONTROL · {cost}g</button></div>}<div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={isBusy || level >= 3 || rangeMatching === 0 || gold < rangeMatching * cost} onClick={() => onBulkUpgrade?.(tower.type, level, "control")} className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-2 text-left text-[10px] text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[0.1] disabled:opacity-30"><span className="block font-semibold">CONTROL ALL</span><span className="mt-0.5 block text-[9px] text-cyan-200/60">{rangeMatching} towers · {rangeMatching * cost}g</span></button><button type="button" disabled={isBusy || level >= 3 || damageMatching === 0 || gold < damageMatching * cost} onClick={() => onBulkUpgrade?.(tower.type, level, "power")} className="rounded-lg border border-orange-300/20 bg-orange-300/[0.06] px-2 py-2 text-left text-[10px] text-orange-100 transition hover:border-orange-200/40 hover:bg-orange-300/[0.1] disabled:opacity-30"><span className="block font-semibold">POWER ALL</span><span className="mt-0.5 block text-[9px] text-orange-200/60">{damageMatching} towers · {damageMatching * cost}g</span></button></div><button type="button" onClick={onRemove} disabled={isBusy} className="mt-3 flex w-full items-center justify-between rounded-lg border border-rose-300/15 bg-rose-300/[0.04] px-2 py-2 text-left text-[10px] text-rose-200/80 disabled:opacity-30"><span className="flex items-center gap-1.5"><Trash2 className="size-3" />Remove tower</span><span className="font-mono text-emerald-200/80">+{refund}g refund</span></button></div></div>;
}

function PlayerSeat({ player, index, isCurrent, isHost }: { player: Player; index: number; isCurrent: boolean; isHost: boolean }) {
  return <div className={`rounded-xl border p-3 transition-colors ${isCurrent ? "border-cyan-300/25 bg-gradient-to-br from-cyan-300/[0.06] to-cyan-400/[0.02]" : "border-white/[0.05] bg-white/[0.01]"}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg text-xs font-bold shadow-inner" style={{ color: player.color, backgroundColor: `${player.color}20`, boxShadow: `0 0 8px 1px ${player.color}15` }}>{index + 1}</div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-white">{player.name}</span>
            {isCurrent && <span className="rounded-md bg-cyan-400/20 px-1 py-0.5 text-[8px] font-semibold text-cyan-200">YOU</span>}
            {isHost && <Crown className="size-3 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.4)]" />}
            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-300/10 bg-emerald-300/[0.04] px-1.5 py-0.5 font-mono text-[8px] text-emerald-300/80" title="Income per 15-second payout"><TrendingUp className="size-2" />+{incomeOf(player)}/15s</span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-rose-300/20 bg-rose-300/[0.06] px-2 py-1 text-right shadow-[0_0_12px_1px_rgba(251,113,133,0.08)]">
        <span className="block font-mono text-lg font-bold leading-none text-rose-100 tabular-nums">{player.health}</span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.16em] text-rose-300/90">hp</span>
      </div>
    </div>
    <div className="mt-2"><StatBar value={player.health} color={isCurrent ? "bg-gradient-to-r from-cyan-400 to-cyan-300" : "bg-gradient-to-r from-slate-600 to-slate-500"} /></div>
  </div>;
}

function SetupScreen({ name, setName, roomInput, setRoomInput, maxPlayers, setMaxPlayers, onCreate, onJoin, onPractice, isBusy, error }: { name: string; setName: (v: string) => void; roomInput: string; setRoomInput: (v: string) => void; maxPlayers: number; setMaxPlayers: (v: number) => void; onCreate: () => void; onJoin: () => void; onPractice: () => void; isBusy: boolean; error: string | null }) {
  return <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_1fr]">
    <Card className="border-white/[0.06] bg-gradient-to-b from-[#0d1528] to-[#0b1120] shadow-xl">
      <CardHeader className="pb-4"><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-lg bg-cyan-300/10"><Radio className="size-3.5 text-cyan-300" /></div><CardTitle className="text-base text-white">Host</CardTitle></div></CardHeader>
      <CardContent className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Your name" className="h-11 border-white/[0.08] bg-white/[0.02] text-white placeholder:text-slate-600 text-sm focus:border-cyan-300/30" />
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">{[2, 3, 4, 5, 6, 7, 8].map((n) => <button key={n} type="button" onClick={() => setMaxPlayers(n)} className={`rounded-lg border py-2.5 text-xs font-medium transition-all ${maxPlayers === n ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100 shadow-[0_0_8px_1px_rgba(34,211,238,0.15)]" : "border-white/[0.05] bg-white/[0.01] text-slate-500 hover:border-white/15 hover:text-slate-300"}`}>{n} players</button>)}</div>
        <Button type="button" onClick={onCreate} disabled={isBusy || !name.trim()} className="h-11 w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-xs font-bold text-slate-950 shadow-[0_0_15px_1px_rgba(34,211,238,0.2)] hover:from-cyan-400 hover:to-cyan-300 disabled:opacity-40">Create room</Button>
      </CardContent>
    </Card>
    <Card className="border-white/[0.06] bg-gradient-to-b from-[#0d1528] to-[#0b1120] shadow-xl">
      <CardHeader className="pb-4"><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-lg bg-violet-300/10"><Users className="size-3.5 text-violet-300" /></div><CardTitle className="text-base text-white">Join</CardTitle></div></CardHeader>
      <CardContent className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Your name" className="h-11 border-white/[0.08] bg-white/[0.02] text-white placeholder:text-slate-600 text-sm focus:border-violet-300/30" />
        <Input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && onJoin()} placeholder="ROOM CODE" className="h-11 border-white/[0.08] bg-white/[0.02] font-mono text-lg tracking-[0.25em] text-white placeholder:text-slate-600 focus:border-violet-300/30" />
        <Button type="button" variant="outline" onClick={onJoin} disabled={isBusy || !name.trim() || roomInput.length < 5} className="h-11 w-full border-white/[0.08] bg-white/[0.02] text-xs font-bold text-white hover:bg-white/[0.05] hover:border-white/20 disabled:opacity-30">Join room</Button>
        <div className="border-t border-white/[0.04] pt-3"><Button type="button" variant="ghost" onClick={onPractice} disabled={isBusy || !name.trim()} className="h-11 w-full text-xs text-slate-500 hover:text-cyan-300 hover:bg-cyan-300/[0.04]">Practice solo →</Button></div>
        {error && <p className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>}
      </CardContent>
    </Card>
  </div>;
}

function Lobby({ room, currentUserId, onStart, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onStart: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const isHost = String(room.players[0]?.userId) === currentUserId;
  const isPractice = !!(room as unknown as { isPractice?: boolean }).isPractice;
  return <Card className="mx-auto w-full max-w-3xl border-white/[0.06] bg-gradient-to-b from-[#0d1528] to-[#0b1120] shadow-xl">
    <CardHeader className="border-b border-white/[0.05] pb-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-cyan-300">
            <span className="flex size-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_2px_rgba(34,211,238,0.5)]" />
            {isPractice ? "PRACTICE MODE" : "GAME LOBBY"}
          </div>
          <CardTitle className="mt-1 text-2xl font-bold text-white">{isPractice ? "Training Ground" : "Ready up"}</CardTitle>
        </div>
        <div className="rounded-xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.06] to-cyan-400/[0.02] px-5 py-3 text-center shadow-[0_0_15px_2px_rgba(34,211,238,0.08)]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-cyan-300/50">room code</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-cyan-100">{room.roomCode}</p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-5 pt-5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: room.maxPlayers }).map((_, i) => {
          const p = room.players[i];
          return p ? <PlayerSeat key={String(p.userId)} player={p} index={i} isCurrent={String(p.userId) === currentUserId} isHost={i === 0} />
            : <div key={i} className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-white/[0.04] bg-white/[0.005]"><p className="text-[10px] font-medium text-slate-600">Waiting for player {i + 1}…</p></div>;
        })}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.05] pt-4">
        <span className="text-[10px] font-medium text-slate-500">{room.players.length}/{room.maxPlayers} connected</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onLeave} className="text-[10px] font-semibold text-slate-500 hover:text-white hover:bg-white/[0.04]">Leave</Button>
          {(isHost || isPractice) && <Button type="button" size="sm" onClick={onStart} disabled={isBusy} className="bg-gradient-to-r from-cyan-500 to-cyan-400 text-[10px] font-bold text-slate-950 shadow-[0_0_12px_2px_rgba(34,211,238,0.25)] hover:from-cyan-400 hover:to-cyan-300 disabled:opacity-40">{isPractice ? "Start practice" : "Start battle"}</Button>}
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>}
    </CardContent>
  </Card>;
}

function GameBoard({ room, currentUserId, onBuild, onSend, onUpgrade, onRemove, onCopy, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onBuild: (type: TowerType, x: number, y: number, element?: MageElement) => void; onSend: (type: UnitType) => void; onUpgrade: (towerId: string, branch: "power" | "control") => void; onRemove: (towerId: string) => void; onCopy: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const currentIndex = room.players.findIndex((p) => String(p.userId) === currentUserId);
  const player = room.players[currentIndex];
  const nextPlayer = room.players
    .slice(1)
    .map((_, offset) => room.players[(currentIndex + offset + 1) % room.players.length])
    .find((candidate) => candidate.health > 0);
  const [selectedTowerType, setSelectedTowerType] = useState<TowerType | null>(null);
  const [selectedMageElement, setSelectedMageElement] = useState<MageElement>("fire");
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [placementPoint, setPlacementPoint] = useState<GridPoint | null>(null);
  const [unitTab, setUnitTab] = useState<"budget" | "mid" | "endgame">("budget");
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "q") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      setSelectedTowerType(null);
      setSelectedTowerId(null);
      setPlacementPoint(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!player) return null;
  const gold = goldOf(player);
  const livingPlayers = room.players.filter((candidate) => candidate.health > 0);
  const matchComplete = livingPlayers.length <= 1;
  const winner = livingPlayers[0];
  const isWinner = matchComplete && player.health > 0;
  const canAct = player.health > 0 && !matchComplete;
  const attackSecondsLeft = room.startedAt === undefined
    ? 0
    : Math.max(0, Math.ceil((room.startedAt + ATTACK_DELAY_SECONDS * 1000 - clock) / 1000));
  const attacksLocked = attackSecondsLeft > 0;
  const canSend = canAct && !attacksLocked;
  const myTowers = towersOf(player);
  const selectedTower = selectedTowerId ? myTowers.find((t) => t.id === selectedTowerId) : null;
  const onBulkUpgrade = (type: TowerType, level: number, branch: "power" | "control") => {
    myTowers.filter((tower) => tower.type === type && (tower.upgradeLevel ?? 0) === level && (!tower.upgradeBranch || tower.upgradeBranch === branch)).forEach((tower) => onUpgrade(tower.id, branch));
  };
  const selectTowerType = (type: TowerType) => {
    setSelectedTowerType(type);
    setSelectedTowerId(null);
    setPlacementPoint(null);
  };
  const handleCellHover = (point: GridPoint | null) => {
    setPlacementPoint(selectedTowerType ? point : null);
  };

  const tabUnits = (Object.entries(UNIT_INFO) as [UnitType, typeof UNIT_INFO[UnitType]][]).filter(([, info]) => info.tier === unitTab);

  return <div className="mx-auto w-full max-w-7xl space-y-4">
    {/* Top bar */}
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-gradient-to-r from-[#0b1120] via-[#0d1528] to-[#0b1120] px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-300/10"><Crosshair className="size-4 text-cyan-300" /></div>
        <div>
          <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-white">LAN TOWER WARS</span>
          <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${room.isPractice ? "border border-amber-300/20 bg-amber-300/[0.08] text-amber-200" : "border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"}`}>{room.isPractice ? "PRACTICE" : "LIVE"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCopy} className="hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200 sm:block">{room.roomCode}</button>
        <Button type="button" variant="ghost" size="icon" onClick={onLeave} className="size-8 text-slate-500 hover:text-rose-300 hover:bg-rose-300/10"><LogOut className="size-3.5" /></Button>
      </div>
    </div>

    {matchComplete && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/25 bg-gradient-to-r from-amber-300/[0.08] to-cyan-300/[0.05] px-4 py-3 text-[10px] text-amber-100/80"><span className="flex items-center gap-2"><Crown className="size-4 text-amber-300" /><strong className="font-semibold text-amber-100">{isWinner ? "Victory" : "Match complete"}</strong><span>{isWinner ? "You are the last player standing." : winner ? `${winner.name} is the last player standing.` : "No player survived."}</span></span><span className="font-mono text-[9px] uppercase tracking-[0.15em] text-amber-300/60">Spectate</span></div>}
    {!matchComplete && !canAct && <div className="flex items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] px-4 py-2.5 text-[10px] text-rose-100/70"><Radar className="size-3.5 text-rose-300/80" />Spectating — the last remaining player wins the match.</div>}

    {/* Economy — always visible, full width */}
    <EconomyStrip player={player} clock={clock} />
    {attacksLocked && canAct && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-2.5 text-[10px] text-amber-100/80">
      <span className="flex items-center gap-2"><Radio className="size-3.5 text-amber-300" /><span><strong className="font-semibold text-amber-100">Attack phase locked.</strong> Build and prepare your defense.</span></span>
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-amber-200">{attackSecondsLeft}s</span>
    </div>}

    {/* Three-column layout */}
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.6fr_0.85fr]">
      {/* Left: build + units */}
      <Card className="border-white/[0.07] bg-[#0b1120]">
        <CardHeader className="pb-3"><div className="flex items-center gap-2"><Hammer className="size-3.5 text-cyan-200" /><CardTitle className="text-sm text-white">Build</CardTitle></div></CardHeader>
        <CardContent className="space-y-4">
          {!canAct && <div className="flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-3 py-3 text-[10px] text-rose-100/80"><Radar className="mt-0.5 size-3.5 shrink-0 text-rose-300" /><span><strong className="font-semibold text-rose-100">Spectator mode.</strong> Your lane has been eliminated. Watch the remaining players fight.</span></div>}
          <div className={canAct ? "" : "pointer-events-none opacity-40"}>
          {/* Tower grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(([type, info]) => {
              const Icon = info.icon;
              return <button key={type} type="button" onClick={() => selectTowerType(type)}
                disabled={gold < info.cost || isBusy}
                className={`rounded-lg border p-2 text-left transition ${selectedTowerType === type ? "border-cyan-300/50 bg-cyan-300/10 ring-1 ring-cyan-300/15" : "border-white/6 bg-white/[0.02] hover:border-white/15"} ${gold < info.cost ? "opacity-30 cursor-not-allowed" : ""}`}>
                <div className="flex items-center justify-between"><Icon className="size-3.5 text-cyan-200" /><span className="font-mono text-[10px] text-amber-200">{info.cost}g</span></div>
                <p className="mt-1 text-[10px] font-medium text-white">{info.short}</p>
                <p className="text-[8px] text-slate-500">{info.range}</p>
              </button>;
            })}
          </div>

          {selectedTowerType === "splash" && <div className="rounded-lg border border-fuchsia-300/10 bg-fuchsia-300/[0.03] p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-slate-500">Mage element</span>
              <span className="text-[8px] text-slate-600">Choose before placement</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(Object.entries(MAGE_ELEMENT_INFO) as [MageElement, typeof MAGE_ELEMENT_INFO[MageElement]][]).map(([element, info]) => {
                const Icon = info.icon;
                return <button key={element} type="button" onClick={() => setSelectedMageElement(element)} className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[8px] transition ${selectedMageElement === element ? `${info.border} ${info.background} ${info.text}` : "border-white/5 text-slate-600 hover:border-white/15 hover:text-slate-300"}`} title={info.counter}>
                  <Icon className="size-3" /><span>{info.label}</span>
                </button>;
              })}
            </div>
          </div>}

          {/* Unit shop with tabs */}
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] uppercase tracking-wider text-slate-500">{attacksLocked ? `Attack phase · unlocks in ${attackSecondsLeft}s` : `Send to ${nextPlayer?.name}`}</span>
            </div>
            <div className="flex gap-1 mb-2">
              {(["budget", "mid", "endgame"] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setUnitTab(tab)}
                  className={`flex-1 rounded-md py-1 text-[9px] font-medium uppercase tracking-wider transition ${unitTab === tab ? "bg-cyan-300/15 text-cyan-200" : "text-slate-600 hover:text-slate-400"}`}>
                  {tab === "budget" ? "≤800g" : tab === "mid" ? "≤3K" : "≤50K"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto">
              {tabUnits.map(([type, info]) => {
                const Icon = info.icon;
                const charge = unitChargeInfo(player, type, clock);
                const hasCharge = charge.charges > 0;
                return <button key={type} type="button" onClick={() => onSend(type)}
                  disabled={!canSend || gold < info.cost || isBusy || !hasCharge}
                  className={`rounded-lg border p-2 text-left transition ${!canSend || gold < info.cost || !hasCharge ? "border-white/3 bg-white/[0.01] opacity-30 cursor-not-allowed" : "border-white/6 bg-white/[0.02] hover:border-amber-300/30 hover:-translate-y-0.5"}`}>
                  <div className="flex items-center justify-between">
                    <Icon className="size-3 text-amber-200" />
                    <span className="font-mono text-[9px] text-amber-200">{info.cost.toLocaleString()}g</span>
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium text-white leading-tight">{info.short}</p>
                  <p className="text-[8px] text-slate-500">
                    {info.hp} Unit HP · +{info.income}/15s · {charge.charges}/{info.maxCharges} ready
                    {charge.nextSeconds > 0 && ` · +1 in ${charge.nextSeconds}s`}
                    {info.flying && " · fly"}
                    {info.resistance && ` · ${info.resistance} res`}
                  </p>
                </button>;
              })}
            </div>
          </div>

          <div className="flex items-start gap-1.5 rounded-lg border border-amber-300/10 bg-amber-300/[0.03] p-2 text-[9px] text-amber-100/60">
            <Coins className="mt-0.5 size-3 shrink-0 text-amber-300" />Income is paid in one burst every 15 seconds. Expensive units pay more.
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Center: battlefield */}
      <Card className="border-white/[0.07] bg-[#0b1120]">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-slate-600">BATTLEFIELD</span>
            <CardTitle className="text-sm text-white">{player.name}<span className="ml-2 rounded border border-rose-300/20 bg-rose-300/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-rose-300">Player HP</span></CardTitle>
          </div>

        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <GridLane player={player} selectedTowerType={selectedTowerType} selectedMageElement={selectedMageElement} placementPoint={placementPoint} onCellClick={canAct && selectedTowerType ? (x, y) => onBuild(selectedTowerType, x, y, selectedTowerType === "splash" ? selectedMageElement : undefined) : undefined} onCellHover={canAct && selectedTowerType ? handleCellHover : undefined} onTowerClick={canAct ? (id) => { setPlacementPoint(null); setSelectedTowerId(id === selectedTowerId ? null : id); } : undefined} selectedTowerId={selectedTowerId} />
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg border border-white/5 bg-white/[0.01] p-2"><p className="font-mono text-sm text-white">{player.health}</p><p className="text-[8px] text-slate-600">integrity</p></div>
            <div className="rounded-lg border border-white/5 bg-white/[0.01] p-2"><p className="font-mono text-sm text-cyan-100">{myTowers.length}</p><p className="text-[8px] text-slate-600">walls</p></div>
            <div className="rounded-lg border border-white/5 bg-white/[0.01] p-2"><p className="font-mono text-sm text-amber-100">{unitsOf(player).length}</p><p className="text-[8px] text-slate-600">units</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Right: other lanes + log */}
      <Card className="border-white/[0.07] bg-white/[0.01]">
        <CardHeader className="pb-3"><div className="flex items-center gap-2"><Radar className="size-3.5 text-violet-200" /><CardTitle className="text-sm text-white">All lanes</CardTitle></div></CardHeader>
        <CardContent className="space-y-3">
          {room.players.map((seat, i) => (
            <div key={String(seat.userId)}>
              <div className="mb-1 flex items-center justify-between gap-1 text-[9px]">
                <span className={i === currentIndex ? "font-semibold text-cyan-100" : "text-slate-400"}>{seat.name}</span>
                {seat.health <= 0 && <span className="rounded border border-rose-300/15 bg-rose-300/[0.05] px-1 py-px font-mono text-[7px] text-rose-300/70">OUT</span>}
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-0.5 rounded border border-emerald-300/15 bg-emerald-300/[0.05] px-1 py-px font-mono text-[8px] text-emerald-300/80" title="Income per 15-second payout"><TrendingUp className="size-2" />+{incomeOf(seat)}/15s</span>
                  <span className="font-mono text-slate-600">{seat.health}%</span>
                </span>
              </div>
              <div className="hidden sm:block"><GridLane player={seat} compact /></div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-2.5 py-2 sm:hidden">
                <span className="font-mono text-[9px] text-slate-500">{unitsOf(seat).length} units · {towersOf(seat).length} walls</span>
                <span className="font-mono text-[9px] text-emerald-300/80">+{incomeOf(seat)}/15s</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>

    {/* Battle log */}
    <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-[#0b1120]/80 px-4 py-3">
      <Radio className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
      <p className="text-[10px] text-slate-400">{room.lastAction}</p>
    </div>
    {error && <p className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>}

    {/* Tower upgrade modal */}
    {selectedTower && canAct && <TowerUpgradeModal tower={selectedTower} player={player} onUpgrade={(branch) => { onUpgrade(selectedTower.id, branch); setSelectedTowerId(null); }} onBulkUpgrade={onBulkUpgrade} onRemove={() => { onRemove(selectedTower.id); setSelectedTowerId(null); }} onClose={() => setSelectedTowerId(null)} isBusy={isBusy} />}
  </div>;
}

export default function Dashboard() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const room = useQuery(api.game.getRoom, roomCode ? { roomCode } : "skip");
  const createRoom = useMutation(api.game.createRoom);
  const createPracticeRoom = useMutation(api.game.createPracticeRoom);
  const joinRoom = useMutation(api.game.joinRoom);
  const leaveRoom = useMutation(api.game.leaveRoom);
  const startGame = useMutation(api.game.startGame);
  const buildTower = useMutation(api.game.buildTower);
  const sendUnit = useMutation(api.game.sendUnit);
  const upgradeTower = useMutation(api.game.upgradeTower);
  const removeTower = useMutation(api.game.removeTower);
  const tick = useMutation(api.game.tick);
  const currentUser = useQuery(api.users.currentUser);
  const currentUserId = currentUser?._id ? String(currentUser._id) : undefined;
  const isLoadingRoom = Boolean(roomCode && room === undefined);
  const showSetup = !roomCode || room === null;
  const roomStatus = room?.status ?? "lobby";

  useEffect(() => {
    if (!roomCode || roomStatus !== "playing") return;
    const timer = window.setInterval(() => { void tick({ roomCode }).catch(() => undefined); }, 1000);
    return () => window.clearInterval(timer);
  }, [roomCode, roomStatus, tick]);

  const run = async (action: () => Promise<unknown>) => {
    setIsBusy(true); setError(null);
    try { await action(); } catch (e) { const msg = friendlyError(e); setError(msg); toast.error(msg); }
    finally { setIsBusy(false); }
  };

  const handleCreate = () => run(async () => {
    const code = await createRoom({ name: name.trim(), maxPlayers });
    setRoomCode(code); toast.success(`Room ${code}`);
  });

  const handlePractice = () => run(async () => {
    const code = await createPracticeRoom({ name: name.trim() });
    setRoomCode(code); toast.success("Practice mode");
  });

  const handleJoin = () => run(async () => {
    const code = await joinRoom({ roomCode: roomInput, name: name.trim() });
    setRoomCode(code); toast.success("Joined");
  });

  const handleLeave = () => run(async () => {
    if (roomCode) await leaveRoom({ roomCode });
    setRoomCode(null); setRoomInput("");
  });

  const handleCopy = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(room.roomCode); toast.success("Copied"); }
    catch { toast.info(`Code: ${room.roomCode}`); }
  };



  return <main className="min-h-screen bg-[#080b14] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.06),transparent_35%),radial-gradient(circle_at_15%_100%,rgba(167,139,250,0.04),transparent_35%),linear-gradient(180deg,#080b14_0%,#0a1020_50%,#080b14_100%)]" />
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-6 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-300/[0.08]"><Crosshair className="size-4 text-cyan-300" /></div>
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-cyan-100">LAN TOWER WARS</span>
        </div>
        <div className="flex items-center gap-2">
          {name && <span className="rounded-lg bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-slate-400">{name}</span>}
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center py-6 sm:py-8">
        {isLoadingRoom ? (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500"><Sparkles className="size-3 animate-pulse text-cyan-200" />Syncing…</div>
        ) : showSetup ? (
          <>
            <div className="mx-auto mb-8 max-w-xl text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Build a maze. Defend your lane.</h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Place towers on the grid to shape a route for enemy units. Send units to your neighbors — their gold becomes your income.</p>
            </div>
            <SetupScreen name={name} setName={setName} roomInput={roomInput} setRoomInput={setRoomInput} maxPlayers={maxPlayers} setMaxPlayers={setMaxPlayers} onCreate={handleCreate} onJoin={handleJoin} onPractice={handlePractice} isBusy={isBusy} error={error} />
          </>
        ) : roomStatus === "lobby" ? (
          <Lobby room={room!} currentUserId={currentUserId} onStart={() => run(() => startGame({ roomCode: roomCode! }))} onLeave={handleLeave} isBusy={isBusy} error={error} />
        ) : roomStatus === "playing" ? (
          <GameBoard room={room!} currentUserId={currentUserId}
            onBuild={(t, x, y, element) => run(() => buildTower({ roomCode: roomCode!, towerType: t, x, y, mageElement: element }))}
            onSend={(unitType) => run(() => sendUnit({ roomCode: roomCode!, unitType }))}
            onUpgrade={(towerId, branch) => run(() => upgradeTower({ roomCode: roomCode!, towerId, branch }))}
            onRemove={(towerId) => run(() => removeTower({ roomCode: roomCode!, towerId }))}
            onCopy={handleCopy} onLeave={handleLeave} isBusy={isBusy} error={error} />
        ) : (
          <Card className="mx-auto max-w-md overflow-hidden border-rose-300/10 bg-gradient-to-b from-[#0f1923] to-[#0b1120] text-center shadow-[0_0_40px_10px_rgba(251,113,133,0.06)]">
            <div className="h-1 w-full bg-gradient-to-r from-rose-500/60 via-rose-400/30 to-rose-500/60" />
            <CardContent className="space-y-5 pt-8">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-rose-300/15 bg-rose-300/[0.06]">
                <Swords className="size-6 text-rose-200/80" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Defeat</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">Wave {room?.wave} — your lane was overrun.</p>
              </div>
              <Button type="button" size="sm" onClick={handleLeave} className="h-10 w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-xs font-bold text-slate-950 shadow-[0_0_15px_2px_rgba(34,211,238,0.2)] hover:from-cyan-400 hover:to-cyan-300">New match</Button>
            </CardContent>
          </Card>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-white/[0.04] pt-4 text-[9px] tracking-[0.2em] text-slate-600">
        <span className="font-mono font-medium">LAN TOWER WARS</span>
        <span>2–4 players · local</span>
      </footer>
    </div>
  </main>;
}

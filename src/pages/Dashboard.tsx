import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { Bird, Castle, Coins, Crosshair, Crown, Flame, Footprints, Ghost, Hammer, HelpCircle, LogOut, Radar, Radio, Ruler, Shield, Skull, Snowflake, Sparkles, Swords, Target, Trash2, TrendingUp, Turtle, Users, Wand, Zap } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

const GRID_WIDTH = 14;
const GRID_HEIGHT = 8;

const TOWER_INFO: Record<TowerType, { short: string; cost: number; range: string; icon: typeof Target }> = {
  close: { short: "Pulse", cost: 15, range: "r1 · 10dps", icon: Target },
  far: { short: "Rail", cost: 25, range: "r3 · 4dps", icon: Radar },
  splash: { short: "Mage", cost: 45, range: "r2 · adaptive", icon: Sparkles },
  slow: { short: "Snare", cost: 30, range: "r2 · 3dps · slow", icon: Ruler },
};

const MAGE_ELEMENT_INFO: Record<MageElement, { label: string; counter: string; icon: typeof Flame; text: string; border: string; background: string; glow: string }> = {
  fire: { label: "Fire", counter: "breaks splash resist", icon: Flame, text: "text-orange-200", border: "border-orange-300/40", background: "bg-orange-300/10", glow: "shadow-[0_0_10px_2px_rgba(251,146,60,0.35)]" },
  frost: { label: "Frost", counter: "checks fast units", icon: Snowflake, text: "text-sky-200", border: "border-sky-300/40", background: "bg-sky-300/10", glow: "shadow-[0_0_10px_2px_rgba(56,189,248,0.35)]" },
  storm: { label: "Storm", counter: "hunts flyers", icon: Zap, text: "text-yellow-200", border: "border-yellow-300/40", background: "bg-yellow-300/10", glow: "shadow-[0_0_10px_2px_rgba(250,204,21,0.35)]" },
  void: { label: "Void", counter: "pierces heavy resist", icon: Wand, text: "text-fuchsia-200", border: "border-fuchsia-300/40", background: "bg-fuchsia-300/10", glow: "shadow-[0_0_10px_2px_rgba(217,70,239,0.35)]" },
};

const UNIT_INFO: Record<UnitType, { short: string; cost: number; hp: number; income: number; tier: string; icon: typeof Footprints; flying?: boolean; resistance?: string }> = {
  soldier: { short: "Foot Soldier", cost: 5, hp: 14, income: 1, tier: "budget", icon: Footprints },
  scout: { short: "Scout", cost: 8, hp: 8, income: 1, tier: "budget", icon: Zap },
  runner: { short: "Runner", cost: 12, hp: 6, income: 1, tier: "budget", icon: Bird },
  grunt: { short: "Grunt", cost: 25, hp: 30, income: 2, tier: "budget", icon: Shield, resistance: "splash" },
  slinger: { short: "Slinger", cost: 35, hp: 10, income: 3, tier: "budget", icon: Bird, flying: true },
  brute: { short: "Brute", cost: 120, hp: 200, income: 8, tier: "mid", icon: Turtle },
  raider: { short: "Raider", cost: 250, hp: 80, income: 15, tier: "mid", icon: Flame, resistance: "slow" },
  juggernaut: { short: "Juggernaut", cost: 500, hp: 500, income: 25, tier: "mid", icon: Shield, resistance: "all" },
  phantom: { short: "Phantom", cost: 350, hp: 40, income: 18, tier: "mid", icon: Ghost, flying: true },
  siege_breaker: { short: "Siege Breaker", cost: 2000, hp: 1200, income: 60, tier: "endgame", icon: Castle },
  leviathan: { short: "Leviathan", cost: 5000, hp: 3000, income: 120, tier: "endgame", icon: Skull, resistance: "splash" },
  wraith_lord: { short: "Wraith Lord", cost: 8000, hp: 500, income: 150, tier: "endgame", icon: Ghost, flying: true, resistance: "physical" },
  titan: { short: "Titan", cost: 20000, hp: 8000, income: 350, tier: "endgame", icon: Castle, resistance: "all" },
  doomsday: { short: "Doomsday", cost: 50000, hp: 15000, income: 500, tier: "endgame", icon: Skull },
};
const UNIT_MAX_HP: Record<string, number> = Object.fromEntries(Object.entries(UNIT_INFO).map(([k, v]) => [k, v.hp]));

const UPGRADE_COSTS = [30, 80, 200];

function friendlyError(error: unknown) { return error instanceof Error ? error.message.replace(/^Error: /, "") : "Something went wrong."; }
function goldOf(player: Player) { return player.gold ?? 30; }
function incomeOf(player: Player) { return player.income ?? 2; }
function unitsOf(player: Player) { return player.laneUnits ?? []; }
function towersOf(player: Player) { return player.towers ?? []; }
function projectilesOf(player: Player): Projectile[] { return player.projectiles ?? []; }
function towerPoint(tower: NonNullable<Player["towers"]>[number]): GridPoint { return { x: tower.x ?? Math.round((tower.position / 100) * (GRID_WIDTH - 1)), y: tower.y ?? 4 }; }
function unitPoint(unit: NonNullable<Player["laneUnits"]>[number]): GridPoint { return { x: unit.x ?? Math.round((unit.position / 100) * (GRID_WIDTH - 1)), y: unit.y ?? 4 }; }
function pointKey(point: GridPoint) { return `${point.x}:${point.y}`; }

function findVisualPath(towers: Player["towers"]): Set<string> {
  // The route overlay shows the ground route; flying units intentionally ignore it.
  return findPathThroughTowers(towers);
}

function findPathThroughTowers(towers: Player["towers"]): Set<string> {
  const blocked = new Set((towers ?? []).map((tower) => pointKey(towerPoint(tower))));
  const start = { x: 0, y: 4 };
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

function StatBar({ value, color = "bg-cyan-300" }: { value: number; color?: string }) { return <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

// ── Prominent economy readout: wallet, income rate, and per-tick estimate ──
function EconomyStrip({ player }: { player: Player }) {
  const gold = goldOf(player);
  const income = incomeOf(player);
  return <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-[#0b1120]/90 px-3 py-2.5 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-4">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-300/10"><Coins className="size-4 text-amber-300" /></span>
      <div className="min-w-0">
        <p className="text-[8px] font-medium uppercase tracking-[0.18em] text-slate-500">Wallet</p>
        <p className="truncate font-mono text-lg font-semibold leading-tight text-amber-100 sm:text-xl">{gold}<span className="ml-1 text-[10px] font-normal text-amber-200/50">g</span></p>
      </div>
    </div>
    <div className="flex min-w-0 items-center justify-end gap-2.5 sm:justify-start">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10"><TrendingUp className="size-4 text-emerald-300" /></span>
      <div className="min-w-0">
        <p className="text-[8px] font-medium uppercase tracking-[0.18em] text-slate-500">Income</p>
        <p className="font-mono text-lg font-semibold leading-tight text-emerald-100 sm:text-xl">+{income}<span className="ml-1 text-[10px] font-normal text-emerald-200/50">g/s</span></p>
      </div>
      <span className="ml-1 hidden shrink-0 rounded-md border border-emerald-300/15 bg-emerald-300/[0.06] px-1.5 py-1 text-[9px] font-medium text-emerald-200/80 md:block" title="Estimated payout each tick">≈{income}g / tick</span>
    </div>
  </div>;
}

// ── Themed projectiles ──
function ProjectileLayer({ projectiles }: { projectiles: Projectile[] }) {
  return (
    <>
      {projectiles.map((p) => {
        const progress = Math.max(0, Math.min(1, p.progress));
        const x = p.x + (p.targetX - p.x) * progress;
        const y = p.y + (p.targetY - p.y) * progress;
        const left = `${((x + 0.5) / GRID_WIDTH) * 100}%`;
        const top = `${((y + 0.5) / GRID_HEIGHT) * 100}%`;

        if (p.towerType === "close") {
          // Pulse: expanding ring wave
          return <div key={p.id} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
            <div className="proj-pulse size-6 rounded-full border-2 border-cyan-300/70 shadow-[0_0_12px_4px_rgba(34,211,238,0.5)]" />
          </div>;
        }

        if (p.towerType === "far") {
          // Rail: laser beam line
          const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x) * (180 / Math.PI);
          const length = Math.sqrt((p.targetX - p.x) ** 2 + (p.targetY - p.y) ** 2) * 100 / GRID_WIDTH;
          return <div key={p.id} className="pointer-events-none absolute z-20 origin-left" style={{ left, top, transform: `rotate(${angle}deg)`, width: `${length}%` }}>
            <div className="h-[2px] bg-gradient-to-r from-violet-300 via-violet-100 to-transparent shadow-[0_0_8px_2px_rgba(167,139,250,0.7)]" />
          </div>;
        }

        if (p.towerType === "splash") {
          const element = mageElementFor(p);
          const info = MAGE_ELEMENT_INFO[element];
          const Icon = info.icon;
          return <div key={p.id} className={`pointer-events-none absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-[0_0_12px_3px_currentColor] ${info.text} ${info.border} ${info.background}`} style={{ left, top }}>
            <Icon className="size-3.5 proj-flicker" />
          </div>;
        }

        // Snare: net
        return <div key={p.id} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
          <div className="proj-spin size-4 border border-emerald-300/60 shadow-[0_0_6px_2px_rgba(110,231,183,0.4)]">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border-[0.5px] border-emerald-300/30" />)}
            </div>
          </div>
        </div>;
      })}
    </>
  );
}

// ── Grid lane with smooth unit movement ──
function GridLane({ player, compact = false, selectedTowerType, selectedMageElement, onCellClick, onTowerClick, selectedTowerId }: { player: Player; compact?: boolean; selectedTowerType?: TowerType; selectedMageElement?: MageElement; onCellClick?: (x: number, y: number) => void; onTowerClick?: (towerId: string) => void; selectedTowerId?: string | null }) {
  const towers = towersOf(player);
  const units = unitsOf(player);
  const projectiles = projectilesOf(player);
  const towerSignature = towers.map((tower) => `${tower.id}:${tower.x ?? ""}:${tower.y ?? ""}:${tower.type}:${tower.element ?? ""}:${tower.upgradeLevel ?? 0}`).join("|");
  const route = useMemo(() => findVisualPath(player.towers), [towerSignature]);
  const towerMap = useMemo(() => new Map(towers.map((tower) => [pointKey(towerPoint(tower)), tower])), [towerSignature]);

  return <div className="relative aspect-[14/8] overflow-hidden rounded-lg border border-white/[0.07] bg-[#060b15]">
    <div className="absolute inset-0 grid grid-cols-14 grid-rows-8">
      {Array.from({ length: GRID_WIDTH * GRID_HEIGHT }).map((_, index) => {
        const x = index % GRID_WIDTH;
        const y = Math.floor(index / GRID_WIDTH);
        const cellKey = `${x}:${y}`;
        const tower = towerMap.get(cellKey);
        const isStart = x === 0;
        const isGoal = x === GRID_WIDTH - 1;
        const canBuild = !compact && !tower && !isStart && !isGoal && Boolean(onCellClick);

        return <div
          key={cellKey}
          role={canBuild || tower ? "button" : undefined}
          tabIndex={canBuild || tower ? 0 : -1}
          onClick={() => { if (canBuild) onCellClick?.(x, y); if (tower && onTowerClick) onTowerClick(tower.id); }}
          className={`relative border-r border-b border-white/[0.04] transition-colors ${isStart ? "bg-cyan-300/[0.05]" : isGoal ? "bg-rose-300/[0.05]" : route.has(cellKey) ? "bg-emerald-300/[0.02]" : ""} ${canBuild ? "cursor-crosshair hover:bg-cyan-300/20" : ""} ${tower && onTowerClick ? "cursor-pointer hover:brightness-125" : ""} ${tower && tower.id === selectedTowerId ? "ring-1 ring-cyan-300/60" : ""} ${tower && tower.type === "splash" ? MAGE_ELEMENT_INFO[mageElementFor(tower)].glow : ""}`}
          title={canBuild ? `Place ${selectedTowerType ? TOWER_INFO[selectedTowerType].short : "tower"}${selectedTowerType === "splash" ? ` · ${MAGE_ELEMENT_INFO[selectedMageElement ?? "fire"].label}` : ""} at ${x + 1}/${y + 1}` : tower ? `${towerInfoFor(tower.type).short}${tower.type === "splash" ? ` · ${MAGE_ELEMENT_INFO[mageElementFor(tower)].label}` : ""}${(tower.upgradeLevel ?? 0) > 0 ? ` LV.${tower.upgradeLevel}` : ""} — click to upgrade` : undefined}
        >
          {isStart && !compact && <span className="absolute left-0.5 top-0.5 text-[7px] font-mono text-cyan-200/50">IN</span>}
          {isGoal && !compact && <span className="absolute right-0.5 top-0.5 text-[7px] font-mono text-rose-200/50">GOAL</span>}
          {tower && (
            <div className={`flex size-full items-center justify-center ${tower.type === "close" ? "text-cyan-200/90" : tower.type === "far" ? "text-violet-200/90" : tower.type === "splash" ? MAGE_ELEMENT_INFO[mageElementFor(tower)].text : "text-emerald-200/90"}`}>
              {React.createElement(tower.type === "splash" ? MAGE_ELEMENT_INFO[mageElementFor(tower)].icon : towerInfoFor(tower.type).icon, { className: compact ? "size-3" : "size-4" })}
              {!compact && (tower.upgradeLevel ?? 0) > 0 && <span className="absolute -bottom-0.5 text-[6px] font-mono text-cyan-300/80">L{tower.upgradeLevel}</span>}
            </div>
          )}
        </div>;
      })}
    </div>

    {/* Units with smooth CSS position transitions */}
    {units.map((unit) => {
      const pt = unitPoint(unit);
      const info = UNIT_INFO[unit.type];
      const hpPct = Math.max(0, Math.min(100, (unit.hp / (info?.hp || UNIT_MAX_HP[unit.type] || 10)) * 100));
      const isFlying = !!(unit as { flying?: boolean }).flying;
      const Icon = info?.icon || HelpCircle;
      return (
        <div key={unit.id} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-1000 ease-linear"
          style={{
            left: `${((pt.x + 0.5) / GRID_WIDTH) * 100}%`,
            top: `${((pt.y + 0.5) / GRID_HEIGHT) * 100}%`,
          }}>
          <div className={`relative flex items-center justify-center rounded-full border shadow-lg ${isFlying ? "size-7 border-sky-400 bg-sky-400/20 text-sky-100" : unit.type === "titan" || unit.type === "doomsday" ? "size-10 border-red-500 bg-red-600/30 text-red-100" : unit.type === "leviathan" || unit.type === "siege_breaker" ? "size-9 border-amber-400 bg-amber-500/25 text-amber-100" : unit.type === "juggernaut" || unit.type === "brute" ? "size-8 border-orange-400 bg-orange-400/25 text-orange-100" : "size-6 border-amber-300 bg-amber-300/20 text-amber-100"}`}>
            <Icon className="size-3" />
            {isFlying && <span className="absolute -top-3 text-[7px] text-sky-300">▲</span>}
          </div>
          {/* HP bar */}
          {!compact && <div className="absolute -top-3 left-1/2 h-0.5 w-6 -translate-x-1/2 overflow-hidden rounded-full bg-black/60">
            <div className={`h-full rounded-full transition-[width] duration-500 ${hpPct > 50 ? "bg-emerald-300" : hpPct > 25 ? "bg-amber-300" : "bg-red-400"}`} style={{ width: `${hpPct}%` }} />
          </div>}
        </div>
      );
    })}

    <ProjectileLayer projectiles={projectiles} />

  </div>;
}

// ── Tower upgrade modal ──
function TowerUpgradeModal({ tower, player, onUpgrade, onRemove, onClose, isBusy }: { tower: NonNullable<Player["towers"]>[number]; player: Player; onUpgrade: (branch: "power" | "control") => void; onRemove: () => void; onClose: () => void; isBusy: boolean }) {
  const level = tower.upgradeLevel ?? 0;
  const locked = tower.upgradeBranch;
  const cost = UPGRADE_COSTS[level] ?? 200;
  const gold = goldOf(player);
  const info = towerInfoFor(tower.type);
  const mageElement = tower.type === "splash" ? mageElementFor(tower) : null;
  const refund = Math.floor((info.cost + UPGRADE_COSTS.slice(0, level).reduce((total, upgradeCost) => total + upgradeCost, 0)) * 0.75);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-pop w-80 rounded-2xl border border-white/10 bg-[#0f1729] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {React.createElement(mageElement ? MAGE_ELEMENT_INFO[mageElement].icon : info.icon, { className: `size-4 ${mageElement ? MAGE_ELEMENT_INFO[mageElement].text : "text-cyan-200"}` })}
            <span className="text-sm font-semibold text-white">{info.short}</span>
            <span className="font-mono text-[10px] text-cyan-300">LV.{level}</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <p className="text-[11px] text-slate-400 mb-1">{info.range}</p>
        {mageElement && <p className={`mb-3 text-[10px] ${MAGE_ELEMENT_INFO[mageElement].text}`}>{MAGE_ELEMENT_INFO[mageElement].label} · {MAGE_ELEMENT_INFO[mageElement].counter}</p>}
        {locked && <p className="text-[10px] text-slate-500 mb-3">Locked to <span className="text-cyan-300">{locked}</span> branch</p>}
        {level >= 3 ? (
          <p className="text-[11px] text-amber-200/70">Maximum level reached.</p>
        ) : (
          <>
            <p className="text-[10px] text-slate-500 mb-3">Upgrade cost: <span className="font-mono text-amber-200">{cost}g</span></p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={isBusy || gold < cost || (Boolean(locked) && locked !== "power")}
                onClick={() => onUpgrade("power")}
                className="rounded-lg border border-orange-300/20 bg-orange-300/[0.06] px-3 py-2.5 text-left text-[11px] text-orange-100 transition hover:border-orange-300/50 disabled:cursor-not-allowed disabled:opacity-30">
                <span className="block font-semibold text-xs">POWER</span><span className="mt-0.5 block text-[10px] text-orange-100/60">+20% dmg / lv</span>
              </button>
              <button type="button" disabled={isBusy || gold < cost || (Boolean(locked) && locked !== "control")}
                onClick={() => onUpgrade("control")}
                className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2.5 text-left text-[11px] text-emerald-100 transition hover:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-30">
                <span className="block font-semibold text-xs">CONTROL</span><span className="mt-0.5 block text-[10px] text-emerald-100/60">+1 range / lv</span>
              </button>
            </div>
          </>
        )}
        <div className="mt-4 border-t border-white/5 pt-3">
          <button type="button" onClick={onRemove} disabled={isBusy}
            className="flex w-full items-center justify-between rounded-lg border border-rose-300/15 bg-rose-300/[0.04] px-3 py-2 text-left text-[10px] text-rose-200/80 transition hover:border-rose-300/40 hover:bg-rose-300/[0.08] disabled:cursor-not-allowed disabled:opacity-30">
            <span className="flex items-center gap-1.5"><Trash2 className="size-3" />Remove tower</span>
            <span className="font-mono text-emerald-200/80">+{refund}g refund</span>
          </button>
          <p className="mt-1.5 text-[9px] text-slate-600">Refunds 75% of this tower's build and upgrade cost.</p>
        </div>
      </div>
    </div>
  );
}

function PlayerSeat({ player, index, isCurrent, isHost }: { player: Player; index: number; isCurrent: boolean; isHost: boolean }) {
  return <div className={`rounded-xl border p-3 ${isCurrent ? "border-cyan-300/30 bg-cyan-300/[0.05]" : "border-white/8 bg-white/[0.015]"}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg text-xs font-semibold" style={{ color: player.color, backgroundColor: `${player.color}18` }}>{index + 1}</div>
        <div><div className="flex items-center gap-1 text-xs font-semibold text-white">{player.name}{isCurrent && <span className="rounded bg-cyan-300/15 px-1 text-[8px] text-cyan-200">YOU</span>}{isHost && <Crown className="size-3 text-amber-300" />}<span className="ml-1 inline-flex items-center gap-0.5 rounded border border-emerald-300/15 bg-emerald-300/[0.05] px-1 font-mono text-[8px] text-emerald-300/80" title="Income per tick"><TrendingUp className="size-2" />+{incomeOf(player)}</span></div></div>
      </div>
      <div className="text-right"><span className="font-mono text-xs text-white">{player.health}</span><span className="text-[8px] text-slate-600">%</span></div>
    </div>
    <div className="mt-1.5"><StatBar value={player.health} color={isCurrent ? "bg-cyan-300" : "bg-slate-500"} /></div>
  </div>;
}

function SetupScreen({ name, setName, roomInput, setRoomInput, maxPlayers, setMaxPlayers, onCreate, onJoin, onPractice, isBusy, error }: { name: string; setName: (v: string) => void; roomInput: string; setRoomInput: (v: string) => void; maxPlayers: number; setMaxPlayers: (v: number) => void; onCreate: () => void; onJoin: () => void; onPractice: () => void; isBusy: boolean; error: string | null }) {
  return <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_1fr]">
    <Card className="border-white/[0.07] bg-[#0b1120]">
      <CardHeader className="pb-4"><div className="flex items-center gap-2"><Radio className="size-4 text-cyan-200" /><CardTitle className="text-base text-white">Host</CardTitle></div></CardHeader>
      <CardContent className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Name" className="h-10 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-600 text-sm" />
        <div className="grid grid-cols-3 gap-1.5">{[2, 3, 4].map((n) => <button key={n} type="button" onClick={() => setMaxPlayers(n)} className={`rounded-lg border py-2 text-xs transition ${maxPlayers === n ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/8 bg-white/[0.02] text-slate-500 hover:border-white/15"}`}>{n}p</button>)}</div>
        <Button type="button" onClick={onCreate} disabled={isBusy || !name.trim()} className="h-10 w-full bg-cyan-300 text-xs font-semibold text-slate-950 hover:bg-cyan-200">Create room</Button>
      </CardContent>
    </Card>
    <Card className="border-white/[0.07] bg-white/[0.015]">
      <CardHeader className="pb-4"><div className="flex items-center gap-2"><Users className="size-4 text-violet-200" /><CardTitle className="text-base text-white">Join</CardTitle></div></CardHeader>
      <CardContent className="space-y-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Name" className="h-10 border-white/10 bg-white/[0.03] text-white placeholder:text-slate-600 text-sm" />
        <Input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && onJoin()} placeholder="CODE" className="h-10 border-white/10 bg-white/[0.03] font-mono text-lg tracking-[0.2em] text-white placeholder:text-slate-600" />
        <Button type="button" variant="outline" onClick={onJoin} disabled={isBusy || !name.trim() || roomInput.length < 5} className="h-10 w-full border-white/10 bg-white/[0.03] text-xs font-semibold text-white hover:bg-white/8">Join room</Button>
        <div className="border-t border-white/5 pt-3"><Button type="button" variant="ghost" onClick={onPractice} disabled={isBusy || !name.trim()} className="h-10 w-full text-xs text-slate-400 hover:text-cyan-200 hover:bg-cyan-300/5">Practice solo</Button></div>
        {error && <p className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>}
      </CardContent>
    </Card>
  </div>;
}

function Lobby({ room, currentUserId, onStart, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onStart: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const isHost = String(room.players[0]?.userId) === currentUserId;
  const isPractice = !!(room as unknown as { isPractice?: boolean }).isPractice;
  return <Card className="mx-auto w-full max-w-3xl border-white/[0.07] bg-[#0b1120]">
    <CardHeader className="border-b border-white/5 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />{isPractice ? "PRACTICE" : "LOBBY"}</div>
          <CardTitle className="mt-1 text-xl text-white">{isPractice ? "Training Ground" : "Assemble crew"}</CardTitle>
        </div>
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] px-4 py-3 text-center">
          <p className="text-[9px] uppercase tracking-[0.2em] text-cyan-200/60">code</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-[0.2em] text-cyan-100">{room.roomCode}</p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-4 pt-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: room.maxPlayers }).map((_, i) => {
          const p = room.players[i];
          return p ? <PlayerSeat key={String(p.userId)} player={p} index={i} isCurrent={String(p.userId) === currentUserId} isHost={i === 0} />
            : <div key={i} className="flex min-h-[70px] items-center justify-center rounded-xl border border-dashed border-white/5 bg-white/[0.01]"><p className="text-[10px] text-slate-600">Open slot {i + 1}</p></div>;
        })}
      </div>
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-[10px] text-slate-500">{room.players.length}/{room.maxPlayers} connected</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onLeave} className="text-[10px] text-slate-500 hover:text-white">Leave</Button>
          {(isHost || isPractice) && <Button type="button" size="sm" onClick={onStart} disabled={isBusy} className="bg-cyan-300 text-[10px] font-semibold text-slate-950 hover:bg-cyan-200">{isPractice ? "Start" : "Start battle"}</Button>}
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-200">{error}</p>}
    </CardContent>
  </Card>;
}

function GameBoard({ room, currentUserId, onBuild, onSend, onUpgrade, onRemove, onCopy, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onBuild: (type: TowerType, x: number, y: number, element?: MageElement) => void; onSend: (type: UnitType) => void; onUpgrade: (towerId: string, branch: "power" | "control") => void; onRemove: (towerId: string) => void; onCopy: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const currentIndex = room.players.findIndex((p) => String(p.userId) === currentUserId);
  const player = room.players[currentIndex];
  const nextPlayer = room.players[(currentIndex + 1) % room.players.length];
  const [selectedTowerType, setSelectedTowerType] = useState<TowerType>("close");
  const [selectedMageElement, setSelectedMageElement] = useState<MageElement>("fire");
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [unitTab, setUnitTab] = useState<"budget" | "mid" | "endgame">("budget");

  if (!player) return null;
  const gold = goldOf(player);
  const myTowers = towersOf(player);
  const selectedTower = selectedTowerId ? myTowers.find((t) => t.id === selectedTowerId) : null;

  const tabUnits = (Object.entries(UNIT_INFO) as [UnitType, typeof UNIT_INFO[UnitType]][]).filter(([, info]) => info.tier === unitTab);

  return <div className="mx-auto w-full max-w-7xl space-y-4">
    {/* Top bar */}
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-[#0b1120]/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Crosshair className="size-4 text-cyan-200" />
        <div>
          <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-white">LAN TOWER WARS</span>
          <span className="ml-2 rounded border border-emerald-300/15 bg-emerald-300/[0.06] px-1.5 py-0.5 text-[9px] text-emerald-200">{room.isPractice ? "PRACTICE" : "LIVE"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCopy} className="hidden rounded border border-white/8 bg-white/[0.02] px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-slate-400 hover:border-cyan-300/30 sm:block">{room.roomCode}</button>
        <Button type="button" variant="ghost" size="icon" onClick={onLeave} className="size-7 text-slate-500 hover:text-rose-200"><LogOut className="size-3.5" /></Button>
      </div>
    </div>

    {/* Economy — always visible, full width */}
    <EconomyStrip player={player} />

    {/* Three-column layout */}
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.6fr_0.85fr]">
      {/* Left: build + units */}
      <Card className="border-white/[0.07] bg-[#0b1120]">
        <CardHeader className="pb-3"><div className="flex items-center gap-2"><Hammer className="size-3.5 text-cyan-200" /><CardTitle className="text-sm text-white">Build</CardTitle></div></CardHeader>
        <CardContent className="space-y-4">
          {/* Tower grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(([type, info]) => {
              const Icon = info.icon;
              return <button key={type} type="button" onClick={() => setSelectedTowerType(type)}
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
              <span className="text-[9px] uppercase tracking-wider text-slate-500">Send to {nextPlayer?.name}</span>
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
                return <button key={type} type="button" onClick={() => onSend(type)}
                  disabled={gold < info.cost || isBusy}
                  className={`rounded-lg border p-2 text-left transition ${gold < info.cost ? "border-white/3 bg-white/[0.01] opacity-30 cursor-not-allowed" : "border-white/6 bg-white/[0.02] hover:border-amber-300/30 hover:-translate-y-0.5"}`}>
                  <div className="flex items-center justify-between">
                    <Icon className="size-3 text-amber-200" />
                    <span className="font-mono text-[9px] text-amber-200">{info.cost.toLocaleString()}g</span>
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium text-white leading-tight">{info.short}</p>
                  <p className="text-[8px] text-slate-500">
                    {info.hp}hp · +{info.income}inc
                    {info.flying && " · fly"}
                    {info.resistance && ` · ${info.resistance} res`}
                  </p>
                </button>;
              })}
            </div>
          </div>

          <div className="flex items-start gap-1.5 rounded-lg border border-amber-300/10 bg-amber-300/[0.03] p-2 text-[9px] text-amber-100/60">
            <Coins className="mt-0.5 size-3 shrink-0 text-amber-300" />Sending units permanently increases your income.
          </div>
        </CardContent>
      </Card>

      {/* Center: battlefield */}
      <Card className="border-white/[0.07] bg-[#0b1120]">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-slate-600">BATTLEFIELD</span>
            <CardTitle className="text-sm text-white">{player.name}</CardTitle>
          </div>

        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          <GridLane player={player} selectedTowerType={selectedTowerType} selectedMageElement={selectedMageElement} onCellClick={(x, y) => onBuild(selectedTowerType, x, y, selectedTowerType === "splash" ? selectedMageElement : undefined)} onTowerClick={(id) => setSelectedTowerId(id === selectedTowerId ? null : id)} selectedTowerId={selectedTowerId} />
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
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-0.5 rounded border border-emerald-300/15 bg-emerald-300/[0.05] px-1 py-px font-mono text-[8px] text-emerald-300/80" title="Income per tick"><TrendingUp className="size-2" />+{incomeOf(seat)}</span>
                  <span className="font-mono text-slate-600">{seat.health}%</span>
                </span>
              </div>
              <div className="hidden sm:block"><GridLane player={seat} compact /></div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.01] px-2.5 py-2 sm:hidden">
                <span className="font-mono text-[9px] text-slate-500">{unitsOf(seat).length} units · {towersOf(seat).length} walls</span>
                <span className="font-mono text-[9px] text-emerald-300/80">+{incomeOf(seat)}/tick</span>
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
    {selectedTower && <TowerUpgradeModal tower={selectedTower} player={player} onUpgrade={(branch) => { onUpgrade(selectedTower.id, branch); setSelectedTowerId(null); }} onRemove={() => { onRemove(selectedTower.id); setSelectedTowerId(null); }} onClose={() => setSelectedTowerId(null)} isBusy={isBusy} />}
  </div>;
}

export default function Dashboard() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
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
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.05),transparent_30%),linear-gradient(180deg,#080b14_0%,#0a0f1e_60%,#080b14_100%)]" />
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 pb-6 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-cyan-200" />
          <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-cyan-100">LAN TOWER WARS</span>
        </div>
        <div className="flex items-center gap-2">
          {name && <span className="text-[10px] text-slate-500">{name}</span>}
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
          <Card className="mx-auto max-w-md border-rose-300/15 bg-rose-300/[0.04] text-center">
            <CardContent className="space-y-4 pt-6">
              <Swords className="mx-auto size-8 text-rose-200" />
              <h2 className="text-lg font-semibold text-white">Game Over</h2>
              <p className="text-xs text-slate-500">Wave {room?.wave} — a lane reached zero integrity.</p>
              <Button type="button" size="sm" onClick={handleLeave} className="bg-cyan-300 text-xs text-slate-950 hover:bg-cyan-200">New match</Button>
            </CardContent>
          </Card>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-white/[0.03] pt-3 text-[8px] uppercase tracking-[0.15em] text-slate-700">
        <span>V1 · 2–4P</span>
        <span>maze-first defense</span>
      </footer>
    </div>
  </main>;
}

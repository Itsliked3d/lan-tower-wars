import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Clipboard,
  Crosshair,
  Crown,
  DoorOpen,
  HeartPulse,
  LogOut,
  Minus,
  Radio,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Swords,
  Users,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type Game = Doc<"games">;
type Player = Game["players"][number];

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error: /, "") : "Something went wrong.";
}

function StatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <motion.div animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} className={`h-full rounded-full ${color}`} />
    </div>
  );
}

function PlayerSeat({ player, index, isCurrent, isHost, total }: { player: Player; index: number; isCurrent: boolean; isHost: boolean; total: number }) {
  const target = total > 1 ? `${player.name} → ${index === total - 1 ? "seat 1" : `seat ${index + 2}`}` : "Waiting for a neighbor";
  return (
    <motion.div layout className={`relative overflow-hidden rounded-2xl border p-4 transition ${isCurrent ? "border-cyan-300/50 bg-cyan-300/[0.09] shadow-[0_0_24px_rgba(34,211,238,0.08)]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: player.color }} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl text-sm font-semibold" style={{ color: player.color, backgroundColor: `${player.color}18` }}>{index + 1}</div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">{player.name}{isCurrent && <span className="rounded-full bg-cyan-300/15 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-cyan-200">YOU</span>}{isHost && <Crown className="size-3.5 text-amber-300" />}</div>
            <p className="mt-0.5 text-[10px] text-slate-500">{target}</p>
          </div>
        </div>
        <span className="font-mono text-xs text-slate-500">P{index + 1}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/15 py-2"><p className="font-mono text-base text-white">{player.units}</p><p className="text-[9px] uppercase tracking-wide text-slate-600">ready</p></div>
        <div className={`rounded-lg py-2 ${player.incoming > 0 ? "bg-rose-300/10" : "bg-black/15"}`}><p className={`font-mono text-base ${player.incoming > 0 ? "text-rose-200" : "text-white"}`}>{player.incoming}</p><p className="text-[9px] uppercase tracking-wide text-slate-600">incoming</p></div>
        <div className="rounded-lg bg-black/15 py-2"><p className="font-mono text-base text-white">{player.shield}</p><p className="text-[9px] uppercase tracking-wide text-slate-600">shield</p></div>
      </div>
    </motion.div>
  );
}

function SetupScreen({ name, setName, roomInput, setRoomInput, maxPlayers, setMaxPlayers, onCreate, onJoin, isBusy, error }: { name: string; setName: (value: string) => void; roomInput: string; setRoomInput: (value: string) => void; maxPlayers: number; setMaxPlayers: (value: number) => void; onCreate: () => void; onJoin: () => void; isBusy: boolean; error: string | null }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <Card className="overflow-hidden border-white/10 bg-[#0f1729] shadow-2xl shadow-black/20">
        <CardHeader className="border-b border-white/10 pb-6">
          <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Radio className="size-5" /></div><div><CardTitle className="text-xl text-white">Open a new match</CardTitle><p className="mt-1 text-sm text-slate-500">Create the room, then share the code with your opponents.</p></div></div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <label className="block"><span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Your callsign</span><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="e.g. Mica" className="h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-slate-700" /></label>
          <div><span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Crew size</span><div className="grid grid-cols-3 gap-2">{[2, 3, 4].map((count) => <button type="button" key={count} onClick={() => setMaxPlayers(count)} className={`rounded-xl border py-3 text-sm transition ${maxPlayers === count ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:text-slate-300"}`}><span className="font-mono text-lg">{count}</span><span className="ml-1 text-xs">players</span></button>)}</div></div>
          <Button type="button" onClick={onCreate} disabled={isBusy || !name.trim()} className="h-12 w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">{isBusy ? "Opening room…" : "Open room"}<ArrowRight className="size-4" /></Button>
        </CardContent>
      </Card>
      <Card className="border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20">
        <CardHeader><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-violet-300/10 text-violet-200"><Users className="size-5" /></div><div><CardTitle className="text-xl text-white">Join a match</CardTitle><p className="mt-1 text-sm text-slate-500">Already have a room code? Enter the fight.</p></div></div></CardHeader>
        <CardContent className="space-y-6">
          <label className="block"><span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Your callsign</span><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="e.g. Sol" className="h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-slate-700" /></label>
          <label className="block"><span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Room code</span><Input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} onKeyDown={(event) => event.key === "Enter" && onJoin()} placeholder="A7K3P" className="h-12 border-white/10 bg-white/[0.04] font-mono text-lg tracking-[0.3em] text-white placeholder:text-slate-700" /></label>
          <Button type="button" variant="outline" onClick={onJoin} disabled={isBusy || !name.trim() || roomInput.length < 5} className="h-12 w-full border-white/10 bg-white/[0.04] font-semibold text-white hover:bg-white/10">{isBusy ? "Joining room…" : "Join room"}<DoorOpen className="size-4" /></Button>
          {error && <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
        </CardContent>
      </Card>
      <div className="rounded-2xl border border-white/10 bg-[#0c1324]/70 p-5 lg:col-span-2"><div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><Swords className="size-4 text-rose-300" /> Send to your neighbor</span><span className="inline-flex items-center gap-2"><Shield className="size-4 text-cyan-300" /> Defend your tower</span><span className="inline-flex items-center gap-2"><RotateCcw className="size-4 text-amber-300" /> Resolve each wave</span><span className="ml-auto font-mono text-[10px] tracking-[0.2em] text-slate-700">NO EXTRA MODES · VERSION 1</span></div></div>
    </div>
  );
}

function Lobby({ room, currentUserId, onStart, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onStart: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const isHost = String(room.players[0]?.userId) === currentUserId;
  return (
    <Card className="mx-auto w-full max-w-4xl border-white/10 bg-[#0f1729] shadow-2xl shadow-black/20">
      <CardHeader className="border-b border-white/10 pb-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-300" /> MATCH OPEN</div><CardTitle className="mt-3 text-3xl text-white">Invite your opponents</CardTitle><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Everyone joins the same arena. The host starts once the players are ready.</p></div><div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] px-5 py-4 text-center"><p className="text-[10px] uppercase tracking-[0.25em] text-cyan-200/70">room code</p><p className="mt-1 font-mono text-3xl font-semibold tracking-[0.25em] text-cyan-100">{room.roomCode}</p></div></div></CardHeader>
      <CardContent className="space-y-7 pt-7"><div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: room.maxPlayers }).map((_, index) => { const player = room.players[index]; return player ? <PlayerSeat key={String(player.userId)} player={player} index={index} isCurrent={String(player.userId) === currentUserId} isHost={index === 0} total={room.maxPlayers} /> : <div key={index} className="flex min-h-[135px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] text-center"><div><div className="mx-auto flex size-9 items-center justify-center rounded-xl border border-white/10 text-slate-600"><Users className="size-4" /></div><p className="mt-3 text-xs text-slate-600">Seat {index + 1} is open</p></div></div>; })}</div><div className="flex flex-col items-stretch gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500"><span className="font-mono text-slate-300">{room.players.length}/{room.maxPlayers}</span> players connected{!isHost && " · waiting for host"}</p><div className="flex gap-2"><Button type="button" variant="ghost" onClick={onLeave} className="text-slate-500 hover:bg-white/5 hover:text-white">Leave</Button>{isHost && <Button type="button" onClick={onStart} disabled={isBusy || room.players.length < 2} className="bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200">Start match <ArrowRight className="size-4" /></Button>}</div></div>{error && <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</p>}</CardContent>
    </Card>
  );
}

function GameBoard({ room, currentUserId, onSend, onDefend, onResolve, onCopy, onLeave, isBusy, error }: { room: Game; currentUserId?: string; onSend: (amount: number) => void; onDefend: (amount: number) => void; onResolve: () => void; onCopy: () => void; onLeave: () => void; isBusy: boolean; error: string | null }) {
  const currentIndex = room.players.findIndex((player) => String(player.userId) === currentUserId);
  const player = room.players[currentIndex];
  const nextPlayer = room.players[(currentIndex + 1) % room.players.length];
  const isHost = currentIndex === 0;
  const [sendAmount, setSendAmount] = useState(3);
  const [defendAmount, setDefendAmount] = useState(1);
  const canSend = Boolean(player && player.units > 0);
  const canDefend = Boolean(player && player.incoming > 0 && player.shield > 0);
  const healthTotal = room.players.reduce((sum, item) => sum + item.health, 0);

  if (!player) return null;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0f1729]/90 px-5 py-4 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="flex size-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Crosshair className="size-5" /></div><div><div className="flex items-center gap-2"><h1 className="font-mono text-sm font-semibold tracking-[0.18em] text-white">LAN TOWER WARS</h1><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-200">LIVE</span></div><p className="mt-1 text-xs text-slate-500">Wave {room.wave} · {room.players.length} stations · keep every tower up</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs tracking-[0.15em] text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100">{room.roomCode}<Clipboard className="size-3.5" /></button><Button type="button" variant="ghost" size="icon" onClick={onLeave} className="text-slate-500 hover:bg-rose-300/10 hover:text-rose-200" title="Leave room"><LogOut className="size-4" /></Button></div></div>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.38fr_0.82fr]">
        <Card className="border-cyan-300/25 bg-cyan-300/[0.055] shadow-[0_0_35px_rgba(34,211,238,0.05)]"><CardHeader><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Zap className="size-4 text-cyan-200" /> Your station</div><span className="rounded-full bg-cyan-300/10 px-2 py-1 font-mono text-[10px] text-cyan-200">P{currentIndex + 1}</span></div></CardHeader><CardContent className="space-y-6"><div><div className="mb-2 flex items-end justify-between"><span className="text-xs uppercase tracking-[0.15em] text-slate-500">Gate integrity</span><span className="font-mono text-lg text-white">{player.health}<span className="text-xs text-slate-600"> / 100</span></span></div><StatBar value={player.health} color="bg-cyan-300" /></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-600">Ready units</p><p className="mt-2 font-mono text-2xl text-white">{player.units}</p></div><div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-600">Shield charge</p><p className="mt-2 font-mono text-2xl text-cyan-100">{player.shield}<span className="text-xs text-slate-600"> / 5</span></p></div></div><div className="border-t border-white/10 pt-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Send to {nextPlayer?.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">Pass units clockwise before the wave resolves.</p></div><Send className="size-4 text-slate-600" /></div><div className="mt-4 flex gap-2">{[1, 3, 5].map((amount) => <button type="button" key={amount} onClick={() => setSendAmount(amount)} className={`flex-1 rounded-lg border py-2 font-mono text-sm transition ${sendAmount === amount ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-white"}`}>{amount}</button>)}</div><Button type="button" onClick={() => onSend(sendAmount)} disabled={isBusy || !canSend || sendAmount > player.units} className="mt-3 h-11 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Send className="size-4" /> Send {sendAmount} units</Button></div></CardContent></Card>

        <Card className="border-white/10 bg-[#0f1729] shadow-xl shadow-black/20"><CardHeader className="border-b border-white/10 pb-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] tracking-[0.2em] text-slate-600">THE TOWER GRID</p><CardTitle className="mt-2 text-xl text-white">Assault map</CardTitle></div><div className="flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200"><Activity className="size-3.5" /> {healthTotal} integrity</div></div></CardHeader><CardContent className="space-y-3 pt-5">{room.players.map((seat, index) => <div key={String(seat.userId)}><PlayerSeat player={seat} index={index} isCurrent={index === currentIndex} isHost={index === 0} total={room.players.length} />{index < room.players.length - 1 && <div className="flex h-6 items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-700"><ArrowDownToLine className="size-3.5" /> next tower receives the assault</div>}</div>)}<div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-center text-xs leading-5 text-slate-600">Your assault always lands on the tower immediately below you. Attack the player who is attacking you.</div></CardContent></Card>

        <Card className={`border-rose-300/25 shadow-[0_0_35px_rgba(251,113,133,0.05)] ${player.incoming > 0 ? "bg-rose-300/[0.08]" : "bg-white/[0.03]"}`}><CardHeader><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Shield className="size-4 text-rose-200" /> At your tower</div><span className={`rounded-full px-2 py-1 font-mono text-[10px] ${player.incoming > 0 ? "bg-rose-300/15 text-rose-200" : "bg-white/5 text-slate-600"}`}>{player.incoming} INCOMING</span></div></CardHeader><CardContent className="space-y-6"><div className="rounded-2xl border border-rose-300/15 bg-black/15 p-5 text-center"><p className="font-mono text-5xl text-rose-100">{String(player.incoming).padStart(2, "0")}</p><p className="mt-2 text-xs text-slate-500">unresolved units</p></div><div><p className="text-sm font-semibold text-white">Defend the tower</p><p className="mt-1 text-xs leading-5 text-slate-500">Spend shield charge to intercept before the wave resolves.</p><div className="mt-4 flex gap-2">{[1, 3, 5].map((amount) => <button type="button" key={amount} onClick={() => setDefendAmount(amount)} className={`flex-1 rounded-lg border py-2 font-mono text-sm transition ${defendAmount === amount ? "border-rose-300/40 bg-rose-300/15 text-rose-100" : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-white"}`}>{amount}</button>)}</div><Button type="button" onClick={() => onDefend(defendAmount)} disabled={isBusy || !canDefend || defendAmount > player.incoming || defendAmount > player.shield} className="mt-3 h-11 w-full bg-rose-300 text-slate-950 hover:bg-rose-200"><Shield className="size-4" /> Intercept {defendAmount}</Button></div><div className="border-t border-white/10 pt-4"><div className="flex items-center gap-2 text-xs text-slate-500"><HeartPulse className="size-3.5 text-rose-300" /> Unresolved units deal 7 damage each.</div></div></CardContent></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_auto]"><div className="rounded-2xl border border-white/10 bg-[#0f1729]/80 px-5 py-4"><div className="flex items-start gap-3"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-400"><Radio className="size-4" /></div><div><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-600">match log</p><p className="mt-1 text-sm text-slate-300">{room.lastAction}</p></div></div></div><div className="flex flex-col gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><RotateCcw className="size-4" /></div><div><p className="text-sm font-semibold text-white">Resolve wave {room.wave}</p><p className="mt-0.5 text-[11px] text-slate-500">Host only · +4 units after</p></div></div>{isHost && <Button type="button" onClick={onResolve} disabled={isBusy} className="h-10 bg-amber-300 text-slate-950 hover:bg-amber-200">Resolve <ArrowRight className="size-4" /></Button>}</div></div>
      {error && <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] uppercase tracking-[0.18em] text-slate-700"><span>Send units · defend incoming · resolve wave</span><span className="inline-flex items-center gap-1.5"><Minus className="size-3" /> No extra modes in V1</span></div>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [name, setName] = useState(() => user?.name ?? "");
  const [roomInput, setRoomInput] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const room = useQuery(api.game.getRoom, roomCode ? { roomCode } : "skip");
  const createRoom = useMutation(api.game.createRoom);
  const joinRoom = useMutation(api.game.joinRoom);
  const leaveRoom = useMutation(api.game.leaveRoom);
  const startGame = useMutation(api.game.startGame);
  const sendUnits = useMutation(api.game.sendUnits);
  const defendIncoming = useMutation(api.game.defendIncoming);
  const resolveWave = useMutation(api.game.resolveWave);


  const currentUserId = user?._id ? String(user._id) : undefined;
  const isLoadingRoom = Boolean(roomCode && room === undefined);
  const showSetup = !roomCode || room === null;
  const roomStatus = useMemo(() => room?.status ?? "lobby", [room?.status]);

  const run = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      const message = friendlyError(actionError);
      setError(message);
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreate = () => run(async () => {
    const createdCode = await createRoom({ name: name.trim(), maxPlayers });
    setRoomCode(createdCode);
    toast.success(`Room ${createdCode} is ready.`);
  });

  const handleJoin = () => run(async () => {
    const joinedCode = await joinRoom({ roomCode: roomInput, name: name.trim() });
    setRoomCode(joinedCode);
    toast.success("You joined the match.");
  });

  const handleLeave = () => run(async () => {
    if (roomCode) await leaveRoom({ roomCode });
    setRoomCode(null);
    setRoomInput("");
  });

  const handleCopy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      toast.success("Room code copied.");
    } catch {
      toast.info(`Share code: ${room.roomCode}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,#080b14_0%,#0b1120_60%,#080b14_100%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-5 pb-8 sm:px-8">
        <header className="flex items-center justify-between py-5"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><Crosshair className="size-4" /></div><div><p className="font-mono text-xs font-semibold tracking-[0.25em] text-cyan-100">LAN TOWER WARS</p><p className="text-[10px] text-slate-600">local match control</p></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-xs text-slate-600 sm:flex"><span className="size-1.5 rounded-full bg-emerald-300" /> {user?.name ?? "Guest"}</div><Button type="button" variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-500 hover:bg-white/5 hover:text-white"><LogOut className="size-4" /> Sign out</Button></div></header>
        <div className="flex flex-1 flex-col justify-center py-8 sm:py-12">
          {isLoadingRoom ? <div className="flex items-center justify-center gap-3 text-sm text-slate-500"><Sparkles className="size-4 animate-pulse text-cyan-200" /> Syncing room…</div> : showSetup ? <><div className="mx-auto mb-10 max-w-2xl text-center"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-cyan-200"><Gamepad2Icon /> V1 · PASS-ALONG TOWER WAR</div><h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Bring your friends into the arena.</h1><p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-500">Create or join a compact LAN match. Each player sends units to the next tower and defends the units arriving at their own tower.</p></div><SetupScreen name={name} setName={setName} roomInput={roomInput} setRoomInput={setRoomInput} maxPlayers={maxPlayers} setMaxPlayers={setMaxPlayers} onCreate={handleCreate} onJoin={handleJoin} isBusy={isBusy} error={error} /></> : roomStatus === "lobby" ? <Lobby room={room!} currentUserId={currentUserId} onStart={() => run(() => startGame({ roomCode: roomCode! }))} onLeave={handleLeave} isBusy={isBusy} error={error} /> : roomStatus === "playing" ? <GameBoard room={room!} currentUserId={currentUserId} onSend={(amount) => run(() => sendUnits({ roomCode: roomCode!, amount }))} onDefend={(amount) => run(() => defendIncoming({ roomCode: roomCode!, amount }))} onResolve={() => run(() => resolveWave({ roomCode: roomCode! }))} onCopy={handleCopy} onLeave={handleLeave} isBusy={isBusy} error={error} /> : <Card className="mx-auto max-w-xl border-rose-300/20 bg-rose-300/[0.06] text-center"><CardContent className="space-y-5 pt-8"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-300/10 text-rose-200"><Swords className="size-7" /></div><h2 className="text-2xl font-semibold text-white">The match is over.</h2><p className="text-sm leading-6 text-slate-500">A tower fell during wave {room?.wave}. Start a fresh room and run it back.</p><Button type="button" onClick={handleLeave} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">Back to matches</Button></CardContent></Card>}
        </div>
        <footer className="flex items-center justify-between border-t border-white/5 pt-5 text-[10px] uppercase tracking-[0.18em] text-slate-700"><span>V1 · 2–4 PLAYERS</span><span>Reactive LAN match</span></footer>
      </div>
    </main>
  );
}

function Gamepad2Icon() {
  return <Zap className="size-3.5" />;
}

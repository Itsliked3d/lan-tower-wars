import { motion } from "framer-motion";
import {
  ArrowRight,
  Crosshair,
  Gamepad2,
  Radio,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";

const steps = [
  {
    number: "01",
    icon: Radio,
    title: "Host the match",
    text: "One player starts a room and shares the five-character code. Everyone connects on the same LAN.",
  },
  {
    number: "02",
    icon: Zap,
    title: "Build the maze",
    text: "Place four tower types on a 14×8 grid. Shape a route the enemy must follow — but never seal it shut. Upgrade each tower down a power or control branch.",
  },
  {
    number: "03",
    icon: Shield,
    title: "Pass the audit",
    text: "Every ten seconds, the red Abuse Control probe checks your route. Send units from budget grunts to endgame titans. Flying units ignore walls. Survive.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const goToDashboard = () => navigate("/dashboard");

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b14] text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_90%_22%,rgba(167,139,250,0.08),transparent_26%),linear-gradient(180deg,#080b14_0%,#0b1120_52%,#080b14_100%)]" />
      <div className="relative mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <Crosshair className="size-5 text-cyan-200" />
            </div>
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.3em] text-cyan-200/80">LAN TOWER WARS</p>
              <p className="text-[10px] text-slate-500">maze defense · up to 8 players · no login</p>
            </div>
          </div>
          <button type="button" onClick={goToDashboard} className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-300 transition hover:border-cyan-300/35 hover:bg-cyan-300/8 hover:text-cyan-100 sm:flex">
            Play now <ArrowRight className="size-3.5" />
          </button>
        </header>

        <section className="grid items-center gap-14 pb-16 pt-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-20 lg:pb-24 lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 font-mono text-[10px] tracking-wide text-amber-200">
              <Sparkles className="size-3" />
              V2 · EXPANDED ROSTER · PRACTICE MODE
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white sm:text-7xl">
              Send the units.
              <span className="block text-cyan-200">Hold your tower.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              A competitive LAN tower defense game. Build a physical maze, deploy units across three tiers — from budget grunts to 50K gold doomsday behemoths — and survive the Abuse Control audit every ten seconds.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={goToDashboard} className="group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-cyan-300 px-6 font-semibold text-slate-950 shadow-[0_10px_35px_rgba(34,211,238,0.15)] transition hover:-translate-y-0.5 hover:bg-cyan-200">
                Start a match <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button type="button" onClick={goToDashboard} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-5 text-sm text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100">
                <Gamepad2 className="size-4" /> Practice solo
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-cyan-300/[0.05] blur-3xl" />
            <div className="relative rounded-[1.65rem] border border-white/[0.07] bg-[#0e1628]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-slate-400">
                  <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" /> LIVE MATCH
                </div>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-slate-500">WAVE 04</span>
              </div>
              <div className="relative my-6 grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  ["YOU", "12", "cyan"],
                  ["MICA", "06", "rose"],
                  ["JULES", "08", "amber"],
                  ["SOL", "03", "violet"],
                ].map(([playerName, units, color]) => (
                  <div key={playerName} className={`relative overflow-hidden rounded-2xl border p-4 ${playerName === "YOU" ? "border-cyan-300/30 bg-cyan-300/[0.06]" : "border-white/[0.06] bg-white/[0.025]"}`}>
                    <div className={`absolute left-0 top-0 h-1 w-full ${color === "cyan" ? "bg-cyan-300" : color === "rose" ? "bg-rose-300" : color === "amber" ? "bg-amber-300" : "bg-violet-300"}`} />
                    <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.15em] text-slate-400">
                      <span>{playerName}</span>
                      <span className={playerName === "YOU" ? "text-cyan-200" : "text-slate-500"}>{playerName === "YOU" ? "YOUR TOWER" : `P${playerName === "MICA" ? 2 : playerName === "JULES" ? 3 : 4}`}</span>
                    </div>
                    <p className="mt-5 font-mono text-3xl text-white">{units}<span className="ml-1 text-sm text-slate-500">u</span></p>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/6"><div className={`h-full rounded-full ${playerName === "YOU" ? "w-[84%] bg-cyan-300" : playerName === "MICA" ? "w-[62%] bg-rose-300" : playerName === "JULES" ? "w-[74%] bg-amber-300" : "w-[42%] bg-violet-300"}`} /></div>
                  </div>
                ))}
                <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cyan-200/15 bg-[#0e1628] p-3 text-cyan-200/40 sm:block">
                  <Gamepad2 className="size-4" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-rose-300/12 bg-rose-300/[0.04] px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-rose-100"><Shield className="size-3.5" /> Incoming at your tower</div>
                <span className="font-mono text-base text-rose-200">03</span>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-t border-white/[0.05] pt-10 sm:pt-14">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-200/60">HOW IT WORKS</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Three steps to chaos.</h2>
            </div>
            <p className="max-w-sm text-xs leading-6 text-slate-500">Fourteen unit types across three tiers. Four tower profiles with two upgrade branches. Flying units, resistances, and the ever-present audit.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <div key={number} className="group rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-cyan-300/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/8 text-cyan-200"><Icon className="size-4" /></div>
                  <span className="font-mono text-[10px] text-slate-600">{number}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-3 border-t border-white/[0.05] pt-4 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>LAN TOWER WARS / V2</span>
          <span>Built for LAN nights. No login required.</span>
        </footer>
      </div>
    </main>
  );
}

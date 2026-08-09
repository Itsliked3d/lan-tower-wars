import { motion } from "framer-motion";
import {
  ArrowRight,
  Crosshair,
  Gamepad2,
  Radio,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";

const steps = [
  {
    number: "01",
    icon: Radio,
    title: "Host the match",
    text: "One player starts a match and shares the five-character code with friends on the LAN.",
  },
  {
    number: "02",
    icon: Zap,
    title: "Send the assault",
    text: "Send 1–5 units to the player next to you. Every player has a tower to defend.",
  },
  {
    number: "03",
    icon: Shield,
    title: "Defend your tower",
    text: "Intercept incoming units, then resolve the wave before the assault overwhelms a tower.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b14] text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_90%_22%,rgba(167,139,250,0.12),transparent_26%),linear-gradient(180deg,#080b14_0%,#0b1120_52%,#080b14_100%)]" />
      <div className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.16)]">
              <Crosshair className="size-5 text-cyan-200" />
            </div>
            <div>
              <p className="font-mono text-xs font-semibold tracking-[0.3em] text-cyan-200/80">
                LAN TOWER WARS
              </p>
              <p className="text-[11px] text-slate-500">a compact LAN strategy game for friends</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth")}
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100 sm:flex"
          >
            {isAuthenticated ? "Open game" : "Sign in"}
            <ArrowRight className="size-4" />
          </button>
        </header>

        <section className="grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[1.04fr_0.96fr] lg:gap-20 lg:pb-28 lg:pt-20">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 font-mono text-xs tracking-wide text-amber-200">
              <Sparkles className="size-3.5" />
              V1 · 2–4 PLAYERS · COMPETITIVE
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-7xl">
              Send the units.
              <span className="block text-cyan-200">Hold your tower.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400 sm:text-xl">
              LAN Tower Wars is a fast, local multiplayer strategy game for friends on the same network. Send units to the player next to you, defend what arrives, and be the last tower standing.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth")}
                className="group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-cyan-300 px-6 font-semibold text-slate-950 shadow-[0_10px_35px_rgba(34,211,238,0.18)] transition hover:-translate-y-0.5 hover:bg-cyan-200"
              >
                Start a match
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
              <div className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm text-slate-400">
                <Users className="size-4 text-slate-500" />
                Built for your LAN
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-cyan-300/[0.07] blur-3xl" />
            <div className="relative rounded-[1.65rem] border border-white/10 bg-[#0e1628]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-slate-400">
                  <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" />
                  LIVE MATCH
                </div>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-slate-500">WAVE 04</span>
              </div>
              <div className="relative my-7 grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  ["YOU", "12", "cyan"],
                  ["MICA", "06", "rose"],
                  ["JULES", "08", "amber"],
                  ["SOL", "03", "violet"],
                ].map(([name, units, color], index) => (
                  <div key={name} className={`relative overflow-hidden rounded-2xl border p-4 ${index === 0 ? "border-cyan-300/40 bg-cyan-300/[0.09]" : "border-white/10 bg-white/[0.035]"}`}>
                    <div className={`absolute left-0 top-0 h-1 w-full ${color === "cyan" ? "bg-cyan-300" : color === "rose" ? "bg-rose-300" : color === "amber" ? "bg-amber-300" : "bg-violet-300"}`} />
                    <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.18em] text-slate-400">
                      <span>{name}</span>
                      <span className={index === 0 ? "text-cyan-200" : "text-slate-500"}>{index === 0 ? "YOUR TOWER" : `P${index + 1}`}</span>
                    </div>
                    <p className="mt-6 font-mono text-3xl text-white">{units}<span className="ml-1 text-sm text-slate-500">u</span></p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${index === 0 ? "w-[84%] bg-cyan-300" : index === 1 ? "w-[62%] bg-rose-300" : index === 2 ? "w-[74%] bg-amber-300" : "w-[42%] bg-violet-300"}`} /></div>
                  </div>
                ))}
                <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cyan-200/25 bg-[#0e1628] p-3 text-cyan-200/60 sm:block">
                  <Gamepad2 className="size-5" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-rose-100"><Shield className="size-4" /> Incoming at your tower</div>
                <span className="font-mono text-lg text-rose-200">03</span>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-t border-white/10 pt-12 sm:pt-16">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-xs tracking-[0.25em] text-cyan-200/70">THE WHOLE LOOP</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Small rules. Big coordination.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-500">No tech tree. No loadouts. Just a shared screen, a room code, and the pressure of choosing when to attack or defend.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <div key={number} className="group rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]">
                <div className="flex items-center justify-between"><div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Icon className="size-5" /></div><span className="font-mono text-xs text-slate-600">{number}</span></div>
                <h3 className="mt-7 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>LAN TOWER WARS / VERSION 1</span>
          <span>Built for LAN nights, sharp tactics, and friendly rivalries.</span>
        </footer>
      </div>
    </main>
  );
}

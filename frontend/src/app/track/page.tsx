'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket, Patient, QueueState, WaitChangeFactor } from '../../hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Clock,
  Users,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Hourglass,
  Wifi,
  WifiOff,
  ChevronRight,
  Info,
  Activity,
  HeartPulse,
  RefreshCw
} from 'lucide-react';

// ─── Traffic Light Status ────────────────────────────────────────────────────
type WaitLevel = 'low' | 'medium' | 'high';
interface StatusConfig {
  level: WaitLevel;
  label: string;
  sublabel: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  pulse: boolean;
}

function getWaitStatus(waitSeconds: number): StatusConfig {
  const minutes = Math.round(waitSeconds / 60);
  if (minutes < 15)
    return {
      level: 'low',
      label: 'Short Wait',
      sublabel: 'Please be ready',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      pulse: true
    };
  if (minutes <= 30)
    return {
      level: 'medium',
      label: 'Moderate Wait',
      sublabel: 'Stay nearby',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      dot: 'bg-amber-400',
      pulse: false
    };
  return {
    level: 'high',
    label: 'Long Wait',
    sublabel: 'Relax — we will announce',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    dot: 'bg-rose-400',
    pulse: false
  };
}

// ─── Find patient in queue state ────────────────────────────────────────────
interface TrackedInfo {
  found: boolean;
  patient: Patient | null;
  position: number; // 0-indexed in waiting list; -1 if active/served
  isActive: boolean;
  isServed: boolean;
  isMissed: boolean;
  peopleAhead: number;
  estimatedWaitTime: number;
  waitFactors: WaitChangeFactor[];
}

function findPatient(tokenInput: string, state: QueueState | null): TrackedInfo {
  const empty: TrackedInfo = {
    found: false,
    patient: null,
    position: -1,
    isActive: false,
    isServed: false,
    isMissed: false,
    peopleAhead: 0,
    estimatedWaitTime: 0,
    waitFactors: []
  };

  if (!state) return empty;

  const normalised = tokenInput.trim().toUpperCase();

  // Check active patient
  if (state.active && state.active.token.toUpperCase() === normalised) {
    return {
      found: true,
      patient: state.active,
      position: 0,
      isActive: true,
      isServed: false,
      isMissed: false,
      peopleAhead: 0,
      estimatedWaitTime: 0,
      waitFactors: state.waitFactors ?? []
    };
  }

  // Check waiting list
  const idx = state.waiting.findIndex(p => p.token.toUpperCase() === normalised);
  if (idx !== -1) {
    const patient = state.waiting[idx];
    return {
      found: true,
      patient,
      position: idx + 1,
      isActive: false,
      isServed: false,
      isMissed: false,
      peopleAhead: idx, // patients ahead in queue (not counting self)
      estimatedWaitTime: patient.estimatedWaitTime,
      waitFactors: state.waitFactors ?? []
    };
  }

  // Check served
  const served = state.served.find(p => p.token.toUpperCase() === normalised);
  if (served)
    return { found: true, patient: served, position: -1, isActive: false, isServed: true, isMissed: false, peopleAhead: 0, estimatedWaitTime: 0, waitFactors: [] };

  // Check missed/skipped
  const missed = state.missed.find(p => p.token.toUpperCase() === normalised);
  if (missed)
    return { found: true, patient: missed, position: -1, isActive: false, isServed: false, isMissed: true, peopleAhead: 0, estimatedWaitTime: 0, waitFactors: [] };

  return empty;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TrackPage() {
  const [inputToken, setInputToken] = useState('');
  const [searchedToken, setSearchedToken] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const { isConnected, queueState } = useSocket();

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;
    setSearchedToken(inputToken.trim().toUpperCase());
    setHasSearched(true);
  };

  const info = findPatient(searchedToken, queueState);
  const status = info.found && !info.isServed && !info.isMissed
    ? getWaitStatus(info.estimatedWaitTime)
    : null;

  const etaMinutes = Math.round(info.estimatedWaitTime / 60);

  return (
    <main className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col">
      {/* Medical grid overlay */}
      <div className="medical-grid" />

      {/* Top bar */}
      <header className="relative z-10 px-4 pt-5 pb-3 border-b border-slate-800/60">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <HeartPulse size={18} className="text-indigo-400" />
            </span>
            <div>
              <p className="text-xs font-extrabold text-white tracking-tight leading-tight">
                QueueCure AI
              </p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                Token Tracker
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">{timeStr}</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold">
              {isConnected ? (
                <>
                  <Wifi size={12} className="text-emerald-400" />
                  <span className="text-emerald-400">LIVE</span>
                </>
              ) : (
                <>
                  <WifiOff size={12} className="text-rose-400" />
                  <span className="text-rose-400">OFFLINE</span>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-grow flex flex-col px-4 py-6 max-w-md mx-auto w-full gap-5">

        {/* Search box */}
        <section className="glass-panel rounded-2xl border border-slate-800 p-5 space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-extrabold text-white tracking-tight">
              Track Your Token
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Enter the token number from your slip to see live queue status.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-grow">
              <input
                id="token-input"
                type="text"
                value={inputToken}
                onChange={e => setInputToken(e.target.value.toUpperCase())}
                placeholder="e.g. QC-007"
                maxLength={10}
                className="w-full bg-slate-900/60 border border-slate-700 text-white font-mono font-bold text-lg rounded-xl px-4 py-3 pr-10 placeholder:text-slate-600 placeholder:font-normal placeholder:text-base focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15 transition-all"
              />
            </div>
            <button
              type="submit"
              id="track-submit"
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl px-5 py-3 font-bold text-sm flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-600/20"
            >
              <Search size={16} />
              Track
            </button>
          </form>
        </section>

        {/* Result area */}
        <AnimatePresence mode="wait">
          {hasSearched && (
            <motion.div
              key={searchedToken}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="space-y-4"
            >
              {!info.found ? (
                /* Token not found */
                <div className="glass-panel rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 flex flex-col items-center gap-3 text-center">
                  <AlertCircle size={32} className="text-rose-400" />
                  <div>
                    <p className="font-bold text-white text-base">Token Not Found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="font-mono text-rose-300">{searchedToken}</span> was not found in the current queue. Check your token slip and try again.
                    </p>
                  </div>
                </div>
              ) : info.isServed ? (
                /* Already served */
                <div className="glass-panel rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 flex flex-col items-center gap-3 text-center">
                  <CheckCircle2 size={36} className="text-emerald-400" />
                  <div>
                    <p className="font-extrabold text-white text-lg">{info.patient?.name}</p>
                    <p className="text-sm text-emerald-400 font-bold mt-1">Consultation Complete</p>
                    <p className="text-xs text-slate-400 mt-2">
                      Token <span className="font-mono">{searchedToken}</span> has already been served. Thank you for visiting.
                    </p>
                  </div>
                </div>
              ) : info.isMissed ? (
                /* Missed/skipped */
                <div className="glass-panel rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 flex flex-col items-center gap-3 text-center">
                  <AlertCircle size={36} className="text-amber-400" />
                  <div>
                    <p className="font-extrabold text-white text-lg">{info.patient?.name}</p>
                    <p className="text-sm text-amber-400 font-bold mt-1">Token Skipped</p>
                    <p className="text-xs text-slate-400 mt-2">
                      Your token was skipped. Please inform the receptionist to be re-added to the queue.
                    </p>
                  </div>
                </div>
              ) : info.isActive ? (
                /* Currently being served */
                <div className="glass-panel rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center space-y-4">
                  <motion.div
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="inline-flex p-4 bg-indigo-500/15 rounded-full border border-indigo-500/30"
                  >
                    <Activity size={32} className="text-indigo-400" />
                  </motion.div>
                  <div>
                    <p className="text-3xl font-black font-mono text-indigo-300 tracking-wider">
                      {searchedToken}
                    </p>
                    <p className="text-lg font-extrabold text-white mt-1">{info.patient?.name}</p>
                    <p className="text-sm font-bold text-indigo-400 mt-2 uppercase tracking-wider">
                      ✓ Now Being Served
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      Please proceed to the consultation cabin immediately.
                    </p>
                  </div>
                </div>
              ) : (
                /* Waiting in queue */
                <>
                  {/* Main status card */}
                  <div
                    className={`glass-panel rounded-2xl border p-5 space-y-4 ${status?.border} ${status?.bg}`}
                  >
                    {/* Token & name */}
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-3xl font-black font-mono text-white tracking-wider">
                          {searchedToken}
                        </p>
                        <p className="text-base font-bold text-slate-200 mt-0.5">
                          {info.patient?.name}
                        </p>
                      </div>
                      {/* Status pill */}
                      <span
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-extrabold tracking-wide ${status?.text} ${status?.border} bg-black/20`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${status?.dot} ${
                            status?.pulse ? 'animate-pulse' : ''
                          }`}
                        />
                        {status?.label}
                      </span>
                    </div>

                    {/* Key metrics grid */}
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      {/* Position */}
                      <div className="bg-slate-900/40 rounded-xl p-3 text-center border border-slate-800/60">
                        <div className="flex justify-center mb-1">
                          <ChevronRight size={14} className="text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-white">{info.position}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                          Position
                        </p>
                      </div>

                      {/* People ahead */}
                      <div className="bg-slate-900/40 rounded-xl p-3 text-center border border-slate-800/60">
                        <div className="flex justify-center mb-1">
                          <Users size={14} className="text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-white">{info.peopleAhead}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                          Ahead
                        </p>
                      </div>

                      {/* ETA */}
                      <div className="bg-slate-900/40 rounded-xl p-3 text-center border border-slate-800/60">
                        <div className="flex justify-center mb-1">
                          <Clock size={14} className="text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-white">
                          {etaMinutes < 1 ? '<1' : etaMinutes}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                          Min ETA
                        </p>
                      </div>
                    </div>

                    {/* Sublabel advice */}
                    <p className="text-xs text-center font-semibold text-slate-400">
                      {status?.sublabel}
                    </p>
                  </div>

                  {/* Wait factors — why did wait time change? */}
                  {info.waitFactors && info.waitFactors.length > 0 && (
                    <div className="glass-panel rounded-2xl border border-slate-800 p-4 space-y-3">
                      <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Info size={13} className="text-indigo-400" />
                        Why did wait time change?
                      </h3>
                      <ul className="space-y-2">
                        {info.waitFactors.map((factor, i) => (
                          <li key={i} className="flex justify-between items-center text-xs">
                            <span className="text-slate-300 font-medium">{factor.label}</span>
                            <span
                              className={`font-mono font-bold ${
                                factor.minutes > 0 ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              {factor.minutes > 0 ? '+' : ''}
                              {factor.minutes} min
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Priority indicator */}
                  {info.patient && info.patient.priority !== 'normal' && (
                    <div
                      className={`glass-panel rounded-xl border p-3 flex items-center gap-2.5 ${
                        info.patient.priority === 'emergency'
                          ? 'border-rose-500/25 bg-rose-500/5'
                          : 'border-amber-500/25 bg-amber-500/5'
                      }`}
                    >
                      <AlertCircle
                        size={16}
                        className={
                          info.patient.priority === 'emergency'
                            ? 'text-rose-400 shrink-0'
                            : 'text-amber-400 shrink-0'
                        }
                      />
                      <p
                        className={`text-xs font-bold ${
                          info.patient.priority === 'emergency'
                            ? 'text-rose-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {info.patient.priority === 'emergency'
                          ? 'Emergency case — you will be prioritised.'
                          : 'Urgent case — you will be called ahead of standard queue.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Helpful note when no search yet */}
        {!hasSearched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-panel rounded-2xl border border-slate-800/50 p-5 space-y-3"
          >
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
              How it works
            </h2>
            <ul className="space-y-2.5 text-xs text-slate-400">
              {[
                'Collect your token slip from the receptionist.',
                'Enter your token number (e.g. QC-007) in the box above.',
                'See your real-time queue position and estimated wait time.',
                'You will be called verbally — listen for announcements.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-indigo-400 font-black text-sm shrink-0">{i + 1}.</span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Live update note */}
        <div className="text-center">
          <p className="text-[10px] text-slate-600 font-semibold flex items-center justify-center gap-1.5">
            <RefreshCw size={10} className="animate-spin" style={{ animationDuration: '3s' }} />
            Queue data updates automatically every second
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 px-4 py-3">
        <p className="text-center text-[10px] text-slate-600 font-semibold max-w-md mx-auto">
          QueueCure AI • OPD Queue Management • Please inform receptionist for priority updates
        </p>
      </footer>
    </main>
  );
}

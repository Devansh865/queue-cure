'use client';

import React, { useState, useEffect } from 'react';
import { useSocket, useCabinOverview, Priority, MultiCabinState, QueueState } from '../../hooks/useSocket';
import { StatsCard } from '../../components/StatsCard';
import {
  Users, CheckCircle2, UserMinus, Heart, Plus, Play, SkipForward,
  Settings, RotateCcw, Activity, AlertTriangle, UserPlus, RefreshCw,
  Clock, Bell, Sparkles, Stethoscope, ChevronDown, Hourglass, X, TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTrafficLight } from '../monitor/page';

// ─── Cabin definitions (must match CabinRegistry defaults) ───────────────────
const CABINS = [
  { cabinId: 'cabin-01', cabinLabel: 'Cabin 01', doctorName: 'Sharma' },
  { cabinId: 'cabin-02', cabinLabel: 'Cabin 02', doctorName: 'Gupta' },
  { cabinId: 'cabin-03', cabinLabel: 'Cabin 03', doctorName: 'Verma' },
] as const;
type CabinId = typeof CABINS[number]['cabinId'];

const statusDot = (status?: string) =>
  status === 'delayed' ? 'bg-rose-500' : status === 'busy' ? 'bg-amber-400' : 'bg-emerald-400';

// ─── Operational Intelligence generator ──────────────────────────────────────
function generateInsights(cabinsState: MultiCabinState | null): string[] {
  if (!cabinsState) return ['Connecting to clinic system…'];
  const cabins = Object.values(cabinsState.cabins);
  if (cabins.length === 0) return ['No cabin data available.'];
  const insights: string[] = [];

  // Delayed cabins
  for (const c of cabins) {
    if (c.isDelayed && c.delaySeconds > 0) {
      const min = Math.ceil(c.delaySeconds / 60);
      insights.push(`${c.roomInfo.roomNumber} running ${min} min behind target consultation time`);
    }
    if ((c.manualDelaySeconds ?? 0) > 0) {
      const min = Math.round((c.manualDelaySeconds ?? 0) / 60);
      insights.push(`Dr. ${c.roomInfo.doctorName} manual delay active: +${min} min offset on all ETAs`);
    }
  }

  // Waiting counts (only non-zero)
  for (const c of cabins) {
    if (c.waiting.length > 0) {
      insights.push(`${c.waiting.length} patient${c.waiting.length !== 1 ? 's' : ''} waiting in ${c.roomInfo.roomNumber}`);
    }
  }

  // Global missed count
  const totalMissed = cabins.reduce((s, c) => s + c.stats.totalMissed, 0);
  if (totalMissed === 0 && cabins.some(c => c.stats.totalServed > 0)) {
    insights.push('No missed patients today — excellent patient attendance');
  } else if (totalMissed > 0) {
    insights.push(`${totalMissed} missed slot${totalMissed > 1 ? 's' : ''} across all cabins today`);
  }

  // Average wait time across active cabins
  const activeCabins = cabins.filter(c => c.stats.totalServed > 0);
  if (activeCabins.length > 0) {
    const avgWait = Math.round(activeCabins.reduce((s, c) => s + c.stats.averageWaitTime, 0) / activeCabins.length / 60);
    insights.push(`Average wait time across clinic: ${avgWait} min`);
  }

  // On-time cabins
  const onTime = cabins.filter(c => !c.isDelayed && (c.manualDelaySeconds ?? 0) === 0 && c.stats.totalServed > 0);
  if (onTime.length > 0 && onTime.length === cabins.filter(c => c.stats.totalServed > 0).length) {
    insights.push('All active cabins operating within target consultation time');
  }

  // Total served today
  const totalServed = cabins.reduce((s, c) => s + c.stats.totalServed, 0);
  if (totalServed > 0) {
    insights.push(`${totalServed} patients served across all cabins today`);
  }

  if (insights.length === 0) insights.push('All cabins idle. No active consultations.');
  return insights.slice(0, 6);
}

const getFriendlyPriority = (p: Priority) => {
  if (p === 'emergency') return { label: 'Immediate Attention', color: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' };
  if (p === 'urgent')    return { label: 'Priority Care',       color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
  return { label: 'Standard Priority', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
};

export default function ReceptionistDashboard() {
  const [activeCabinId, setActiveCabinId] = useState<CabinId>('cabin-01');

  const {
    isConnected, queueState, addPatient, callNext, skipPatient, recallPatient,
    addDelay, clearDelay, updateConfig, resetQueue,
  } = useSocket(activeCabinId);

  // Cross-cabin operational intelligence
  const { cabinsState } = useCabinOverview();
  const insights = generateInsights(cabinsState);

  // Form state
  const [name, setName] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [formCabinId, setFormCabinId] = useState<CabinId>('cabin-01');
  const [formError, setFormError] = useState('');
  const [showCabinDropdown, setShowCabinDropdown] = useState(false);

  // Action state
  const [isCalling, setIsCalling] = useState(false);
  const handleCallNext = () => {
    if (isCalling) return;
    setIsCalling(true);
    callNext();
    setTimeout(() => setIsCalling(false), 2000);
  };

  // Settings
  const [avgTime, setAvgTime] = useState(5);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => { if (queueState) setAvgTime(queueState.averageConsultationTime); }, [queueState]);
  useEffect(() => {
    const t = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFormError('Patient Name is required'); return; }
    setFormError('');
    if (formCabinId !== activeCabinId) {
      setActiveCabinId(formCabinId);
      setTimeout(() => { addPatient(name.trim(), symptoms.trim(), priority); }, 200);
    } else {
      addPatient(name.trim(), symptoms.trim(), priority);
    }
    setName(''); setSymptoms(''); setPriority('normal');
  };

  const formatDuration = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const activePatient = queueState?.active ?? null;
  const waitingList   = queueState?.waiting || [];
  const missedList    = queueState?.missed || [];
  const stats         = queueState?.stats;
  const roomInfo      = queueState?.roomInfo;
  const notifications = queueState?.notifications || [];
  const manualDelay   = queueState?.manualDelaySeconds ?? 0;

  const activeCabinMeta = CABINS.find(c => c.cabinId === activeCabinId)!;
  const formCabinMeta   = CABINS.find(c => c.cabinId === formCabinId)!;

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0a0e17] text-slate-100 p-4 md:p-8">
      <div className="medical-grid" />
      <div className="relative z-10 max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/60 pb-6">
          <div className="flex items-center space-x-3">
            <span className="flex items-center justify-center rounded-2xl drop-shadow-md">
              <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                PulseQueue
              </h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Clinical Operations Console</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="glass-panel px-4 py-2 rounded-xl text-sm font-mono text-slate-400 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />{timeStr || '--:--:--'}
            </div>
            <div className="glass-panel px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isConnected ? 'LIVE SYNCED' : 'OFFLINE'}
            </div>
          </div>
        </header>

        {/* CABIN SWITCHER */}
        <div className="glass-panel rounded-2xl border border-slate-800/80 p-1.5 flex gap-1.5 overflow-x-auto">
          {CABINS.map((cabin) => {
            const isActive = cabin.cabinId === activeCabinId;
            const status = isActive ? (roomInfo?.status ?? 'available') : 'available';
            return (
              <button key={cabin.cabinId} onClick={() => setActiveCabinId(cabin.cabinId)}
                className={`flex-1 min-w-[140px] flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  isActive ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/30'
                }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? statusDot(status) : 'bg-slate-600'} ${isActive && status === 'busy' ? 'animate-pulse' : ''}`} />
                <span className="truncate">{cabin.cabinLabel}</span>
                <span className="text-[9px] text-slate-500 shrink-0">Dr. {cabin.doctorName}</span>
                {isActive && waitingList.length > 0 && (
                  <span className="ml-auto bg-indigo-500/20 text-indigo-400 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-indigo-500/30">
                    {waitingList.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* STATS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Active Waiting" value={stats?.totalWaiting ?? 0} subtext={`${stats?.currentLoad?.toUpperCase() ?? 'LOW'} QUEUE LOAD`} icon={<Users size={18} />} variant={stats?.currentLoad === 'high' ? 'rose' : stats?.currentLoad === 'medium' ? 'amber' : 'primary'} />
          <StatsCard title="Patients Served" value={stats?.totalServed ?? 0} subtext="COMPLETED TODAY" icon={<CheckCircle2 size={18} />} variant="emerald" />
          <StatsCard title="Missed Patients" value={stats?.totalMissed ?? 0} subtext="SKIPPED SESSIONS" icon={<UserMinus size={18} />} variant={(stats?.totalMissed ?? 0) > 0 ? 'amber' : 'primary'} />
          <StatsCard title="Efficiency Score" value={stats ? `${stats.efficiencyScore}%` : '100%'} subtext={`HEALTH: ${stats?.queueHealth?.toUpperCase() ?? 'OPTIMAL'}`} icon={<Heart size={18} />} variant={stats?.queueHealth === 'critical' ? 'rose' : stats?.queueHealth === 'warning' ? 'amber' : 'emerald'} />
        </div>

        {/* TWO-COLUMN COMMAND CENTER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">

          {/* MAIN CONTENT AREA */}
          <div className="lg:col-span-9 space-y-6">
            
            {/* ROW 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Triage Intake Form */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg"><UserPlus size={14} /></span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Triage Intake Form</h3>
              </div>
              <form onSubmit={handleAddPatient} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Patient Name</label>
                  <input type="text" placeholder="Enter name..." value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900/40 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600" />
                  {formError && <p className="text-[10px] text-rose-400 font-medium">{formError}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Chief Complaint</label>
                  <input type="text" placeholder="Symptoms description..." value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
                    className="w-full bg-slate-900/40 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600" />
                </div>
                {/* Cabin selector */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Register To Cabin</label>
                  <div className="relative">
                    <button type="button" onClick={() => setShowCabinDropdown(v => !v)}
                      className="w-full bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between transition-colors">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        {formCabinMeta.cabinLabel} · Dr. {formCabinMeta.doctorName}
                      </span>
                      <ChevronDown size={12} className={`text-slate-500 transition-transform ${showCabinDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {showCabinDropdown && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                          {CABINS.map((cabin) => (
                            <button key={cabin.cabinId} type="button"
                              onClick={() => { setFormCabinId(cabin.cabinId); setShowCabinDropdown(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${formCabinId === cabin.cabinId ? 'text-indigo-400' : 'text-slate-300'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${formCabinId === cabin.cabinId ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                              {cabin.cabinLabel} · Dr. {cabin.doctorName}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Triage level */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Clinical Triage Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['normal', 'urgent', 'emergency'] as const).map((level) => (
                      <button key={level} type="button" onClick={() => setPriority(level)}
                        className={`py-2 rounded-xl text-[9px] font-bold uppercase border transition-all text-center leading-tight ${
                          priority === level
                            ? level === 'emergency' ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                            : level === 'urgent'    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            :                        'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900/20 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}>
                        {getFriendlyPriority(level).label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all">
                  <Plus size={12} /> Register Triage Token
                </button>
              </form>
            </section>

            {/* Active cabin status */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {activeCabinMeta.cabinLabel} · Dr. {roomInfo?.doctorName ?? activeCabinMeta.doctorName}
                </h3>
                {roomInfo && (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    roomInfo.status === 'delayed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    roomInfo.status === 'busy'    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>{roomInfo.status}</span>
                )}
              </div>

              {/* Manual delay indicator */}
              {manualDelay > 0 && (
                <div className="mb-3 flex items-center justify-between p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <div className="flex items-center gap-2 text-xs text-purple-300 font-semibold">
                    <Hourglass size={12} className="text-purple-400" />
                    Manual delay: +{Math.round(manualDelay / 60)} min active on all ETAs
                  </div>
                  <button onClick={clearDelay}
                    className="text-purple-400 hover:text-white hover:bg-purple-500/20 p-1 rounded-lg transition-all">
                    <X size={12} />
                  </button>
                </div>
              )}

              {activePatient ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Current Token</span>
                    <h4 className="text-3xl font-black font-mono tracking-wide text-white">{activePatient.token}</h4>
                    <p className="text-base font-semibold text-slate-100 mt-1">{activePatient.name}</p>
                    <p className="text-xs text-slate-500 font-medium">Complaint: {activePatient.symptoms}</p>
                  </div>
                  <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/60 space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
                      <span>ELAPSED TIMER</span>
                      <span className="font-mono text-slate-500">TARGET: {queueState?.averageConsultationTime}m</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-4xl font-mono font-bold text-white tracking-wider">
                        {formatDuration(activePatient.elapsedTime)}
                      </span>
                      {queueState?.isDelayed && (
                        <motion.span animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                          className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] font-bold text-rose-400 uppercase flex items-center gap-1">
                          <AlertTriangle size={10} /> +{Math.ceil(queueState.delaySeconds / 60)}m Overrun
                        </motion.span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button onClick={handleCallNext} disabled={isCalling} className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed border border-indigo-500/20 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all">
                      <Play size={12} /> {isCalling ? 'Calling...' : 'Call Next'}
                    </button>
                    <button onClick={skipPatient} className="px-3 py-2.5 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all">
                      <SkipForward size={12} /> Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-3.5">
                  <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
                    <Stethoscope size={22} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase">Cabin Available</h4>
                    <p className="text-2xs text-slate-500 mt-0.5">Ready for next patient</p>
                  </div>
                  <button onClick={handleCallNext} disabled={isCalling || waitingList.length === 0}
                    className="px-5 py-2 bg-emerald-600 disabled:bg-slate-900/40 disabled:text-slate-600 hover:bg-emerald-500 border border-emerald-500/20 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5 transition-all">
                    <Play size={12} /> {isCalling ? 'Calling...' : 'Call Patient'}
                  </button>
                </div>
              )}

              {/* ── Doctor Delay Control ── */}
              <div className="mt-5 pt-4 border-t border-slate-800/40 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <Hourglass size={11} className="text-slate-500" />
                  Doctor Delay — inject ETA offset
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[5, 10, 15].map((min) => (
                    <button key={min} onClick={() => addDelay(min)}
                      className="py-2 bg-slate-900/40 hover:bg-purple-600/20 hover:border-purple-500/50 hover:text-purple-400 border border-slate-800 text-slate-400 font-bold text-[10px] rounded-xl transition-all flex items-center justify-center gap-1">
                      <Clock size={10} />+{min} min
                    </button>
                  ))}
                </div>
                {manualDelay > 0 && (
                  <button onClick={clearDelay} className="w-full py-1.5 text-[10px] font-bold text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-all flex items-center justify-center gap-1">
                    <X size={10} /> Clear delay (+{Math.round(manualDelay / 60)}m)
                  </button>
                )}
              </div>
            </section>
                  </div>

            {/* ROW 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Waiting Queue — fixed height */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[380px]">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg"><Users size={14} /></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Waiting ({waitingList.length})</h3>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {waitingList.length > 0 ? (
                    waitingList.map((patient, index) => {
                      const light = getTrafficLight(patient.estimatedWaitTime);
                      return (
                        <motion.div key={patient.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                          className="p-3 bg-slate-900/20 hover:bg-slate-900/40 border border-slate-800/50 rounded-xl flex items-center justify-between gap-3 transition-colors">
                          <div className="flex items-center space-x-2.5 truncate">
                            <div className="h-8 w-8 bg-slate-900/50 border border-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-mono font-bold text-slate-500">#{index + 1}</span>
                            </div>
                            <div className="truncate">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold font-mono text-indigo-400">{patient.token}</span>
                                <span className="text-xs font-semibold text-slate-200 truncate">{patient.name}</span>
                              </div>
                              <span className="text-[9px] text-slate-500 truncate block">{patient.symptoms}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${getFriendlyPriority(patient.priority).color}`}>
                              {getFriendlyPriority(patient.priority).label.split(' ')[0]}
                            </span>
                            {/* Traffic light badge */}
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-bold ${light.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${light.dot} ${light.pulse ? 'animate-pulse' : ''}`} />
                              {Math.round(patient.estimatedWaitTime / 60)}m
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 py-8">
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                      </div>
                      <p className="text-xs font-bold text-emerald-400">No patients waiting</p>
                      <p className="text-[10px] text-slate-500">Ready for next registration</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Missed Queue — fixed height */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg"><UserMinus size={14} /></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Missed Slots ({missedList.length})</h3>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {missedList.length > 0 ? (
                    missedList.map((patient) => (
                      <motion.div key={patient.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                        className="p-3 bg-slate-900/20 border border-slate-800/50 rounded-xl flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold font-mono text-rose-400">{patient.token}</span>
                            <span className="text-xs font-semibold text-slate-200">{patient.name}</span>
                          </div>
                          <span className="text-[9px] text-slate-500 block">
                            Skipped: {new Date(patient.skippedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <button onClick={() => recallPatient(patient.id)}
                          className="px-2.5 py-1.5 bg-slate-900/40 hover:bg-indigo-600 hover:text-white border border-slate-800 hover:border-indigo-500 rounded-lg text-[9px] font-extrabold uppercase text-indigo-400 tracking-wider flex items-center gap-1 transition-all">
                          <RefreshCw size={9} /> Recall
                        </button>
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">No skipped slots recorded.</div>
                  )}
                </AnimatePresence>
              </div>
            </section>
            </div>
          </div>

          {/* COL 3: Notifications, Operational Intelligence, Settings */}
          <div className="lg:col-span-3 space-y-6">

            {/* Notifications */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[270px]">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/40 shrink-0">
                <div className="flex items-center space-x-2">
                  <Bell size={14} className="text-indigo-400 shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">IntelliAlert Center</h3>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {notifications.length > 0 ? (
                    notifications.map((notif) => {
                      const color =
                        notif.type === 'emergency' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' :
                        notif.type === 'warning'   ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' :
                        notif.type === 'delay'     ? 'text-purple-400 border-purple-500/20 bg-purple-500/5' :
                        'text-slate-400 border-slate-800 bg-slate-900/10';
                      return (
                        <motion.div key={notif.id} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                          className={`p-2.5 rounded-lg border text-[10px] leading-normal font-medium ${color}`}>
                          <div className="flex justify-between items-start gap-1">
                            <span>{notif.message}</span>
                            <span className="text-[8px] text-slate-500 shrink-0 font-mono">
                              {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">No alerts logged.</div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Operational Intelligence (replaces Live Insights) */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[220px]">
              <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-slate-800/40 shrink-0">
                <TrendingUp size={14} className="text-indigo-400 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Operational Intelligence</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {insights.map((insight, idx) => (
                  <div key={idx} className="flex gap-2 items-start text-[10px] font-medium leading-relaxed p-2 bg-slate-900/20 border border-slate-800/40 rounded-lg">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                      insight.includes('behind') || insight.includes('delay') || insight.includes('missed') ? 'bg-amber-500' :
                      insight.includes('excellent') || insight.includes('within target') || insight.includes('No missed') ? 'bg-emerald-500' :
                      'bg-indigo-500'
                    }`} />
                    <span className="text-slate-300">{insight}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Settings */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="flex items-center space-x-2">
                <Settings size={14} className="text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Settings — {activeCabinMeta.cabinLabel}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Avg Consultation</span>
                  <span className="font-bold text-indigo-400">{avgTime} min</span>
                </div>
                <input type="range" min="1" max="20" step="1" value={avgTime}
                  onChange={(e) => { const v = Number(e.target.value); setAvgTime(v); updateConfig(v); }}
                  className="w-full accent-indigo-500 bg-slate-800 h-1 rounded-lg cursor-pointer" />
              </div>
              <div className="pt-2 border-t border-slate-800/40 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Purge {activeCabinMeta.cabinLabel}</span>
                {showResetConfirm ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => { resetQueue(); setShowResetConfirm(false); }}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-bold rounded uppercase transition-all">Confirm</button>
                    <button onClick={() => setShowResetConfirm(false)}
                      className="px-2 py-1 bg-slate-800 text-slate-400 text-[9px] font-bold rounded uppercase transition-all">No</button>
                  </div>
                ) : (
                  <button onClick={() => setShowResetConfirm(true)}
                    className="p-1.5 text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg text-[9px] font-bold uppercase flex items-center gap-1 transition-all">
                    <RotateCcw size={10} /> Reset
                  </button>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>
    </main>
  );
}

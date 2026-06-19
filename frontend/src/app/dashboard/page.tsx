'use client';

import React, { useState, useEffect } from 'react';
import { useSocket, Priority } from '../../hooks/useSocket';
import { StatsCard } from '../../components/StatsCard';
import { VisualTimeline } from '../../components/VisualTimeline';
import { 
  Users, 
  CheckCircle2, 
  UserMinus, 
  Heart, 
  Plus, 
  Play, 
  SkipForward, 
  Settings, 
  RotateCcw, 
  Activity,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  Clock,
  Bell,
  Sparkles,
  Stethoscope
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReceptionistDashboard() {
  const {
    isConnected,
    queueState,
    addPatient,
    callNext,
    skipPatient,
    recallPatient,
    updateConfig,
    updateRoomInfo,
    resetQueue
  } = useSocket();

  // Form State
  const [name, setName] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [formError, setFormError] = useState('');

  // Settings State
  const [avgTime, setAvgTime] = useState(5);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    if (queueState) {
      setAvgTime(queueState.averageConsultationTime);
    }
  }, [queueState]);

  // Sync clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Patient Name is required');
      return;
    }
    setFormError('');
    addPatient(name.trim(), symptoms.trim(), priority);
    
    // Reset Form
    setName('');
    setSymptoms('');
    setPriority('normal');
  };

  const handleUpdateConfig = (val: number) => {
    setAvgTime(val);
    updateConfig(val);
  };

  // Helper to format active consultation duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Map backend priority tags to patient-friendly strings
  const getFriendlyPriority = (priority: Priority) => {
    switch (priority) {
      case 'emergency': 
        return { label: 'Immediate Attention', color: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' };
      case 'urgent': 
        return { label: 'Priority Care', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
      default: 
        return { label: 'Standard Priority', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    }
  };

  const activePatient = queueState?.active ?? null;
  const waitingList = queueState?.waiting || [];
  const missedList = queueState?.missed || [];
  const stats = queueState?.stats;
  const roomInfo = queueState?.roomInfo;
  const notifications = queueState?.notifications || [];
  const insights = queueState?.insights || [];

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0a0e17] text-slate-100 p-4 md:p-8">
      {/* Medical Grid Overlay */}
      <div className="medical-grid" />

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/60 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-md">
                <Activity size={22} className="animate-pulse" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  QueueCure AI
                </h1>
                <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Clinical Operations Console</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Live Clock */}
            <div className="glass-panel px-4 py-2 rounded-xl text-sm font-mono text-slate-400 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />
              {timeStr || '--:--:--'}
            </div>

            {/* Socket Status Indicator */}
            <div className="glass-panel px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{isConnected ? 'LIVE SYNCED' : 'OFFLINE'}</span>
            </div>
          </div>
        </header>

        {/* STATS ANALYTICS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard 
            title="Active Waiting" 
            value={stats?.totalWaiting ?? 0}
            subtext={`${stats?.currentLoad?.toUpperCase() ?? 'LOW'} QUEUE LOAD`}
            icon={<Users size={18} />}
            variant={stats?.currentLoad === 'high' ? 'rose' : stats?.currentLoad === 'medium' ? 'amber' : 'primary'}
          />
          <StatsCard 
            title="Patients Served" 
            value={stats?.totalServed ?? 0}
            subtext="COMPLETED TODAY"
            icon={<CheckCircle2 size={18} />}
            variant="emerald"
          />
          <StatsCard 
            title="Missed Patients" 
            value={stats?.totalMissed ?? 0}
            subtext="SKIPPED SESSIONS"
            icon={<UserMinus size={18} />}
            variant={(stats?.totalMissed ?? 0) > 0 ? 'amber' : 'primary'}
          />
          <StatsCard 
            title="Efficiency Score" 
            value={stats ? `${stats.efficiencyScore}%` : '100%'}
            subtext={`HEALTH: ${stats?.queueHealth?.toUpperCase() ?? 'OPTIMAL'}`}
            icon={<Heart size={18} />}
            variant={stats?.queueHealth === 'critical' ? 'rose' : stats?.queueHealth === 'warning' ? 'amber' : 'emerald'}
          />
        </div>

        {/* DYNAMIC TIMELINE FLOW */}
        <VisualTimeline waiting={waitingList} active={activePatient} />

        {/* THREE-COLUMN GRID COMMAND CENTER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUMN 1 (lg:col-span-4): ACTIVE CONSULTATION & REGISTRATION */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* ACTIVE CONSULTATION COMPONENT */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Cabin status</h3>
                {roomInfo && (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    roomInfo.status === 'delayed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                    roomInfo.status === 'busy' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {roomInfo.status}
                  </span>
                )}
              </div>

              {activePatient ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Current Token</span>
                    <h4 className="text-3xl font-black font-mono tracking-wide text-white">{activePatient.token}</h4>
                    <p className="text-base font-semibold text-slate-100 mt-1">{activePatient.name}</p>
                    <p className="text-xs text-slate-500 font-medium">Complaint: {activePatient.symptoms}</p>
                  </div>

                  {/* Consultation Duration & Delay Detection */}
                  <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/60 space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
                      <span>ELAPSED TIMER</span>
                      <span className="font-mono text-slate-500">TARGET: {queueState?.averageConsultationTime}m</span>
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-4xl font-mono font-bold text-white tracking-wider">
                        {formatDuration(activePatient.elapsedTime)}
                      </span>

                      {/* Doctor Delay Badge */}
                      {queueState?.isDelayed && (
                        <motion.span 
                          animate={{ scale: [1, 1.03, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-[9px] font-bold text-rose-400 uppercase flex items-center gap-1"
                        >
                          <AlertTriangle size={10} /> Overrun +{Math.ceil(queueState.delaySeconds / 60)}m
                        </motion.span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={callNext}
                      className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/20 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/10"
                    >
                      <Play size={12} /> Call Next
                    </button>
                    <button
                      onClick={skipPatient}
                      className="px-3 py-2.5 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <SkipForward size={12} /> Skip Patient
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-3.5">
                  <div className="inline-flex p-3 bg-slate-900/30 border border-slate-850 rounded-2xl text-slate-500">
                    <Stethoscope size={22} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase">Consultation Cabin Idle</h4>
                    <p className="text-2xs text-slate-500 mt-0.5">No active consultation currently running.</p>
                  </div>
                  <button
                    onClick={callNext}
                    disabled={waitingList.length === 0}
                    className="px-5 py-2 bg-emerald-600 disabled:bg-slate-900/40 disabled:text-slate-600 disabled:border-slate-850 hover:bg-emerald-500 border border-emerald-500/20 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5 transition-all"
                  >
                    <Play size={12} /> Call Patient
                  </button>
                </div>
              )}
            </section>

            {/* ADD PATIENT FORM */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                  <UserPlus size={14} />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Triage Intake Form</h3>
              </div>

              <form onSubmit={handleAddPatient} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Patient Name</label>
                  <input
                    type="text"
                    placeholder="Enter name..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900/40 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600"
                  />
                  {formError && <p className="text-[10px] text-rose-400 font-medium">{formError}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Chief Complaint</label>
                  <input
                    type="text"
                    placeholder="Symptoms description..."
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    className="w-full bg-slate-900/40 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Clinical Triage Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['normal', 'urgent', 'emergency'] as const).map((level) => {
                      const details = getFriendlyPriority(level);
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setPriority(level)}
                          className={`py-2 rounded-xl text-[9px] font-bold uppercase border transition-all text-center leading-tight ${
                            priority === level
                              ? level === 'emergency'
                                ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                                : level === 'urgent'
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                                : 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                              : 'bg-slate-900/20 border-slate-800 text-slate-500 hover:border-slate-700'
                          }`}
                        >
                          {details.label.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all mt-2"
                >
                  <Plus size={12} /> Register Triage Token
                </button>
              </form>
            </section>

          </div>

          {/* COLUMN 2 (lg:col-span-5): QUEUE LISTINGS & MISSED RECOVERY */}
          <div className="lg:col-span-5 space-y-6">

            {/* WAITING QUEUE LIST */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[380px]">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                    <Users size={14} />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Waiting List ({waitingList.length})
                  </h3>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {waitingList.length > 0 ? (
                    waitingList.map((patient, index) => (
                      <motion.div
                        key={patient.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="p-3 bg-slate-900/20 hover:bg-slate-900/40 border border-slate-850 rounded-xl flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <div className="h-8 w-8 bg-slate-900/50 border border-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-mono font-bold text-slate-500">#{index + 1}</span>
                          </div>
                          <div className="truncate">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold font-mono text-indigo-400 tracking-wider">{patient.token}</span>
                              <span className="text-xs font-semibold text-slate-200 truncate">{patient.name}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 truncate block">Complaint: {patient.symptoms}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wide ${getFriendlyPriority(patient.priority).color}`}>
                            {getFriendlyPriority(patient.priority).label}
                          </span>

                          <div className="flex items-center space-x-1 text-slate-400">
                            <Clock size={10} />
                            <span className="text-xs font-mono font-bold">{Math.round(patient.estimatedWaitTime / 60)}m</span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic py-10">
                      No patients are currently waiting.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* SKIPPED / MISSED QUEUE */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[280px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg">
                    <UserMinus size={14} />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Missed Slots ({missedList.length})
                  </h3>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {missedList.length > 0 ? (
                    missedList.map((patient) => (
                      <motion.div
                        key={patient.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="p-3 bg-slate-900/20 border border-slate-850 rounded-xl flex items-center justify-between gap-3 transition-colors"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold font-mono text-rose-400 tracking-wider">{patient.token}</span>
                            <span className="text-xs font-semibold text-slate-200">{patient.name}</span>
                          </div>
                          <span className="text-[9px] text-slate-500 block">Skipped: {new Date(patient.skippedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <button
                          onClick={() => recallPatient(patient.id)}
                          className="px-2.5 py-1.5 bg-slate-900/40 hover:bg-indigo-600 hover:text-white border border-slate-800 hover:border-indigo-500 rounded-lg text-[9px] font-extrabold uppercase text-indigo-400 tracking-wider flex items-center gap-1 transition-all"
                        >
                          <RefreshCw size={9} /> Recall
                        </button>
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic py-10">
                      No skipped patient slots recorded.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>

          </div>

          {/* COLUMN 3 (lg:col-span-3): NOTIFICATIONS, INSIGHTS & CONFIG */}
          <div className="lg:col-span-3 space-y-6">

            {/* REAL-TIME NOTIFICATIONS CENTER */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[270px]">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-850/60">
                <div className="flex items-center space-x-2">
                  <Bell size={14} className="text-indigo-400 shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">IntelliAlert Center</h3>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {notifications.length > 0 ? (
                    notifications.map((notif) => {
                      const color = 
                        notif.type === 'emergency' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' :
                        notif.type === 'warning' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' :
                        notif.type === 'delay' ? 'text-purple-400 border-purple-500/20 bg-purple-500/5' :
                        'text-slate-400 border-slate-800 bg-slate-900/10';
                      
                      return (
                        <motion.div
                          key={notif.id}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-2.5 rounded-lg border text-[10px] leading-normal font-medium ${color}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span>{notif.message}</span>
                            <span className="text-[8px] text-slate-500 shrink-0 font-mono">
                              {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).split(' ')[0]}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                      No operational alerts logged.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* SYSTEM INSIGHTS */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[200px]">
              <div className="flex items-center space-x-2 mb-3">
                <Sparkles size={14} className="text-purple-400 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Insights</h3>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin text-slate-400">
                {insights.length > 0 ? (
                  insights.map((insight, idx) => (
                    <div key={idx} className="flex gap-2 items-start text-[11px] font-medium leading-relaxed p-2 bg-slate-900/30 border border-slate-850/60 rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                      <span>{insight}</span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                    Analyzing queue operations...
                  </div>
                )}
              </div>
            </section>

            {/* CONFIGURATIONS */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="flex items-center space-x-2">
                <Settings size={14} className="text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Settings</h3>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Avg Consultation</span>
                  <span className="font-bold text-indigo-400">{avgTime} min</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={avgTime}
                  onChange={(e) => handleUpdateConfig(Number(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-800 h-1 rounded-lg cursor-pointer"
                />
              </div>

              {/* Clinician Cabin Selector */}
              <div className="space-y-2 pt-2 border-t border-slate-850/60">
                <label className="text-[10px] uppercase font-bold text-slate-400">Doctor Cabin Profile</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { name: 'Sharma', room: 'Cabin 01' },
                    { name: 'Gupta', room: 'Cabin 02' },
                    { name: 'Verma', room: 'Cabin 03' }
                  ].map((profile) => (
                    <button
                      key={profile.name}
                      type="button"
                      onClick={() => updateRoomInfo(profile.room, profile.name)}
                      className={`py-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                        queueState?.roomInfo.doctorName === profile.name
                          ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                          : 'bg-slate-900/20 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      Dr. {profile.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-850 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Purge Data</span>

                {showResetConfirm ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        resetQueue();
                        setShowResetConfirm(false);
                      }}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-bold rounded uppercase transition-all"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-2 py-1 bg-slate-800 text-slate-400 text-[9px] font-bold rounded uppercase transition-all"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="p-1.5 text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg text-[9px] font-bold uppercase flex items-center gap-1 transition-all"
                  >
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

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket, Patient } from '../../hooks/useSocket';
import { VisualTimeline } from '../../components/VisualTimeline';
import { PatientSearch } from '../../components/PatientSearch';
import { StatsCard } from '../../components/StatsCard';
import { 
  Tv, 
  Activity, 
  Volume2, 
  Clock, 
  Users, 
  CheckCircle,
  AlertOctagon,
  MicOff,
  Stethoscope,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import canvasConfetti from 'canvas-confetti';

export default function PatientMonitor() {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const lastCalledToken = useRef<string | null>(null);

  // Play a procedural medical chime using the Web Audio API
  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5

      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.8);
      osc2.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn('Web Audio chime failed', e);
    }
  };

  // Text-To-Speech Patient Callout
  const handlePatientCalled = ({ token, name }: { token: string; name: string }) => {
    // Prevent double calls for same patient trigger
    if (lastCalledToken.current === token) return;
    lastCalledToken.current = token;

    // Trigger subtle party confetti (clean burst)
    canvasConfetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.8 }
    });

    playChime();

    if (!voiceEnabled) return;

    // Trigger Speech synthesis after a slight delay for the chime to play
    setTimeout(() => {
      try {
        const speech = new SpeechSynthesisUtterance();
        speech.text = `Attention please. Patient with Token number ${token.split('-').join(' ')}, ${name}, please proceed to Cabin 0 1.`;
        speech.volume = 1;
        speech.rate = 0.85; // Slower rate for clear pronunciation
        speech.pitch = 1.0; 
        
        // Find standard English voice if available
        const voices = window.speechSynthesis.getVoices();
        const fallbackVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || 
                             voices.find(v => v.lang.includes('en'));
        if (fallbackVoice) speech.voice = fallbackVoice;

        window.speechSynthesis.speak(speech);
      } catch (e) {
        console.warn('Speech synthesis error', e);
      }
    }, 450);
  };

  const { isConnected, queueState } = useSocket(handlePatientCalled);

  // Sync clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-load voices on component mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const activePatient = queueState?.active ?? null;
  const waitingList = queueState?.waiting || [];
  const stats = queueState?.stats;
  const roomInfo = queueState?.roomInfo;

  // Convert wait times into traffic light indicators
  const getTrafficLight = (waitTimeSeconds: number) => {
    const minutes = Math.round(waitTimeSeconds / 60);
    if (minutes < 15) {
      return {
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dot: 'bg-emerald-400',
        text: 'Expected Soon'
      };
    } else if (minutes <= 30) {
      return {
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dot: 'bg-amber-400',
        text: 'Moderate Wait'
      };
    } else {
      return {
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        dot: 'bg-rose-400',
        text: 'Busy Right Now'
      };
    }
  };

  // Convert priority to clinical labels
  const getFriendlyPriority = (priority: string) => {
    switch (priority) {
      case 'emergency': return { label: 'Immediate Attention', color: 'border-rose-500/30 text-rose-400 bg-rose-500/5' };
      case 'urgent': return { label: 'Priority Care', color: 'border-amber-500/30 text-amber-400 bg-amber-500/5' };
      default: return { label: 'Standard Priority', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' };
    }
  };

  // Helper to format active consultation duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Consultation progress bar percentage calculation
  const getConsultationProgress = () => {
    if (!activePatient || !queueState) return 0;
    const limit = queueState.averageConsultationTime * 60;
    return Math.min(100, Math.round((activePatient.elapsedTime / limit) * 100));
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0a0e17] text-slate-100 p-4 md:p-8 flex flex-col justify-between">
      {/* Medical Grid Overlay */}
      <div className="medical-grid" />

      <div className="relative z-10 max-w-7xl mx-auto w-full space-y-6 flex-grow">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/60 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-md">
                <Tv size={22} className="text-indigo-400" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Patient Board
                </h1>
                <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">QueueCure AI Waiting Screen</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Audio callout status */}
            <button
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (!voiceEnabled) playChime();
              }}
              className={`glass-panel px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                voiceEnabled 
                  ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.08)]' 
                  : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {voiceEnabled ? <Volume2 size={13} className="animate-bounce" /> : <MicOff size={13} />}
              <span>SPEECH CALLS: {voiceEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Live Clock */}
            <div className="glass-panel px-4 py-2 rounded-xl text-sm font-mono text-slate-400 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />
              {timeStr || '--:--:--'}
            </div>

            {/* Connection Indicator */}
            <div className="glass-panel px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{isConnected ? 'LIVE SYNCED' : 'OFFLINE'}</span>
            </div>
          </div>
        </header>

        {/* TOP STATS ROW */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800/60 flex items-center space-x-3.5">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <Users size={16} />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Active Load</span>
              <span className="text-base font-bold text-white">{(stats?.totalWaiting ?? 0) + (activePatient ? 1 : 0)} Patients</span>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800/60 flex items-center space-x-3.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <CheckCircle size={16} />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Served Today</span>
              <span className="text-base font-bold text-white">{stats?.totalServed ?? 0} Completed</span>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800/60 flex items-center space-x-3.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Clock size={16} />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Average Wait</span>
              <span className="text-base font-bold text-white">
                {stats?.averageWaitTime ? `${Math.round(stats.averageWaitTime / 60)} mins` : 'Calculating...'}
              </span>
            </div>
          </div>
        </div>

        {/* MONITOR MAIN DASHBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT AREA: MASSIVE CALLOUT SCREEN */}
          <div className="lg:col-span-7 space-y-6">
            
            <section className="glass-panel p-8 rounded-3xl border border-slate-800/80 flex flex-col justify-between items-center text-center relative overflow-hidden h-[420px] bg-slate-900/10">
              
              {/* Corner clinical outline markings */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-slate-700 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-slate-700 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-slate-700 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-slate-700 rounded-br-lg" />

              <div className="w-full flex justify-between items-center z-10">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 bg-indigo-500/10 px-3.5 py-1.5 rounded-full border border-indigo-500/20">
                  <Stethoscope size={13} className="text-indigo-400 animate-pulse" />
                  {roomInfo ? `${roomInfo.roomNumber} - ${roomInfo.doctorName}` : 'Cabin 01 - Dr. Sarah Jenkins'}
                </span>
                
                {queueState?.isDelayed && (
                  <motion.span
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full"
                  >
                    <AlertOctagon size={11} /> Delay Detected
                  </motion.span>
                )}
              </div>

              {activePatient ? (
                <div className="space-y-4 my-auto z-10 w-full">
                  <motion.div
                    key={activePatient.token}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="space-y-4"
                  >
                    <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase block">NOW CALLING PATIENT</span>
                    <h2 className="text-7xl md:text-8xl font-black text-indigo-400 tracking-wider font-mono drop-shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                      {activePatient.token}
                    </h2>
                    
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-white tracking-wide">{activePatient.name}</p>
                      <p className="text-xs text-slate-400 font-medium">Please proceed to Cabin 01 for consultation</p>
                    </div>

                    {/* Dynamic Session Progress Bar */}
                    <div className="max-w-md mx-auto pt-4 space-y-2">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        <span>Expected Consultation progress</span>
                        <span className="font-mono">{formatDuration(activePatient.elapsedTime)}</span>
                      </div>
                      
                      <div className="w-full bg-slate-900/60 rounded-full h-2 border border-slate-800/80 overflow-hidden relative">
                        <motion.div 
                          className={`h-full rounded-full transition-all ${
                            queueState?.isDelayed ? 'bg-rose-500' : 'bg-indigo-500'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${getConsultationProgress()}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>

                      {queueState?.isDelayed && (
                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider animate-pulse pt-0.5">
                          Consultation exceeding expected average duration
                        </p>
                      )}
                    </div>

                  </motion.div>
                </div>
              ) : (
                <div className="space-y-3.5 my-auto z-10">
                  <h2 className="text-3xl font-extrabold text-slate-500 tracking-wider uppercase">
                    No active call
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    The cabin is currently preparing. Please refer to the waiting lists on the side. Next token announced shortly.
                  </p>
                </div>
              )}

              {/* Heartbeat EKG Graphics */}
              <div className="w-full h-8 flex justify-center opacity-10 z-0">
                <svg className="w-64 h-full" viewBox="0 0 200 40">
                  <path
                    d="M 0 20 L 50 20 L 60 10 L 70 30 L 75 20 L 95 20 L 100 0 L 105 40 L 110 20 L 130 20 L 140 10 L 150 30 L 155 20 L 200 20"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1.5"
                    strokeDasharray="400"
                    strokeDashoffset="0"
                  />
                </svg>
              </div>
            </section>

            {/* TIMELINE */}
            <VisualTimeline waiting={waitingList} active={activePatient} />

          </div>

          {/* RIGHT AREA: LOOKUP WIDGET & UPCOMING LIST */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* PERSONAL LOOKUP */}
            <PatientSearch queueState={queueState} />

            {/* UPCOMING QUEUE TABLE */}
            <section className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col h-[280px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Upcoming waiting list</h3>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Estimated Wait</span>
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {waitingList.length > 0 ? (
                    waitingList.map((patient, idx) => {
                      const light = getTrafficLight(patient.estimatedWaitTime);
                      return (
                        <motion.div
                          key={patient.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-slate-900/30 border border-slate-850 rounded-xl flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className="text-xs font-mono font-bold text-indigo-400 tracking-wider w-14 shrink-0">{patient.token}</span>
                            <span className="text-xs font-semibold text-slate-200 truncate">{patient.name}</span>
                          </div>

                          <div className="flex items-center space-x-3.5 shrink-0">
                            {/* Traffic light wait index badge */}
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${light.color}`}>
                              <span className={`w-1 h-1 rounded-full ${light.dot}`} />
                              {light.text}
                            </span>
                            
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border tracking-wide hidden sm:inline-block ${getFriendlyPriority(patient.priority).color}`}>
                              {getFriendlyPriority(patient.priority).label.split(' ')[0]}
                            </span>

                            <span className="text-xs font-mono font-bold text-indigo-400 w-12 text-right">
                              {idx === 0 ? 'Next Up' : `${Math.round(patient.estimatedWaitTime / 60)}m`}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs italic py-10">
                      No upcoming patient registrations.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </section>

          </div>

        </div>

      </div>

      {/* "THANK YOU FOR YOUR PATIENCE" FOOTER DISCLAIMER TICKER */}
      <footer className="w-full max-w-7xl mx-auto mt-6 pt-4 border-t border-slate-850/60 text-center flex flex-col md:flex-row justify-between items-center gap-2 text-slate-500 text-[10px] font-medium">
        <span className="uppercase tracking-widest text-[9px] font-bold text-indigo-400/80 animate-pulse">
          🏥 QueueCure Clinical operations ticker: System synced in real-time.
        </span>
        <span>
          Thank you for your patience. If your status requires urgent attention, please notify the medical front desk immediately.
        </span>
      </footer>
    </main>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket, Patient } from '../../hooks/useSocket';
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
  QrCode,
  Info
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
    if (lastCalledToken.current === token) return;
    lastCalledToken.current = token;

    // Trigger subtle party confetti
    canvasConfetti({
      particleCount: 40,
      spread: 45,
      origin: { y: 0.6 }
    });

    playChime();

    if (!voiceEnabled) return;

    // Trigger Speech synthesis after a slight delay
    setTimeout(() => {
      try {
        const speech = new SpeechSynthesisUtterance();
        speech.text = `Attention please. Patient with Token number ${token.split('-').join(' ')}, ${name}, please proceed to Cabin 0 1.`;
        speech.volume = 1;
        speech.rate = 0.85; 
        speech.pitch = 1.0; 
        
        const voices = window.speechSynthesis.getVoices();
        const fallbackVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-US')) || 
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
    <main className="min-h-screen relative overflow-hidden bg-[#070b12] text-slate-100 p-6 md:p-8 flex flex-col justify-between">
      {/* Medical Grid Overlay */}
      <div className="medical-grid" />

      <div className="relative z-10 max-w-7xl mx-auto w-full flex-grow flex flex-col gap-6">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/60 pb-5">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-md">
              <Tv size={24} className="text-indigo-400" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                OPD Token Display Board
              </h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Real-Time Patient Guidance Screen</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Audio callout status */}
            <button
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (!voiceEnabled) playChime();
              }}
              className={`glass-panel px-4.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                voiceEnabled 
                  ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.08)]' 
                  : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {voiceEnabled ? <Volume2 size={13} className="animate-bounce" /> : <MicOff size={13} />}
              <span>SPEECH CALLS: {voiceEnabled ? 'ACTIVE' : 'MUTED'}</span>
            </button>

            {/* Live Clock */}
            <div className="glass-panel px-4.5 py-2 rounded-xl text-sm font-mono text-slate-300 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />
              {timeStr || '--:--:--'}
            </div>

            {/* Connection Indicator */}
            <div className="glass-panel px-4.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </header>

        {/* MONITOR MAIN SPLIT GRID LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch flex-grow">
          
          {/* LEFT AREA (lg:col-span-7): MASSIVE CALLOUT SCREEN + SCAN QR BLOCK */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-6">
            
            {/* NOW SERVING SCREEN */}
            <section className="glass-panel p-8 rounded-3xl border border-slate-800 flex flex-col justify-between items-center text-center relative overflow-hidden flex-grow bg-slate-900/10 min-h-[300px]">
              
              {/* Corner EMR-like visual layout frames */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-slate-700/80 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-slate-700/80 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-slate-700/80 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-slate-700/80 rounded-br-xl" />

              <div className="w-full flex justify-between items-center z-10">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20">
                  <Stethoscope size={15} className="text-indigo-400 shrink-0" />
                  {roomInfo ? `${roomInfo.roomNumber} • Dr. ${roomInfo.doctorName}` : 'Cabin 01 • Dr. Sharma'}
                </span>
                
                {queueState?.isDelayed && (
                  <motion.span
                    animate={{ scale: [1, 1.03, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full"
                  >
                    <AlertOctagon size={13} /> Doctor Delayed
                  </motion.span>
                )}
              </div>

              {activePatient ? (
                <div className="my-auto z-10 w-full py-6">
                  <motion.div
                    key={activePatient.token}
                    initial={{ scale: 0.94, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="space-y-6"
                  >
                    <span className="text-xs font-bold text-slate-500 tracking-widest uppercase block">NOW SERVING</span>
                    
                    <h2 className="text-9xl md:text-[9.5rem] font-black text-indigo-400 tracking-wider font-mono leading-none drop-shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                      {activePatient.token}
                    </h2>
                    
                    <div className="space-y-1">
                      <p className="text-3xl font-extrabold text-white tracking-wide">{activePatient.name}</p>
                      <p className="text-sm text-slate-400 font-medium">Please proceed inside the consultation cabin</p>
                    </div>

                    {/* Consultation progress countdown */}
                    <div className="max-w-md mx-auto pt-6 space-y-2 border-t border-slate-850/40">
                      <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <span>Expected Session duration</span>
                        <span className="font-mono text-slate-400">{formatDuration(activePatient.elapsedTime)}</span>
                      </div>
                      
                      <div className="w-full bg-slate-900/60 rounded-full h-2.5 border border-slate-800 overflow-hidden relative">
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
                          Consultation duration exceeding targeted average
                        </p>
                      )}
                    </div>

                  </motion.div>
                </div>
              ) : (
                <div className="space-y-3.5 my-auto z-10">
                  <h2 className="text-4xl font-extrabold text-slate-500 tracking-wider uppercase">
                    Cabin Preparing
                  </h2>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Consultation is currently idle. Please refer to the upcoming waiting list on the side. Next token announced shortly.
                  </p>
                </div>
              )}

              {/* Heartbeat EKG Graphics */}
              <div className="w-full h-4 flex justify-center opacity-5 z-0">
                <svg className="w-64 h-full" viewBox="0 0 200 40">
                  <path
                    d="M 0 20 L 50 20 L 60 10 L 70 30 L 75 20 L 95 20 L 100 0 L 105 40 L 110 20 L 130 20 L 140 10 L 150 30 L 155 20 L 200 20"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1"
                    strokeDasharray="400"
                    strokeDashoffset="0"
                  />
                </svg>
              </div>
            </section>

            {/* SCAN QR TO TRACK QUEUE (Replaces Patient Portal lookup) */}
            <section className="glass-panel p-5 rounded-2xl border border-slate-800/80 flex items-center justify-between gap-6 bg-slate-950/20">
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <QrCode size={16} className="text-indigo-400" />
                  Scan QR To Track Queue
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                  Scan this QR code with your smartphone camera to access the live mobile portal. Look up your token status, check queue progress, and monitor ETAs without waiting in the hall.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold pt-1">
                  <Info size={11} className="text-indigo-400/80" />
                  <span>Receive dynamic notifications directly on your phone.</span>
                </div>
              </div>

              {/* Simulated QR Code SVG drawing */}
              <div className="p-2.5 bg-white rounded-xl flex-shrink-0 shadow-md">
                <svg className="w-20 h-20 text-slate-950" viewBox="0 0 100 100" fill="currentColor">
                  {/* Position Finders */}
                  <rect x="0" y="0" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" />
                  <rect x="6" y="6" width="16" height="16" fill="currentColor" />
                  
                  <rect x="72" y="0" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" />
                  <rect x="78" y="6" width="16" height="16" fill="currentColor" />

                  <rect x="0" y="72" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="4" />
                  <rect x="6" y="78" width="16" height="16" fill="currentColor" />
                  
                  {/* Mock QR Matrix */}
                  <rect x="36" y="4" width="8" height="16" />
                  <rect x="48" y="0" width="12" height="8" />
                  <rect x="64" y="12" width="4" height="4" />
                  <rect x="32" y="24" width="24" height="8" />
                  <rect x="60" y="24" width="8" height="12" />
                  <rect x="36" y="36" width="8" height="8" />
                  <rect x="48" y="48" width="12" height="12" />
                  <rect x="64" y="36" width="4" height="12" />
                  <rect x="80" y="36" width="12" height="8" />
                  <rect x="92" y="32" width="4" height="20" />
                  <rect x="32" y="56" width="12" height="8" />
                  <rect x="32" y="68" width="8" height="16" />
                  <rect x="48" y="72" width="20" height="8" />
                  <rect x="60" y="84" width="8" height="16" />
                  <rect x="36" y="92" width="16" height="8" />
                  <rect x="76" y="56" width="8" height="8" />
                  <rect x="84" y="68" width="16" height="12" />
                  <rect x="76" y="84" width="8" height="8" />
                  <rect x="84" y="88" width="16" height="8" />
                  <rect x="92" y="92" width="8" height="8" />
                </svg>
              </div>
            </section>

          </div>

          {/* RIGHT AREA (lg:col-span-5): EXPANDED UPCOMING QUEUE BOARD */}
          <section className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col min-h-[460px]">
            <div className="flex justify-between items-center mb-5 pb-2.5 border-b border-slate-850">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users size={16} className="text-indigo-400" />
                Next in Queue
              </h3>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Est. Wait Time</span>
            </div>

            {/* Legible waiting list (shows up to 10 tokens) */}
            <div className="flex-grow overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
              <AnimatePresence initial={false}>
                {waitingList.length > 0 ? (
                  waitingList.slice(0, 10).map((patient, idx) => {
                    const light = getTrafficLight(patient.estimatedWaitTime);
                    return (
                      <motion.div
                        key={patient.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-slate-900/30 border border-slate-850/80 rounded-xl flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          {/* Large high-contrast token */}
                          <span className="text-xl font-black font-mono text-white tracking-wider shrink-0">{patient.token}</span>
                          <span className="text-sm font-bold text-slate-200 truncate">{patient.name}</span>
                        </div>

                        <div className="flex items-center space-x-3 shrink-0">
                          {/* Traffic Light status color & text */}
                          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-extrabold tracking-wide ${light.color}`}>
                            <span className={`w-2 h-2 rounded-full ${light.dot}`} />
                            {light.text}
                          </span>
                          
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wide hidden xl:inline-block ${getFriendlyPriority(patient.priority).color}`}>
                            {getFriendlyPriority(patient.priority).label.split(' ')[0]}
                          </span>

                          <span className="text-sm font-mono font-bold text-indigo-400 w-16 text-right shrink-0">
                            {idx === 0 ? 'Next Up' : `${Math.round(patient.estimatedWaitTime / 60)} mins`}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm font-semibold italic py-20 gap-2">
                    <Activity size={20} className="text-slate-600 animate-pulse" />
                    <span>No upcoming patient slots waiting.</span>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>

        </div>

      </div>

      {/* BOTTOM FOOTER SECTION */}
      <footer className="w-full max-w-7xl mx-auto mt-6 pt-5 border-t border-slate-850/80 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-500 text-xs font-semibold">
        <span className="uppercase tracking-widest text-[10px] font-bold text-indigo-400/80 flex items-center gap-1.5 animate-pulse">
          <Activity size={12} /> Live OPD Ticker: Please wait for your token block to pulse.
        </span>
        <span className="text-slate-400 text-center">
          Thank you for your patience. Coordinate with receptionist if triage level requires priority care updates.
        </span>
      </footer>
    </main>
  );
}

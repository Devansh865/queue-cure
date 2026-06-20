'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket, Patient } from '../../hooks/useSocket';
import { QRCodeSVG } from 'qrcode.react';
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
  Info,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import canvasConfetti from 'canvas-confetti';

export default function PatientMonitor() {
  // Voice enabled by default; persisted in localStorage
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('qc_voiceEnabled');
    return saved === null ? true : saved === 'true';
  });

  // Track whether browser has unlocked audio context (requires user gesture)
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showAudioBanner, setShowAudioBanner] = useState(true);

  const [timeStr, setTimeStr] = useState('');
  const [trackUrl, setTrackUrl] = useState('');

  // Use a Set to guarantee no token is announced twice per session
  const announcedTokens = useRef<Set<string>>(new Set());
  const lastCalledToken = useRef<string | null>(null);

  // Resolve the /track URL once on the client side
  useEffect(() => {
    setTrackUrl(`${window.location.origin}/track`);
  }, []);

  // Persist voice preference
  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem('qc_voiceEnabled', String(next));
    if (next) playChime();
  };

  // Unlock audio on first user interaction anywhere on the page
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    // Warm up AudioContext
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        ctx.resume().then(() => ctx.close());
      }
    } catch (_) {}
    // Warm up SpeechSynthesis
    try {
      const utt = new SpeechSynthesisUtterance('');
      utt.volume = 0;
      window.speechSynthesis.speak(utt);
      window.speechSynthesis.cancel();
    } catch (_) {}
    setAudioUnlocked(true);
    setShowAudioBanner(false);
  }, [audioUnlocked]);

  useEffect(() => {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [unlockAudio]);

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

      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.9);
      osc2.stop(ctx.currentTime + 0.9);
    } catch (e) {
      console.warn('Web Audio chime failed', e);
    }
  };

  // Speak announcement via SpeechSynthesis
  const speakAnnouncement = (token: string, cabin: string) => {
    try {
      window.speechSynthesis.cancel(); // clear any queued speech first
      const speech = new SpeechSynthesisUtterance();
      // Clean token: "QC-007" → "Q C 0 0 7" for clearer digit-by-digit reading
      const spokenToken = token.replace('QC-', '').split('').join(' ');
      speech.text = `Attention please. Token Q C ${spokenToken}, please proceed to ${cabin}.`;
      speech.volume = 1;
      speech.rate = 0.82;
      speech.pitch = 1.05;
      speech.lang = 'en-IN';

      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(v => v.lang === 'en-IN') ||
        voices.find(v => v.lang.startsWith('en-IN')) ||
        voices.find(v => v.lang.startsWith('en-US')) ||
        voices.find(v => v.lang.startsWith('en'));
      if (preferred) speech.voice = preferred;

      window.speechSynthesis.speak(speech);
    } catch (e) {
      console.warn('Speech synthesis error', e);
    }
  };

  // Text-To-Speech Patient Callout — triggered by socket event
  const handlePatientCalled = useCallback(
    ({ token, name }: { token: string; name: string }) => {
      // Prevent duplicate announcements for the same token
      if (announcedTokens.current.has(token)) return;
      announcedTokens.current.add(token);
      lastCalledToken.current = token;

      // Confetti burst
      canvasConfetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });

      // Always play the chime regardless of voice setting
      playChime();

      // Speech announcement only if voice is enabled
      if (!voiceEnabled) return;

      // Use roomInfo for cabin name at call time (closure captures latest state)
      setTimeout(() => {
        speakAnnouncement(token, 'Cabin 1');
      }, 500);
    },
    [voiceEnabled]
  );

  const { isConnected, queueState } = useSocket(handlePatientCalled);

  // Keep speakAnnouncement cabin name in sync with roomInfo
  const roomInfoRef = useRef(queueState?.roomInfo);
  useEffect(() => {
    roomInfoRef.current = queueState?.roomInfo;
  }, [queueState?.roomInfo]);

  // Sync clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-load voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        window.speechSynthesis.getVoices();
      });
    }
  }, []);

  const activePatient = queueState?.active ?? null;
  const waitingList = queueState?.waiting || [];
  const roomInfo = queueState?.roomInfo;

  // Derive cabin name for display
  const cabinLabel = roomInfo
    ? `${roomInfo.roomNumber} • Dr. ${roomInfo.doctorName}`
    : 'Cabin 01 • Dr. Sharma';
  const cabinName = roomInfo?.roomNumber || 'Cabin 1';

  // Traffic light indicators
  const getTrafficLight = (waitTimeSeconds: number) => {
    const minutes = Math.round(waitTimeSeconds / 60);
    if (minutes < 15)
      return {
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dot: 'bg-emerald-400',
        text: 'Expected Soon'
      };
    if (minutes <= 30)
      return {
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dot: 'bg-amber-400',
        text: 'Moderate Wait'
      };
    return {
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      dot: 'bg-rose-400',
      text: 'Busy Right Now'
    };
  };

  const getFriendlyPriority = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return { label: 'Immediate', color: 'border-rose-500/30 text-rose-400 bg-rose-500/5' };
      case 'urgent':
        return { label: 'Priority', color: 'border-amber-500/30 text-amber-400 bg-amber-500/5' };
      default:
        return { label: 'Standard', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' };
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConsultationProgress = () => {
    if (!activePatient || !queueState) return 0;
    const limit = queueState.averageConsultationTime * 60;
    return Math.min(100, Math.round((activePatient.elapsedTime / limit) * 100));
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#070b12] text-slate-100 p-4 md:p-6 flex flex-col justify-between">
      {/* Medical Grid Overlay */}
      <div className="medical-grid" />

      {/* Audio Unlock Banner */}
      <AnimatePresence>
        {showAudioBanner && !audioUnlocked && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={unlockAudio}
            className="fixed top-0 left-0 right-0 z-50 cursor-pointer bg-amber-500/95 backdrop-blur-sm text-slate-900 text-sm font-bold py-3 px-6 flex items-center justify-center gap-3 shadow-lg"
          >
            <Volume2 size={18} className="shrink-0 animate-pulse" />
            <span>Click once to enable voice announcements</span>
            <Volume2 size={18} className="shrink-0 animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-7xl mx-auto w-full flex-grow flex flex-col gap-5">

        {/* HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 pb-4">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-md">
              <Tv size={22} className="text-indigo-400" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                OPD Token Display Board
              </h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">
                Real-Time Patient Guidance Screen
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Voice toggle */}
            <button
              onClick={toggleVoice}
              className={`glass-panel px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                voiceEnabled
                  ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {voiceEnabled ? (
                <Volume2 size={13} className="animate-bounce" />
              ) : (
                <MicOff size={13} />
              )}
              <span>SPEECH: {voiceEnabled ? 'ON' : 'MUTED'}</span>
            </button>

            {/* Live Clock */}
            <div className="glass-panel px-4 py-2 rounded-xl text-sm font-mono text-slate-300 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />
              {timeStr || '--:--:--'}
            </div>

            {/* Connection indicator */}
            <div className="glass-panel px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </header>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-grow">

          {/* LEFT: NOW SERVING + QR */}
          <div className="lg:col-span-7 flex flex-col gap-5">

            {/* NOW SERVING SCREEN */}
            <section className="glass-panel p-8 rounded-3xl border border-slate-800 flex flex-col justify-between items-center text-center relative overflow-hidden flex-grow bg-slate-900/10 min-h-[280px]">

              {/* Corner frames */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-slate-700/80 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-slate-700/80 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-slate-700/80 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-slate-700/80 rounded-br-xl" />

              <div className="w-full flex justify-between items-center z-10">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20">
                  <Stethoscope size={15} className="text-indigo-400 shrink-0" />
                  {cabinLabel}
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
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="space-y-5"
                  >
                    <span className="text-xs font-bold text-slate-500 tracking-widest uppercase block">
                      NOW SERVING
                    </span>

                    <h2 className="text-9xl md:text-[9.5rem] font-black text-indigo-400 tracking-wider font-mono leading-none drop-shadow-[0_0_28px_rgba(99,102,241,0.20)]">
                      {activePatient.token}
                    </h2>

                    <div className="space-y-1">
                      <p className="text-3xl font-extrabold text-white tracking-wide">
                        {activePatient.name}
                      </p>
                      <p className="text-sm text-slate-400 font-medium">
                        Please proceed inside the consultation cabin
                      </p>
                    </div>

                    {/* Consultation progress */}
                    <div className="max-w-md mx-auto pt-5 space-y-2 border-t border-slate-800/40">
                      <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <span>Session Duration</span>
                        <span className="font-mono text-slate-400">
                          {formatDuration(activePatient.elapsedTime)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-900/60 rounded-full h-2.5 border border-slate-800 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            queueState?.isDelayed ? 'bg-rose-500' : 'bg-indigo-500'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${getConsultationProgress()}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                      {queueState?.isDelayed && (
                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider animate-pulse pt-0.5">
                          Session exceeding targeted average
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
                    Consultation is idle. Please refer to the upcoming list. Next token announced shortly.
                  </p>
                </div>
              )}

              {/* EKG decoration */}
              <div className="w-full h-4 flex justify-center opacity-5 z-0">
                <svg className="w-64 h-full" viewBox="0 0 200 40">
                  <path
                    d="M 0 20 L 50 20 L 60 10 L 70 30 L 75 20 L 95 20 L 100 0 L 105 40 L 110 20 L 130 20 L 140 10 L 150 30 L 155 20 L 200 20"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1"
                  />
                </svg>
              </div>
            </section>

            {/* QR CODE SECTION — large, wall-visible */}
            <section className="glass-panel p-5 rounded-2xl border border-slate-800/80 flex items-center gap-6 bg-slate-950/20">
              {/* Text side */}
              <div className="flex-grow space-y-2 min-w-0">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone size={16} className="text-indigo-400 shrink-0" />
                  Track Your Queue on Phone
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Scan the QR code with your smartphone camera to open the live queue tracker. See your position, ETA, and wait status — without standing in the corridor.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold pt-1">
                  <Info size={11} className="text-indigo-400/80 shrink-0" />
                  <span className="font-mono text-indigo-400/70 truncate">{trackUrl || 'Loading URL…'}</span>
                </div>
              </div>

              {/* Real QR Code — large enough for across-room scanning */}
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <div className="p-3 bg-white rounded-2xl shadow-[0_0_25px_rgba(99,102,241,0.15)]">
                  {trackUrl ? (
                    <QRCodeSVG
                      value={trackUrl}
                      size={160}
                      fgColor="#111827"
                      bgColor="#ffffff"
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-40 h-40 bg-slate-100 rounded-xl animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center leading-tight">
                  Scan to track your<br />queue on your phone
                </span>
              </div>
            </section>
          </div>

          {/* RIGHT: UPCOMING QUEUE BOARD (12 tokens) */}
          <section className="lg:col-span-5 glass-panel p-5 rounded-3xl border border-slate-800 flex flex-col min-h-[460px]">
            <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-slate-800/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users size={16} className="text-indigo-400" />
                Next in Queue
                {waitingList.length > 0 && (
                  <span className="ml-1.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {waitingList.length}
                  </span>
                )}
              </h3>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Est. Wait
              </span>
            </div>

            {/* Queue list — up to 12 tokens, auto-scroll */}
            <div className="flex-grow overflow-y-auto space-y-2.5 pr-1 scrollbar-thin" style={{ maxHeight: '520px' }}>
              <AnimatePresence initial={false}>
                {waitingList.length > 0 ? (
                  waitingList.slice(0, 12).map((patient, idx) => {
                    const light = getTrafficLight(patient.estimatedWaitTime);
                    const priority = getFriendlyPriority(patient.priority);
                    return (
                      <motion.div
                        key={patient.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: idx * 0.03 }}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          idx === 0
                            ? 'bg-indigo-500/8 border-indigo-500/25 shadow-[0_0_12px_rgba(99,102,241,0.06)]'
                            : 'bg-slate-900/30 border-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          {/* Position number */}
                          <span className="text-[10px] font-black text-slate-600 w-5 text-center shrink-0">
                            {idx + 1}
                          </span>
                          {/* Token */}
                          <span
                            className={`text-lg font-black font-mono tracking-wider shrink-0 ${
                              idx === 0 ? 'text-indigo-300' : 'text-white'
                            }`}
                          >
                            {patient.token}
                          </span>
                          <span className="text-sm font-semibold text-slate-300 truncate">
                            {patient.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Traffic light */}
                          <span
                            className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-extrabold tracking-wide ${light.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${light.dot}`} />
                            {light.text}
                          </span>

                          {/* Priority badge — hidden on smaller right panel */}
                          <span
                            className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border tracking-wide hidden xl:inline-block ${priority.color}`}
                          >
                            {priority.label}
                          </span>

                          {/* ETA */}
                          <span className="text-xs font-mono font-bold text-indigo-400 w-14 text-right shrink-0">
                            {idx === 0 ? 'Next ↑' : `${Math.round(patient.estimatedWaitTime / 60)} min`}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm font-semibold italic py-20 gap-2">
                    <Activity size={20} className="text-slate-600 animate-pulse" />
                    <span>No patients waiting.</span>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Overflow indicator */}
            {waitingList.length > 12 && (
              <div className="mt-3 pt-3 border-t border-slate-800/50 text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  + {waitingList.length - 12} more patients registered
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-7xl mx-auto mt-5 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-500 text-xs font-semibold">
        <span className="uppercase tracking-widest text-[10px] font-bold text-indigo-400/80 flex items-center gap-1.5 animate-pulse">
          <Activity size={12} />
          Live OPD Ticker — Please wait for your token to be announced
        </span>
        <span className="text-slate-500 text-center">
          Thank you for your patience. Inform receptionist for priority care updates.
        </span>
      </footer>
    </main>
  );
}

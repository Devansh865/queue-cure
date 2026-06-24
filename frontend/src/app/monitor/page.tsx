'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket, useCabinOverview, PatientCallAlert, QueueState } from '../../hooks/useSocket';
import { QRCodeSVG } from 'qrcode.react';
import {
  Tv, Activity, Volume2, Clock, Users, AlertOctagon, MicOff,
  Stethoscope, Smartphone, CheckCircle, Megaphone, CheckCircle2, Hourglass,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import canvasConfetti from 'canvas-confetti';

// ─── Cabin order ─────────────────────────────────────────────────────────────
const CABIN_ORDER = ['cabin-01', 'cabin-02', 'cabin-03'] as const;

// ─── Traffic light helper (shared across lobby + single-cabin views) ──────────
export function getTrafficLight(waitTimeSeconds: number) {
  const minutes = Math.round(waitTimeSeconds / 60);
  if (minutes <= 10)
    return {
      emoji: '🟢',
      label: 'Expected Soon',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      dot: 'bg-emerald-400',
      pulse: true,
    };
  if (minutes <= 25)
    return {
      emoji: '🟡',
      label: 'Moderate Wait',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      dot: 'bg-amber-400',
      pulse: false,
    };
  return {
    emoji: '🔴',
    label: 'Busy Right Now',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    dot: 'bg-rose-400',
    pulse: false,
  };
}

// ─── Global announcement queue ────────────────────────────────────────────────
// Uses onend/onerror callbacks to guarantee sequential, non-overlapping speech.
// Never calls speechSynthesis.cancel() mid-play.

interface QueuedAnnouncement {
  text: string;
  token: string;
  cabinLabel: string;
  doctorName: string;
  onQueued?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
}

class AnnouncementQueue {
  private queue: QueuedAnnouncement[] = [];
  private isProcessing = false;
  private loadedVoices: SpeechSynthesisVoice[] = [];

  preloadVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      this.loadedVoices = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
  }

  enqueue(ann: QueuedAnnouncement) {
    this.queue.push(ann);
    ann.onQueued?.();
    if (!this.isProcessing) this.processNext();
  }

  private processNext() {
    if (this.queue.length === 0) { this.isProcessing = false; return; }
    this.isProcessing = true;
    const ann = this.queue.shift()!;
    ann.onStart?.();
    try {
      const utterance = new SpeechSynthesisUtterance(ann.text);
      utterance.volume = 1; utterance.rate = 0.82; utterance.pitch = 1.05; utterance.lang = 'en-IN';
      const preferred =
        this.loadedVoices.find(v => v.lang === 'en-IN') ||
        this.loadedVoices.find(v => v.lang.startsWith('en-US')) ||
        this.loadedVoices.find(v => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;
      utterance.onend  = () => { ann.onComplete?.(); this.processNext(); };
      utterance.onerror = () => { ann.onComplete?.(); this.processNext(); };
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error', e);
      ann.onComplete?.();
      this.processNext();
    }
  }

  get queueLength() { return this.queue.length; }
  get playing() { return this.isProcessing; }
}

// Singleton — one instance per monitor page session
const announcementQueue = new AnnouncementQueue();

// ─── Chime ────────────────────────────────────────────────────────────────────
function playChime() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc1 = ctx.createOscillator(); const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(); osc2.start();
    osc1.stop(ctx.currentTime + 0.9); osc2.stop(ctx.currentTime + 0.9);
  } catch (e) { console.warn('Chime error', e); }
}

// ─── Announcement log types ───────────────────────────────────────────────────
interface AnnLogEntry {
  id: string;
  token: string;
  cabinLabel: string;
  doctorName: string;
  status: 'queued' | 'playing' | 'completed';
  timestamp: number;
}

// ─── Duration formatter ───────────────────────────────────────────────────────
function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Lobby Cabin Card ─────────────────────────────────────────────────────────
function CabinCard({ cabinState }: { cabinState: QueueState }) {
  const { active, waiting, roomInfo, isDelayed, averageConsultationTime, manualDelaySeconds } = cabinState;
  const hasManualDelay = (manualDelaySeconds ?? 0) > 0;

  const statusColor =
    roomInfo.status === 'delayed'  ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
    roomInfo.status === 'busy'     ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  const progress = active ? Math.min(100, Math.round((active.elapsedTime / (averageConsultationTime * 60)) * 100)) : 0;

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 flex flex-col h-full overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800/60 shrink-0 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 truncate">{roomInfo.roomNumber}</p>
          <p className="text-xs font-bold text-white truncate">Dr. {roomInfo.doctorName}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasManualDelay && (
            <span className="text-[8px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Clock size={8} /> +{Math.round((manualDelaySeconds ?? 0) / 60)}m
            </span>
          )}
          {isDelayed && (
            <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-[8px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <AlertOctagon size={8} /> Delay
            </motion.span>
          )}
          <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border ${statusColor}`}>
            {roomInfo.status}
          </span>
        </div>
      </div>

      {/* Now Serving */}
      <div className="flex flex-col items-center justify-center px-4 py-3 shrink-0 border-b border-slate-800/40">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Now Serving</span>
        {active ? (
          <motion.div key={active.token} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center w-full">
            <p className="text-4xl font-black font-mono tracking-wider text-indigo-400 leading-none">{active.token}</p>
            <p className="text-xs font-semibold text-slate-300 mt-1 truncate">{active.name}</p>
            <div className="mt-1.5 w-full bg-slate-900/60 rounded-full h-1 border border-slate-800 overflow-hidden max-w-[160px] mx-auto">
              <motion.div className={`h-full rounded-full ${isDelayed ? 'bg-rose-500' : 'bg-indigo-500'}`}
                initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
            </div>
            <p className="text-[8px] text-slate-500 font-mono mt-0.5">{formatDuration(active.elapsedTime)}</p>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-1 py-1">
            <CheckCircle size={18} className="text-emerald-500/60" />
            <p className="text-xs font-semibold text-emerald-400">Available</p>
            <p className="text-[9px] text-slate-500">Ready for next patient</p>
          </div>
        )}
      </div>

      {/* Queue list — fixed height, scrollable */}
      <div className="flex flex-col flex-1 min-h-0 px-3 py-2">
        <div className="flex justify-between items-center mb-1.5 shrink-0">
          <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Users size={9} /> Waiting
          </span>
          {waiting.length > 0 && (
            <span className="bg-indigo-500/15 text-indigo-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-indigo-500/20">
              {waiting.length}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 scrollbar-thin pr-0.5">
          <AnimatePresence initial={false}>
            {waiting.length > 0 ? (
              waiting.slice(0, 8).map((patient, idx) => {
                const light = getTrafficLight(patient.estimatedWaitTime);
                return (
                  <motion.div key={patient.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg border ${
                      idx === 0 ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-slate-900/20 border-slate-800/60'
                    }`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[7px] text-slate-600 font-bold shrink-0">#{idx+1}</span>
                      <span className={`font-black font-mono text-[10px] tracking-wide shrink-0 ${idx===0?'text-indigo-300':'text-white'}`}>{patient.token}</span>
                      <span className="text-slate-400 text-[9px] truncate">{patient.name}</span>
                    </div>
                    {/* Traffic light badge with ETA */}
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-bold shrink-0 ${light.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${light.dot} ${light.pulse ? 'animate-pulse' : ''}`} />
                      {idx === 0 ? 'Next' : `${Math.round(patient.estimatedWaitTime/60)}m`}
                    </span>
                  </motion.div>
                );
              })
            ) : (
              // Positive empty state
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-1.5">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <p className="text-[9px] font-bold text-emerald-400">No patients waiting</p>
                <p className="text-[8px] text-slate-500 mt-0.5">Ready for next consultation</p>
              </div>
            )}
          </AnimatePresence>
          {waiting.length > 8 && (
            <div className="text-center text-[7px] text-slate-600 font-bold uppercase pt-1">
              +{waiting.length - 8} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Announcement Log Strip ───────────────────────────────────────────────────
function AnnouncementLogStrip({ entries }: { entries: AnnLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin px-1">
      <Megaphone size={11} className="text-indigo-400 shrink-0" />
      <AnimatePresence initial={false}>
        {entries.slice(0, 5).map(e => (
          <motion.div key={e.id}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-bold uppercase whitespace-nowrap shrink-0 ${
              e.status === 'playing'   ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse' :
              e.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              'bg-slate-900/40 border-slate-800 text-slate-500'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              e.status === 'playing' ? 'bg-amber-400 animate-pulse' :
              e.status === 'completed' ? 'bg-emerald-400' : 'bg-slate-600'
            }`} />
            {e.token}
            <span className="text-[7px] opacity-70">
              {e.status === 'queued' ? '· queued' : e.status === 'playing' ? '· playing' : '· done'}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Lobby Monitor ────────────────────────────────────────────────────────────
function LobbyMonitor() {
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const s = localStorage.getItem('qc_voiceEnabled');
    return s === null ? true : s === 'true';
  });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showAudioBanner, setShowAudioBanner] = useState(true);
  const [timeStr, setTimeStr] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const [annLog, setAnnLog] = useState<AnnLogEntry[]>([]);
  const announcedTokens = useRef<Set<string>>(new Set());
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  useEffect(() => { setTrackUrl(`${window.location.origin}/track`); }, []);
  useEffect(() => { announcementQueue.preloadVoices(); }, []);

  const addAnnLog = (entry: Omit<AnnLogEntry, 'id'>) =>
    setAnnLog(prev => [{ ...entry, id: `ann_${Date.now()}_${Math.random().toString(36).substr(2,4)}` }, ...prev].slice(0, 8));

  const updateAnnLog = (token: string, status: AnnLogEntry['status']) =>
    setAnnLog(prev => prev.map(e => e.token === token && e.status !== 'completed' ? { ...e, status } : e));

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem('qc_voiceEnabled', String(next));
    if (next) playChime();
  };

  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    try { const c = new (window.AudioContext || (window as any).webkitAudioContext)(); c.resume().then(() => c.close()); } catch (_) {}
    try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); window.speechSynthesis.cancel(); } catch (_) {}
    setAudioUnlocked(true); setShowAudioBanner(false);
  }, [audioUnlocked]);

  useEffect(() => {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => { window.removeEventListener('click', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
  }, [unlockAudio]);

  const handlePatientCalled = useCallback((payload: PatientCallAlert) => {
    if (announcedTokens.current.has(payload.token)) return;
    announcedTokens.current.add(payload.token);
    canvasConfetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
    playChime();
    if (!voiceEnabledRef.current) return;
    const spokenToken = payload.token.replace('QC-', '').split('').join(' ');
    const text = `Attention please. Token Q C ${spokenToken}. Please proceed to ${payload.cabinLabel}, Doctor ${payload.doctorName}.`;
    announcementQueue.enqueue({
      text,
      token: payload.token,
      cabinLabel: payload.cabinLabel,
      doctorName: payload.doctorName,
      onQueued:   () => addAnnLog({ token: payload.token, cabinLabel: payload.cabinLabel, doctorName: payload.doctorName, status: 'queued', timestamp: Date.now() }),
      onStart:    () => updateAnnLog(payload.token, 'playing'),
      onComplete: () => updateAnnLog(payload.token, 'completed'),
    });
  }, []);

  const { isConnected, cabinsState } = useCabinOverview(handlePatientCalled);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const cabins = cabinsState?.cabins ?? {};

  return (
    <main className="h-screen max-h-screen relative overflow-hidden bg-[#080c14] text-slate-100 flex flex-col p-3 md:p-4">
      <div className="medical-grid" />

      <AnimatePresence>
        {showAudioBanner && !audioUnlocked && (
          <motion.div initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -60 }}
            onClick={unlockAudio}
            className="fixed top-0 left-0 right-0 z-50 cursor-pointer bg-indigo-700 text-white text-sm font-bold py-3 px-6 flex items-center justify-center gap-3 shadow-lg">
            <Volume2 size={18} className="shrink-0 animate-pulse" />
            Click once to enable voice announcements
            <Volume2 size={18} className="shrink-0 animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col h-full gap-3">

        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-800/60 pb-2.5 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="flex items-center justify-center bg-transparent rounded-xl shadow-md overflow-hidden">
              <img src="/logo.png" alt="Logo" className="h-8 w-auto drop-shadow-md" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                PulseQueue
              </h1>
              <p className="text-[8px] text-slate-500 font-semibold tracking-wider uppercase">Clinic Lobby Display</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleVoice}
              className={`glass-panel px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 border transition-all ${
                voiceEnabled ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400' : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}>
              {voiceEnabled ? <Volume2 size={11} className="animate-bounce" /> : <MicOff size={11} />}
              SPEECH: {voiceEnabled ? 'ON' : 'MUTED'}
            </button>
            <div className="glass-panel px-3 py-1.5 rounded-xl text-xs font-mono text-slate-300 flex items-center gap-1.5 border border-slate-800/60">
              <Clock size={12} className="text-slate-500" />
              {timeStr || '--:--:--'}
            </div>
            <div className="glass-panel px-3 py-1.5 rounded-xl text-[10px] font-semibold flex items-center gap-1.5 border border-slate-800/60">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </div>
          </div>
        </header>

        {/* 3-cabin grid — fills all remaining space */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-0">
          {CABIN_ORDER.map((cabinId) => {
            const state = cabins[cabinId];
            if (!state)
              return (
                <div key={cabinId} className="glass-panel rounded-2xl border border-slate-800 flex items-center justify-center text-slate-600 text-xs">
                  <Activity size={16} className="animate-pulse mr-2" /> Connecting…
                </div>
              );
            return <CabinCard key={cabinId} cabinState={state} />;
          })}
        </div>

        {/* QR + announcement log row */}
        <div className="glass-panel rounded-2xl border border-slate-800/80 px-4 py-3 flex items-center gap-5 shrink-0">
          <div className="p-2 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] shrink-0">
            {trackUrl ? (
              <QRCodeSVG value={trackUrl} size={90} fgColor="#080c14" bgColor="#ffffff" level="M" includeMargin={false} />
            ) : (
              <div className="w-[90px] h-[90px] bg-slate-100 rounded-lg animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mb-0.5">
                <Smartphone size={12} className="text-indigo-400 shrink-0" />
                Track Your Queue on Your Phone
              </h4>
              <p className="text-[10px] text-slate-400">Wait in your car, garden, or cafeteria. Live updates on your device.</p>
            </div>
            {/* Announcement log */}
            <AnnouncementLogStrip entries={annLog} />
          </div>
        </div>

        {/* Marquee */}
        <div className="relative w-full overflow-hidden bg-slate-950/40 border-t border-slate-800/40 py-1.5 shrink-0">
          <div className="flex animate-marquee whitespace-nowrap gap-12 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {['Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
              'Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
              'Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
            ].map((text, idx) => (
              <span key={idx} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-indigo-500 shrink-0" />{text}
              </span>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

// ─── Per-Cabin Monitor ────────────────────────────────────────────────────────
function SingleCabinMonitor({ cabinId }: { cabinId: string }) {
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const s = localStorage.getItem('qc_voiceEnabled');
    return s === null ? true : s === 'true';
  });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showAudioBanner, setShowAudioBanner] = useState(true);
  const [timeStr, setTimeStr] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const [annLog, setAnnLog] = useState<AnnLogEntry[]>([]);
  const announcedTokens = useRef<Set<string>>(new Set());
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  useEffect(() => { setTrackUrl(`${window.location.origin}/track`); }, []);
  useEffect(() => { announcementQueue.preloadVoices(); }, []);

  const addAnnLog = (entry: Omit<AnnLogEntry, 'id'>) =>
    setAnnLog(prev => [{ ...entry, id: `ann_${Date.now()}_${Math.random().toString(36).substr(2,4)}` }, ...prev].slice(0, 8));

  const updateAnnLog = (token: string, status: AnnLogEntry['status']) =>
    setAnnLog(prev => prev.map(e => e.token === token && e.status !== 'completed' ? { ...e, status } : e));

  const toggleVoice = () => {
    const next = !voiceEnabled; setVoiceEnabled(next);
    localStorage.setItem('qc_voiceEnabled', String(next));
    if (next) playChime();
  };

  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    try { const c = new (window.AudioContext || (window as any).webkitAudioContext)(); c.resume().then(() => c.close()); } catch (_) {}
    try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); window.speechSynthesis.cancel(); } catch (_) {}
    setAudioUnlocked(true); setShowAudioBanner(false);
  }, [audioUnlocked]);

  useEffect(() => {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => { window.removeEventListener('click', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
  }, [unlockAudio]);

  const handlePatientCalled = useCallback((payload: PatientCallAlert) => {
    if (announcedTokens.current.has(payload.token)) return;
    announcedTokens.current.add(payload.token);
    canvasConfetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
    playChime();
    if (!voiceEnabledRef.current) return;
    const spokenToken = payload.token.replace('QC-', '').split('').join(' ');
    const text = `Attention please. Token Q C ${spokenToken}. Please proceed to ${payload.cabinLabel}, Doctor ${payload.doctorName}.`;
    announcementQueue.enqueue({
      text, token: payload.token, cabinLabel: payload.cabinLabel, doctorName: payload.doctorName,
      onQueued:   () => addAnnLog({ token: payload.token, cabinLabel: payload.cabinLabel, doctorName: payload.doctorName, status: 'queued', timestamp: Date.now() }),
      onStart:    () => updateAnnLog(payload.token, 'playing'),
      onComplete: () => updateAnnLog(payload.token, 'completed'),
    });
  }, []);

  const { isConnected, queueState } = useSocket(cabinId, handlePatientCalled);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activePatient = queueState?.active ?? null;
  const waitingList   = queueState?.waiting || [];
  const roomInfo      = queueState?.roomInfo;
  const doctorName    = roomInfo?.doctorName || 'Doctor';
  const roomNumber    = roomInfo?.roomNumber || cabinId;
  const manualDelay   = queueState?.manualDelaySeconds ?? 0;

  const getConsultationProgress = () => {
    if (!activePatient || !queueState) return 0;
    return Math.min(100, Math.round((activePatient.elapsedTime / (queueState.averageConsultationTime * 60)) * 100));
  };

  const getFriendlyPriority = (priority: string) => {
    if (priority === 'emergency') return { label: 'Immediate', color: 'border-rose-500/30 text-rose-400 bg-rose-500/5' };
    if (priority === 'urgent')    return { label: 'Priority',  color: 'border-amber-500/30 text-amber-400 bg-amber-500/5' };
    return { label: 'Standard', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' };
  };

  const formatWaitFactor = (factor: { label: string; minutes: number }) => {
    const lbl = factor.label.toLowerCase();
    const minStr = factor.minutes > 0 ? `+${factor.minutes}` : `${factor.minutes}`;
    if (lbl.includes('overrun')) return `${minStr} min — active session overrun`;
    if (lbl.includes('remaining')) return `${minStr} min — active consultation remaining`;
    if (lbl.includes('emergency')) return `${minStr} min — emergency triage priority`;
    if (lbl.includes('urgent')) return `${minStr} min — urgent triage priority`;
    return `${minStr} min — ${lbl}`;
  };

  return (
    <main className="h-screen max-h-screen relative overflow-hidden bg-[#080c14] text-slate-100 p-4 md:p-6 flex flex-col">
      <div className="medical-grid" />

      <AnimatePresence>
        {showAudioBanner && !audioUnlocked && (
          <motion.div initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -60 }}
            onClick={unlockAudio}
            className="fixed top-0 left-0 right-0 z-50 cursor-pointer bg-indigo-700 text-white text-sm font-bold py-3 px-6 flex items-center justify-center gap-3 shadow-lg">
            <Volume2 size={18} className="shrink-0 animate-pulse" />
            Click once to enable voice announcements
            <Volume2 size={18} className="shrink-0 animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-7xl mx-auto w-full flex flex-col gap-4 flex-1 min-h-0">

        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 pb-3 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="flex items-center justify-center bg-transparent rounded-2xl shadow-md overflow-hidden"><img src="/logo.png" alt="Logo" className="h-10 w-auto drop-shadow-md" /></span>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">PulseQueue</h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">{roomNumber} · Dr. {doctorName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={toggleVoice}
              className={`glass-panel px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                voiceEnabled ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-400' : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}>
              {voiceEnabled ? <Volume2 size={13} className="animate-bounce" /> : <MicOff size={13} />}
              SPEECH: {voiceEnabled ? 'ON' : 'MUTED'}
            </button>
            <div className="glass-panel px-4 py-2 rounded-xl text-sm font-mono text-slate-300 flex items-center gap-2 border border-slate-800/60">
              <Clock size={14} className="text-slate-500" />{timeStr || '--:--:--'}
            </div>
            <div className="glass-panel px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-800/60">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isConnected ? '🟢 LIVE' : '🔴 OFFLINE'}
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">

          {/* LEFT: Now Serving */}
          <div className="lg:col-span-8 flex flex-col gap-4 min-h-0 h-full">
            <section className="glass-panel p-8 rounded-3xl border border-slate-800 flex flex-col justify-between items-center text-center relative overflow-hidden flex-1 min-h-0 bg-slate-900/10">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-slate-800 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-slate-800 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-slate-800 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-slate-800 rounded-br-xl" />

              <div className="w-full flex justify-between items-center z-10">
                <div className="text-left">
                  <span className="text-xs font-black text-indigo-400 uppercase tracking-widest block">NOW SERVING</span>
                  <span className="text-[10px] font-bold text-slate-500 block -mt-0.5">अभी सेवा में</span>
                </div>
                <div className="flex items-center gap-2">
                  {manualDelay > 0 && (
                    <motion.span animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                      className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
                      <Hourglass size={12} /> +{Math.round(manualDelay / 60)}m Manual Delay
                    </motion.span>
                  )}
                  {queueState?.isDelayed && (
                    <motion.span animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
                      <AlertOctagon size={13} /> Doctor Delayed
                    </motion.span>
                  )}
                </div>
              </div>

              {activePatient ? (
                <div className="my-auto z-10 w-full py-4">
                  <motion.div key={activePatient.token} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }} className="space-y-4">
                    <h2 className="text-9xl md:text-[9.5rem] font-black text-indigo-400 tracking-wider font-mono leading-none">
                      {activePatient.token}
                    </h2>
                    <div className="space-y-1">
                      <p className="text-3xl font-extrabold text-white tracking-wide">{activePatient.name}</p>
                      <p className="text-sm text-slate-400 font-semibold flex items-center justify-center gap-1.5">
                        <Stethoscope size={14} className="text-indigo-400" />
                        Please proceed to {roomNumber} (Dr. {doctorName})
                      </p>
                    </div>
                    <div className="max-w-md mx-auto pt-4 space-y-2 border-t border-slate-800/40">
                      <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <span>Session Duration</span>
                        <span className="font-mono text-slate-400">{formatDuration(activePatient.elapsedTime)}</span>
                      </div>
                      <div className="w-full bg-slate-900/60 rounded-full h-2 border border-slate-800 overflow-hidden">
                        <motion.div className={`h-full rounded-full ${queueState?.isDelayed ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          initial={{ width: 0 }} animate={{ width: `${getConsultationProgress()}%` }} transition={{ duration: 0.5 }} />
                      </div>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="space-y-3 my-auto z-10">
                  <div className="inline-flex p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <CheckCircle2 size={40} className="text-emerald-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-emerald-400 tracking-wider">Available</h2>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">No active consultation. Ready for next patient.</p>
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
              <section className="glass-panel p-5 rounded-2xl border border-slate-800/80">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Why Wait Time Changed</h4>
                <div className="space-y-2.5">
                  {queueState?.waitFactors && queueState.waitFactors.length > 0 ? (
                    queueState.waitFactors.map((factor, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs border-b border-slate-800/40 pb-1.5">
                        <span className="text-slate-300 font-medium pr-2">{formatWaitFactor(factor)}</span>
                        <span className={`font-mono font-bold shrink-0 ${factor.minutes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {factor.minutes > 0 ? `+${factor.minutes}` : factor.minutes} min
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No wait time modifications currently active.</p>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-3 border-t border-slate-800/40 pt-2 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
                  Powered by smart clinic flow metrics
                </div>
              </section>

              <section className="glass-panel p-5 rounded-2xl border border-slate-800/80">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Stethoscope size={14} className="text-indigo-400" /> Clinic Information
                </h4>
                <div className="space-y-2 text-xs">
                  {[
                    ['Clinician', `Dr. ${doctorName}`],
                    ['Cabin', roomNumber],
                    ['Clinic Hours', '9:00 AM – 5:00 PM'],
                    ["Today's Avg Wait", `${queueState ? Math.max(5, Math.round(queueState.stats.averageWaitTime/60)) || 12 : 12} min`],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="flex justify-between border-b border-slate-800/40 pb-1.5">
                      <span className="text-slate-500">{lbl}:</span>
                      <span className="text-white font-semibold">{val}</span>
                    </div>
                  ))}
                </div>
                {/* Announcement log in per-cabin view */}
                {annLog.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/40">
                    <AnnouncementLogStrip entries={annLog} />
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* RIGHT: Queue + QR */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 h-full">
            <section className="glass-panel p-5 rounded-3xl border border-slate-800 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-slate-800/40 shrink-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Users size={16} className="text-indigo-400" /> Next in Queue
                  {waitingList.length > 0 && (
                    <span className="ml-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {waitingList.length}
                    </span>
                  )}
                </h3>
                <span className="text-[9px] text-slate-500 font-bold uppercase">Est. Wait</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {waitingList.length > 0 ? (
                    waitingList.slice(0, 8).map((patient, idx) => {
                      const light = getTrafficLight(patient.estimatedWaitTime);
                      const priority = getFriendlyPriority(patient.priority);
                      return (
                        <motion.div key={patient.id}
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`p-2.5 rounded-xl border flex items-center justify-between ${
                            idx === 0 ? 'bg-indigo-500/5 border-indigo-500/25' : 'bg-slate-900/20 border-slate-800'
                          }`}>
                          <div className="flex flex-col min-w-0 flex-grow">
                            <div className="flex items-center space-x-2">
                              <span className="text-[9px] font-black text-slate-600 shrink-0">#{idx+1}</span>
                              <span className={`text-base font-black font-mono tracking-wider shrink-0 ${idx===0?'text-indigo-300':'text-white'}`}>{patient.token}</span>
                              <span className="text-xs font-semibold text-slate-300 truncate">{patient.name}</span>
                            </div>
                            {/* Traffic light badge */}
                            <div className="mt-1 flex items-center gap-1.5 pl-5">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-extrabold ${light.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${light.dot} ${light.pulse ? 'animate-pulse' : ''}`} />
                                {light.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 ml-2">
                            {patient.priority !== 'normal' && (
                              <span className={`text-[8px] font-extrabold uppercase px-1 py-0.5 rounded border mb-1 ${priority.color}`}>
                                {priority.label}
                              </span>
                            )}
                            <span className="text-sm font-mono font-black text-indigo-400 w-12 text-right">
                              {idx === 0 ? 'Next' : `${Math.round(patient.estimatedWaitTime/60)} min`}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    // Positive empty state for queue panel
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                        <CheckCircle2 size={28} className="text-emerald-400" />
                      </div>
                      <p className="text-sm font-bold text-emerald-400">No patients waiting</p>
                      <p className="text-xs text-slate-500">Ready for next consultation</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
              {waitingList.length > 8 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-800/40 text-center shrink-0">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">+{waitingList.length-8} more registered</span>
                </div>
              )}
            </section>

            <section className="glass-panel p-5 rounded-2xl border border-slate-800/80 flex flex-col items-center gap-3 text-center shrink-0">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Smartphone size={14} className="text-indigo-400 shrink-0" /> Track your queue
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Wait anywhere. Live updates on your phone.</p>
              </div>
              <div className="p-3 bg-white rounded-2xl shadow-[0_4px_25px_rgba(0,0,0,0.3)] shrink-0">
                {trackUrl ? (
                  <QRCodeSVG value={trackUrl} size={130} fgColor="#080c14" bgColor="#ffffff" level="M" includeMargin={false} />
                ) : (
                  <div className="w-[130px] h-[130px] bg-slate-100 rounded-xl animate-pulse" />
                )}
              </div>
              <p className="text-[9px] text-slate-500 font-semibold">Powered by PulseQueue</p>
            </section>
          </div>
        </div>

        {/* Marquee */}
        <div className="relative w-full overflow-hidden bg-slate-950/40 border-t border-slate-800/40 py-2 shrink-0">
          <div className="flex animate-marquee whitespace-nowrap gap-16 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {['Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
              'Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
              'Please keep your prescription ready', 'You have not been skipped', 'Your ETA updates automatically', 'Thank you for your patience',
            ].map((text, idx) => (
              <span key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />{text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Root — routes by ?cabin= query param ────────────────────────────────────
export default function PatientMonitor() {
  const [cabinParam, setCabinParam] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('cabin');
    setCabinParam(p);
    setResolved(true);
  }, []);
  if (!resolved) return null;
  return cabinParam ? <SingleCabinMonitor cabinId={cabinParam} /> : <LobbyMonitor />;
}

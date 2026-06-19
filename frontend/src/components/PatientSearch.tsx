'use client';

import React, { useState } from 'react';
import { QueueState, Patient } from '../hooks/useSocket';
import { Search, Clock, Users, ArrowRight, ShieldCheck, AlertTriangle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PatientSearchProps {
  queueState: QueueState | null;
}

export function PatientSearch({ queueState }: PatientSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<{
    found: boolean;
    patient?: Patient;
    position?: number;
    peopleAhead?: number;
    totalActiveQueue?: number;
    statusText?: string;
    type?: 'waiting' | 'serving' | 'served' | 'skipped' | 'none';
  } | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queueState || !searchTerm.trim()) return;

    const term = searchTerm.trim().toUpperCase();
    const totalActive = (queueState.waiting.length || 0) + (queueState.active ? 1 : 0);

    // 1. Check active patient
    if (queueState.active && (queueState.active.token === term || queueState.active.name.toUpperCase().includes(term))) {
      setSearchResult({
        found: true,
        patient: queueState.active,
        position: 1,
        peopleAhead: 0,
        totalActiveQueue: totalActive,
        statusText: 'It is your turn! Please proceed to the Consultation Room now.',
        type: 'serving'
      });
      return;
    }

    // 2. Check waiting queue
    const waitingIndex = queueState.waiting.findIndex(
      p => p.token === term || p.name.toUpperCase().includes(term)
    );
    if (waitingIndex !== -1) {
      const patient = queueState.waiting[waitingIndex];
      setSearchResult({
        found: true,
        patient,
        position: waitingIndex + (queueState.active ? 2 : 1), // Offset by active patient
        peopleAhead: waitingIndex + (queueState.active ? 1 : 0),
        totalActiveQueue: totalActive,
        statusText: `You are in the waiting list.`,
        type: 'waiting'
      });
      return;
    }

    // 3. Check missed
    const missedPatient = queueState.missed.find(
      p => p.token === term || p.name.toUpperCase().includes(term)
    );
    if (missedPatient) {
      setSearchResult({
        found: true,
        patient: missedPatient,
        statusText: 'Your appointment slot was missed. Please report to the receptionist to be recalled.',
        type: 'skipped'
      });
      return;
    }

    // 4. Check served
    const servedPatient = queueState.served.find(
      p => p.token === term || p.name.toUpperCase().includes(term)
    );
    if (servedPatient) {
      setSearchResult({
        found: true,
        patient: servedPatient,
        statusText: 'Your consultation has been completed. Wishing you good health!',
        type: 'served'
      });
      return;
    }

    // 5. Not found
    setSearchResult({
      found: false,
      type: 'none',
      statusText: 'Token number or Patient name not found. Please double-check with the front desk.'
    });
  };

  // Convert wait times into traffic light indicators
  const getTrafficLightIndicator = (waitTimeSeconds: number) => {
    const minutes = Math.round(waitTimeSeconds / 60);
    if (minutes < 15) {
      return {
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dot: 'bg-emerald-400',
        label: 'Expected Soon',
        text: `${minutes} min`
      };
    } else if (minutes <= 30) {
      return {
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dot: 'bg-amber-400',
        label: 'Moderate Wait',
        text: `${minutes} min`
      };
    } else {
      return {
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        dot: 'bg-rose-400',
        label: 'Busy Right Now',
        text: `${minutes} min`
      };
    }
  };

  // Patient Friendly priority translations
  const getFriendlyPriority = (priority: string) => {
    switch (priority) {
      case 'emergency': return { label: 'Immediate Attention', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
      case 'urgent': return { label: 'Priority Care', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
      default: return { label: 'Standard Priority', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    }
  };

  // SVG circular progress calculation helper
  const radius = 28;
  const stroke = 5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
      <div>
        <h4 className="text-sm font-bold text-white tracking-wide uppercase">Patient Portal</h4>
        <p className="text-xs text-slate-400 mt-0.5">Verify your queue status and dynamic waiting time predictions</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-grow">
          <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-500 pointer-events-none">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Enter Token (e.g. QC-001) or Name"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!e.target.value.trim()) setSearchResult(null);
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 focus:border-indigo-500 focus:outline-none text-white text-xs placeholder-slate-500 transition-all font-mono"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-indigo-600/10"
        >
          Check status <ArrowRight size={12} />
        </button>
      </form>

      <AnimatePresence mode="wait">
        {searchResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-4 border-t border-slate-800/60 overflow-hidden space-y-4"
          >
            {searchResult.found && searchResult.patient ? (
              <div className="space-y-4">
                
                {/* 1. Header with Friendly Triage Indicator */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Patient Ticket</span>
                    <h5 className="text-xl font-bold font-mono text-white leading-none mt-0.5">{searchResult.patient.token}</h5>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Triage Level</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold tracking-wide border capitalize ${getFriendlyPriority(searchResult.patient.priority).color}`}>
                      {getFriendlyPriority(searchResult.patient.priority).label}
                    </span>
                  </div>
                </div>

                {/* Patient Name */}
                <div className="p-3 bg-slate-900/30 border border-slate-850 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Registered Name</span>
                  <p className="text-sm font-semibold text-slate-200 mt-0.5">{searchResult.patient.name}</p>
                </div>

                {/* 2. Lookup States */}
                {searchResult.type === 'serving' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs leading-relaxed">
                    <ShieldCheck size={16} className="text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                    <span className="font-semibold">{searchResult.statusText}</span>
                  </div>
                )}

                {searchResult.type === 'skipped' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs leading-relaxed">
                    <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5 animate-bounce" />
                    <span className="font-semibold">{searchResult.statusText}</span>
                  </div>
                )}

                {searchResult.type === 'served' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs leading-relaxed">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span className="font-semibold">{searchResult.statusText}</span>
                  </div>
                )}

                {searchResult.type === 'waiting' && (
                  <>
                    {/* STATS & CIRCULAR PROGRESS RING */}
                    <div className="grid grid-cols-12 gap-3 items-center bg-slate-900/20 border border-slate-850 p-4 rounded-xl">
                      
                      {/* Circular Progress Ring (SVG) */}
                      <div className="col-span-4 flex flex-col items-center justify-center border-r border-slate-850 pr-2">
                        {(() => {
                          const total = searchResult.totalActiveQueue || 1;
                          const ahead = searchResult.peopleAhead ?? 0;
                          const progress = Math.max(10, Math.round(((total - ahead) / total) * 100));
                          const strokeDashoffset = circumference - (progress / 100) * circumference;

                          return (
                            <div className="relative flex items-center justify-center">
                              <svg className="w-16 h-16 transform -rotate-90">
                                <circle
                                  className="text-slate-800"
                                  strokeWidth={stroke}
                                  stroke="currentColor"
                                  fill="transparent"
                                  r={normalizedRadius}
                                  cx={32}
                                  cy={32}
                                />
                                <circle
                                  className="text-indigo-500"
                                  strokeWidth={stroke}
                                  strokeDasharray={circumference}
                                  strokeDashoffset={strokeDashoffset}
                                  strokeLinecap="round"
                                  stroke="currentColor"
                                  fill="transparent"
                                  r={normalizedRadius}
                                  cx={32}
                                  cy={32}
                                />
                              </svg>
                              <span className="absolute text-[11px] font-mono font-bold text-white">{progress}%</span>
                            </div>
                          );
                        })()}
                        <span className="text-[9px] uppercase font-bold text-slate-500 text-center mt-2.5">Flow Progress</span>
                      </div>

                      {/* Position & Waiting Details */}
                      <div className="col-span-8 space-y-2.5 pl-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-500 block">Queue Position</span>
                            <span className="text-sm font-bold text-white">
                              Position {searchResult.position} of {searchResult.totalActiveQueue}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 block">Estimated Wait</span>
                          {(() => {
                            const indicator = getTrafficLightIndicator(searchResult.patient.estimatedWaitTime);
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${indicator.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${indicator.dot}`} />
                                  {indicator.label}
                                </span>
                                <span className="text-xs font-mono font-bold text-slate-200">
                                  ~ {indicator.text}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                    </div>

                    {/* CONFIDENCE & DYNAMIC WHY WAIT CHANGED */}
                    <div className="space-y-3 pt-1">
                      
                      {/* Confidence indicator */}
                      <div className="flex justify-between items-center text-xs p-3 bg-slate-900/30 border border-slate-850 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-slate-500">ETA Confidence Rating</span>
                        {(() => {
                          const conf = queueState?.confidence || 'high';
                          const color = conf === 'high' ? 'text-emerald-400' : conf === 'medium' ? 'text-amber-400' : 'text-rose-400';
                          return (
                            <span className={`font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 ${color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${conf === 'high' ? 'bg-emerald-400' : conf === 'medium' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                              {conf} Confidence
                            </span>
                          );
                        })()}
                      </div>

                      {/* "Why Wait Time Changed" Panel */}
                      {queueState?.waitFactors && queueState.waitFactors.length > 0 && (
                        <div className="p-4 bg-slate-900/40 border border-slate-850/80 rounded-xl space-y-2">
                          <h6 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                            <Clock size={11} className="text-indigo-400" /> Why Wait Time Changed
                          </h6>
                          <div className="space-y-1.5 pt-1">
                            {queueState.waitFactors.map((factor, index) => (
                              <div key={index} className="flex justify-between items-center text-[11px] text-slate-400">
                                <span>{factor.label}</span>
                                <span className="font-mono font-bold text-indigo-400">+{factor.minutes} min</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-500 leading-relaxed pt-1.5 border-t border-slate-850/60">
                            *Wait factors compute session runtimes, clinician delay states, and triage priority slots.
                          </p>
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-850 text-slate-400 text-xs">
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <span>{searchResult.statusText}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

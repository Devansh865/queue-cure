'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Patient, Priority } from '../hooks/useSocket';
import { Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface VisualTimelineProps {
  waiting: Patient[];
  active: Patient | null;
}

export function VisualTimeline({ waiting, active }: VisualTimelineProps) {
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'emergency': return 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]';
      case 'urgent': return 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]';
      default: return 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]';
    }
  };

  const getPriorityBorder = (priority: Priority) => {
    switch (priority) {
      case 'emergency': return 'border-rose-500/30';
      case 'urgent': return 'border-amber-500/30';
      default: return 'border-emerald-500/30';
    }
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds <= 0) return 'Next Up';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <div className="relative glass-panel p-6 rounded-2xl border border-slate-800 overflow-hidden w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 heartbeat-dot" />
          <h4 className="text-sm font-semibold tracking-wide text-white uppercase">Live Queue Flow Timeline</h4>
        </div>
        <span className="text-xs text-slate-500 font-medium">Auto-arranges by priority</span>
      </div>

      <div className="relative flex items-center min-h-[140px] overflow-x-auto pb-4 pt-2 scrollbar-thin">
        {/* Timeline Path Line */}
        <div className="absolute left-6 right-6 top-[54px] h-0.5 bg-gradient-to-r from-indigo-500/50 via-slate-800 to-slate-900 z-0" />

        <div className="flex space-x-8 z-10 px-2">
          {/* Active Patient Node */}
          {active && (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center flex-shrink-0"
            >
              <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600/20 border-2 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] z-10">
                <span className="text-sm font-bold text-white tracking-wider">{active.token}</span>
                {/* Active pulse aura */}
                <span className="absolute -inset-1 rounded-full border border-indigo-500/40 animate-ping opacity-75" />
              </div>
              <div className="mt-3 text-center">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center justify-center gap-1">
                  <ShieldCheck size={11} className="animate-pulse" /> Serving
                </p>
                <p className="text-sm font-semibold text-white max-w-[110px] truncate mt-0.5">{active.name}</p>
                <p className="text-[10px] text-slate-500 font-medium">In consultation</p>
              </div>
            </motion.div>
          )}

          {/* Empty Waiting Queue Node (if nothing waiting and active) */}
          {!active && waiting.length === 0 && (
            <div className="flex items-center justify-center w-full min-h-[80px] text-slate-500 text-sm font-medium italic z-10 w-full pl-6">
              Queue is currently empty.
            </div>
          )}

          {/* Waiting Queue Nodes */}
          <AnimatePresence mode="popLayout">
            {waiting.map((patient, index) => (
              <motion.div
                key={patient.id}
                layout
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -50, scale: 0.9 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="flex flex-col items-center flex-shrink-0"
              >
                <div className={`relative flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 border ${getPriorityBorder(patient.priority)} z-10 hover:border-slate-400 transition-colors duration-200`}>
                  <span className="text-xs font-bold text-slate-300 tracking-wider">{patient.token}</span>
                  
                  {/* Priority Color Dot */}
                  <span className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border border-slate-950 flex items-center justify-center ${getPriorityColor(patient.priority)}`} />
                </div>
                <div className="mt-4 text-center">
                  <p className="text-xs font-medium text-slate-400 max-w-[100px] truncate">{patient.name}</p>
                  
                  <div className="flex items-center justify-center space-x-1 mt-0.5 text-indigo-400">
                    <Clock size={10} />
                    <span className="text-[10px] font-semibold">
                      {formatWaitTime(patient.estimatedWaitTime)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

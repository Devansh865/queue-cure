'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, ShieldAlert, Cpu, HeartPulse, Sparkles, Monitor, ClipboardCheck } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 md:p-12">
      {/* Medical Grid Overlay */}
      <div className="medical-grid" />

      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-4xl w-full text-center space-y-12">
        {/* LOGO & TITLE */}
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="inline-flex p-3.5 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl text-indigo-400 mb-2 hover:scale-105 transition-transform"
          >
            <HeartPulse size={40} className="animate-pulse" />
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-4xl md:text-6xl font-black tracking-tight"
          >
            PulseQueue
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-sm md:text-base text-slate-400 max-w-xl mx-auto font-medium"
          >
            A high-fidelity clinical queue command center. Synchronized in real-time with smart ETA prediction models and delay-mitigation alerts.
          </motion.p>
        </div>

        {/* WORKSPACE NAVIGATION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          
          {/* CARD 1: RECEPTIONIST OPERATING CONSOLE */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="glass-panel p-8 rounded-3xl border border-slate-800 flex flex-col justify-between text-left group hover:border-indigo-500/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] transition-all duration-300 transform hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl w-fit group-hover:scale-110 transition-transform">
                <ClipboardCheck size={26} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">Receptionist Console</h3>
                <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-medium">
                  Register patients, update average session durations, trigger instant triage caller, skipped patient recall, and view operational analytics logs.
                </p>
              </div>
            </div>

            <div className="pt-8">
              <Link 
                href="/dashboard"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/10 group-hover:shadow-indigo-600/30"
              >
                Launch Reception Dashboard
              </Link>
            </div>
          </motion.div>

          {/* CARD 2: PUBLIC WAITING SCREEN */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="glass-panel p-8 rounded-3xl border border-slate-800 flex flex-col justify-between text-left group hover:border-purple-500/30 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-all duration-300 transform hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-2xl w-fit group-hover:scale-110 transition-transform">
                <Monitor size={26} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors">Patient Display Board</h3>
                <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-medium">
                  High-visibility layout optimized for clinic TV monitors. Includes automatic chime notifications, voice name-callouts, and personal wait-time lookups.
                </p>
              </div>
            </div>

            <div className="pt-8">
              <Link 
                href="/monitor"
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/10 group-hover:shadow-purple-600/30"
              >
                Launch TV Waiting Screen
              </Link>
            </div>
          </motion.div>

        </div>

        {/* KEY FEATURES TICKER */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto border-t border-slate-900"
        >
          <div className="flex items-center justify-center space-x-2 text-slate-400 text-xs font-semibold">
            <Cpu size={14} className="text-indigo-400" />
            <span>Smart ETA predictions</span>
          </div>
          <div className="flex items-center justify-center space-x-2 text-slate-400 text-xs font-semibold">
            <Activity size={14} className="text-emerald-400" />
            <span>Active Triage System</span>
          </div>
          <div className="flex items-center justify-center space-x-2 text-slate-400 text-xs font-semibold">
            <Sparkles size={14} className="text-pink-400" />
            <span>Framer Motion FX</span>
          </div>
          <div className="flex items-center justify-center space-x-2 text-slate-400 text-xs font-semibold">
            <ShieldAlert size={14} className="text-amber-400" />
            <span>Delay Mitigation Engine</span>
          </div>
        </motion.div>

      </div>
    </main>
  );
}

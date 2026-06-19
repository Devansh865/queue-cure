'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'emerald' | 'amber' | 'rose';
  trend?: {
    value: string;
    label: string;
    isPositive?: boolean;
  };
}

export function StatsCard({ 
  title, 
  value, 
  subtext, 
  icon, 
  variant = 'primary',
  trend 
}: StatsCardProps) {
  const getGlowVariant = () => {
    switch (variant) {
      case 'emerald': return 'group-hover:border-emerald-500/30 group-hover:shadow-[0_0_25px_rgba(16,185,129,0.15)]';
      case 'amber': return 'group-hover:border-amber-500/30 group-hover:shadow-[0_0_25px_rgba(245,158,11,0.15)]';
      case 'rose': return 'group-hover:border-rose-500/30 group-hover:shadow-[0_0_25px_rgba(244,63,94,0.15)]';
      default: return 'group-hover:border-indigo-500/30 group-hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]';
    }
  };

  const getBorderColor = () => {
    switch (variant) {
      case 'emerald': return 'border-emerald-500/10';
      case 'amber': return 'border-amber-500/10';
      case 'rose': return 'border-rose-500/10';
      default: return 'border-indigo-500/10';
    }
  };

  const getIconContainerColor = () => {
    switch (variant) {
      case 'emerald': return 'bg-emerald-500/10 text-emerald-400';
      case 'amber': return 'bg-amber-500/10 text-amber-400';
      case 'rose': return 'bg-rose-500/10 text-rose-400';
      default: return 'bg-indigo-500/10 text-indigo-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`glass-panel p-6 rounded-2xl border ${getBorderColor()} group transition-all duration-300 ${getGlowVariant()}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-400 tracking-wide uppercase">{title}</p>
          <h3 className="text-3xl font-bold tracking-tight text-white">{value}</h3>
          
          {subtext && (
            <p className="text-xs text-slate-500 font-medium">{subtext}</p>
          )}

          {trend && (
            <div className="flex items-center space-x-1.5 pt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                trend.isPositive 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'bg-rose-500/10 text-rose-400'
              }`}>
                {trend.value}
              </span>
              <span className="text-xs text-slate-500">{trend.label}</span>
            </div>
          )}
        </div>
        
        <div className={`p-3 rounded-xl transition-all duration-300 ${getIconContainerColor()} group-hover:scale-110`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

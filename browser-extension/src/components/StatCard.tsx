/// <reference types="chrome"/>
import React from 'react'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from './ui/card'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  iconColor: string
  iconBgColor: string
  borderColor: string
  hoverBorderColor: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
  iconBgColor,
  borderColor,
  hoverBorderColor
}: StatCardProps) {
  return (
    <Card className={`shadow-xs ring-1 bg-neutral-900/30 ring-white/5 ${borderColor} ${hoverBorderColor} transition-all`}>
      <CardContent className="p-3 flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${iconBgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <p className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-bold text-emerald-400">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

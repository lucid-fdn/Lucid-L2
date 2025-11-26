import { Zap, Coins, Target, TrendingUp, Activity } from 'lucide-react'
import { LucideIcon } from 'lucide-react'

export interface StatConfig {
  icon: LucideIcon
  label: string
  key: 'mGas' | 'lucid' | 'daily'
  iconColor: string
  iconBgColor: string
  borderColor: string
  hoverBorderColor: string
}

export interface ActionConfig {
  icon: LucideIcon
  label: string
  key: string
  borderColor: string
  hoverBgColor: string
  hoverBorderColor: string
  iconColor: string
}

export const STATS_CONFIG: StatConfig[] = [
  {
    icon: Zap,
    label: 'mGas',
    key: 'mGas',
    iconColor: 'text-indigo-400',
    iconBgColor: 'bg-indigo-500/20',
    borderColor: 'border-indigo-500/20',
    hoverBorderColor: 'hover:border-indigo-500/40'
  },
  {
    icon: Coins,
    label: 'LUCID',
    key: 'lucid',
    iconColor: 'text-purple-400',
    iconBgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/20',
    hoverBorderColor: 'hover:border-purple-500/40'
  },
  {
    icon: Target,
    label: 'Daily',
    key: 'daily',
    iconColor: 'text-emerald-400',
    iconBgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/20',
    hoverBorderColor: 'hover:border-emerald-500/40'
  }
]

export const ACTIONS_CONFIG: ActionConfig[] = [
  {
    icon: TrendingUp,
    label: 'Convert',
    key: 'convert',
    iconColor: 'text-indigo-400',
    borderColor: 'border-indigo-500/20',
    hoverBgColor: 'hover:bg-indigo-900/20',
    hoverBorderColor: 'hover:border-indigo-500/40'
  },
  {
    icon: Target,
    label: 'Achievements',
    key: 'achievements',
    iconColor: 'text-purple-400',
    borderColor: 'border-purple-500/20',
    hoverBgColor: 'hover:bg-purple-900/20',
    hoverBorderColor: 'hover:border-purple-500/40'
  },
  {
    icon: Activity,
    label: 'Leaderboard',
    key: 'leaderboard',
    iconColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/20',
    hoverBgColor: 'hover:bg-emerald-900/20',
    hoverBorderColor: 'hover:border-emerald-500/40'
  }
]

import {
  LayoutDashboard,
  Fingerprint,
  Cpu,
  Rocket,
  Brain,
  Receipt,
  Anchor,
  Settings,
} from 'lucide-react'

export const navItems = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Passports', href: '/passports', icon: Fingerprint },
  { title: 'Models', href: '/models', icon: Cpu },
  { title: 'Deployments', href: '/deployments', icon: Rocket },
  { title: 'Memory', href: '/memory', icon: Brain },
  { title: 'Receipts', href: '/receipts', icon: Receipt },
  { title: 'Anchoring', href: '/anchoring', icon: Anchor },
  { title: 'Config', href: '/config', icon: Settings },
] as const

/// <reference types="chrome"/>
import React from 'react'
import { LucideIcon } from 'lucide-react'
import { Button } from './ui/button'

interface ActionButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  borderColor: string
  hoverBgColor: string
  hoverBorderColor: string
  iconColor: string
  tooltip?: string
}

export function ActionButton({
  icon: Icon,
  label,
  onClick,
  borderColor,
  hoverBgColor,
  hoverBorderColor,
  iconColor,
  tooltip
}: ActionButtonProps) {
  return (
    <Button 
      variant="outline" 
      onClick={onClick}
      className={`flex-col h-auto py-3 bg-slate-900/50 ${borderColor} ${hoverBgColor} ${hoverBorderColor}`}
      title={tooltip}
    >
      <Icon className={`w-5 h-5 ${iconColor} mb-1`} />
      <span className="text-[10px]">{label}</span>
    </Button>
  )
}

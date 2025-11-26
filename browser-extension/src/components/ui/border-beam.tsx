import React from 'react'
import { cn } from '../../lib/utils'

interface BorderBeamProps {
  /**
   * The size of the border beam.
   */
  size?: number
  /**
   * The duration of the border beam.
   */
  duration?: number
  /**
   * The delay of the border beam.
   */
  delay?: number
  /**
   * The color of the border beam from.
   */
  colorFrom?: string
  /**
   * The color of the border beam to.
   */
  colorTo?: string
  /**
   * The class name of the border beam.
   */
  className?: string
  /**
   * The style of the border beam.
   */
  style?: React.CSSProperties
  /**
   * The border width of the beam.
   */
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  style,
  borderWidth = 1,
}: BorderBeamProps) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
      style={{
        border: `${borderWidth}px solid transparent`,
      }}
    >
      <div
        className={cn(
          'absolute animate-beam',
          'bg-gradient-to-r opacity-75 blur-sm',
          className
        )}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: `linear-gradient(90deg, ${colorFrom}, ${colorTo}, transparent)`,
          animationDuration: `${duration}s`,
          animationDelay: `${-delay}s`,
          ...style,
        }}
      />
    </div>
  )
}

import React, { useState } from 'react'
import { cn } from '../../lib/utils'

interface InteractiveGridPatternProps extends React.SVGAttributes<SVGSVGElement> {
  width?: number
  height?: number
  squares?: [number, number] // [horizontal, vertical]
  className?: string
  squaresClassName?: string
}

export function InteractiveGridPattern({
  width = 40,
  height = 40,
  squares = [24, 24],
  className,
  squaresClassName,
  ...props
}: InteractiveGridPatternProps) {
  const [horizontal, vertical] = squares
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null)

  return (
    <svg
      viewBox={`0 0 ${width * horizontal} ${height * vertical}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn(
        'absolute inset-0 h-full w-full border border-gray-400/30',
        className
      )}
      {...props}
    >
      {Array.from({ length: horizontal * vertical }).map((_, index) => {
        const x = (index % horizontal) * width
        const y = Math.floor(index / horizontal) * height
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={width}
            height={height}
            className={cn(
              'stroke-gray-400/30 transition-all duration-100 ease-in-out [&:not(:hover)]:duration-1000',
              hoveredSquare === index ? 'fill-gray-300/30' : 'fill-transparent',
              squaresClassName
            )}
            onMouseEnter={() => setHoveredSquare(index)}
            onMouseLeave={() => setHoveredSquare(null)}
          />
        )
      })}
    </svg>
  )
}

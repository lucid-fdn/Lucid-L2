import React from 'react'
import { cn } from '../../lib/utils'

type HeadingProps = { 
  level?: 1 | 2 | 3 | 4 | 5 | 6
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  dark?: boolean
} & React.ComponentPropsWithoutRef<
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
>

export function Heading({ className, level, as, dark, ...props }: HeadingProps) {
  // Use 'as' prop if provided, otherwise fallback to level, otherwise default to h1
  let Element: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' = as || `h${level || 1}` as any

  return (
    <Element
      {...props}
      className={cn(className, 'text-3xl/8 font-semibold text-zinc-950' , dark && 'dark:text-white')}
    />
  )
}

export function Subheading({ className, level, as, dark, ...props }: HeadingProps) {
  // Use 'as' prop if provided, otherwise fallback to level, otherwise default to h2
  let Element: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' = as || `h${level || 2}` as any

  return (
    <Element
      {...props}
      className={cn(className, 'text-base/7 font-semibold text-zinc-950 sm:text-sm/6', dark && 'dark:text-white')}
    />
  )
}

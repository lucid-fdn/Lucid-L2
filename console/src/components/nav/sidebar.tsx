'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { navItems } from './nav-config'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-8 px-2">
          <h1 className="text-lg font-semibold text-zinc-100">
            Lucid Console
          </h1>
          <p className="text-xs text-zinc-500">Operator Dashboard</p>
        </div>
        <NavLinks />
      </aside>

      {/* Mobile menu button */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent
            side="left"
            className="w-56 bg-zinc-950 border-zinc-800 p-4"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Main navigation menu
            </SheetDescription>
            <div className="mb-8 px-2 mt-8">
              <h1 className="text-lg font-semibold text-zinc-100">
                Lucid Console
              </h1>
              <p className="text-xs text-zinc-500">Operator Dashboard</p>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

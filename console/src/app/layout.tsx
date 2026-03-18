import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Sidebar } from '@/components/nav/sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lucid Console',
  description: 'Operator dashboard for Lucid L2',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased bg-zinc-950 text-zinc-100`}
      >
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  )
}

/// <reference types="chrome"/>
import React, { useState, useEffect } from 'react'
import { Sparkles, Shield, Coins } from 'lucide-react'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { InteractiveGridPattern } from './ui/interactive-grid-pattern'
import { Heading, Subheading } from './ui/heading'
import { AuroraText } from './ui/aurora-text'
import { LogoCloud } from './ui/logo-cloud'
import { cn } from '../lib/utils'

interface ConnectWalletProps {
  onConnected: () => void
}

export function ConnectWallet({ onConnected }: ConnectWalletProps) {
  const [gridSquares, setGridSquares] = useState<[number, number]>([20, 20])

  useEffect(() => {
    // Animate grid from [40, 40] to [39, 39] on mount
    const timer = setTimeout(() => {
      setGridSquares([19, 19])
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])
  const handleConnect = () => {
    // Send message to background script to open server-hosted auth page
    chrome.runtime.sendMessage({ type: 'open_privy_auth' })
    
    // Listen for connection success
    const checkConnection = setInterval(async () => {
      const data = await chrome.storage.local.get(['privy_session'])
      if (data.privy_session) {
        clearInterval(checkConnection)
        onConnected()
      }
    }, 1000)
    
    // Clean up after 5 minutes
    setTimeout(() => clearInterval(checkConnection), 300000)
  }

  return (
    <div className="w-[420px] min-h-[600px] bg-black relative overflow-hidden flex items-center justify-center">
      {/* Interactive Grid Background */}
      <InteractiveGridPattern
        squares={gridSquares}
        className={cn(
          'absolute inset-0',
          '[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]',
          'skew-y-12',
          'transition-all duration-1000 ease-out'
        )}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md p-6">
        <Card className="bg-neutral-900/70 backdrop-blur-sm shadow-xl ring-1 ring-white/10">
          <CardHeader className="text-center space-y-4 pt-8">
            {/* Logo */}
            <div className="flex items-center justify-center">
              <img 
                src={chrome.runtime.getURL('icons/lucid_w.gif')} 
                alt="Lucid" 
                className="w-14 h-14"
              />
            </div>

            <Heading as="h1" dark className="mt-8 text-base/6 font-medium">
              Welcome to <AuroraText>Lucid AI</AuroraText>
            </Heading>
            <Subheading dark className="mt-1 text-sm/5 text-gray-600">
              Sign in to access the Internet of AI.
            </Subheading>
          </CardHeader>

          <CardContent className="space-y-6 pb-8">
            {/* Features List */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 border border-indigo-500/20">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">
                    Mine Your Thoughts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 border border-purple-500/20">
                  <Coins className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">
                    Get mGas for participation
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">
                    Your data is encrypted and under your control
                  </p>
                </div>
              </div>
            </div>

            {/* Connect Button */}
            <Button
              className="w-full rounded-full bg-gradient-to-r from-[#081D3C] to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white h-11 text-base font-medium transition-colors duration-200 ease-in-out"
              onClick={handleConnect}
            >
              Login
            </Button>

            {/* Footer Note */}
            <p className="text-xs text-center text-slate-500">
              You agree to our Terms of Service and Privacy Policy
            </p>

            {/* Logo Cloud */}
            <div className="pt-6">
              <LogoCloud />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

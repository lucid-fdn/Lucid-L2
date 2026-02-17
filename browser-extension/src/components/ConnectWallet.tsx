/// <reference types="chrome"/>
import React, { useState, useEffect } from 'react'
import { Sparkles, Shield, Coins, Zap, ArrowRight, Globe } from 'lucide-react'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { InteractiveGridPattern } from './ui/interactive-grid-pattern'
import { Heading } from './ui/heading'
import { AuroraText } from './ui/aurora-text'
import { LogoCloud } from './ui/logo-cloud'
import { cn } from '../lib/utils'

interface ConnectWalletProps {
  onConnected: () => void
}

const ONBOARDING_STEPS = [
  {
    title: 'Earn Crypto from AI',
    subtitle: 'Turn your AI conversations into mGas tokens on the Lucid L2 blockchain.',
    icon: Zap,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    features: [
      { icon: Globe, text: 'Works with ChatGPT, Claude, Gemini, Perplexity, Grok & Copilot', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
      { icon: Sparkles, text: 'Earn mGas automatically as you chat with AI', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
      { icon: Shield, text: 'Your data stays private and encrypted', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    ]
  },
  {
    title: 'How It Works',
    subtitle: 'Lucid captures your AI interactions in the background — no extra work needed.',
    icon: Coins,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    features: [
      { icon: Sparkles, text: '1. Chat with any supported AI platform', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
      { icon: Zap, text: '2. Earn mGas tokens for each conversation', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
      { icon: Coins, text: '3. Convert mGas to $LUCID tokens on-chain', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ]
  }
]

export function ConnectWallet({ onConnected }: ConnectWalletProps) {
  const [step, setStep] = useState(0)
  const [gridSquares, setGridSquares] = useState<[number, number]>([20, 20])

  useEffect(() => {
    const timer = setTimeout(() => setGridSquares([19, 19]), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleConnect = () => {
    chrome.runtime.sendMessage({ type: 'open_privy_auth' })
    const checkConnection = setInterval(async () => {
      const data = await chrome.storage.local.get(['privy_session'])
      if (data.privy_session) {
        clearInterval(checkConnection)
        onConnected()
      }
    }, 1000)
    setTimeout(() => clearInterval(checkConnection), 300000)
  }

  const handleGuestMode = async () => {
    // Set guest mode flag — user can earn locally, connect later
    await chrome.storage.local.set({ guest_mode: true })
    onConnected()
  }

  const isOnboarding = step < ONBOARDING_STEPS.length
  const currentStep = ONBOARDING_STEPS[step]

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
                className="w-20 h-20"
              />
            </div>

            {isOnboarding ? (
              <>
                <Heading as="h1" dark className="mt-4 font-medium text-lg">
                  <AuroraText>{currentStep.title}</AuroraText>
                </Heading>
                <p className="text-xs text-slate-400 px-2">
                  {currentStep.subtitle}
                </p>
              </>
            ) : (
              <Heading as="h1" dark className="mt-4 font-medium">
                Welcome to <AuroraText>Lucid AI</AuroraText>
              </Heading>
            )}
          </CardHeader>

          <CardContent className="space-y-5 pb-8">
            {isOnboarding ? (
              <>
                {/* Onboarding Features */}
                <div className="space-y-3">
                  {currentStep.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border', feature.bg)}>
                        <feature.icon className={cn('w-4 h-4', feature.color)} />
                      </div>
                      <p className="text-xs text-slate-400">{feature.text}</p>
                    </div>
                  ))}
                </div>

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  {ONBOARDING_STEPS.map((_, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all duration-300',
                        idx === step ? 'bg-indigo-500 w-6' : 'bg-slate-600'
                      )}
                    />
                  ))}
                  <div className={cn(
                    'w-2 h-2 rounded-full transition-all duration-300',
                    step >= ONBOARDING_STEPS.length ? 'bg-indigo-500 w-6' : 'bg-slate-600'
                  )} />
                </div>

                {/* Next button */}
                <Button
                  className="w-full rounded-full bg-gradient-to-r from-[#081D3C] to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white h-11 text-base font-medium transition-colors duration-200 ease-in-out"
                  onClick={() => setStep(step + 1)}
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                {/* Skip onboarding */}
                <button
                  className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors text-center"
                  onClick={() => setStep(ONBOARDING_STEPS.length)}
                >
                  Skip intro
                </button>
              </>
            ) : (
              <>
                {/* Connect / Guest buttons */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 border border-indigo-500/20">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                    </div>
                    <p className="text-xs text-slate-400">Mine Your Thoughts</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 border border-purple-500/20">
                      <Coins className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-xs text-slate-400">Get mGas for participation</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
                      <Shield className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-xs text-slate-400">Your data is encrypted and under your control</p>
                  </div>
                </div>

                {/* Connect Button */}
                <Button
                  className="w-full rounded-full bg-gradient-to-r from-[#081D3C] to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white h-11 text-base font-medium transition-colors duration-200 ease-in-out"
                  onClick={handleConnect}
                >
                  Log In to the Internet of AI
                </Button>

                {/* Guest Mode */}
                <button
                  className="w-full text-xs text-indigo-400 hover:text-indigo-300 transition-colors text-center py-1"
                  onClick={handleGuestMode}
                >
                  Skip for now — start earning as guest
                </button>

                {/* Footer Note */}
                <p className="text-xs text-center text-slate-500">
                  You agree to our Terms of Service and Privacy Policy
                </p>

                {/* Logo Cloud */}
                <div className="pt-4">
                  <LogoCloud />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
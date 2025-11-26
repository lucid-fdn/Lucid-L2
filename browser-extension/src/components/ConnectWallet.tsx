/// <reference types="chrome"/>
import React from 'react'
import { Wallet, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

interface ConnectWalletProps {
  onConnected: () => void
}

export function ConnectWallet({ onConnected }: ConnectWalletProps) {
  const handleConnect = () => {
    // Open auth page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') })
    
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
    <div className="w-[420px] min-h-[600px] max-h-[700px] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground flex flex-col relative">
      {/* Animated Background Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent opacity-50 pointer-events-none -z-10" />
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-indigo-500/20">
        <div className="flex items-center gap-3">
          <img src={chrome.runtime.getURL('icons/lucid_w.png')} alt="Lucid" className="w-10 h-10" />
          <div>
            <h1 className="text-sm font-bold bg-white bg-clip-text text-transparent">
              Lucid
            </h1>
            <p className="text-[10px] text-slate-400">AI Thought Miner</p>
          </div>
        </div>
        
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
          DEVNET
        </Badge>
      </header>

      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/30">
          <CardHeader className="text-center space-y-4">
            {/* Animated Icon */}
            <div className="relative mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full blur-xl opacity-50 animate-pulse"></div>
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                <Wallet className="w-10 h-10 text-white" />
              </div>
            </div>

            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold">Welcome to Lucid</CardTitle>
              <CardDescription className="text-sm text-slate-300">
                Connect your Solana wallet to start earning mGas from your AI conversations
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Features List */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Mine Your Thoughts</h3>
                  <p className="text-xs text-slate-400">Turn AI conversations into valuable tokens</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Earn Rewards</h3>
                  <p className="text-xs text-slate-400">Get mGas and LUCID tokens for participation</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Secure & Private</h3>
                  <p className="text-xs text-slate-400">Your data is encrypted and under your control</p>
                </div>
              </div>
            </div>

            {/* Connect Button */}
            <Button
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 h-12 text-base font-semibold"
              onClick={handleConnect}
            >
              <Wallet className="w-5 h-5 mr-2" />
              Connect Wallet to Get Started
            </Button>

            {/* Footer Note */}
            <p className="text-xs text-center text-slate-500">
              By connecting, you agree to our Terms of Service and Privacy Policy
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

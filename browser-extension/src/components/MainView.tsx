/// <reference types="chrome"/>
import React, { useState, useEffect } from 'react'
import { 
  Settings, 
  Activity,
  Home,
  Copy,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { cn } from '../lib/utils'
import { StatCard } from './StatCard'
import { ActionButton } from './ActionButton'
import { BorderBeam } from './ui/border-beam'
import { STATS_CONFIG, ACTIONS_CONFIG } from '../config/ui-config'

interface MainViewProps {
  mode: 'popup' | 'sidebar'
  onClose?: () => void
  onUnpin?: () => void
  onPin?: () => void
}

interface ConversationItem {
  type: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export function MainView({ mode, onClose, onUnpin, onPin }: MainViewProps) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [walletConnected, setWalletConnected] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [mGasBalance, setMGasBalance] = useState(0)
  const [lucidBalance, setLucidBalance] = useState(0)
  const [dailyProgress, setDailyProgress] = useState(0)
  const [sessionStats, setSessionStats] = useState({
    totalMessages: 0,
    pointsEarned: 0,
    mGasEarned: 0
  })
  const [recentCaptures, setRecentCaptures] = useState<ConversationItem[]>([])
  const [walletAddress, setWalletAddress] = useState('')

  const isSidebar = mode === 'sidebar'
  const width = isSidebar ? 'w-[350px]' : 'w-[420px]'
  const height = isSidebar ? 'h-screen' : 'min-h-[600px]'
  const OpenAILogo = ({ size = 32, className }: { size?: number; className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"/>
    </svg>
  )

  useEffect(() => {
    loadData()
    
    // Listen for storage changes
    const handleStorageChange = (changes: any, area: string) => {
      if (area === 'local') {
        if (changes.chatgpt_session_stats || changes.conversationHistory || changes.balance || changes.privy_session) {
          loadData()
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    // Listen for rewards updates
    const handleMessage = (msg: any) => {
      if (msg?.type === 'rewards_updated') {
        loadData()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  async function loadData() {
    try {
      const data = await chrome.storage.local.get([
        'privy_session',
        'chatgpt_session_stats',
        'conversationHistory',
        'balance'
      ])

      // Update wallet connection
      if (data.privy_session) {
        setWalletConnected(true)
        setWalletAddress(data.privy_session.wallet?.address || '')
      }

      // Update session stats
      const stats = data.chatgpt_session_stats || {
        totalMessages: 0,
        pointsEarned: 0,
        mGasEarned: 0
      }
      setSessionStats(stats)
      setDailyProgress(stats.totalMessages || 0)

      // Update balance
      const balance = data.balance || { mGas: 0, lucid: 0 }
      setMGasBalance(balance.mGas || 0)
      setLucidBalance(balance.lucid || 0)

      // Update recent captures
      const history = data.conversationHistory || []
      setRecentCaptures(history.slice(-5).reverse())
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleWalletConnect = () => {
    // Open auth page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') })
  }

  const handleWalletDisconnect = async () => {
    try {
      // Clear all auth-related data
      await chrome.storage.local.remove([
        'privy_session',
        'chatgpt_session_stats',
        'conversationHistory',
        'balance'
      ])
      
      // Reset local state
      setWalletConnected(false)
      setWalletAddress('')
      setSessionStats({
        totalMessages: 0,
        pointsEarned: 0,
        mGasEarned: 0
      })
      setMGasBalance(0)
      setLucidBalance(0)
      setRecentCaptures([])
      
      // The Popup component will detect the storage change and show ConnectWallet
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress)
    }
  }

  const truncateAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  return (
    <div className={cn(
      width,
      height,
      "bg-black text-foreground flex flex-col relative",
      isSidebar && "fixed top-0 right-0 shadow-2xl"
    )}>
      {/* Animated Background Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent opacity-50 pointer-events-none -z-10" />
      
      {/* Header - Sticky */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src={chrome.runtime.getURL('icons/lucid_w.png')} alt="Lucid" className="w-10 h-10" />
          <div>
            <h1 className="text-sm font-bold bg-white bg-clip-text text-transparent">
              Lucid
            </h1>
            <p className="text-[10px] text-slate-400">AI Thought Miner</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* {!isSidebar && onPin && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-slate-400 hover:text-slate-200"
              onClick={onPin}
              title="Pin sidebar"
            >
              <Pin className="w-4 h-4" />
            </Button>
          )}
          {isSidebar && onUnpin && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-slate-400 hover:text-slate-200"
              onClick={onUnpin}
              title="Unpin sidebar"
            >
              <PinOff className="w-4 h-4" />
            </Button>
          )}
          {isSidebar && onClose && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-slate-400 hover:text-slate-200"
              onClick={onClose}
              title="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          )} */}
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
            TESTNET
          </Badge>
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col relative z-10">
        <TabsList className="grid w-full grid-cols-3 shadow-xs ring-1 bg-neutral-900/30 ring-white/5 rounded-none">
          <TabsTrigger value="dashboard" className="gap-2">
            <Home className="w-4 h-4" />
            <span className="text-xs">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="text-xs">Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="flex-1 overflow-y-auto scrollbar-hide p-4 pb-20 space-y-4">
          {/* Start Session CTA - Show only when no session active */}
      {/* Quick Stats Banner - Sticky below header */}
          <div className={cn(
            "grid gap-2",
            isSidebar ? "grid-cols-1" : "grid-cols-2"
          )}>
            {STATS_CONFIG.map((stat) => {
              // Hide LUCID stat (always)
              if (stat.key === 'lucid') return null
              // Hide daily stat in sidebar
              if (isSidebar && stat.key === 'daily') return null
              
              const statValues = {
                mGas: mGasBalance,
                lucid: lucidBalance,
                daily: `${dailyProgress}/10`
              }
              
              return (
                <StatCard
                  key={stat.key}
                  icon={stat.icon}
                  label={stat.label}
                  value={statValues[stat.key]}
                  iconColor={stat.iconColor}
                  iconBgColor={stat.iconBgColor}
                  borderColor={stat.borderColor}
                  hoverBorderColor={stat.hoverBorderColor}
                />
              )
            })}
          </div>
          {sessionStats.totalMessages === 0 && (
            <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-center">
                  <img 
                    src={chrome.runtime.getURL('icons/lucid_w.gif')} 
                    alt="Lucid" 
                    className="w-14 h-14"
                  />
                </div>
                <CardTitle className="text-center text-base">Start Earning mGas</CardTitle>
                <CardDescription className="text-center text-xs">
                  Start a ChatGPT conversation to begin mining mGas tokens from your AI interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full bg-gradient-to-r from-[#081D3C] to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-colors duration-200 ease-in-out"
                  onClick={() => window.open('https://chatgpt.com', '_blank')}
                >
                  <OpenAILogo className="mr-2" size={22} />
                  Start ChatGPT Chat
                </Button>
                <p className="text-[10px] text-center text-slate-500 mt-2">
                  Your conversations will be tracked privately
                </p>
              </CardContent>
            </Card>
          )}

          {/* Wallet Status Card */}
          {walletConnected && walletAddress && (
            <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    Connected
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleWalletDisconnect}>
                    Disconnect
                  </Button>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg">
                  <span className="text-xs text-slate-400">Wallet:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-indigo-400">{truncateAddress(walletAddress)}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyAddress}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ChatGPT Session Stats */}
          {sessionStats.totalMessages > 0 && (
            <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5 relative overflow-hidden">
              <BorderBeam size={100} duration={8} colorFrom="#a855f7" colorTo="#6366f1" />
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  ChatGPT Session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Messages:</span>
                  <span className="font-semibold text-slate-200">{sessionStats.totalMessages}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Points:</span>
                  <span className="font-semibold text-slate-200">{sessionStats.pointsEarned.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-slate-700 pt-2">
                  <span className="text-purple-400">mGas Earned:</span>
                  <span className="font-bold text-purple-400">{sessionStats.mGasEarned}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Captures */}
          {recentCaptures.length > 0 && (
            <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
              <CardHeader>
                <CardTitle className="text-sm">Recent Captures</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentCaptures.map((capture, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-slate-900/50 rounded-lg">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0",
                      capture.type === 'user' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                    )}>
                      {capture.type === 'user' ? '👤' : '🤖'}
                    </div>
                    <p className="text-xs text-slate-300 flex-1">{truncateText(capture.content, isSidebar ? 40 : 60)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* AI Thought Mining 
          <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <img src={chrome.runtime.getURL('icons/lucid_w.png')} alt="Lucid" className="w-5 h-5" />
                  AI Thought Mining
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{dailyProgress}/10</span>
                  <Progress value={(dailyProgress / 10) * 100} className="w-16 h-1" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Enter your thought or question for AI processing..."
                className="min-h-[80px] resize-none bg-slate-900/50 border-slate-700 focus:border-indigo-500"
                maxLength={500}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{aiInput.length}/500</span>
                <Button 
                  disabled={!aiInput}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Process Thought
                </Button>
              </div>
            </CardContent>
          </Card> */}

          {/* Quick Actions - Only show in popup mode for space */}
          {!isSidebar && (
            <div className="grid grid-cols-3 gap-2">
              {ACTIONS_CONFIG.map((action) => (
                <ActionButton
                  key={action.key}
                  icon={action.icon}
                  label={action.label}
                  iconColor={action.iconColor}
                  borderColor={action.borderColor}
                  hoverBgColor={action.hoverBgColor}
                  hoverBorderColor={action.hoverBorderColor}
                  tooltip={action.tooltip}
                  onClick={() => console.log(`${action.key} clicked`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="flex-1 overflow-y-auto scrollbar-hide p-4 pb-20 space-y-4">
          <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentCaptures.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No activity yet
                </div>
              ) : (
                recentCaptures.map((capture, idx) => (
                  <div key={idx} className="flex items-start justify-between p-2 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-xs text-slate-300">{truncateText(capture.content, 40)}</p>
                      <p className="text-[10px] text-slate-500">Recent</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400">+15 mGas</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 overflow-y-auto scrollbar-hide p-4 pb-20 space-y-4">
          <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Account</h3>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleWalletDisconnect}
                >
                  Disconnect
                </Button>
                <p className="text-xs text-slate-500">
                  This will sign you out and clear all your session data
                </p>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Notifications</h3>
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" className="rounded" defaultChecked />
                  Enable notifications
                </label>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Version</h3>
                <p className="text-xs text-slate-500">v1.0.0</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

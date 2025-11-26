/// <reference types="chrome"/>
import React, { useState, useEffect } from 'react'
import { 
  Wallet, 
  Sparkles, 
  Settings, 
  Activity,
  Home,
  X,
  Copy,
  Pin,
  PinOff
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'
import { Progress } from './ui/progress'
import { cn } from '../lib/utils'
import { StatCard } from './StatCard'
import { ActionButton } from './ActionButton'
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
    await chrome.storage.local.remove(['privy_session'])
    setWalletConnected(false)
    setWalletAddress('')
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
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-xl border-b border-indigo-500/20">
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

      {/* Quick Stats Banner - Sticky below header */}
      <div className={cn(
        "z-10 grid gap-2 p-3 shadow-xs ring-1 bg-neutral-900/30 ring-white/5",
        isSidebar ? "grid-cols-2" : "grid-cols-3"
      )}>
        {STATS_CONFIG.map((stat) => {
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
          {/* Wallet Status Card */}
          {walletConnected && walletAddress && (
            <Card className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border-emerald-500/30">
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
            <Card className="shadow-xs ring-1 bg-neutral-900/30 ring-white/5">
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
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

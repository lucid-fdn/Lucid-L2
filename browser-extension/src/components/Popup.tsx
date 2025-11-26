/// <reference types="chrome"/>
import React, { useState, useEffect } from 'react'
import { MainView } from './MainView'
import { ConnectWallet } from './ConnectWallet'

export function Popup() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    checkAuthentication()
    
    // Listen for auth changes
    const handleStorageChange = (changes: any, area: string) => {
      if (area === 'local' && changes.privy_session) {
        checkAuthentication()
      }
    }
    
    chrome.storage.onChanged.addListener(handleStorageChange)
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const checkAuthentication = async () => {
    try {
      const data = await chrome.storage.local.get(['privy_session'])
      setIsAuthenticated(!!data.privy_session)
    } catch (error) {
      console.error('Error checking authentication:', error)
      setIsAuthenticated(false)
    }
  }

  const handleConnected = () => {
    setIsAuthenticated(true)
  }

  const handlePin = async () => {
    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tabs[0]?.id) return

      const tabId = tabs[0].id

      // Inject sidebar CSS first
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['dist/sidebar.css']
      })

      // Inject sidebar container and root element with proper styling
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Check if sidebar already exists
          if (document.getElementById('lucid-sidebar-root')) {
            return
          }

          // Create sidebar container with inline styles for proper rendering
          const sidebarContainer = document.createElement('div')
          sidebarContainer.id = 'lucid-sidebar-root'
          sidebarContainer.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            width: 350px !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3) !important;
            background: #0a0a0f !important;
            overflow: hidden !important;
          `

          // Create root element for React with proper styling
          const root = document.createElement('div')
          root.id = 'root'
          root.style.cssText = `
            width: 100% !important;
            height: 100% !important;
            background: #0a0a0f !important;
          `
          
          sidebarContainer.appendChild(root)
          document.body.appendChild(sidebarContainer)
          
          console.log('✅ Sidebar container and root created')
        }
      })

      // Inject sidebar React script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['dist/sidebar.js']
      })

      // Mark sidebar as pinned
      await chrome.storage.local.set({ sidebarPinned: true })
      
      // Close the popup
      window.close()
    } catch (error) {
      console.error('Error pinning sidebar:', error)
    }
  }

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="w-[420px] min-h-[600px] bg-black flex items-center justify-center">
        <div className="text-center">
          <img 
            src={chrome.runtime.getURL('icons/lucid_w.gif')}
            alt="Loading..."
            className="w-16 h-16 mx-auto mb-4"
          />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Show ConnectWallet if not authenticated
  if (!isAuthenticated) {
    return <ConnectWallet onConnected={handleConnected} />
  }

  // Show MainView if authenticated
  return <MainView mode="popup" onPin={handlePin} />
}

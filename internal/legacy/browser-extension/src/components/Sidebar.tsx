/// <reference types="chrome"/>
import React from 'react'
import { MainView } from './MainView'

export function Sidebar() {
  const handleClose = () => {
    // Send message to content script to remove sidebar
    const sidebarElement = document.getElementById('lucid-sidebar-root')
    if (sidebarElement) {
      sidebarElement.classList.add('lucid-sidebar-closing')
      setTimeout(() => {
        sidebarElement.remove()
      }, 300)
    }
  }

  const handleUnpin = async () => {
    // Update storage to mark sidebar as unpinned
    await chrome.storage.local.set({ sidebarPinned: false })
    handleClose()
  }

  return <MainView mode="sidebar" onClose={handleClose} onUnpin={handleUnpin} />
}

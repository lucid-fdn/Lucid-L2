import React from 'react'
import ReactDOM from 'react-dom/client'
import { Sidebar } from './components/Sidebar'
// Import scoped CSS for content script - NO global styles!
import './styles/content-script.css'

// Create root element
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Sidebar />
    </React.StrictMode>
  )
}

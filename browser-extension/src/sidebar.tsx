import React from 'react'
import ReactDOM from 'react-dom/client'
import { Sidebar } from './components/Sidebar'
import './styles/globals.css'

// Create root element
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Sidebar />
    </React.StrictMode>
  )
}

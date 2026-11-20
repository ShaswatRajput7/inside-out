import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installExternalLinks } from './platform/links.js'

installExternalLinks()

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './lib/debugUtils' // Initialize debug utilities
import { ThemeProvider } from './components/ThemeProvider'
import { logger } from './lib/logger'
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
logger.setDefaultContext({
  browser: navigator.userAgent,
  isMobile,
})

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="teleprompter-theme">
    <App />
  </ThemeProvider>
);

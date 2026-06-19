import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

function applySafeAreaInsets() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
  document.body.appendChild(el);
  const sab = el.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--sab', `${sab}px`);
  document.body.removeChild(el);
}

applySafeAreaInsets();
setTimeout(applySafeAreaInsets, 50);
setTimeout(applySafeAreaInsets, 150);
setTimeout(applySafeAreaInsets, 500);
window.addEventListener('resize', applySafeAreaInsets);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

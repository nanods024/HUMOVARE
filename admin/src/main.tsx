import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// A page restored from the back/forward cache (e.g. pressing Back after
// signing out) would show the old screen without asking the server. Reload
// it instead, so the session is checked again before anything is shown.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

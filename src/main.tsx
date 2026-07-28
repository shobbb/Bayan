import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { seedOnFirstRun } from '@/services/seed/firstRunSeed';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
const root = createRoot(rootEl);

/**
 * Seed before the first render so Home and Stats mount against a populated
 * corpus (§14). A seeding failure must never block the app: the reader still
 * works, and the import can be retried from Settings (REQ-I2).
 */
async function start() {
  try {
    const outcome = await seedOnFirstRun();
    if (outcome.status === 'failed') console.error('First-run seed failed:', outcome.reason);
  } catch (error) {
    console.error('First-run seed failed:', error);
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();

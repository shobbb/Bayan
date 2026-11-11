import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The shared control styles load before any screen's stylesheet, so a screen
// can adjust a button's layout without having to out-specify it.
import './styles/buttons.css';
import { App } from './app';
import {
  describeRestore,
  restoreSavedBackupIfEmpty,
} from '@/services/interchange/restoreOnLaunch';
import { markTransitionSupport } from '@/ui/transitions';
import './styles/global.css';
import './styles/transitions.css';

// Decided once, before anything renders, so the stylesheet knows whether it is
// falling back to a plain fade-in.
markTransitionSupport();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
const root = createRoot(rootEl);

/**
 * An empty install starts empty, unless this device holds a backup from Save
 * file, which is put back before the first render so Home mounts against it.
 * Nothing here may block the app: with no backup, or any failure, it opens.
 */
async function start() {
  let startupNotice: string | null = null;
  try {
    startupNotice = describeRestore(await restoreSavedBackupIfEmpty());
  } catch (error) {
    console.error('Restoring the saved backup failed:', error);
  }

  root.render(
    <StrictMode>
      <App startupNotice={startupNotice} />
    </StrictMode>,
  );
}

void start();

import type { CapacitorConfig } from '@capacitor/cli';

// Native shell configuration. The web layer in src/ is the entire UI and logic;
// this file only governs how Capacitor wraps the built assets in a native binary.
const config: CapacitorConfig = {
  appId: 'app.bayan.reader',
  appName: 'Bayan',
  webDir: 'dist',
  // Cool-neutral ground so the native splash/background matches --ground (§5.3)
  // and there is no white flash before the WebView paints.
  backgroundColor: '#F7F7F5',
  ios: {
    // The reading surface owns the full height; we manage safe areas in CSS (REQ-P6).
    contentInset: 'never',
  },
  android: {
    // Allow http only for the dev livereload server; production loads local assets.
    allowMixedContent: false,
  },
};

export default config;

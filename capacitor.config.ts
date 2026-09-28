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
  plugins: {
    /**
     * Over-the-air updates to the web layer (§2.0.2).
     *
     * `atBackground` is the conservative mode on purpose: a newer bundle is
     * fetched while the app is backgrounded and applied at the next cold start.
     * The instant-apply modes need the splash-screen plugin held open and swap
     * the bundle under a running session — more to go wrong, for a second
     * saved, on a phone that will be a long way from anyone who could fix it.
     *
     * Nothing here points the WebView at a remote URL. The bundle still ships
     * inside the binary; this only lets a newer one replace it. No connection
     * means the bundle already on the device, not a blank screen.
     */
    CapacitorUpdater: {
      // Which Capgo dashboard app the updater contacts for update checks,
      // channel resolution and stats. A lookup override only — deliberately not
      // the native `appId` above; it does not rename the app or change the
      // bundle identifier. https://capgo.app/docs/plugins/updater/settings/#appid
      appId: 'com.bayan.bayan',
      autoUpdate: 'atBackground',
      // The reader never sees a version number they did not ask for; Settings
      // shows it, and REQ-15 rules out interrupting them with one.
      directUpdate: false,
      // Update checks are enough. Crash and usage telemetry to a third party is
      // not something this app collects anywhere else, and a single-user
      // reading app has nobody to aggregate.
      statsUrl: '',
    },
  },
};

export default config;

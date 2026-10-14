import type { CapacitorConfig } from '@capacitor/cli';

// When CAPACITOR_SERVER_URL is provided, Capacitor loads the remote deployment.
// Otherwise, it runs offline from locally bundled assets in public/out.
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.nirvana.pos',
  appName: 'Nirvana POS',
  webDir: 'public',
  server: serverUrl ? {
    url: serverUrl,
    cleartext: true,
    androidScheme: 'https'
  } : {
    androidScheme: 'https'
  },
  ios: {
    backgroundColor: '#0f172a'
  },
  android: {
    backgroundColor: '#0f172a'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirvana.pos',
  appName: 'Nirvana POS',
  webDir: 'public',
  server: {
    // Mobile app loads from your hosted Vercel site
    url: 'https://nirvana-ten-zeta.vercel.app',
    cleartext: true,
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

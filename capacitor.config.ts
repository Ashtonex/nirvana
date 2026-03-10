import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nirvana.app',
  appName: 'Nirvana',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;

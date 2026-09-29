import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aquire.game',
  appName: 'Aquire',
  webDir: 'dist',
  backgroundColor: '#f7f8f2',
  ios: { contentInset: 'never' },
  plugins: {
    StatusBar: { style: 'LIGHT', backgroundColor: '#f7f8f2' },
    SystemBars: { style: 'LIGHT', insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
};

export default config;

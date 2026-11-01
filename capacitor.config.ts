import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bunyan.residential',
  appName: 'العمارة',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LiveUpdate: {
      autoUpdateStrategy: 'none',
      readyTimeout: 30000,
      autoBlockRolledBackBundles: true,
    },
  },
};

export default config;

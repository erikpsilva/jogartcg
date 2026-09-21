import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.jogartcg.app',
  appName: 'Jogar TCG',
  webDir: '../../client',
  backgroundColor: '#090c18',
  android: {
    allowMixedContent: false
  }
};

export default config;

import { Capacitor } from '@capacitor/core';

function getDefaultApiBaseUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return 'https://www.jogartcg.com.br/api/v1';
  }

  if (window.location.port === '5173') {
    return '/api/v1';
  }

  if (window.location.hostname === 'localhost') {
    return `${window.location.origin}/jogartcg/api/v1`;
  }

  return `${window.location.origin}/api/v1`;
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl()).replace(/\/$/, '');

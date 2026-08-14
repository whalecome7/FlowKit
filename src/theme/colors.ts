export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  warningBg: string;
  headerBg: string;
}

export const lightColors: ThemeColors = {
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceAlt: '#f0f0f0',
  text: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  primary: '#4a90d9',
  border: '#e0e0e0',
  danger: '#d9534f',
  success: '#5cb85c',
  warning: '#b26a00',
  warningBg: '#fff8e1',
  headerBg: '#ffffff',
};

export const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#2a2a2a',
  text: '#f0f0f0',
  textSecondary: '#aaaaaa',
  textMuted: '#777777',
  primary: '#5b9bd5',
  border: '#333333',
  danger: '#e0706c',
  success: '#6cc06c',
  warning: '#d9a03f',
  warningBg: '#3a3120',
  headerBg: '#1e1e1e',
};

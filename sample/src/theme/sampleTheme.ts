/** Same tokens as the Flocon Desktop dark theme, so the sample looks like the app it is debugged with. */
export const SampleTheme = {
  bg: '#111111',
  surface: '#151515',
  surfaceHigh: '#1F1F1F',
  surfaceHighest: '#282828',
  line: '#2A2A2A',
  ink: '#ECECEC',
  inkMuted: '#A3A3A3',
  inkFaint: '#828282',
  accent: '#F5B440',
  onAccent: '#1C1405',
  success: '#4FD08A',
  warning: '#F7A531',
  error: '#FF6D6D',
} as const;

/** The color of each family of plugins, used for its icon and its tile. */
export const SampleCategory = {
  network: '#5EAAF7',
  database: '#3FCFB5',
  analytics: '#B494FF',
  featureFlags: '#F5B440',
  table: '#A9D65E',
  deeplink: '#F483C2',
  timeline: '#6FD6F0',
  crash: '#FF6D6D',
  neutral: '#A8ADB6',
} as const;

export type SampleCategoryName = keyof typeof SampleCategory;

/** Translucent background behind an icon: the color with 13 % alpha. */
export const soft = (color: string) => `${color}21`;

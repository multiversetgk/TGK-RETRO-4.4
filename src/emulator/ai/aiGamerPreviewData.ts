export type AiGamerFeatureIconId = 'partner' | 'banter' | 'guide' | 'india-retro';

export interface AiGamerFutureFeature {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly icon: AiGamerFeatureIconId;
  readonly accentHex: string;
  readonly featuredGames?: readonly string[];
}

export interface AiGamerPreviewMeta {
  readonly badgeTitle: string;
  readonly panelHeading: string;
  readonly sectionLabel: string;
  readonly summaryLine: string;
  readonly statusNotice: string;
  readonly isActiveGameplay: false;
}

export const AI_GAMER_PREVIEW_META: AiGamerPreviewMeta = {
  badgeTitle: 'TGK AI GAMER – COMING SOON',
  panelHeading: 'Future Update Preview',
  sectionLabel: 'TGK RETRO 2.0 · FUTURE UPDATE PREVIEW',
  summaryLine:
    '2-Player AI Partner, Live Banter, 1P & 2P Smart Game Guide, aur Classic Underrated Retro Guide (India Edition).',
  statusNotice:
    'Preview Only — Abhi koi fake ya dummy AI gameplay active nahi hai. Existing FCEUmm core, controls, ROM loader, aur APK build untouched hain.',
  isActiveGameplay: false,
} as const;

export const AI_GAMER_COMING_SOON_FEATURES: readonly AiGamerFutureFeature[] = [
  {
    id: 'ai-2p-partner',
    number: '01',
    title: '2-Player AI Partner (Co-op & Versus)',
    description:
      'Aapke saath Player 2 bankar 2-player NES games khelega aur compete karega.',
    icon: 'partner',
    accentHex: '#C82333',
  },
  {
    id: 'live-banter-reactions',
    number: '02',
    title: 'Live Banter & Match Reactions',
    description:
      'Khelte waqt aapse baatein karega aur match ke baad batayega ki khel kar kaisa laga.',
    icon: 'banter',
    accentHex: '#F59E0B',
  },
  {
    id: 'smart-game-guide',
    number: '03',
    title: '1P & 2P Smart Game Guide',
    description:
      'Single-player aur two-player dono modes mein boss patterns, weapons, aur levels ke liye live guide karega.',
    icon: 'guide',
    accentHex: '#38BDF8',
  },
  {
    id: 'classic-underrated-india-edition',
    number: '04',
    title: 'Classic Underrated Retro Guide (India Edition)',
    description:
      'Blaster Master, Metroid, Zelda, aur Castlevania II jaise deep NES games (jo India mein kam khele gaye aur samajhne mein mushkil lagte hain) unke maps, power-ups, aur raaste aasan bhasha mein samjhayega.',
    icon: 'india-retro',
    accentHex: '#34D399',
    featuredGames: [
      'Blaster Master',
      'Metroid',
      'The Legend of Zelda',
      'Castlevania II',
    ],
  },
] as const;

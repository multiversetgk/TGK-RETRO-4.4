export type RetroCreatorCategory =
  | 'NES & Speedruns'
  | 'Hardware & Emulation'
  | 'Reviews & History';

export interface MyChannelProfile {
  channelName: string;
  handle: string;
  channelUrl: string;
  tagline: string;
  ctaLabel: string;
}

export interface CreatorVideoItem {
  id: string;
  title: string;
  videoUrl: string;
  duration: string;
  publishedLabel: string;
  category: string;
  note: string;
}

export interface RetroCreatorChannel {
  id: string;
  name: string;
  handle: string;
  channelUrl: string;
  category: RetroCreatorCategory;
  specialty: string;
  highlightLine: string;
  accentColor: string;
  isCustom?: boolean;
}

export interface CreatorHubState {
  myChannel: MyChannelProfile;
  myVideos: CreatorVideoItem[];
  retroCreators: RetroCreatorChannel[];
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl: string | null;
  error: string | null;
}

const STORAGE_KEY = 'tgk_creator_hub_v1';

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

/**
 * Strictly validates and normalizes user-entered YouTube URLs.
 * Blocks javascript:, data:, file:, vbscript:, and non-YouTube hosts so links
 * rendered in <a href> or Android Intent.ACTION_VIEW are always safe.
 */
export function validateYouTubeUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: null, error: 'Please enter a YouTube URL.' };
  }

  // Block dangerous schemes before auto-prepending https://
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'Only valid https:// YouTube links are allowed.',
    };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'Enter a valid YouTube link (e.g. https://www.youtube.com/@YourChannel).',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'Only https:// YouTube links are supported.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'URL must point to youtube.com or youtu.be.',
    };
  }

  // Always normalize to https://
  parsed.protocol = 'https:';
  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    error: null,
  };
}

/**
 * Extracts an 11-character YouTube video ID from watch, shorts, live, or youtu.be links.
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  const checked = validateYouTubeUrl(rawUrl);
  if (!checked.valid || !checked.normalizedUrl) return null;

  try {
    const parsed = new URL(checked.normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    let candidate: string | null = null;

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (parsed.pathname === '/watch') {
      candidate = parsed.searchParams.get('v');
    } else if (
      parsed.pathname.startsWith('/shorts/') ||
      parsed.pathname.startsWith('/live/')
    ) {
      candidate = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
    }

    if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

export const DEFAULT_MY_CHANNEL: MyChannelProfile = {
  channelName: 'TGK Retro Gaming',
  handle: '@TGKTestEmulators',
  channelUrl: 'https://www.youtube.com/@TGKTestEmulators',
  tagline:
    'Classic 8-bit NES challenges, Dual-Screen 1P VS Races with friends, and authentic FCEUmm gameplay highlights.',
  ctaLabel: 'Open My YouTube Channel',
};

export const DEFAULT_MY_VIDEOS: CreatorVideoItem[] = [
  {
    id: 'vid-dual-race-mario',
    title: 'Super Mario Bros. Dual-Screen 1P VS Race — Friends Chaos Mode',
    videoUrl: 'https://www.youtube.com/@TGKTestEmulators/videos',
    duration: '12:48',
    publishedLabel: 'Latest Upload',
    category: 'Dual-Screen Race',
    note: 'Top vs Bottom stacked NES race with 30s Mystery Chaos twists & live RAM scoreboard.',
  },
  {
    id: 'vid-fceumm-setup',
    title: 'TGK TEST EMULATORS — Native Android FCEUmm 60FPS + Turbo Guide',
    videoUrl: 'https://www.youtube.com/@TGKTestEmulators/videos',
    duration: '08:15',
    publishedLabel: 'Featured Guide',
    category: 'Emulator Showcase',
    note: 'Custom per-game touch layouts, Bluetooth gamepad mapping, and zero-WebView setup.',
  },
  {
    id: 'vid-survival-run',
    title: '1-Life NES Survival Challenge — Online Room Code Netplay Highlights',
    videoUrl: 'https://www.youtube.com/@TGKTestEmulators/videos',
    duration: '15:22',
    publishedLabel: 'Squad Highlights',
    category: '2P Netplay',
    note: 'Head-to-head friends squad session with WebRTC low-latency inputs and instant bookmarks.',
  },
];

export const CURATED_RETRO_CREATORS: RetroCreatorChannel[] = [
  {
    id: 'creator-avgn',
    name: 'Cinemassacre (AVGN)',
    handle: '@JamesNintendoNerd',
    channelUrl: 'https://www.youtube.com/@JamesNintendoNerd',
    category: 'Reviews & History',
    specialty: 'Classic NES & 8-Bit Deep Cuts',
    highlightLine: 'Iconic comedic reviews of classic and notoriously tough NES cartridges.',
    accentColor: '#C82333',
  },
  {
    id: 'creator-mlig',
    name: 'My Life in Gaming',
    handle: '@MyLifeInGaming',
    channelUrl: 'https://www.youtube.com/@MyLifeInGaming',
    category: 'Hardware & Emulation',
    specialty: 'CRT PVM, RGB & Video Accuracy',
    highlightLine: 'Deep technical guides on getting crisp retro pixels on CRTs and modern displays.',
    accentColor: '#F59E0B',
  },
  {
    id: 'creator-rgc',
    name: 'Retro Game Corps',
    handle: '@RetroGameCorps',
    channelUrl: 'https://www.youtube.com/@RetroGameCorps',
    category: 'Hardware & Emulation',
    specialty: 'Android & Handheld Emulation',
    highlightLine: 'Hands-on setup tutorials, shader comparisons, and controller benchmarks for retro gamers.',
    accentColor: '#34D399',
  },
  {
    id: 'creator-summoning-salt',
    name: 'Summoning Salt',
    handle: '@SummoningSalt',
    channelUrl: 'https://www.youtube.com/@SummoningSalt',
    category: 'NES & Speedruns',
    specialty: 'NES World Record Documentaries',
    highlightLine: 'Feature-length histories of Super Mario Bros., Punch-Out!!, and classic NES speedruns.',
    accentColor: '#60A5FA',
  },
  {
    id: 'creator-gaming-historian',
    name: 'Gaming Historian',
    handle: '@GamingHistorian',
    channelUrl: 'https://www.youtube.com/@GamingHistorian',
    category: 'Reviews & History',
    specialty: 'Nintendo & 90s Console History',
    highlightLine: 'Well-researched documentaries covering the creators and hardware behind 80s/90s classics.',
    accentColor: '#F472B6',
  },
  {
    id: 'creator-mvg',
    name: 'Modern Vintage Gamer',
    handle: '@ModernVintageGamer',
    channelUrl: 'https://www.youtube.com/@ModernVintageGamer',
    category: 'Hardware & Emulation',
    specialty: 'Emulators, Homebrew & Hardware',
    highlightLine: 'Developer perspective on emulator cores, console architecture, and retro reverse engineering.',
    accentColor: '#A78BFA',
  },
];

function cloneDefaultState(): CreatorHubState {
  return {
    myChannel: { ...DEFAULT_MY_CHANNEL },
    myVideos: DEFAULT_MY_VIDEOS.map((v) => ({ ...v })),
    retroCreators: CURATED_RETRO_CREATORS.map((c) => ({ ...c })),
  };
}

export class CreatorHubStore {
  private state: CreatorHubState;

  constructor() {
    this.state = this.loadFromStorage();
  }

  private loadFromStorage(): CreatorHubState {
    if (typeof window === 'undefined' || !window.localStorage) {
      return cloneDefaultState();
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaultState();
      const parsed = JSON.parse(raw) as Partial<CreatorHubState>;
      const fallback = cloneDefaultState();

      const myChannel: MyChannelProfile = {
        channelName:
          typeof parsed.myChannel?.channelName === 'string' && parsed.myChannel.channelName.trim()
            ? parsed.myChannel.channelName.trim().slice(0, 60)
            : fallback.myChannel.channelName,
        handle:
          typeof parsed.myChannel?.handle === 'string' && parsed.myChannel.handle.trim()
            ? parsed.myChannel.handle.trim().slice(0, 40)
            : fallback.myChannel.handle,
        channelUrl:
          typeof parsed.myChannel?.channelUrl === 'string' &&
          validateYouTubeUrl(parsed.myChannel.channelUrl).valid
            ? validateYouTubeUrl(parsed.myChannel.channelUrl).normalizedUrl!
            : fallback.myChannel.channelUrl,
        tagline:
          typeof parsed.myChannel?.tagline === 'string'
            ? parsed.myChannel.tagline.trim().slice(0, 220)
            : fallback.myChannel.tagline,
        ctaLabel:
          typeof parsed.myChannel?.ctaLabel === 'string' && parsed.myChannel.ctaLabel.trim()
            ? parsed.myChannel.ctaLabel.trim().slice(0, 40)
            : fallback.myChannel.ctaLabel,
      };

      const myVideos: CreatorVideoItem[] = Array.isArray(parsed.myVideos)
        ? parsed.myVideos
            .filter(
              (v): v is CreatorVideoItem =>
                Boolean(v && typeof v.id === 'string' && typeof v.title === 'string') &&
                typeof v.videoUrl === 'string' &&
                validateYouTubeUrl(v.videoUrl).valid
            )
            .map((v) => ({
              id: v.id,
              title: v.title.trim().slice(0, 100),
              videoUrl: validateYouTubeUrl(v.videoUrl).normalizedUrl!,
              duration: (v.duration || '10:00').trim().slice(0, 12),
              publishedLabel: (v.publishedLabel || 'Video').trim().slice(0, 28),
              category: (v.category || 'Gameplay').trim().slice(0, 32),
              note: (v.note || '').trim().slice(0, 160),
            }))
        : fallback.myVideos;

      const retroCreators: RetroCreatorChannel[] = Array.isArray(parsed.retroCreators)
        ? parsed.retroCreators
            .filter(
              (c): c is RetroCreatorChannel =>
                Boolean(c && typeof c.id === 'string' && typeof c.name === 'string') &&
                typeof c.channelUrl === 'string' &&
                validateYouTubeUrl(c.channelUrl).valid
            )
            .map((c) => ({
              id: c.id,
              name: c.name.trim().slice(0, 60),
              handle: (c.handle || '@creator').trim().slice(0, 40),
              channelUrl: validateYouTubeUrl(c.channelUrl).normalizedUrl!,
              category:
                c.category === 'NES & Speedruns' ||
                c.category === 'Hardware & Emulation' ||
                c.category === 'Reviews & History'
                  ? c.category
                  : 'Reviews & History',
              specialty: (c.specialty || 'Retro Gaming').trim().slice(0, 60),
              highlightLine: (c.highlightLine || '').trim().slice(0, 160),
              accentColor:
                typeof c.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.accentColor)
                  ? c.accentColor
                  : '#C82333',
              isCustom: Boolean(c.isCustom),
            }))
        : fallback.retroCreators;

      return { myChannel, myVideos, retroCreators };
    } catch {
      return cloneDefaultState();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage quota errors
    }
  }

  public getSnapshot(): CreatorHubState {
    return {
      myChannel: { ...this.state.myChannel },
      myVideos: this.state.myVideos.map((v) => ({ ...v })),
      retroCreators: this.state.retroCreators.map((c) => ({ ...c })),
    };
  }

  public updateMyChannel(
    input: Partial<MyChannelProfile>
  ): { ok: true; profile: MyChannelProfile } | { ok: false; error: string } {
    const nextName = (input.channelName ?? this.state.myChannel.channelName).trim();
    if (!nextName) {
      return { ok: false, error: 'Channel name is required.' };
    }

    const urlCheck = validateYouTubeUrl(input.channelUrl ?? this.state.myChannel.channelUrl);
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      return { ok: false, error: urlCheck.error ?? 'Invalid YouTube URL.' };
    }

    const rawHandle = (input.handle ?? this.state.myChannel.handle).trim();
    const normalizedHandle = rawHandle
      ? rawHandle.startsWith('@')
        ? rawHandle
        : `@${rawHandle}`
      : '@TGKChannel';

    this.state.myChannel = {
      channelName: nextName.slice(0, 60),
      handle: normalizedHandle.slice(0, 40),
      channelUrl: urlCheck.normalizedUrl,
      tagline: (input.tagline ?? this.state.myChannel.tagline).trim().slice(0, 220),
      ctaLabel:
        (input.ctaLabel ?? this.state.myChannel.ctaLabel).trim().slice(0, 40) ||
        'Open My YouTube Channel',
    };
    this.persist();
    return { ok: true, profile: { ...this.state.myChannel } };
  }

  public upsertMyVideo(input: {
    id?: string;
    title: string;
    videoUrl: string;
    duration?: string;
    publishedLabel?: string;
    category?: string;
    note?: string;
  }): { ok: true; video: CreatorVideoItem } | { ok: false; error: string } {
    const cleanTitle = input.title.trim();
    if (!cleanTitle) {
      return { ok: false, error: 'Video title is required.' };
    }
    const urlCheck = validateYouTubeUrl(input.videoUrl);
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      return { ok: false, error: urlCheck.error ?? 'Invalid YouTube video link.' };
    }

    const item: CreatorVideoItem = {
      id: input.id ?? `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle.slice(0, 100),
      videoUrl: urlCheck.normalizedUrl,
      duration: (input.duration ?? '10:00').trim().slice(0, 12) || '10:00',
      publishedLabel: (input.publishedLabel ?? 'New Upload').trim().slice(0, 28) || 'New Upload',
      category: (input.category ?? 'NES Gameplay').trim().slice(0, 32) || 'NES Gameplay',
      note: (input.note ?? '').trim().slice(0, 160),
    };

    const existingIdx = this.state.myVideos.findIndex((v) => v.id === item.id);
    if (existingIdx >= 0) {
      this.state.myVideos[existingIdx] = item;
    } else {
      this.state.myVideos = [item, ...this.state.myVideos];
    }
    this.persist();
    return { ok: true, video: { ...item } };
  }

  public deleteMyVideo(id: string): void {
    this.state.myVideos = this.state.myVideos.filter((v) => v.id !== id);
    this.persist();
  }

  public upsertRetroCreator(input: {
    id?: string;
    name: string;
    handle: string;
    channelUrl: string;
    category: RetroCreatorCategory;
    specialty: string;
    highlightLine: string;
    accentColor?: string;
  }): { ok: true; creator: RetroCreatorChannel } | { ok: false; error: string } {
    const cleanName = input.name.trim();
    if (!cleanName) {
      return { ok: false, error: 'Channel name is required.' };
    }
    const urlCheck = validateYouTubeUrl(input.channelUrl);
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      return { ok: false, error: urlCheck.error ?? 'Invalid YouTube channel link.' };
    }

    const rawHandle = input.handle.trim();
    const handle = rawHandle
      ? rawHandle.startsWith('@')
        ? rawHandle
        : `@${rawHandle}`
      : `@${cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'RetroCreator'}`;

    const accentPalette = ['#C82333', '#F59E0B', '#34D399', '#60A5FA', '#F472B6', '#A78BFA'];
    const fallbackColor =
      accentPalette[this.state.retroCreators.length % accentPalette.length];

    const item: RetroCreatorChannel = {
      id: input.id ?? `creator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.slice(0, 60),
      handle: handle.slice(0, 40),
      channelUrl: urlCheck.normalizedUrl,
      category: input.category,
      specialty: input.specialty.trim().slice(0, 60) || 'Retro Gaming & NES',
      highlightLine:
        input.highlightLine.trim().slice(0, 160) ||
        'Curated retro gaming channel added to TGK Creator Hub.',
      accentColor:
        input.accentColor && /^#[0-9a-fA-F]{6}$/.test(input.accentColor)
          ? input.accentColor
          : fallbackColor,
      isCustom: true,
    };

    const existingIdx = this.state.retroCreators.findIndex((c) => c.id === item.id);
    if (existingIdx >= 0) {
      this.state.retroCreators[existingIdx] = item;
    } else {
      this.state.retroCreators = [item, ...this.state.retroCreators];
    }
    this.persist();
    return { ok: true, creator: { ...item } };
  }

  public deleteRetroCreator(id: string): void {
    this.state.retroCreators = this.state.retroCreators.filter((c) => c.id !== id);
    this.persist();
  }

  public resetRetroCreators(): RetroCreatorChannel[] {
    this.state.retroCreators = CURATED_RETRO_CREATORS.map((c) => ({ ...c }));
    this.persist();
    return this.state.retroCreators.map((c) => ({ ...c }));
  }
}

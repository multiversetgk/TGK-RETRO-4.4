import React from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Crown,
  FolderOpen,
  Gamepad2,
  Globe,
  Home,
  Lock,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  User,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import {
  ALL_ACHIEVEMENT_CATEGORIES,
  getAchievementsForGame,
  getCatalogAchievementTotals,
  getStageClearAchievementsForGame,
} from '../emulator/champions/achievementCatalog';
import {
  AVATAR_PRESETS,
  ChampionsProfileStore,
  COUNTRY_OPTIONS,
  FOUNDER_BADGE_LABEL,
  OFFICIAL_RANKING_RULES,
  RANK_TIERS,
} from '../emulator/champions/championsStore';
import {
  ALL_NES_GENRES,
  buildCompatibilityMatrix,
  filterAndSortCatalog,
  getCatalogGameById,
  matchCatalogAgainstUserLibrary,
  NES_CHAMPIONS_CATALOG_60,
} from '../emulator/champions/nesCatalog60';
import type {
  AchievementCategory,
  CompatibilityTier,
  LocalRomMatchResult,
  NesGenre,
  PlaySessionMode,
  RunSessionIntegrityState,
  TrophyTier,
} from '../emulator/champions/types';
import {
  formatNesFramesToSplitMs,
  formatNesFramesToTime,
} from '../emulator/champions/verificationEngine';
import type { UserRomEntry } from '../emulator/roms/userRomLibraryStore';
import { CartridgeCoverArt, PixelTrophyIcon } from './PixelTrophyIcon';

export type ChampionsSectionId =
  | 'home'
  | 'catalog'
  | 'my-achievements'
  | 'trophy-collection'
  | 'speedrun-arena'
  | 'challenge-arena'
  | 'global-leaderboard'
  | 'country-leaderboard'
  | 'friends-leaderboard'
  | 'game-leaderboard'
  | 'player-profile'
  | 'hall-of-fame'
  | 'verification-status';

interface ChampionsDashboardProps {
  userRoms: UserRomEntry[];
  sessionMode: PlaySessionMode;
  liveIntegrity: RunSessionIntegrityState;
  profileStore: ChampionsProfileStore;
  storeVersion: number;
  onProfileStoreMutated: () => void;
  onChangeSessionMode: (mode: PlaySessionMode) => void;
  onLaunchUserRom: (userRomId: string) => void;
  onRequestLoadRomFile: () => void;
  onBack: () => void;
}

const SIDEBAR_SECTIONS: {
  id: ChampionsSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'home', label: 'Champions Home', icon: Home },
  { id: 'catalog', label: 'NES Game Catalog', icon: Gamepad2 },
  { id: 'my-achievements', label: 'My Achievements', icon: Award },
  { id: 'trophy-collection', label: 'Trophy Collection', icon: Trophy },
  { id: 'speedrun-arena', label: 'Speedrun Arena', icon: Timer },
  { id: 'challenge-arena', label: 'Challenge Arena', icon: Swords },
  { id: 'global-leaderboard', label: 'Global Leaderboard', icon: Globe },
  { id: 'country-leaderboard', label: 'Country Leaderboard', icon: Globe },
  { id: 'friends-leaderboard', label: 'Friends Leaderboard', icon: Users },
  { id: 'game-leaderboard', label: 'Game-Wise Leaderboard', icon: Gamepad2 },
  { id: 'player-profile', label: 'Player Profile', icon: User },
  { id: 'hall-of-fame', label: 'Hall of Fame', icon: Crown },
  { id: 'verification-status', label: 'Verification Status', icon: ShieldCheck },
];

const TIER_LABEL: Record<CompatibilityTier, string> = {
  'verified-ram-hooks': 'Verified Native WRAM Hooks',
  'partial-hooks-review': 'Frame-Timed + Manual Review',
  'pending-community-review': 'Pending RAM Hooks / Video Review',
};

const TIER_TEXT_CLASS: Record<CompatibilityTier, string> = {
  'verified-ram-hooks': 'text-[#22D3EE]',
  'partial-hooks-review': 'text-[#F59E0B]',
  'pending-community-review': 'text-[#94A3B8]',
};

export const ChampionsDashboard: React.FC<ChampionsDashboardProps> = ({
  userRoms,
  sessionMode,
  liveIntegrity,
  profileStore,
  storeVersion,
  onProfileStoreMutated,
  onChangeSessionMode,
  onLaunchUserRom,
  onRequestLoadRomFile,
  onBack,
}) => {
  const [activeSection, setActiveSection] = React.useState<ChampionsSectionId>('home');
  const [selectedBookGameId, setSelectedBookGameId] = React.useState<string | null>(null);
  const [bookCategoryFilter, setBookCategoryFilter] = React.useState<AchievementCategory | 'all'>('all');

  // Catalog search, filter, sort state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [genreFilter, setGenreFilter] = React.useState<NesGenre | 'all'>('all');
  const [installedFilter, setInstalledFilter] = React.useState<'all' | 'installed' | 'not-installed'>('all');
  const [compatFilter, setCompatFilter] = React.useState<CompatibilityTier | 'all'>('all');
  const [sortBy, setSortBy] = React.useState<
    'catalog-asc' | 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc' | 'verified-first'
  >('catalog-asc');

  // Matrix filter
  const [matrixSearch, setMatrixSearch] = React.useState('');
  const [matrixTier, setMatrixTier] = React.useState<CompatibilityTier | 'all'>('all');

  // Leaderboard selectors
  const [countryLeaderboardCode, setCountryLeaderboardCode] = React.useState('IN');
  const [gameLeaderboardId, setGameLeaderboardId] = React.useState('super-mario-bros');

  // Account auth & Friends form state
  const [authTab, setAuthTab] = React.useState<'register' | 'signin'>('register');
  const [authUsername, setAuthUsername] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [authCountry, setAuthCountry] = React.useState('IN');
  const [authAvatar, setAuthAvatar] = React.useState(AVATAR_PRESETS[0].id);
  const [authClaimFounder, setAuthClaimFounder] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState<string | null>(null);
  const [friendUsernameInput, setFriendUsernameInput] = React.useState('');
  const [friendMessage, setFriendMessage] = React.useState<string | null>(null);

  // Speedrun / Challenge video proof submission state
  const [submissionCategory, setSubmissionCategory] = React.useState('Any% Speedrun');
  const [submissionBoard, setSubmissionBoard] = React.useState<'speedrun-any' | 'speedrun-100' | 'challenge'>('speedrun-any');
  const [submissionScore, setSubmissionScore] = React.useState('0');
  const [submissionVideoUrl, setSubmissionVideoUrl] = React.useState('');
  const [submissionFeedback, setSubmissionFeedback] = React.useState<string | null>(null);

  const catalogMatches = React.useMemo(() => matchCatalogAgainstUserLibrary(userRoms), [userRoms]);
  const filteredCatalog = React.useMemo(
    () =>
      filterAndSortCatalog(catalogMatches, {
        searchQuery,
        genre: genreFilter,
        installedOnly: installedFilter,
        compatibility: compatFilter,
        sortBy,
      }),
    [catalogMatches, searchQuery, genreFilter, installedFilter, compatFilter, sortBy]
  );

  const matrixRows = React.useMemo(() => {
    const all = buildCompatibilityMatrix();
    const q = matrixSearch.trim().toLowerCase();
    return all.filter((row) => {
      if (matrixTier !== 'all' && row.compatibilityTier !== matrixTier) return false;
      if (q && !row.title.toLowerCase().includes(q) && !row.genre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [matrixSearch, matrixTier]);

  const totals = React.useMemo(() => getCatalogAchievementTotals(), []);
  const installedCount = React.useMemo(
    () => catalogMatches.filter((m) => m.installed).length,
    [catalogMatches]
  );
  const verifiedGamesCount = React.useMemo(
    () => NES_CHAMPIONS_CATALOG_60.filter((g) => g.compatibilityTier === 'verified-ram-hooks').length,
    []
  );
  const partialGamesCount = React.useMemo(
    () => NES_CHAMPIONS_CATALOG_60.filter((g) => g.compatibilityTier === 'partial-hooks-review').length,
    []
  );
  const pendingGamesCount = React.useMemo(
    () => NES_CHAMPIONS_CATALOG_60.filter((g) => g.compatibilityTier === 'pending-community-review').length,
    []
  );

  // Read profile store (re-evaluated when storeVersion increments)
  const activeProfile = React.useMemo(
    () => profileStore.getActiveProfile(),
    [profileStore, storeVersion]
  );
  const unlockedList = React.useMemo(
    () => profileStore.listUnlockedAchievements(),
    [profileStore, storeVersion]
  );
  const unlockedSet = React.useMemo(
    () => new Set(unlockedList.map((u) => u.achievementId)),
    [unlockedList]
  );
  const personalStats = React.useMemo(
    () => profileStore.listPlayerGameStats(),
    [profileStore, storeVersion]
  );
  const hallOfFame = React.useMemo(
    () => profileStore.getHallOfFame(),
    [profileStore, storeVersion]
  );
  const founderSpotlight = React.useMemo(
    () => profileStore.getFounderSpotlight(),
    [profileStore, storeVersion]
  );
  const pendingReviews = React.useMemo(
    () => profileStore.listPendingVideoReviews(),
    [profileStore, storeVersion]
  );
  const googleStatus = React.useMemo(() => profileStore.getGoogleSignInStatus(), [profileStore]);

  const selectedBookMatch: LocalRomMatchResult | null = React.useMemo(() => {
    if (!selectedBookGameId) return null;
    return catalogMatches.find((m) => m.game.gameId === selectedBookGameId) ?? null;
  }, [catalogMatches, selectedBookGameId]);

  const selectedBookStageAchievements = React.useMemo(() => {
    if (!selectedBookGameId) return [];
    return getStageClearAchievementsForGame(selectedBookGameId);
  }, [selectedBookGameId]);

  const selectedBookBestSplits = React.useMemo(() => {
    if (!selectedBookGameId) return [];
    const saved = profileStore.getBestStageSplitsForGame(selectedBookGameId);
    if (saved.length > 0) return saved;
    if (liveIntegrity.gameId === selectedBookGameId && liveIntegrity.stageSplits.length > 0) {
      return liveIntegrity.stageSplits;
    }
    return [];
  }, [selectedBookGameId, profileStore, storeVersion, liveIntegrity]);

  const selectedBookAchievements = React.useMemo(() => {
    if (!selectedBookGameId) return [];
    const list = getAchievementsForGame(selectedBookGameId);
    if (bookCategoryFilter === 'all') return list;
    return list.filter((a) => a.category === bookCategoryFilter);
  }, [selectedBookGameId, bookCategoryFilter]);

  const gameRuleCountsMap = React.useMemo(() => {
    const map = new Map<string, { active: number; video: number; pending: number }>();
    for (const g of NES_CHAMPIONS_CATALOG_60) {
      const list = getAchievementsForGame(g.gameId);
      let active = 0;
      let video = 0;
      let pending = 0;
      for (const a of list) {
        if (a.autoUnlockEnabled && a.compatibilityStatus === 'active-verified') {
          active += 1;
        } else if (a.compatibilityStatus === 'manual-review-only') {
          video += 1;
        } else {
          pending += 1;
        }
      }
      map.set(g.gameId, { active, video, pending });
    }
    return map;
  }, []);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    if (authTab === 'register') {
      const res = profileStore.registerUsernameAccount({
        username: authUsername,
        password: authPassword,
        countryCode: authCountry,
        avatarId: authAvatar,
        isFounderCreator: authClaimFounder,
      });
      if (!res.ok) {
        setAuthMessage(res.error);
        return;
      }
      setAuthPassword('');
      setAuthMessage(
        res.profile.isFounderCreator
          ? `Created profile "${res.profile.username}" with ${FOUNDER_BADGE_LABEL} badge.`
          : `Created profile "${res.profile.username}".`
      );
      onProfileStoreMutated();
    } else {
      const res = profileStore.signInUsernameAccount(authUsername, authPassword);
      if (!res.ok) {
        setAuthMessage(res.error);
        return;
      }
      setAuthPassword('');
      setAuthMessage(`Signed in as "${res.profile.username}".`);
      onProfileStoreMutated();
    }
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    setFriendMessage(null);
    const res = profileStore.addFriend(friendUsernameInput);
    if (!res.ok) {
      setFriendMessage(res.error);
      return;
    }
    setFriendUsernameInput('');
    setFriendMessage('Friend added to your Friends Leaderboard roster.');
    onProfileStoreMutated();
  };

  const handleSubmitRun = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionFeedback(null);
    const res = profileStore.submitRunRecord({
      integrity: liveIntegrity,
      boardType: submissionBoard,
      categoryLabel: submissionCategory,
      score: Number(submissionScore) || 0,
      requiresManualVideoReview: true,
      videoProofUrl: submissionVideoUrl,
    });
    if (!res.ok) {
      setSubmissionFeedback(res.error);
      return;
    }
    setSubmissionVideoUrl('');
    setSubmissionFeedback(
      `Submitted ${res.record.gameTitle} (${res.record.categoryLabel}) — status: ${res.record.verificationStatus}.`
    );
    onProfileStoreMutated();
  };

  const renderLeaderboardTable = (
    scope: 'global' | 'country' | 'friends' | 'game' | 'speedrun' | 'challenge',
    title: string,
    emptyExplain: string
  ) => {
    const rows = profileStore.getOfficialLeaderboard({
      scope,
      countryCode: countryLeaderboardCode,
      gameId: gameLeaderboardId,
    });

    const founderTopRow = founderSpotlight?.verifiedRecords[0] ?? null;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#F8FAFC]">{title}</h2>
            <p className="mt-1 text-xs text-[#94A3B8]">
              Verified native FCEUmm &amp; moderator-approved records only · Zero synthetic or seeded entries
            </p>
          </div>
          {scope === 'country' && (
            <select
              aria-label="Select country leaderboard"
              value={countryLeaderboardCode}
              onChange={(e) => setCountryLeaderboardCode(e.target.value)}
              className="h-9 rounded-md border border-white/15 bg-[#121622] px-3 text-xs font-medium text-[#F8FAFC]"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          )}
          {scope === 'game' && (
            <select
              aria-label="Select NES game leaderboard"
              value={gameLeaderboardId}
              onChange={(e) => setGameLeaderboardId(e.target.value)}
              className="h-9 rounded-md border border-white/15 bg-[#121622] px-3 text-xs font-medium text-[#F8FAFC]"
            >
              {NES_CHAMPIONS_CATALOG_60.map((g) => (
                <option key={g.gameId} value={g.gameId}>
                  #{g.catalogNumber} {g.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* App Owner (TGK FOUNDER / CREATOR) Top Spotlight — shown ONLY when Founder has genuine verified records */}
        {founderSpotlight && founderTopRow && (
          <div
            data-testid="founder-leaderboard-spotlight"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#F59E0B]/45 bg-[#1A150B] p-4"
          >
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-extrabold text-[#F8FAFC]">
                    {founderSpotlight.profile.username}
                  </span>
                  <span className="font-mono-tabular text-[11px] font-bold tracking-wider text-[#F59E0B]">
                    {FOUNDER_BADGE_LABEL}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[#CBD5E1]">
                  {founderSpotlight.profile.rankTier.name} · ELO {founderSpotlight.profile.eloRating} · Top Verified Record: {founderTopRow.gameTitle} ({founderTopRow.exactTimeMs ?? formatNesFramesToSplitMs(founderTopRow.frames)})
                </div>
              </div>
            </div>
            <div className="font-mono-tabular text-right text-xs text-[#F59E0B]">
              {founderSpotlight.verifiedRecords.length} Verified Runs · {founderSpotlight.unlockedCount} Trophies
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#111520] p-6">
            <div className="font-display text-sm font-bold text-[#F8FAFC]">
              No Verified Official Records Yet
            </div>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[#94A3B8]">
              {emptyExplain}
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setActiveSection('catalog')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0891B2] px-3.5 text-xs font-semibold text-white hover:bg-[#06B6D4] whitespace-nowrap shrink-0"
              >
                <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Browse 60-Game NES Catalog</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection(scope === 'friends' ? 'player-profile' : 'speedrun-arena')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-[#161B29] px-3.5 text-xs font-semibold text-[#E2E8F0] hover:border-[#22D3EE]/60 whitespace-nowrap shrink-0"
              >
                {scope === 'friends' ? (
                  <>
                    <UserPlus className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                    <span>Manage Friends Roster</span>
                  </>
                ) : (
                  <>
                    <Timer className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                    <span>Open Speedrun Arena</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#111520]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-[#151A28] text-[11px] font-semibold text-[#94A3B8]">
                <tr>
                  <th className="px-3.5 py-2.5">Rank</th>
                  <th className="px-3.5 py-2.5">Player</th>
                  <th className="px-3.5 py-2.5">NES Title</th>
                  <th className="px-3.5 py-2.5">Category</th>
                  <th className="px-3.5 py-2.5 text-right">Exact Time (MM:SS.ms)</th>
                  <th className="px-3.5 py-2.5 text-right">Score</th>
                  <th className="px-3.5 py-2.5">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 text-[#E2E8F0]">
                {rows.map((row, idx) => (
                  <tr
                    key={row.recordId}
                    className={
                      row.isFounderCreator ? 'bg-[#F59E0B]/[0.06] hover:bg-[#F59E0B]/[0.1]' : 'hover:bg-white/[0.02]'
                    }
                  >
                    <td className="font-mono-tabular px-3.5 py-2.5 font-bold text-[#F59E0B]">
                      #{idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{row.playerName}</span>
                        {row.isFounderCreator && (
                          <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] font-bold text-[#F59E0B]">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            {FOUNDER_BADGE_LABEL}
                          </span>
                        )}
                        <span className="text-[#64748B]">
                          · {row.countryCode}
                          {row.rankTierName ? ` · ${row.rankTierName}` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">{row.gameTitle}</td>
                    <td className="px-3.5 py-2.5 text-[#CBD5E1]">{row.categoryLabel}</td>
                    <td className="font-mono-tabular px-3.5 py-2.5 text-right text-[#22D3EE]">
                      {row.exactTimeMs ?? formatNesFramesToSplitMs(row.frames)} ({row.frames}f)
                    </td>
                    <td className="font-mono-tabular px-3.5 py-2.5 text-right">
                      {row.score.toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 text-[#34D399]">Verified Native</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Explicit Official Ranking & Tie-Breaker Rules */}
        <div className="grid gap-3 border-t border-white/10 pt-4 text-xs text-[#94A3B8] md:grid-cols-3">
          <div>
            <div className="font-semibold text-[#E2E8F0]">Tie-Breaker Policy</div>
            <p className="mt-1 leading-relaxed">{OFFICIAL_RANKING_RULES.tieBreaker}</p>
          </div>
          <div>
            <div className="font-semibold text-[#E2E8F0]">Invalid Run Enforcement</div>
            <p className="mt-1 leading-relaxed">{OFFICIAL_RANKING_RULES.invalidRuns}</p>
          </div>
          <div>
            <div className="font-semibold text-[#E2E8F0]">Verification Standard</div>
            <p className="mt-1 leading-relaxed">{OFFICIAL_RANKING_RULES.verificationPolicy}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="champions-dashboard"
      className="flex h-full w-full flex-col overflow-hidden bg-[#0A0C12] text-[#F1F5F9]"
    >
      {/* Top 3-Zone Navigation Contract */}
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-white/10 bg-[#0E111B] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/12 bg-[#161B29] px-2.5 text-xs font-semibold text-[#E2E8F0] hover:border-[#22D3EE]/50 hover:text-white whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>
          <span className="font-display text-sm font-extrabold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0">
            TGK RETRO 4.4 · NES Champions
          </span>
        </div>

        {/* Official Ranked vs Practice Mode Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Session verification mode"
            className="flex items-center rounded-md border border-white/12 bg-[#141926] p-0.5"
          >
            <button
              type="button"
              data-testid="mode-official-ranked-btn"
              onClick={() => onChangeSessionMode('official-ranked')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sessionMode === 'official-ranked'
                  ? 'bg-[#0891B2] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Official Ranked
            </button>
            <button
              type="button"
              data-testid="mode-practice-btn"
              onClick={() => onChangeSessionMode('practice')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sessionMode === 'practice'
                  ? 'bg-[#6D28D9] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Practice Mode
            </button>
          </div>

          <button
            type="button"
            onClick={onRequestLoadRomFile}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#F59E0B] px-3 text-xs font-bold text-[#0A0C12] hover:bg-[#FBBF24] whitespace-nowrap shrink-0"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Load .nes ROM</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: 240px Sidebar + Main Scrollable Viewport */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 12-Section Champions Sidebar */}
        <aside className="shrink-0 border-b border-white/10 bg-[#0D1019] md:w-60 md:border-r md:border-b-0 md:overflow-y-auto">
          <nav
            aria-label="Champions Dashboard Sections"
            className="flex gap-1 overflow-x-auto p-2.5 md:flex-col md:overflow-x-visible"
          >
            {SIDEBAR_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const active = activeSection === sec.id && !selectedBookGameId;
              return (
                <button
                  key={sec.id}
                  type="button"
                  data-testid={`champions-nav-${sec.id}`}
                  onClick={() => {
                    setSelectedBookGameId(null);
                    setActiveSection(sec.id);
                  }}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#172033] text-[#22D3EE]'
                      : 'text-[#94A3B8] hover:bg-white/[0.04] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Compact Player Summary Footer in Sidebar */}
          <div className="hidden border-t border-white/10 p-3.5 md:block">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#F8FAFC]">
              <span className="truncate">{activeProfile ? activeProfile.username : 'Not Signed In'}</span>
              {activeProfile?.isFounderCreator && (
                <Crown className="h-3 w-3 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              )}
            </div>
            <div className="font-mono-tabular mt-1 text-xs text-[#22D3EE]">
              {activeProfile
                ? `${activeProfile.rankTier.name} · ELO ${activeProfile.eloRating}`
                : 'Sign in under Player Profile'}
            </div>
            {activeProfile && (
              <div className="font-mono-tabular mt-0.5 text-[11px] text-[#94A3B8]">
                Lv.{activeProfile.level} · {activeProfile.xp} XP · {activeProfile.countryCode}
              </div>
            )}
            <div className="font-mono-tabular mt-2 flex items-center gap-3 text-[11px] text-[#94A3B8]">
              <span>B:{activeProfile?.trophies.bronze ?? 0}</span>
              <span>S:{activeProfile?.trophies.silver ?? 0}</span>
              <span className="text-[#F59E0B]">G:{activeProfile?.trophies.gold ?? 0}</span>
              <span className="text-[#22D3EE]">P:{activeProfile?.trophies.platinum ?? 0}</span>
            </div>
          </div>
        </aside>

        {/* Main Section Viewport */}
        <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-7">
          {/* TROPHY BOOK DETAIL VIEW FOR ANY SELECTED NES GAME */}
          {selectedBookMatch ? (
            <div className="mx-auto max-w-5xl space-y-6" data-testid="game-trophy-book">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedBookGameId(null)}
                    className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#22D3EE] hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Back to 60-Game NES Catalog</span>
                  </button>
                  <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                    #{selectedBookMatch.game.catalogNumber} {selectedBookMatch.game.title} — Trophy Book
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                    <span>{selectedBookMatch.game.publisher}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedBookMatch.game.releaseYear}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedBookMatch.game.genre}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedBookMatch.game.regions.join(' / ')}</span>
                    <span aria-hidden="true">·</span>
                    <span className={TIER_TEXT_CLASS[selectedBookMatch.game.compatibilityTier]}>
                      {TIER_LABEL[selectedBookMatch.game.compatibilityTier]}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {selectedBookMatch.installed && selectedBookMatch.matchedUserRomId ? (
                    <button
                      type="button"
                      onClick={() => onLaunchUserRom(selectedBookMatch.matchedUserRomId!)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0891B2] px-4 text-xs font-bold text-white hover:bg-[#06B6D4] whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span>Play on FCEUmm</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestLoadRomFile}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-[#161B29] px-3.5 text-xs font-semibold text-[#E2E8F0] hover:border-[#F59E0B]/60 whitespace-nowrap shrink-0"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                      <span>Load Local .nes File</span>
                    </button>
                  )}
                </div>
              </div>

              {/* RAM Hook & Supported Regional Variants Summary */}
              <div className="grid gap-4 rounded-lg border border-white/10 bg-[#111520] p-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-[#E2E8F0]">Native FCEUmm Verification Status</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">
                    {selectedBookMatch.game.ramHookSummary.notes}
                  </p>
                  {selectedBookMatch.game.ramHookSummary.addresses.length > 0 && (
                    <div className="font-mono-tabular mt-2 text-[11px] text-[#22D3EE]">
                      WRAM Hooks: {selectedBookMatch.game.ramHookSummary.addresses.join(' · ')}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#E2E8F0]">
                    Supported Regional Variants (Metadata Only)
                  </div>
                  <div className="mt-1 space-y-1 text-xs text-[#94A3B8]">
                    {selectedBookMatch.game.supportedVariants.map((v) => (
                      <div key={v.variantId}>
                        {v.label} · {v.mapperName} · {v.revision}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-[#CBD5E1]">
                    Local Library:{' '}
                    {selectedBookMatch.installed
                      ? `Installed (${selectedBookMatch.matchedFileName})`
                      : 'Not installed in your local .nes ROM library'}
                  </div>
                </div>
              </div>

              {/* Stage-by-Stage Clear Achievements & Exact MM:SS.ms Split Timing */}
              <div
                data-testid="stage-by-stage-splits-panel"
                className="rounded-lg border border-[#22D3EE]/25 bg-[#0F1524] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <div className="font-display text-sm font-bold text-[#F8FAFC]">
                      Stage-by-Stage Clear &amp; Game Completion (Strict 90s Arcade Rule)
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                      Exact emulator frame-counter split times (MM:SS.ms) &amp; completion timestamps · Disqualified immediately if Save-State load, Rewind, Fast-Forward, or Cheats are used
                    </p>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-[#22D3EE]">
                    {selectedBookStageAchievements.length} Stage &amp; Completion Milestones
                  </span>
                </div>

                <div className="mt-3 divide-y divide-white/8">
                  {selectedBookStageAchievements.map((stAch) => {
                    const isUnlocked = unlockedSet.has(stAch.achievementId);
                    const splitRec = selectedBookBestSplits.find(
                      (s) => s.stageNumber === stAch.stageNumber
                    );
                    return (
                      <div
                        key={stAch.achievementId}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PixelTrophyIcon tier={stAch.trophyTier} size={22} className="shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-[#F8FAFC] truncate">
                              {stAch.name}
                            </div>
                            <div className="text-[11px] text-[#94A3B8]">
                              +{stAch.xpReward} XP · {stAch.autoUnlockEnabled ? 'Native WRAM Hook' : 'Pending RAM Hook / Video Proof'}
                            </div>
                          </div>
                        </div>

                        <div className="font-mono-tabular text-right">
                          {splitRec ? (
                            <>
                              <div className="font-bold text-[#22D3EE]">
                                Split {splitRec.splitTimeMs} · Total {splitRec.cumulativeTimeMs}
                              </div>
                              <div className="text-[10px] text-[#94A3B8]">
                                {new Date(splitRec.completedAtMs).toLocaleString()} · {splitRec.verifiedOfficial ? 'Official' : 'Non-Official'}
                              </div>
                            </>
                          ) : (
                            <div className={isUnlocked ? 'font-semibold text-[#34D399]' : 'text-[#64748B]'}>
                              {isUnlocked ? 'Unlocked · Official' : 'Split --:--.---'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Filter for the 50 Achievements */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-mono-tabular text-xs text-[#94A3B8]">
                  Showing {selectedBookAchievements.length} of 50 achievements ·{' '}
                  {gameRuleCountsMap.get(selectedBookMatch.game.gameId)?.active ?? 0} auto-verified ·{' '}
                  {gameRuleCountsMap.get(selectedBookMatch.game.gameId)?.video ?? 0} video-review ·{' '}
                  {gameRuleCountsMap.get(selectedBookMatch.game.gameId)?.pending ?? 0} pending hooks
                </div>
                <select
                  aria-label="Filter achievements by category"
                  value={bookCategoryFilter}
                  onChange={(e) => setBookCategoryFilter(e.target.value as AchievementCategory | 'all')}
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-3 text-xs text-[#F8FAFC]"
                >
                  <option value="all">All 19 Categories (50)</option>
                  {ALL_ACHIEVEMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* 50-Achievement Table/List */}
              <div className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#111520]">
                {selectedBookAchievements.map((ach) => {
                  const isUnlocked = unlockedSet.has(ach.achievementId);
                  return (
                    <div
                      key={ach.achievementId}
                      className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <PixelTrophyIcon tier={ach.trophyTier} size={28} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-bold text-[#F8FAFC]">
                              {ach.name}
                            </span>
                            {isUnlocked && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#34D399]">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Unlocked
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[#94A3B8]">{ach.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                            <span>{ach.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{ach.difficulty}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-[#F59E0B]">+{ach.xpReward} XP</span>
                            <span aria-hidden="true">·</span>
                            <span>{ach.exactConditions}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <div
                          className={`text-xs font-semibold ${
                            ach.autoUnlockEnabled
                              ? 'text-[#22D3EE]'
                              : ach.compatibilityStatus === 'manual-review-only'
                                ? 'text-[#A78BFA]'
                                : 'text-[#64748B]'
                          }`}
                        >
                          {ach.autoUnlockEnabled
                            ? 'Active · Native WRAM'
                            : ach.compatibilityStatus === 'manual-review-only'
                              ? 'Video Proof · Manual Review'
                              : 'Pending RAM Hooks'}
                        </div>
                        <div className="font-mono-tabular mt-0.5 text-[10px] text-[#64748B]">
                          {ach.achievementId}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeSection === 'home' ? (
            /* 1. CHAMPIONS HOME */
            <div className="mx-auto max-w-5xl space-y-7">
              <div className="rounded-lg border border-white/10 bg-[#111520] p-6">
                <div className="font-mono-tabular text-xs font-semibold tracking-wider text-[#22D3EE]">
                  PLAY → ACHIEVE → VERIFY → RANK → BECOME A LEGEND
                </div>
                <h1 className="font-display mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-[#F8FAFC]">
                  TGK RETRO 4.4 — NES Champions System
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
                  Competitive NES-only achievement, stage-split speedrun, and 2P VS ELO ecosystem integrated directly with the native{' '}
                  <span className="font-semibold text-[#E2E8F0]">FCEUmm (libretro-fceumm)</span> core. Strict 90s Arcade Rules apply—zero bundled ROMs and zero fabricated leaderboard records.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="home-open-catalog-btn"
                    onClick={() => setActiveSection('catalog')}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0891B2] px-4 text-xs font-bold text-white hover:bg-[#06B6D4] whitespace-nowrap shrink-0"
                  >
                    <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                    <span>Explore All 60 NES Games</span>
                  </button>
                  <button
                    type="button"
                    data-testid="home-open-matrix-btn"
                    onClick={() => setActiveSection('verification-status')}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-[#161B29] px-4 text-xs font-semibold text-[#E2E8F0] hover:border-[#A78BFA]/60 whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                    <span>60-Game Compatibility Matrix</span>
                  </button>
                </div>
              </div>

              {/* 4-Column Quantitative KPI Strip (Real Data Only) */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                  <div className="text-xs text-[#94A3B8]">NES-Only Catalog</div>
                  <div className="font-mono-tabular mt-1 text-2xl font-bold text-[#F8FAFC]">
                    {totals.totalGames} Titles
                  </div>
                  <div className="mt-1 text-[11px] text-[#22D3EE]">
                    {installedCount} matched in local library
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                  <div className="text-xs text-[#94A3B8]">Achievement Definitions</div>
                  <div className="font-mono-tabular mt-1 text-2xl font-bold text-[#F8FAFC]">
                    {totals.totalDefinitions.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[11px] text-[#A78BFA]">
                    {totals.activeAutoVerified} active auto-verified rules
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                  <div className="text-xs text-[#94A3B8]">Verified WRAM Games</div>
                  <div className="font-mono-tabular mt-1 text-2xl font-bold text-[#F59E0B]">
                    {verifiedGamesCount} / 60
                  </div>
                  <div className="mt-1 text-[11px] text-[#94A3B8]">
                    {partialGamesCount} partial · {pendingGamesCount} pending
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                  <div className="text-xs text-[#94A3B8]">90s Arcade Rule Status</div>
                  <div
                    data-testid="champions-90s-rule-status"
                    className={`font-display mt-1 text-lg font-bold ${
                      !liveIntegrity.romSha256
                        ? 'text-[#22D3EE]'
                        : liveIntegrity.runValidityStatus === 'VALID_OFFICIAL'
                          ? 'text-[#34D399]'
                          : liveIntegrity.runValidityStatus === 'PRACTICE'
                            ? 'text-[#A78BFA]'
                            : 'text-[#F87171]'
                    }`}
                  >
                    {!liveIntegrity.romSha256
                      ? sessionMode === 'practice'
                        ? 'Practice Mode'
                        : 'Ready · Load .nes ROM'
                      : liveIntegrity.runValidityStatus === 'VALID_OFFICIAL'
                        ? 'VALID · Official Ranked'
                        : liveIntegrity.runValidityStatus === 'PRACTICE'
                          ? 'Practice Mode'
                          : 'INVALID · Disqualified'}
                  </div>
                  <div className="font-mono-tabular mt-1 text-[11px] text-[#94A3B8]">
                    {!liveIntegrity.romSha256
                      ? 'No Save-States, Rewind, FF, or Cheats'
                      : `${formatNesFramesToSplitMs(liveIntegrity.elapsedFrames)} · ${liveIntegrity.stageSplits.length} splits · ${liveIntegrity.flags.length} flags`}
                  </div>
                </div>
              </div>

              {/* Verified Native WRAM Flagships Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#F8FAFC]">
                    Verified Native WRAM Hook Games
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCompatFilter('verified-ram-hooks');
                      setActiveSection('catalog');
                    }}
                    className="text-xs font-semibold text-[#22D3EE] hover:underline"
                  >
                    View all {verifiedGamesCount} verified titles
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {catalogMatches
                    .filter((m) => m.game.compatibilityTier === 'verified-ram-hooks')
                    .slice(0, 8)
                    .map((item) => (
                      <button
                        key={item.game.gameId}
                        type="button"
                        onClick={() => setSelectedBookGameId(item.game.gameId)}
                        className="flex flex-col gap-2.5 rounded-lg border border-white/10 bg-[#111520] p-3 text-left transition-colors hover:border-[#22D3EE]/50"
                      >
                        <CartridgeCoverArt
                          title={item.game.title}
                          catalogNumber={item.game.catalogNumber}
                          theme={item.game.coverTheme}
                          installed={item.installed}
                        />
                        <div className="min-w-0">
                          <div className="font-display truncate text-sm font-bold text-[#F8FAFC]">
                            {item.game.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#94A3B8]">
                            {item.game.genre} · {gameRuleCountsMap.get(item.game.gameId)?.active ?? 0}/50 auto rules
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : activeSection === 'catalog' ? (
            /* 2. NES GAME CATALOG (60 TITLES) */
            <div className="mx-auto max-w-6xl space-y-5" data-testid="nes-catalog-60-view">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                    NES Game Catalog (60 Titles)
                  </h2>
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    NES-only catalog (#01 Contra → #60 Little Samson) · {installedCount} installed in your real local library · Metadata only, zero copyrighted ROMs
                  </p>
                </div>
                <div className="font-mono-tabular text-xs text-[#22D3EE]">
                  Showing {filteredCatalog.length} / 60 NES games
                </div>
              </div>

              {/* Search, Filter & Sort Toolbar */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
                <div className="relative sm:col-span-2 lg:col-span-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    data-testid="catalog-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, publisher, genre, region..."
                    className="h-9 w-full rounded-md border border-white/15 bg-[#121622] pr-3 pl-9 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#22D3EE] focus:outline-none"
                  />
                </div>

                <select
                  aria-label="Filter by genre"
                  data-testid="catalog-genre-filter"
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value as NesGenre | 'all')}
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-2.5 text-xs text-[#F8FAFC]"
                >
                  <option value="all">All Genres</option>
                  {ALL_NES_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by installed status"
                  data-testid="catalog-installed-filter"
                  value={installedFilter}
                  onChange={(e) =>
                    setInstalledFilter(e.target.value as 'all' | 'installed' | 'not-installed')
                  }
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-2.5 text-xs text-[#F8FAFC]"
                >
                  <option value="all">All Library Status</option>
                  <option value="installed">Installed Only ({installedCount})</option>
                  <option value="not-installed">Not Installed ({60 - installedCount})</option>
                </select>

                <select
                  aria-label="Filter by compatibility"
                  data-testid="catalog-compat-filter"
                  value={compatFilter}
                  onChange={(e) => setCompatFilter(e.target.value as CompatibilityTier | 'all')}
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-2.5 text-xs text-[#F8FAFC]"
                >
                  <option value="all">All Hooks</option>
                  <option value="verified-ram-hooks">Verified WRAM</option>
                  <option value="partial-hooks-review">Partial / Timed</option>
                  <option value="pending-community-review">Pending Review</option>
                </select>

                <select
                  aria-label="Sort catalog"
                  data-testid="catalog-sort-select"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | 'catalog-asc'
                        | 'title-asc'
                        | 'title-desc'
                        | 'year-asc'
                        | 'year-desc'
                        | 'verified-first'
                    )
                  }
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-2.5 text-xs text-[#F8FAFC]"
                >
                  <option value="catalog-asc">#1–60 Order</option>
                  <option value="verified-first">Verified First</option>
                  <option value="title-asc">Title A–Z</option>
                  <option value="title-desc">Title Z–A</option>
                  <option value="year-asc">Year Oldest</option>
                  <option value="year-desc">Year Newest</option>
                </select>
              </div>

              {/* 60-Game Grid */}
              {filteredCatalog.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-[#111520] p-8 text-center">
                  <div className="font-display text-sm font-bold text-[#F8FAFC]">
                    No matching NES titles found
                  </div>
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    Try clearing one of the active filters or load a local .nes ROM file from your device.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredCatalog.map((item) => {
                    const g = item.game;
                    const gameUnlockedCount = unlockedList.filter((u) => u.gameId === g.gameId).length;
                    return (
                      <article
                        key={g.gameId}
                        data-testid={`catalog-card-${g.gameId}`}
                        className="flex flex-col justify-between gap-3 rounded-lg border border-white/10 bg-[#111520] p-3.5 transition-colors hover:border-white/25"
                      >
                        <div className="space-y-2.5">
                          <CartridgeCoverArt
                            title={g.title}
                            catalogNumber={g.catalogNumber}
                            theme={g.coverTheme}
                            installed={item.installed}
                          />

                          <div>
                            <h3 className="font-display text-sm font-bold leading-snug text-[#F8FAFC]">
                              {g.title}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8]">
                              <span>{g.genre}</span>
                              <span aria-hidden="true">·</span>
                              <span>{g.releaseYear}</span>
                              <span aria-hidden="true">·</span>
                              <span>{g.regions.join('/')}</span>
                            </div>
                          </div>

                          <div className="space-y-1 border-t border-white/8 pt-2 text-[11px]">
                            <div className={`font-medium ${TIER_TEXT_CLASS[g.compatibilityTier]}`}>
                              {TIER_LABEL[g.compatibilityTier]}
                            </div>
                            <div className="font-mono-tabular text-[#94A3B8]">
                              Trophies: {gameUnlockedCount}/{g.targetAchievementCount} · {gameRuleCountsMap.get(g.gameId)?.active ?? 0} auto-verified
                            </div>
                            <div className="truncate text-[#64748B]" title={item.matchedFileName ?? 'No matching local ROM'}>
                              {item.installed
                                ? `Matched: ${item.matchedFileName}`
                                : `Versions: ${g.supportedVariants.map((v) => v.region).join(', ')} (${g.supportedVariants[0]?.mapperName})`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setBookCategoryFilter('all');
                              setSelectedBookGameId(g.gameId);
                            }}
                            className="flex-1 rounded-md border border-white/12 bg-[#161B29] py-1.5 text-xs font-semibold text-[#E2E8F0] hover:border-[#22D3EE]/50 hover:text-white"
                          >
                            Trophy Book (50)
                          </button>
                          {item.installed && item.matchedUserRomId && (
                            <button
                              type="button"
                              onClick={() => onLaunchUserRom(item.matchedUserRomId!)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#0891B2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#06B6D4]"
                            >
                              <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                              <span>Play</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeSection === 'my-achievements' ? (
            /* 3. MY ACHIEVEMENTS */
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                  My Achievements
                </h2>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Verified Official Ranked unlocks earned via native FCEUmm WRAM rules ({unlockedList.length} unlocked)
                </p>
              </div>

              {unlockedList.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-[#111520] p-6">
                  <div className="font-display text-sm font-bold text-[#F8FAFC]">
                    No Verified Achievements Unlocked Yet
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                    Load a verified NES cartridge (such as Super Mario Bros., Contra, Mega Man 2, Castlevania,
                    or The Legend of Zelda) in Official Ranked Mode with zero save-state or turbo flags to earn
                    verified trophies automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/8 rounded-lg border border-white/10 bg-[#111520]">
                  {unlockedList.map((u) => {
                    const game = getCatalogGameById(u.gameId);
                    const def = getAchievementsForGame(u.gameId).find(
                      (a) => a.achievementId === u.achievementId
                    );
                    return (
                      <div key={u.achievementId} className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3">
                          <PixelTrophyIcon tier={u.trophyTier} size={28} />
                          <div>
                            <div className="font-display text-sm font-bold text-[#F8FAFC]">
                              {def?.name ?? u.achievementId}
                            </div>
                            <div className="text-xs text-[#94A3B8]">
                              {game?.title ?? u.gameId} · Frame {u.frameCount} · {u.coreVersion}
                            </div>
                          </div>
                        </div>
                        <div className="font-mono-tabular text-right text-xs">
                          <div className="font-bold text-[#F59E0B]">+{u.xpAwarded} XP</div>
                          <div className="text-[#34D399]">Verified Official</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeSection === 'trophy-collection' ? (
            /* 4. TROPHY COLLECTION */
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                  Trophy Collection
                </h2>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Bronze (Beginner · 25 XP) · Silver (Skilled · 75 XP) · Gold (Advanced · 150 XP) · Platinum (Elite · 300 XP)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                {(
                  [
                    { tier: 'bronze' as TrophyTier, label: 'Bronze', desc: 'Beginner challenges · 25 XP' },
                    { tier: 'silver' as TrophyTier, label: 'Silver', desc: 'Skilled player challenges · 75 XP' },
                    { tier: 'gold' as TrophyTier, label: 'Gold', desc: 'Advanced challenges · 150 XP' },
                    { tier: 'platinum' as TrophyTier, label: 'Platinum', desc: 'Elite challenges · 300 XP' },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.tier}
                    className="flex flex-col items-center rounded-lg border border-white/10 bg-[#111520] p-5 text-center"
                  >
                    <PixelTrophyIcon tier={item.tier} size={44} />
                    <div className="font-display mt-3 text-base font-bold text-[#F8FAFC]">
                      {item.label}
                    </div>
                    <div className="font-mono-tabular mt-1 text-2xl font-extrabold text-[#22D3EE]">
                      {activeProfile?.trophies[item.tier] ?? 0}
                    </div>
                    <div className="mt-1 text-[11px] text-[#94A3B8]">{item.desc}</div>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="font-display mb-3 text-sm font-bold text-[#F8FAFC]">
                  Per-Game Trophy Books (60 NES Titles)
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {NES_CHAMPIONS_CATALOG_60.map((g) => {
                    const count = unlockedList.filter((u) => u.gameId === g.gameId).length;
                    return (
                      <button
                        key={g.gameId}
                        type="button"
                        onClick={() => setSelectedBookGameId(g.gameId)}
                        className="flex items-center justify-between rounded-md border border-white/10 bg-[#111520] px-3.5 py-2.5 text-left text-xs hover:border-[#22D3EE]/50"
                      >
                        <span className="truncate font-medium text-[#E2E8F0]">
                          #{g.catalogNumber} {g.title}
                        </span>
                        <span className="font-mono-tabular ml-2 shrink-0 text-[#94A3B8]">
                          {count}/50
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeSection === 'speedrun-arena' || activeSection === 'challenge-arena' ? (
            /* 5. SPEEDRUN ARENA & 6. CHALLENGE ARENA */
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                  {activeSection === 'speedrun-arena' ? 'Speedrun Arena' : 'Challenge Arena'}
                </h2>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  {activeSection === 'speedrun-arena'
                    ? 'Frame-accurate NTSC NES timing (60.0988 FPS) · Accounts for pause, reset, rewind, fast-forward & save-states'
                    : 'No Death, No Hit, 1CC, No Upgrade, Boss Master, and Marathon challenges with transparent verification'}
                </p>
              </div>

              {/* Live Frame-Accurate Timer (MM:SS.ms) & Strict 90s Rule Integrity Status */}
              <div className="grid gap-4 rounded-lg border border-white/10 bg-[#111520] p-5 md:grid-cols-3">
                <div>
                  <div className="text-xs text-[#94A3B8]">Emulator Frame Clock (MM:SS.ms)</div>
                  <div className="font-mono-tabular mt-1 text-2xl font-bold text-[#22D3EE]">
                    {formatNesFramesToSplitMs(liveIntegrity.elapsedFrames)}
                  </div>
                  <div className="font-mono-tabular mt-0.5 text-[11px] text-[#64748B]">
                    {liveIntegrity.elapsedFrames.toLocaleString()} frames @ 60.0988 Hz ({formatNesFramesToTime(liveIntegrity.elapsedFrames)})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#94A3B8]">Active Cartridge</div>
                  <div className="font-display mt-1 truncate text-sm font-bold text-[#F8FAFC]">
                    {liveIntegrity.romName ?? 'No .nes ROM loaded'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#94A3B8]">
                    Mode: {liveIntegrity.mode === 'official-ranked' ? 'Official Ranked' : 'Practice Mode'} · Splits: {liveIntegrity.stageSplits.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#94A3B8]">90s Arcade Rule Verdict</div>
                  <div
                    className={`font-display mt-1 text-sm font-bold ${
                      liveIntegrity.runValidityStatus === 'VALID_OFFICIAL'
                        ? 'text-[#34D399]'
                        : 'text-[#F87171]'
                    }`}
                  >
                    {liveIntegrity.runValidityStatus === 'VALID_OFFICIAL'
                      ? 'VALID — Eligible for Official Submission'
                      : liveIntegrity.runValidityStatus === 'PRACTICE'
                        ? 'Practice Mode (Non-Official)'
                        : 'INVALID — Disqualified by 90s Rule'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#94A3B8]">
                    Save Loads: {liveIntegrity.saveStateLoadCount} · Rewind: {liveIntegrity.rewindCount} · FF: {liveIntegrity.fastForwardFrames > 0 ? 'Flagged' : 'Clean'} · Cheats: {liveIntegrity.cheatsUsed ? 'Flagged' : 'Clean'}
                  </div>
                </div>
              </div>

              {/* Live Recorded Stage-by-Stage Splits */}
              {liveIntegrity.stageSplits.length > 0 && (
                <div className="rounded-lg border border-[#22D3EE]/25 bg-[#101626] p-4">
                  <div className="font-display text-xs font-bold text-[#22D3EE]">
                    Live Session Stage Splits (Exact Emulator Frame Counter)
                  </div>
                  <div className="mt-2 divide-y divide-white/8 text-xs">
                    {liveIntegrity.stageSplits.map((sp) => (
                      <div key={sp.stageNumber} className="flex items-center justify-between py-1.5">
                        <span className="font-medium text-[#F8FAFC]">{sp.stageLabel}</span>
                        <span className="font-mono-tabular text-[#22D3EE]">
                          Split {sp.splitTimeMs} · Total {sp.cumulativeTimeMs} · {new Date(sp.completedAtMs).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Video Proof / Official Run Submission Form */}
              <form
                onSubmit={handleSubmitRun}
                className="space-y-4 rounded-lg border border-white/10 bg-[#111520] p-5"
              >
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[#F8FAFC]">
                    Submit Official Run with Video Proof (Manual Review Queue)
                  </h3>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Runs in Official Ranked Mode with zero anti-cheat flags can be submitted with an uncut YouTube or Twitch
                  video proof URL. Unverified evidence is never awarded official leaderboard rank automatically.
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <select
                    value={submissionBoard}
                    onChange={(e) =>
                      setSubmissionBoard(e.target.value as 'speedrun-any' | 'speedrun-100' | 'challenge')
                    }
                    className="h-9 rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                  >
                    <option value="speedrun-any">Speedrun Any%</option>
                    <option value="speedrun-100">Speedrun 100%</option>
                    <option value="challenge">Challenge (1CC / No-Death / No-Hit)</option>
                  </select>
                  <input
                    type="text"
                    value={submissionCategory}
                    onChange={(e) => setSubmissionCategory(e.target.value)}
                    placeholder="Category label (e.g. Any% Warpless)"
                    className="h-9 rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                  />
                  <input
                    type="number"
                    min={0}
                    value={submissionScore}
                    onChange={(e) => setSubmissionScore(e.target.value)}
                    placeholder="Score"
                    className="h-9 rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                  />
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="url"
                    value={submissionVideoUrl}
                    onChange={(e) => setSubmissionVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or https://twitch.tv/videos/..."
                    className="h-9 flex-1 rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-md bg-[#7C3AED] px-4 text-xs font-bold text-white hover:bg-[#8B5CF6] whitespace-nowrap shrink-0"
                  >
                    Queue for Review
                  </button>
                </div>

                {submissionFeedback && (
                  <div className="text-xs font-medium text-[#22D3EE]">{submissionFeedback}</div>
                )}
              </form>

              {renderLeaderboardTable(
                activeSection === 'speedrun-arena' ? 'speedrun' : 'challenge',
                activeSection === 'speedrun-arena'
                  ? 'Verified Speedrun Standings'
                  : 'Verified Challenge Standings',
                'Complete a verified Official Ranked run in FCEUmm without save-states, rewinds, fast-forward, or turbo cheats to claim the first verified standing.'
              )}

              {pendingReviews.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                  <div className="text-xs font-bold text-[#A78BFA]">
                    Pending Manual Video Review Queue ({pendingReviews.length})
                  </div>
                  <div className="mt-2 divide-y divide-white/8 text-xs text-[#CBD5E1]">
                    {pendingReviews.map((pr) => (
                      <div key={pr.recordId} className="flex items-center justify-between py-2">
                        <span>
                          {pr.gameTitle} · {pr.categoryLabel} · {pr.playerName}
                        </span>
                        <span className="font-mono-tabular text-[#94A3B8]">
                          {formatNesFramesToTime(pr.frames)} · Pending Review
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeSection === 'global-leaderboard' ? (
            /* 7. GLOBAL LEADERBOARD */
            <div className="mx-auto max-w-5xl">
              {renderLeaderboardTable(
                'global',
                'Global Leaderboard',
                'Official Global Rankings only list verified native FCEUmm runs and moderator-approved submissions. No placeholder or mock players are ever injected.'
              )}
            </div>
          ) : activeSection === 'country-leaderboard' ? (
            /* 8. COUNTRY LEADERBOARD */
            <div className="mx-auto max-w-5xl">
              {renderLeaderboardTable(
                'country',
                'Country Leaderboard',
                `No verified official runs have been recorded for ${countryLeaderboardCode} yet. Set your country under Player Profile and complete a clean Ranked run.`
              )}
            </div>
          ) : activeSection === 'friends-leaderboard' ? (
            /* 8B. FRIENDS LEADERBOARD */
            <div className="mx-auto max-w-5xl" data-testid="friends-leaderboard-view">
              {renderLeaderboardTable(
                'friends',
                'Friends Leaderboard',
                activeProfile
                  ? `Showing verified official runs for ${activeProfile.username} and your ${activeProfile.friends.length} added friend(s). Add friends under Player Profile to compare genuine verified runs.`
                  : 'Sign in under Player Profile and add friends to compare verified official runs with your circle.'
              )}
            </div>
          ) : activeSection === 'game-leaderboard' ? (
            /* 9. GAME-WISE LEADERBOARD */
            <div className="mx-auto max-w-5xl">
              {renderLeaderboardTable(
                'game',
                `Game-Wise Leaderboard — ${getCatalogGameById(gameLeaderboardId)?.title ?? gameLeaderboardId}`,
                'No verified runs have been recorded for this NES cartridge yet. Load your local .nes file in Official Ranked Mode to record the first verified benchmark.'
              )}
            </div>
          ) : activeSection === 'player-profile' ? (
            /* 10. PLAYER PROFILE & ACCOUNT */
            <div className="mx-auto max-w-5xl space-y-6" data-testid="champions-player-profile">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                  Player Profile &amp; Account
                </h2>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Unique local player profile, XP &amp; level progression, trophy history, and personal game stats · Private credentials are never exposed publicly
                </p>
              </div>

              {activeProfile ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#111520] p-5">
                    <div className="flex items-center gap-4">
                      {(() => {
                        const preset =
                          AVATAR_PRESETS.find((a) => a.id === activeProfile.avatarId) ??
                          AVATAR_PRESETS[0];
                        return (
                          <div
                            className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/15 font-display text-lg font-extrabold"
                            style={{ backgroundColor: preset.bg, color: preset.accent }}
                          >
                            {preset.code}
                          </div>
                        );
                      })()}
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-display text-xl font-extrabold text-[#F8FAFC]">
                            {activeProfile.username}
                          </span>
                          {activeProfile.isFounderCreator && (
                            <span
                              data-testid="profile-founder-badge"
                              className="inline-flex items-center gap-1 rounded border border-[#F59E0B]/50 bg-[#271E0C] px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#F59E0B]"
                            >
                              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                              {FOUNDER_BADGE_LABEL}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-tabular mt-1 text-xs text-[#94A3B8]">
                          <span style={{ color: activeProfile.rankTier.colorHex }} className="font-bold">
                            {activeProfile.rankTier.name}
                          </span>{' '}
                          · Level {activeProfile.level} · {activeProfile.xp} XP · 2P VS ELO{' '}
                          <span className="text-[#22D3EE]">{activeProfile.eloRating}</span> · Country: {activeProfile.countryCode}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeProfile.isFounderCreator ? (
                        <button
                          type="button"
                          onClick={() => {
                            profileStore.revokeFounderCreatorBadge();
                            onProfileStoreMutated();
                          }}
                          className="rounded-md border border-[#F59E0B]/35 bg-[#1B150A] px-3 py-2 text-xs font-semibold text-[#FCD34D] hover:border-[#F59E0B]"
                        >
                          Disable Owner Badge
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="claim-founder-badge-btn"
                          onClick={() => {
                            const res = profileStore.claimFounderCreatorBadge();
                            if (!res.ok) setAuthMessage(res.error);
                            else setAuthMessage(`Enabled ${FOUNDER_BADGE_LABEL} badge on your real account.`);
                            onProfileStoreMutated();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#F59E0B]/45 bg-[#241B0B] px-3 py-2 text-xs font-bold text-[#F59E0B] hover:bg-[#31240E]"
                        >
                          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Claim App Owner Badge</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          profileStore.signOut();
                          onProfileStoreMutated();
                        }}
                        className="rounded-md border border-white/15 bg-[#161B29] px-3.5 py-2 text-xs font-semibold text-[#E2E8F0] hover:border-red-400/50"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>

                  {authMessage && (
                    <div className="text-xs font-medium text-[#22D3EE]">{authMessage}</div>
                  )}

                  {/* XP Rank Tiers (Rookie -> TGK Legend) + 2P VS ELO Rating */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-[#111520] p-5">
                      <div className="flex items-center justify-between">
                        <div className="font-display text-sm font-bold text-[#F8FAFC]">
                          Rank Tier Progression (Rookie → TGK Legend)
                        </div>
                        <span
                          className="font-mono-tabular text-xs font-bold"
                          style={{ color: activeProfile.rankTier.colorHex }}
                        >
                          {activeProfile.rankTier.name}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
                        {RANK_TIERS.map((tier) => {
                          const reached = activeProfile.xp >= tier.minXp;
                          return (
                            <div
                              key={tier.id}
                              className={`rounded border px-2.5 py-1.5 ${
                                activeProfile.rankTier.id === tier.id
                                  ? 'border-[#22D3EE]/60 bg-[#132234] text-white'
                                  : reached
                                    ? 'border-white/12 bg-[#0D1019] text-[#CBD5E1]'
                                    : 'border-white/5 bg-[#0A0D15] text-[#64748B]'
                              }`}
                            >
                              <div className="font-semibold" style={reached ? { color: tier.colorHex } : undefined}>
                                {tier.name}
                              </div>
                              <div className="font-mono-tabular text-[10px]">
                                {tier.minXp.toLocaleString()} XP
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-[#111520] p-5">
                      <div className="font-display text-sm font-bold text-[#F8FAFC]">
                        2P VS ELO Rating
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2.5 text-center">
                        <div className="rounded-md bg-[#0D1019] p-3">
                          <div className="text-[10px] text-[#94A3B8]">Current ELO</div>
                          <div className="font-mono-tabular mt-0.5 text-xl font-extrabold text-[#22D3EE]">
                            {activeProfile.eloRating}
                          </div>
                        </div>
                        <div className="rounded-md bg-[#0D1019] p-3">
                          <div className="text-[10px] text-[#94A3B8]">Peak ELO</div>
                          <div className="font-mono-tabular mt-0.5 text-xl font-extrabold text-[#F59E0B]">
                            {activeProfile.peakElo}
                          </div>
                        </div>
                        <div className="rounded-md bg-[#0D1019] p-3">
                          <div className="text-[10px] text-[#94A3B8]">2P Record</div>
                          <div className="font-mono-tabular mt-0.5 text-base font-bold text-[#F8FAFC]">
                            {activeProfile.vsWins}W-{activeProfile.vsLosses}L-{activeProfile.vsDraws}D
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-[11px] text-[#94A3B8]">
                        Updated automatically from genuine completed 2P VS / Netplay matches (starts at 1200 ELO with zero seeded matches).
                      </p>
                    </div>
                  </div>

                  {/* Friends Roster for Friends Leaderboard */}
                  <div className="rounded-lg border border-white/10 bg-[#111520] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-display text-sm font-bold text-[#F8FAFC]">
                          Friends Roster ({activeProfile.friends.length})
                        </div>
                        <p className="mt-0.5 text-xs text-[#94A3B8]">
                          Add friends by username to compare verified records on the Friends Leaderboard.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('friends-leaderboard')}
                        className="text-xs font-semibold text-[#22D3EE] hover:underline"
                      >
                        Open Friends Leaderboard
                      </button>
                    </div>

                    <form onSubmit={handleAddFriend} className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={friendUsernameInput}
                        onChange={(e) => setFriendUsernameInput(e.target.value)}
                        placeholder="Friend's username (3–24 chars)"
                        className="h-9 flex-1 rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0891B2] px-3.5 text-xs font-bold text-white hover:bg-[#06B6D4] whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Add Friend</span>
                      </button>
                    </form>
                    {friendMessage && (
                      <div className="mt-2 text-xs font-medium text-[#22D3EE]">{friendMessage}</div>
                    )}
                    {activeProfile.friends.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeProfile.friends.map((friend) => (
                          <div
                            key={friend}
                            className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-[#0D1019] px-2.5 py-1 text-xs text-[#E2E8F0]"
                          >
                            <span>{friend}</span>
                            <button
                              type="button"
                              aria-label={`Remove friend ${friend}`}
                              onClick={() => {
                                profileStore.removeFriend(friend);
                                onProfileStoreMutated();
                              }}
                              className="text-[#94A3B8] hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Avatar & Country Customization */}
                  <div className="grid gap-4 rounded-lg border border-white/10 bg-[#111520] p-5 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold text-[#E2E8F0]">Player Avatar</div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {AVATAR_PRESETS.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            onClick={() => {
                              profileStore.updateActiveProfileAppearance({ avatarId: av.id });
                              onProfileStoreMutated();
                            }}
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                              activeProfile.avatarId === av.id
                                ? 'border-[#22D3EE] bg-[#162234] text-[#22D3EE]'
                                : 'border-white/10 bg-[#0D1019] text-[#94A3B8]'
                            }`}
                          >
                            {av.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-[#E2E8F0]">Leaderboard Country</div>
                      <select
                        value={activeProfile.countryCode}
                        onChange={(e) => {
                          profileStore.updateActiveProfileAppearance({ countryCode: e.target.value });
                          onProfileStoreMutated();
                        }}
                        className="mt-2.5 h-9 w-full rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Personal Game Statistics */}
                  <div className="rounded-lg border border-white/10 bg-[#111520] p-5">
                    <div className="font-display text-sm font-bold text-[#F8FAFC]">
                      Personal Game Statistics
                    </div>
                    {personalStats.length === 0 ? (
                      <p className="mt-1.5 text-xs text-[#94A3B8]">
                        No catalog game sessions recorded yet. Load a local .nes ROM and play on FCEUmm to log session stats.
                      </p>
                    ) : (
                      <div className="mt-3 divide-y divide-white/8 text-xs">
                        {personalStats.map((st) => (
                          <div key={st.gameId} className="flex items-center justify-between py-2">
                            <span className="font-medium text-[#E2E8F0]">
                              {getCatalogGameById(st.gameId)?.title ?? st.gameId}
                            </span>
                            <span className="font-mono-tabular text-[#94A3B8]">
                              {st.sessionsPlayed} sessions · {st.totalFramesPlayed.toLocaleString()} frames · Best {st.bestScore.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  {/* Username / Password Local Account */}
                  <form
                    onSubmit={handleAuthSubmit}
                    className="space-y-3.5 rounded-lg border border-white/10 bg-[#111520] p-5"
                  >
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <button
                        type="button"
                        onClick={() => setAuthTab('register')}
                        className={`rounded px-3 py-1 text-xs font-semibold ${
                          authTab === 'register'
                            ? 'bg-[#0891B2] text-white'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        Create Account
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthTab('signin')}
                        className={`rounded px-3 py-1 text-xs font-semibold ${
                          authTab === 'signin'
                            ? 'bg-[#0891B2] text-white'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        Sign In
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={24}
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="Username (3–24 chars)"
                        className="h-9 w-full rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                      />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Password (min 6 chars)"
                        className="h-9 w-full rounded-md border border-white/15 bg-[#0D1019] px-3 text-xs text-[#F8FAFC]"
                      />
                      {authTab === 'register' && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={authCountry}
                              onChange={(e) => setAuthCountry(e.target.value)}
                              className="h-9 rounded-md border border-white/15 bg-[#0D1019] px-2.5 text-xs text-[#F8FAFC]"
                            >
                              {COUNTRY_OPTIONS.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={authAvatar}
                              onChange={(e) => setAuthAvatar(e.target.value)}
                              className="h-9 rounded-md border border-white/15 bg-[#0D1019] px-2.5 text-xs text-[#F8FAFC]"
                            >
                              {AVATAR_PRESETS.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[#F59E0B]/30 bg-[#1A150B] px-3 py-2 text-xs text-[#FDE68A]">
                            <input
                              type="checkbox"
                              data-testid="register-founder-checkbox"
                              checked={authClaimFounder}
                              onChange={(e) => setAuthClaimFounder(e.target.checked)}
                              className="h-3.5 w-3.5 accent-[#F59E0B]"
                            />
                            <span>Enable App Owner Badge ({FOUNDER_BADGE_LABEL})</span>
                          </label>
                        </>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="h-9 w-full rounded-md bg-[#0891B2] text-xs font-bold text-white hover:bg-[#06B6D4]"
                    >
                      {authTab === 'register' ? 'Create Champions Profile' : 'Sign In'}
                    </button>

                    {authMessage && (
                      <div className="text-xs font-medium text-[#22D3EE]">{authMessage}</div>
                    )}
                  </form>

                  {/* Honest Google Sign-In & Cloud Save Status */}
                  <div className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#111520] p-5">
                    <div>
                      <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F8FAFC]">
                        <Lock className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                        <span>Google Sign-In &amp; Cloud Sync</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
                        {googleStatus.message}
                      </p>
                    </div>
                    <div className="mt-4 rounded-md border border-white/10 bg-[#0D1019] p-3 text-[11px] text-[#94A3B8]">
                      Privacy guarantee: Passwords are encrypted locally on your device and are never
                      shared into public profiles, leaderboards, or Hall of Fame entries.
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeSection === 'hall-of-fame' ? (
            /* 11. HALL OF FAME */
            <div className="mx-auto max-w-5xl space-y-5" data-testid="hall-of-fame-view">
              <div className="border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                  Hall of Fame
                </h2>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  {OFFICIAL_RANKING_RULES.hallOfFameRequirement}
                </p>
              </div>

              {hallOfFame.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-[#111520] p-6">
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F59E0B]">
                    <Crown className="h-4 w-4" aria-hidden="true" />
                    <span>Hall of Fame Awaits Its First Verified Legend</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                    Zero mock legends are pre-populated. Earn at least 1 Official Platinum Trophy or 3 Official
                    Gold Trophies in Official Ranked Mode on FCEUmm—or record genuine verified achievements on
                    the App Owner ({FOUNDER_BADGE_LABEL}) account—to appear here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {hallOfFame.map((p, idx) => (
                    <div
                      key={p.playerId}
                      className={`flex items-center justify-between rounded-lg border p-4 ${
                        p.isFounderCreator
                          ? 'border-[#F59E0B]/60 bg-[#1B160C]'
                          : 'border-[#F59E0B]/35 bg-[#141724]'
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-extrabold text-[#F8FAFC]">
                            #{idx + 1} {p.username}
                          </span>
                          {p.isFounderCreator && (
                            <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] font-bold text-[#F59E0B]">
                              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                              {FOUNDER_BADGE_LABEL}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-tabular mt-0.5 text-xs text-[#94A3B8]">
                          {p.rankTier.name} · Lv.{p.level} · {p.xp} XP · ELO {p.eloRating} · {p.countryCode}
                        </div>
                      </div>
                      <div className="font-mono-tabular text-right text-xs">
                        <div className="text-[#22D3EE]">Platinum: {p.trophies.platinum}</div>
                        <div className="text-[#F59E0B]">Gold: {p.trophies.gold}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 12. ACHIEVEMENT VERIFICATION STATUS & 60-GAME COMPATIBILITY MATRIX */
            <div className="mx-auto max-w-6xl space-y-6" data-testid="compatibility-matrix-view">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-[#F8FAFC]">
                    Achievement Verification Status &amp; 60-Game Compatibility Matrix
                  </h2>
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    Transparent audit of all 60 NES titles showing verified native WRAM ($0000–$07FF) hooks vs. manual video review &amp; pending community rules
                  </p>
                </div>
                <div className="font-mono-tabular text-xs text-[#22D3EE]">
                  {verifiedGamesCount} Verified WRAM · {partialGamesCount} Partial · {pendingGamesCount} Pending
                </div>
              </div>

              {/* Live Anti-Cheat Session Inspector */}
              <div className="rounded-lg border border-white/10 bg-[#111520] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F8FAFC]">
                    {liveIntegrity.officialEligible ? (
                      <ShieldCheck className="h-4 w-4 text-[#34D399]" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                    )}
                    <span>Current Session Anti-Cheat &amp; Core Telemetry</span>
                  </div>
                  <span className="font-mono-tabular text-xs text-[#94A3B8]">
                    Core: {liveIntegrity.coreId} ({liveIntegrity.coreVersion})
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono-tabular text-xs text-[#CBD5E1]">
                  <span>Mode: {liveIntegrity.mode}</span>
                  <span>Frames: {liveIntegrity.elapsedFrames}</span>
                  <span>Pauses: {liveIntegrity.pauseCount}</span>
                  <span>Resets: {liveIntegrity.resetCount}</span>
                  <span>Save-State Loads: {liveIntegrity.saveStateLoadCount}</span>
                  <span>Rewinds: {liveIntegrity.rewindCount}</span>
                  <span>Turbo/Cheat: {liveIntegrity.turboUsed || liveIntegrity.cheatDetected ? 'Flagged' : 'Clean'}</span>
                </div>
                {liveIntegrity.flags.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-white/8 pt-2.5 text-xs text-[#F59E0B]">
                    {liveIntegrity.flags.map((flag) => (
                      <div key={flag.code}>
                        <span className="font-mono-tabular font-bold">{flag.code}</span> — {flag.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Matrix Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="Filter 60-game compatibility matrix..."
                    className="h-9 w-full rounded-md border border-white/15 bg-[#121622] pr-3 pl-9 text-xs text-[#F8FAFC]"
                  />
                </div>
                <select
                  aria-label="Filter matrix by compatibility tier"
                  value={matrixTier}
                  onChange={(e) => setMatrixTier(e.target.value as CompatibilityTier | 'all')}
                  className="h-9 rounded-md border border-white/15 bg-[#121622] px-3 text-xs text-[#F8FAFC]"
                >
                  <option value="all">All 60 NES Games</option>
                  <option value="verified-ram-hooks">Verified Native RAM Hooks ({verifiedGamesCount})</option>
                  <option value="partial-hooks-review">Frame-Timed + Manual Review ({partialGamesCount})</option>
                  <option value="pending-community-review">Pending Community Review ({pendingGamesCount})</option>
                </select>
              </div>

              {/* 60-Row Compatibility Matrix Table */}
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#111520]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 bg-[#151A28] text-[11px] font-semibold text-[#94A3B8]">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">NES Title</th>
                      <th className="px-3 py-2.5">Hook Status</th>
                      <th className="px-3 py-2.5 text-right">Auto</th>
                      <th className="px-3 py-2.5 text-right">Video</th>
                      <th className="px-3 py-2.5 text-right">Pending</th>
                      <th className="px-3 py-2.5">Verified WRAM Addresses / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8 text-[#E2E8F0]">
                    {matrixRows.map((row) => (
                      <tr key={row.gameId} className="hover:bg-white/[0.02]">
                        <td className="font-mono-tabular px-3 py-2 text-[#64748B]">
                          {String(row.catalogNumber).padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2 font-semibold">
                          <button
                            type="button"
                            onClick={() => setSelectedBookGameId(row.gameId)}
                            className="text-left hover:text-[#22D3EE] hover:underline"
                          >
                            {row.title}
                          </button>
                        </td>
                        <td className={`px-3 py-2 font-medium ${TIER_TEXT_CLASS[row.compatibilityTier]}`}>
                          {TIER_LABEL[row.compatibilityTier]}
                        </td>
                        <td className="font-mono-tabular px-3 py-2 text-right text-[#22D3EE]">
                          {gameRuleCountsMap.get(row.gameId)?.active ?? 0}
                        </td>
                        <td className="font-mono-tabular px-3 py-2 text-right text-[#A78BFA]">
                          {gameRuleCountsMap.get(row.gameId)?.video ?? 0}
                        </td>
                        <td className="font-mono-tabular px-3 py-2 text-right text-[#64748B]">
                          {gameRuleCountsMap.get(row.gameId)?.pending ?? 0}
                        </td>
                        <td className="max-w-md px-3 py-2 text-[11px] text-[#94A3B8]">
                          {row.ramAddresses.length > 0 ? (
                            <span className="font-mono-tabular text-[#CBD5E1]">
                              {row.ramAddresses.join(' · ')}
                            </span>
                          ) : (
                            <span>{row.notes}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <Sparkles className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                <span>
                  Screenshot/OCR recognition is never used as primary verification. Native Android reads live 2 KB NES WRAM via Libretro RETRO_MEMORY_SYSTEM_RAM; Web FCEUmm tracks frame timing, save-states, pauses, resets, and turbo flags with full manual video proof review where WRAM exports are unavailable.
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

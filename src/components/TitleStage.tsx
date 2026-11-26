import React from 'react';
import {
  Bot,
  ChevronRight,
  Clock,
  Flame,
  FolderOpen,
  FolderSearch,
  Play,
  Radio,
  Settings,
  Trash2,
  Trophy,
  Tv,
  Upload,
} from 'lucide-react';
import { AI_GAMER_PREVIEW_META } from '../emulator/ai/aiGamerPreviewData';
import type { UserRomEntry } from '../emulator/roms/userRomLibraryStore';
import type { EmulatorSettingsProfile } from '../emulator/settings/emulatorSettingsStore';
import {
  formatHumanDuration,
  type UsageReportSnapshot,
} from '../emulator/settings/sessionTimerStore';

interface TitleStageProps {
  userRoms: UserRomEntry[];
  selectedRomId: string | null;
  activeSettings: EmulatorSettingsProfile;
  usageReport: UsageReportSnapshot;
  onSelectUserRom: (id: string) => void;
  onLaunchUserRom: (id: string) => void;
  onRemoveUserRom: (id: string) => void;
  onDropRomFile: (file: File) => void;
  onStart: () => void;
  onOpenChampions: () => void;
  onOpenDualRace: () => void;
  onOpenCreatorHub: () => void;
  onOpenAiComingSoon: () => void;
  onRequestLoadRomFile: () => void;
  onRequestScanFolder: () => void;
  onOpenNetplay: () => void;
  onOpenSettings: () => void;
  romError: string | null;
}

const TITLE_BG_SRC = '/src/assets/images/title_bg_1795640242801.jpg';

function cleanGameTitle(name: string): string {
  return name.replace(/\.nes$/i, '').replace(/[_]+/g, ' ').trim();
}

export const TitleStage: React.FC<TitleStageProps> = ({
  userRoms,
  selectedRomId,
  usageReport,
  onSelectUserRom,
  onLaunchUserRom,
  onRemoveUserRom,
  onDropRomFile,
  onStart,
  onOpenChampions,
  onOpenDualRace,
  onOpenCreatorHub,
  onOpenAiComingSoon,
  onRequestLoadRomFile,
  onRequestScanFolder,
  onOpenNetplay,
  onOpenSettings,
  romError,
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [isDraggingRom, setIsDraggingRom] = React.useState(false);

  const selectedRom = userRoms.find((r) => r.id === selectedRomId) ?? userRoms[0] ?? null;

  // Build Recent Games from Usage Reports matched against local library (or latest loaded cartridges)
  const usageByGameId = React.useMemo(() => {
    const map = new Map<string, { totalSeconds: number; lastPlayedAt: number }>();
    for (const g of usageReport.games) {
      map.set(g.gameId, { totalSeconds: g.totalSeconds, lastPlayedAt: g.lastPlayedAt });
    }
    return map;
  }, [usageReport.games]);

  const recentRoms = React.useMemo(() => {
    if (userRoms.length === 0) return [];
    const played = userRoms
      .filter((r) => usageByGameId.has(r.id))
      .sort(
        (a, b) =>
          (usageByGameId.get(b.id)?.lastPlayedAt ?? 0) -
          (usageByGameId.get(a.id)?.lastPlayedAt ?? 0)
      );
    if (played.length > 0) return played.slice(0, 3);
    return userRoms.slice(0, 3);
  }, [usageByGameId, userRoms]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingRom) setIsDraggingRom(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingRom(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingRom(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    const nesFile = files.find((f) => f.name.toLowerCase().endsWith('.nes')) ?? files[0];
    if (nesFile) {
      onDropRomFile(nesFile);
    }
  };

  return (
    <main className="neon-obsidian-grid relative h-full w-full overflow-hidden bg-[#070910] text-[#F1F5F9]">
      {/* Atmospheric Retro Monitor Studio Backdrop with Deep Obsidian Vignette */}
      <div className="pointer-events-none absolute inset-0">
        {!imgFailed ? (
          <img
            src={TITLE_BG_SRC}
            alt="Retro CRT monitor and classic controllers on dark obsidian desk"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover object-right opacity-45"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_75%_45%,rgba(139,92,246,0.18)_0%,#0b0f1b_55%,#070910_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#070910] via-[#070910]/92 to-[#070910]/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070910] via-transparent to-[#070910]/55" />
      </div>

      {/* Main Neon Retro Layout */}
      <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto px-6 py-4 md:px-14 md:py-5">
        {/* Strict 3-Zone Top Bar */}
        <header className="mb-4 flex items-center justify-between gap-8 border-b border-white/10 pb-3.5">
          <span className="font-display text-base font-extrabold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0">
            TGK RETRO <span className="text-[#22D3EE]">4.4</span>
          </span>

          <nav
            aria-label="Primary Navigation"
            className="hidden items-center gap-6 text-xs font-semibold text-[#94A3B8] md:flex"
          >
            <button
              type="button"
              onClick={onStart}
              className="text-[#F8FAFC] underline decoration-[#22D3EE] decoration-2 underline-offset-6 whitespace-nowrap shrink-0"
            >
              Library
            </button>
            <button
              type="button"
              data-testid="nav-champions"
              onClick={onOpenChampions}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-[#22D3EE] whitespace-nowrap shrink-0"
            >
              <Trophy className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>Champions</span>
            </button>
            <button
              type="button"
              onClick={onOpenDualRace}
              className="transition-colors hover:text-[#FBBF24] whitespace-nowrap shrink-0"
            >
              VS Race
            </button>
            <button
              type="button"
              onClick={onOpenNetplay}
              className="transition-colors hover:text-[#A78BFA] whitespace-nowrap shrink-0"
            >
              2P Online
            </button>
            <button
              type="button"
              data-testid="nav-youtube-creator-hub"
              onClick={onOpenCreatorHub}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-[#FBBF24] whitespace-nowrap shrink-0"
            >
              <Tv className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
              <span>Creator Hub</span>
            </button>
          </nav>

          <button
            type="button"
            data-testid="nav-settings-btn"
            onClick={onOpenSettings}
            className="tactile-press inline-flex h-9 items-center gap-2 rounded-lg border border-[#22D3EE]/35 bg-[#0E1422] px-3.5 text-xs font-semibold text-[#E2E8F0] hover:border-[#22D3EE] hover:text-white whitespace-nowrap shrink-0"
          >
            <Settings className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span>Settings</span>
          </button>
        </header>

        {/* Core Hero + Game Library + Modes + Coming Soon */}
        <div className="max-w-2xl">
          {/* Clean Neon Retro Title Lockup */}
          <div className="mb-4">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#F8FAFC] sm:text-4xl">
              TGK RETRO <span className="text-[#22D3EE]">4.4</span>
            </h1>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Classic 8-bit NES console powered by FCEUmm · NES Champions, 2P Netplay Sync &amp; Dual-Screen VS.
            </p>
          </div>

          {/* Game Library & Folder Scan Card */}
          <section
            aria-label="Game Library"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="mb-4 rounded-xl border border-white/10 bg-[#0D121F]/92 p-4 shadow-xl shadow-black/50"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-[#F8FAFC]">
                  Game Library
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  {userRoms.length > 0
                    ? `${userRoms.length} ${userRoms.length === 1 ? 'game' : 'games'} ready`
                    : 'Scan a folder or pick any .nes game file'}
                  {usageReport.totalPlaySeconds > 0
                    ? ` · ${formatHumanDuration(usageReport.totalPlaySeconds)} played`
                    : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="scan-folder-btn"
                  onClick={onRequestScanFolder}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#A78BFA]/45 bg-[#17132B] px-3 text-xs font-semibold text-[#DDD6FE] hover:border-[#A78BFA] hover:text-white whitespace-nowrap shrink-0"
                >
                  <FolderSearch className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                  <span>Scan Folder</span>
                </button>
                <button
                  type="button"
                  data-testid="pick-rom-file-btn"
                  onClick={onRequestLoadRomFile}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#22D3EE]/45 bg-[#0D212B] px-3 text-xs font-semibold text-[#A5F3FC] hover:border-[#22D3EE] hover:text-white whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                  <span>Pick .nes File</span>
                </button>
              </div>
            </div>

            {/* Recent Games Strip (when games exist) */}
            {recentRoms.length > 0 && (
              <div className="mb-3 border-b border-white/8 pb-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#94A3B8]">
                  <Clock className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                  <span>Recent Games</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {recentRoms.map((rom) => {
                    const stats = usageByGameId.get(rom.id);
                    const active = rom.id === selectedRom?.id;
                    return (
                      <button
                        key={`recent-${rom.id}`}
                        type="button"
                        onClick={() => onLaunchUserRom(rom.id)}
                        className={`tactile-press flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-[#22D3EE]/60 bg-[#10202C] text-white'
                            : 'border-white/8 bg-[#121829] text-[#E2E8F0] hover:border-[#22D3EE]/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-display truncate text-xs font-bold">
                            {cleanGameTitle(rom.name)}
                          </div>
                          <div className="font-mono-tabular text-[10px] text-[#94A3B8]">
                            {stats ? formatHumanDuration(stats.totalSeconds) : 'Tap to Play'}
                          </div>
                        </div>
                        <Play
                          className="h-3.5 w-3.5 shrink-0 fill-current text-[#22D3EE]"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty Dropzone OR Clean Cartridge Shelf */}
            {userRoms.length === 0 ? (
              <button
                type="button"
                data-testid="empty-rom-loader-btn"
                onClick={onRequestLoadRomFile}
                className={`tactile-press flex w-full flex-col items-start justify-between gap-3 rounded-lg border border-dashed p-4 text-left transition-colors sm:flex-row sm:items-center ${
                  isDraggingRom
                    ? 'border-[#22D3EE] bg-[#0D212B]'
                    : 'border-white/15 bg-[#0A0E18] hover:border-[#22D3EE]/60 hover:bg-[#0E1624]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/35 bg-[#0E1F2A]">
                    <Upload className="h-5 w-5 text-[#22D3EE]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="font-display text-sm font-bold text-[#F8FAFC]">
                      Add Your .nes Games
                    </div>
                    <p className="mt-0.5 text-xs text-[#94A3B8]">
                      Drag and drop .nes files here, pick a file, or scan a game folder.
                    </p>
                  </div>
                </div>
                <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-4 font-display text-xs font-bold text-[#070910]">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Browse Games</span>
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {userRoms.slice(0, 8).map((rom, idx) => {
                  const active = rom.id === selectedRom?.id;
                  const accentPalette = ['#22D3EE', '#A78BFA', '#F59E0B', '#38BDF8'];
                  const accent = accentPalette[idx % accentPalette.length];
                  return (
                    <div
                      key={rom.id}
                      className={`group relative flex flex-col overflow-hidden rounded-lg border transition-colors ${
                        active
                          ? 'border-[#22D3EE] bg-[#101C2B] text-white'
                          : 'border-white/10 bg-[#111726] text-[#CBD5E1] hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <div className="cartridge-ribs flex h-4 w-full items-center justify-between border-b border-black/45 px-2">
                        <span
                          className="h-1 w-8 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveUserRom(rom.id);
                          }}
                          aria-label={`Remove ${cleanGameTitle(rom.name)}`}
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded text-white/40 hover:text-[#FCA5A5]"
                        >
                          <Trash2 className="h-2.5 w-2.5" aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectUserRom(rom.id)}
                        onDoubleClick={() => onLaunchUserRom(rom.id)}
                        className="tactile-press flex flex-1 flex-col justify-between p-2.5 text-left"
                      >
                        <div className="font-display line-clamp-2 break-words text-xs font-bold leading-snug">
                          {cleanGameTitle(rom.name)}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t border-white/8 pt-1.5 text-[10px] font-medium text-[#94A3B8]">
                          <span>{active ? 'Selected' : 'Ready'}</span>
                          <span style={{ color: accent }}>NES</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {romError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-[#F87171]/45 bg-[#261116] px-3.5 py-2 text-xs text-[#FCA5A5]"
            >
              {romError}
            </div>
          )}

          {/* Primary Play Action + Multiplayer Modes */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={selectedRom ? onStart : onRequestLoadRomFile}
              className="tactile-press inline-flex h-11 items-center gap-2 rounded-lg bg-[#22D3EE] px-5 font-display text-sm font-extrabold text-[#070910] shadow-lg shadow-[#22D3EE]/15 hover:bg-[#38BDF8] whitespace-nowrap shrink-0"
            >
              {selectedRom ? (
                <>
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Play Now</span>
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  <span>Choose .nes Game</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="title-dual-race-btn"
              onClick={onOpenDualRace}
              className="tactile-press inline-flex h-11 items-center gap-2 rounded-lg border border-[#F59E0B]/50 bg-[#1F1A10] px-4 font-display text-xs font-bold text-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#292113] whitespace-nowrap shrink-0"
            >
              <Flame className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <span>Dual-Screen VS</span>
            </button>

            <button
              type="button"
              data-testid="title-netplay-btn"
              onClick={onOpenNetplay}
              className="tactile-press inline-flex h-11 items-center gap-2 rounded-lg border border-[#A78BFA]/50 bg-[#161329] px-4 font-display text-xs font-bold text-[#DDD6FE] hover:border-[#A78BFA] hover:bg-[#1F1A38] whitespace-nowrap shrink-0"
            >
              <Radio className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
              <span>2P Online</span>
            </button>
          </div>

          {/* TGK AI GAMER – COMING SOON (Future Update Preview Card) */}
          <section aria-label="TGK AI Gamer Coming Soon" className="mt-4">
            <button
              type="button"
              data-testid="title-ai-coming-soon-card"
              onClick={onOpenAiComingSoon}
              className="tactile-press group flex w-full items-center justify-between gap-3 rounded-xl border border-[#A78BFA]/35 bg-[#101324]/95 px-4 py-3 text-left transition-colors hover:border-[#22D3EE]/65 hover:bg-[#141930]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#A78BFA]/40 bg-[#1B1633]">
                  <Bot className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xs font-extrabold tracking-wide text-[#F8FAFC]">
                      {AI_GAMER_PREVIEW_META.badgeTitle}
                    </span>
                    <span className="text-[11px] font-semibold text-[#F59E0B]">
                      · {AI_GAMER_PREVIEW_META.panelHeading}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                    {AI_GAMER_PREVIEW_META.summaryLine}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 font-display text-xs font-bold text-[#22D3EE] group-hover:text-white">
                <span>Preview</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </button>
          </section>
        </div>

        {/* Clean Single-Line Footer */}
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#64748B]">
          <p>
            USB &amp; Bluetooth Controllers Supported · Press Esc during play for Menu
          </p>
          <div className="flex items-center gap-4 md:hidden">
            <button
              type="button"
              onClick={onOpenChampions}
              className="font-semibold text-[#F59E0B]"
            >
              Champions
            </button>
            <button
              type="button"
              onClick={onOpenCreatorHub}
              className="font-semibold text-[#A78BFA]"
            >
              Creator Hub
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
};

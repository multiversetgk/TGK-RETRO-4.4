import React from 'react';
import {
  BarChart3,
  Bookmark,
  Bot,
  Clock,
  Gamepad2,
  Home,
  Play,
  Radio,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Trash2,
  Trophy,
  Tv,
  Upload,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import type { RomMetadata } from '../emulator/core/inesParser';
import type { SaveSlotId, SaveSlotSummary } from '../emulator/core/saveStateStore';
import {
  TURBO_RATE_PRESETS,
  type AudioFocusMode,
  type EmulatorSettingsProfile,
  type TurboRateHz,
} from '../emulator/settings/emulatorSettingsStore';
import type { HighlightBookmarkSummary } from '../emulator/settings/highlightBookmarkStore';
import { formatSessionDuration } from '../emulator/settings/sessionTimerStore';

interface QuickDrawerProps {
  open: boolean;
  romMetadata: RomMetadata | null;
  sessionElapsedSeconds: number;
  slots: Record<SaveSlotId, SaveSlotSummary | null>;
  settings: EmulatorSettingsProfile;
  highlights: HighlightBookmarkSummary[];
  onResume: () => void;
  onSaveSlot: (slot: SaveSlotId) => void;
  onLoadSlot: (slot: SaveSlotId) => void;
  onChangeAudioFocus: (focus: AudioFocusMode) => void;
  onChangeVolume: (volume: number) => void;
  onChangeTurboRate: (hz: TurboRateHz) => void;
  onOpenControls: () => void;
  onStartEditGameLayout: () => void;
  onOpenSettings: () => void;
  onOpenReports: () => void;
  onOpenNetplay: () => void;
  onOpenChampions: () => void;
  onOpenCreatorHub: () => void;
  onOpenAiComingSoon: () => void;
  onCreateHighlight: () => void;
  onJumpHighlight: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onRematch: () => void;
  onExitToShelf: () => void;
}

const AUDIO_FOCUS_OPTIONS: { id: AudioFocusMode; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Balanced' },
  { id: 'game-focus', label: 'Game Focus', hint: 'Full punch' },
  { id: 'voice-duck', label: 'Voice Duck', hint: 'Softer for chat' },
  { id: 'muted', label: 'Mute', hint: 'Silent' },
];

function formatClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function cleanGameTitle(name: string): string {
  return name.replace(/\.nes$/i, '').replace(/[_]+/g, ' ').trim();
}

export const QuickDrawer: React.FC<QuickDrawerProps> = ({
  open,
  romMetadata,
  sessionElapsedSeconds,
  slots,
  settings,
  highlights,
  onResume,
  onSaveSlot,
  onLoadSlot,
  onChangeAudioFocus,
  onChangeVolume,
  onChangeTurboRate,
  onOpenControls,
  onStartEditGameLayout,
  onOpenSettings,
  onOpenReports,
  onOpenNetplay,
  onOpenChampions,
  onOpenCreatorHub,
  onOpenAiComingSoon,
  onCreateHighlight,
  onJumpHighlight,
  onDeleteHighlight,
  onRematch,
  onExitToShelf,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="In-Game Menu"
      data-testid="quick-drawer"
      className="fixed inset-0 z-40 flex justify-end bg-[#04060B]/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onResume();
      }}
    >
      <aside className="flex h-full w-full max-w-[390px] flex-col border-l border-[#22D3EE]/25 bg-[#0B0F1A] text-[#F1F5F9] shadow-2xl shadow-black/90">
        {/* Top Accent */}
        <div className="h-1 w-full bg-gradient-to-r from-[#22D3EE] via-[#A78BFA] to-[#F59E0B]" />

        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-[#F8FAFC]">
              Game Menu
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[#94A3B8]">
              <span className="truncate">
                {romMetadata ? cleanGameTitle(romMetadata.name) : 'No game loaded'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular inline-flex items-center gap-1 font-bold text-[#22D3EE]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>{formatSessionDuration(sessionElapsedSeconds)}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onResume}
            aria-label="Close Menu"
            className="tactile-press inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#111827] text-[#CBD5E1] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 1. Primary Action: Resume & Restart */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="tactile-press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#22D3EE] px-4 font-display text-sm font-extrabold text-[#070910] hover:bg-[#67E8F9]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>Resume</span>
            </button>
            <button
              type="button"
              onClick={onRematch}
              className="tactile-press inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#F59E0B]/40 bg-[#241B0D] px-4 font-display text-sm font-bold text-[#FCD34D] hover:bg-[#2F2312]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Restart</span>
            </button>
          </div>

          {/* 2. Quick Save / Quick Load (Slots 1-3) */}
          <section aria-label="Quick Save and Load Slots" className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                Quick Save / Load
              </h3>
              <span className="font-mono-tabular text-[11px] text-[#94A3B8]">3 Slots</span>
            </div>
            <div className="space-y-1.5">
              {([1, 2, 3] as SaveSlotId[]).map((slot) => {
                const info = slots[slot];
                return (
                  <div
                    key={slot}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#101625] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-xs font-bold text-[#F8FAFC]">
                        Slot {slot}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-[#94A3B8]">
                        {info ? `Saved at ${formatClockTime(info.savedAt)}` : 'Empty slot'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!romMetadata}
                        onClick={() => onSaveSlot(slot)}
                        className="tactile-press inline-flex h-8 items-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#0D2332] px-2.5 text-xs font-bold text-[#22D3EE] hover:bg-[#133247] disabled:opacity-40"
                      >
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        disabled={!info || !romMetadata}
                        onClick={() => onLoadSlot(slot)}
                        className="tactile-press inline-flex h-8 items-center gap-1 rounded-lg border border-white/12 bg-[#161F33] px-2.5 text-xs font-semibold text-[#E2E8F0] hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Load</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Audio Focus & Volume */}
          <section aria-label="Audio Focus" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-[#A78BFA] uppercase">
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Audio</span>
              </h3>
              <span className="font-mono-tabular text-[11px] text-[#CBD5E1]">
                {Math.round(settings.masterVolume * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {AUDIO_FOCUS_OPTIONS.map((opt) => {
                const active = settings.audioFocus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeAudioFocus(opt.id)}
                    className={`tactile-press flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-[#A78BFA] bg-[#1E1636] text-[#F8FAFC]'
                        : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] text-[#94A3B8]">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.masterVolume}
              aria-label="Master Audio Volume"
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              className="w-full accent-[#22D3EE]"
            />
          </section>

          {/* 4. Controls, Turbo Speed & Custom Layout */}
          <section aria-label="Controls and Turbo" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-[#F59E0B] uppercase">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Controls &amp; Turbo</span>
              </h3>
              <span className="font-mono-tabular text-[11px] font-bold text-[#FCD34D]">
                {settings.turboRateHz} Hz
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#080C16] p-1">
              {TURBO_RATE_PRESETS.map((hz) => (
                <button
                  key={hz}
                  type="button"
                  aria-pressed={settings.turboRateHz === hz}
                  onClick={() => onChangeTurboRate(hz)}
                  className={`font-mono-tabular rounded-lg py-1.5 text-[11px] font-bold transition-colors ${
                    settings.turboRateHz === hz
                      ? 'bg-[#F59E0B] text-[#070910]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {hz}Hz
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenControls}
                className="tactile-press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#101625] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-[#22D3EE]/40"
              >
                <Gamepad2 className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                <span>Gamepad Map</span>
              </button>
              <button
                type="button"
                onClick={onStartEditGameLayout}
                className="tactile-press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#101625] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-[#A78BFA]/50"
              >
                <Sliders className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                <span>Edit Layout</span>
              </button>
            </div>
          </section>

          {/* 5. Instant Highlights */}
          <section aria-label="Highlight Bookmarks" className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-[#CBD5E1] uppercase">
                <Bookmark className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                <span>Highlights ({highlights.length})</span>
              </h3>
              <button
                type="button"
                disabled={!romMetadata}
                onClick={onCreateHighlight}
                className="tactile-press rounded-lg border border-[#22D3EE]/40 bg-[#0D2332] px-2.5 py-1 text-[11px] font-bold text-[#22D3EE] hover:bg-[#133247] disabled:opacity-40"
              >
                + Bookmark
              </button>
            </div>
            {highlights.length === 0 ? (
              <p className="rounded-xl border border-white/8 bg-[#0E1422] px-3 py-2.5 text-xs text-[#94A3B8]">
                Save favorite boss moments and jump back instantly anytime.
              </p>
            ) : (
              <div className="space-y-1.5">
                {highlights.map((hl) => (
                  <div
                    key={hl.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#101625] p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {hl.thumbnailDataUrl ? (
                        <img
                          src={hl.thumbnailDataUrl}
                          alt={hl.label}
                          referrerPolicy="no-referrer"
                          className="nes-canvas-pixelated h-9 w-12 shrink-0 rounded border border-white/10 bg-black object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded border border-white/10 bg-[#080C16] text-[10px] text-[#94A3B8]">
                          NES
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-[#F8FAFC]">{hl.label}</div>
                        <div className="font-mono-tabular text-[10px] text-[#94A3B8]">
                          Saved {formatClockTime(hl.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onJumpHighlight(hl.id)}
                        className="tactile-press rounded-md bg-[#22D3EE] px-2.5 py-1 text-[11px] font-extrabold text-[#070910] hover:bg-[#67E8F9]"
                      >
                        Jump
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHighlight(hl.id)}
                        aria-label={`Delete ${hl.label}`}
                        className="tactile-press rounded-md border border-white/10 p-1 text-[#94A3B8] hover:text-[#FCA5A5]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 6. Modes & Hub Shortcuts */}
          <section aria-label="Modes and Hubs" className="space-y-2">
            <h3 className="font-display text-xs font-bold tracking-wider text-[#94A3B8] uppercase">
              Modes &amp; Extras
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenNetplay}
                className="tactile-press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#22D3EE]/30 bg-[#0D1E2C] px-3 text-xs font-bold text-[#67E8F9] hover:border-[#22D3EE]/60"
              >
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                <span>2P Online</span>
              </button>
              <button
                type="button"
                onClick={onOpenReports}
                className="tactile-press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#F59E0B]/30 bg-[#231A0D] px-3 text-xs font-bold text-[#FCD34D] hover:border-[#F59E0B]/60"
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Usage Reports</span>
              </button>
              <button
                type="button"
                onClick={onOpenChampions}
                className="tactile-press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#101625] px-3 text-xs font-semibold text-[#E2E8F0] hover:border-[#F59E0B]/50"
              >
                <Trophy className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                <span>Champions</span>
              </button>
              <button
                type="button"
                onClick={onOpenCreatorHub}
                className="tactile-press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#101625] px-3 text-xs font-semibold text-[#E2E8F0] hover:border-[#A78BFA]/50"
              >
                <Tv className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                <span>Creator Hub</span>
              </button>
            </div>

            <button
              type="button"
              data-testid="drawer-ai-coming-soon-btn"
              onClick={onOpenAiComingSoon}
              className="tactile-press flex w-full items-center justify-between gap-2 rounded-xl border border-[#A78BFA]/35 bg-[#17122B] px-3.5 py-2.5 text-left hover:border-[#A78BFA]/70"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Bot className="h-4 w-4 shrink-0 text-[#A78BFA]" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-display truncate text-xs font-bold text-[#F8FAFC]">
                    TGK AI GAMER – COMING SOON
                  </div>
                  <div className="truncate text-[10px] text-[#CBD5E1]">
                    Future Update Preview (4 Planned Features)
                  </div>
                </div>
              </div>
              <span className="font-mono-tabular shrink-0 text-[10px] font-bold text-[#22D3EE]">
                Preview
              </span>
            </button>
          </section>
        </div>

        {/* Drawer Footer: Full Settings & Exit to Library */}
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#080C16] px-5 py-3.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="tactile-press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#111827] px-3 text-xs font-bold text-[#F1F5F9] hover:border-[#22D3EE]/50"
          >
            <Settings className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={onExitToShelf}
            className="tactile-press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#F87171]/35 bg-[#2A1219] px-3 text-xs font-bold text-[#FCA5A5] hover:bg-[#3A1721]"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Exit to Menu</span>
          </button>
        </div>
      </aside>
    </div>
  );
};

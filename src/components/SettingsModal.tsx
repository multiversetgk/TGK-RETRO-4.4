import React from 'react';
import {
  BarChart3,
  Clock,
  Cpu,
  Gamepad2,
  Monitor,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Upload,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { PRIMARY_NES_CORE, PRIMARY_NES_CORE_ID } from '../emulator/core/CoreRegistry';
import type { NesCoreId } from '../emulator/core/INesEmulatorCore';
import type { SaveSlotId, SaveSlotSummary } from '../emulator/core/saveStateStore';
import {
  TURBO_RATE_PRESETS,
  type AudioFocusMode,
  type CrtDisplayMode,
  type EmulatorSettingsProfile,
  type ScreenAspectRatio,
  type ScreenOrientationMode,
  type VideoFilterMode,
} from '../emulator/settings/emulatorSettingsStore';
import type { GameLayoutProfile } from '../emulator/settings/gameLayoutStore';
import {
  formatHumanDuration,
  formatSessionDuration,
  type UsageReportSnapshot,
} from '../emulator/settings/sessionTimerStore';

export type SettingsTabId = 'display' | 'controls' | 'gameplay' | 'reports';

interface SettingsModalProps {
  activeCoreId: NesCoreId;
  initialTab?: SettingsTabId;
  getSettingsForCore: (coreId: NesCoreId) => EmulatorSettingsProfile;
  onUpdateCoreSettings: (
    coreId: NesCoreId,
    patch: Partial<EmulatorSettingsProfile>
  ) => void;
  onResetCoreSettings: (coreId: NesCoreId) => void;
  currentGameLayout: GameLayoutProfile | null;
  onUpdateGameLayout?: (patch: Partial<GameLayoutProfile>) => void;
  onOpenLayoutEditor?: () => void;
  onResetGameLayout?: () => void;
  onOpenControllers: () => void;
  hasActiveRom: boolean;
  slots: Record<SaveSlotId, SaveSlotSummary | null>;
  onSaveSlot: (slot: SaveSlotId) => void;
  onLoadSlot: (slot: SaveSlotId) => void;
  sessionElapsedSeconds: number;
  activeGameTitle: string | null;
  usageReport: UsageReportSnapshot;
  onClearUsageReports: () => void;
  onClose: () => void;
}

const TABS: {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}[] = [
  { id: 'display', label: 'Display & Screen', icon: Monitor },
  { id: 'controls', label: 'Controls & Layout', icon: Gamepad2 },
  { id: 'gameplay', label: 'Gameplay & Saves', icon: Save },
  { id: 'reports', label: 'Timer & Reports', icon: BarChart3 },
];

const ASPECT_RATIOS: { id: ScreenAspectRatio; label: string; desc: string }[] = [
  { id: '4:3', label: '4:3 Original', desc: 'Classic CRT TV ratio' },
  { id: 'fit', label: 'Fit Screen', desc: 'Maximized edge-to-edge fit' },
  { id: 'full', label: 'Full Stretch', desc: 'Fill entire viewport' },
];

const ORIENTATIONS: { id: ScreenOrientationMode; label: string; desc: string }[] = [
  { id: 'auto', label: 'Auto Rotate', desc: 'Follows screen shape' },
  { id: 'landscape', label: 'Landscape', desc: 'Wide handheld layout' },
  { id: 'portrait', label: 'Portrait', desc: 'Top screen + lower pad' },
];

const VIDEO_FILTERS: { id: VideoFilterMode; label: string; desc: string }[] = [
  { id: 'pixel-crisp', label: 'Pixel Crisp', desc: 'Razor sharp pixels' },
  { id: 'smooth-linear', label: 'Smooth', desc: 'Soft anti-aliased edges' },
  { id: 'warm-phosphor', label: 'Warm Glow', desc: 'Classic 90s TV warmth' },
  { id: 'mono-pocket', label: 'Retro Pocket', desc: 'Olive handheld style' },
];

const CRT_MODES: { id: CrtDisplayMode; label: string; desc: string }[] = [
  { id: 'off', label: 'Clean Raw', desc: 'No scanlines or bezel' },
  { id: 'scanlines', label: 'Subtle CRT', desc: 'Fine retro scanlines' },
  { id: 'pvm-border', label: 'Studio CRT', desc: 'Aperture grille & bezel' },
];

const AUDIO_FOCUS_MODES: { id: AudioFocusMode; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'game-focus', label: 'Game Focus' },
  { id: 'voice-duck', label: 'Voice Duck' },
  { id: 'muted', label: 'Muted' },
];

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  activeCoreId,
  initialTab = 'display',
  getSettingsForCore,
  onUpdateCoreSettings,
  onResetCoreSettings,
  currentGameLayout,
  onUpdateGameLayout,
  onOpenLayoutEditor,
  onResetGameLayout,
  onOpenControllers,
  hasActiveRom,
  slots,
  onSaveSlot,
  onLoadSlot,
  sessionElapsedSeconds,
  activeGameTitle,
  usageReport,
  onClearUsageReports,
  onClose,
}) => {
  const [activeTab, setActiveTab] = React.useState<SettingsTabId>(initialTab);
  const editingCoreId: NesCoreId = activeCoreId || PRIMARY_NES_CORE_ID;
  const profile = getSettingsForCore(editingCoreId);

  const renderToggleRow = (
    title: string,
    subtitle: string,
    checked: boolean,
    onToggle: () => void,
    accent: 'cyan' | 'violet' | 'gold' = 'cyan'
  ) => {
    const activeClass =
      accent === 'gold'
        ? 'border-[#F59E0B] bg-[#F59E0B] text-[#070910]'
        : accent === 'violet'
          ? 'border-[#A78BFA] bg-[#A78BFA] text-[#070910]'
          : 'border-[#22D3EE] bg-[#22D3EE] text-[#070910]';
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101625] px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#F8FAFC]">{title}</div>
          <div className="text-[11px] text-[#94A3B8]">{subtitle}</div>
        </div>
        <button
          type="button"
          aria-pressed={checked}
          onClick={onToggle}
          className={`tactile-press shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-colors ${
            checked
              ? activeClass
              : 'border-white/15 bg-[#0A0F1B] text-[#94A3B8] hover:text-white'
          }`}
        >
          {checked ? 'On' : 'Off'}
        </button>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TGK RETRO 4.4 Settings"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060B]/85 p-3 sm:p-5 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#22D3EE]/25 bg-[#0B0F1A] text-[#F1F5F9] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        {/* Neon Top Trim */}
        <div className="h-1 w-full bg-gradient-to-r from-[#22D3EE] via-[#A78BFA] to-[#F59E0B]" />

        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-tight text-[#F8FAFC]">
              Emulator Settings
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Display, touch &amp; gamepad controls, saves, and playtime reports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onResetCoreSettings(editingCoreId)}
              className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] hover:border-[#22D3EE]/40 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="tactile-press inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#111827] text-[#CBD5E1] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* 4 Clean Logical Section Tabs */}
        <nav
          aria-label="Settings Categories"
          className="grid grid-cols-2 gap-1.5 border-b border-white/10 bg-[#080C16] px-4 py-2.5 sm:grid-cols-4 sm:px-6"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`settings-tab-${tab.id}`}
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`tactile-press inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                  active
                    ? 'border-[#22D3EE]/60 bg-[#0E2433] text-[#22D3EE] shadow-[0_0_16px_rgba(34,211,238,0.16)]'
                    : 'border-white/8 bg-[#101625] text-[#94A3B8] hover:border-white/20 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* 1. DISPLAY & SCREEN */}
          {activeTab === 'display' && (
            <div className="space-y-5" data-testid="settings-panel-display">
              <section className="space-y-2.5">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                  Video Size &amp; Aspect Ratio
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ASPECT_RATIOS.map((ratio) => {
                    const active = profile.aspectRatio === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateCoreSettings(editingCoreId, { aspectRatio: ratio.id })
                        }
                        className={`tactile-press flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#22D3EE] bg-[#0D2332] text-[#F8FAFC]'
                            : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        <span className="text-xs font-bold">{ratio.label}</span>
                        <span className="mt-0.5 text-[11px] text-[#94A3B8]">{ratio.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2.5">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#A78BFA] uppercase">
                  Video Filter
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VIDEO_FILTERS.map((f) => {
                    const active = profile.videoFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateCoreSettings(editingCoreId, { videoFilter: f.id })
                        }
                        className={`tactile-press flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#A78BFA] bg-[#1E1636] text-[#F8FAFC]'
                            : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        <span className="text-xs font-bold">{f.label}</span>
                        <span className="mt-0.5 text-[11px] text-[#94A3B8]">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2.5">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#F59E0B] uppercase">
                  CRT Scanlines &amp; Frame
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {CRT_MODES.map((m) => {
                    const active = profile.crtMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onUpdateCoreSettings(editingCoreId, { crtMode: m.id })}
                        className={`tactile-press flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#F59E0B] bg-[#251C0E] text-[#F8FAFC]'
                            : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        <span className="text-xs font-bold">{m.label}</span>
                        <span className="mt-0.5 text-[11px] text-[#94A3B8]">{m.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2.5">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                  Screen Orientation
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ORIENTATIONS.map((ori) => {
                    const active = profile.orientation === ori.id;
                    return (
                      <button
                        key={ori.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateCoreSettings(editingCoreId, { orientation: ori.id })
                        }
                        className={`tactile-press flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#22D3EE] bg-[#0D2332] text-[#F8FAFC]'
                            : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        <span className="text-xs font-bold">{ori.label}</span>
                        <span className="mt-0.5 text-[11px] text-[#94A3B8]">{ori.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* 2. CONTROLS & LAYOUT */}
          {activeTab === 'controls' && (
            <div className="space-y-5" data-testid="settings-panel-controls">
              {renderToggleRow(
                'On-Screen Touch Controller',
                'Show D-Pad / Thumbstick, A, B, Turbo A/B, and Start/Select during play',
                profile.showOnScreenPad,
                () =>
                  onUpdateCoreSettings(editingCoreId, {
                    showOnScreenPad: !profile.showOnScreenPad,
                  }),
                'cyan'
              )}

              {/* Default Movement Pad */}
              <section className="space-y-2.5">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                  Directional Control Style
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['dpad', 'thumbstick'] as const).map((mode) => {
                    const currentStick = currentGameLayout?.stickMode ?? profile.defaultStickMode;
                    const active = currentStick === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          onUpdateCoreSettings(editingCoreId, { defaultStickMode: mode });
                          onUpdateGameLayout?.({ stickMode: mode });
                        }}
                        className={`tactile-press rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#22D3EE] bg-[#0D2332] text-[#F8FAFC]'
                            : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-bold">
                          {mode === 'dpad' ? 'Classic Cross D-Pad' : 'Virtual Thumbstick'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#94A3B8]">
                          {mode === 'dpad'
                            ? 'Crisp 8-way retro precision'
                            : 'Smooth floating analog feel'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Button Size & Opacity */}
              {currentGameLayout && onUpdateGameLayout && (
                <section className="space-y-3 rounded-xl border border-white/10 bg-[#101625] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#F8FAFC]">
                      <Sliders className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                      <span>Touch Pad Size &amp; Opacity</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onResetGameLayout && (
                        <button
                          type="button"
                          onClick={onResetGameLayout}
                          className="tactile-press rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white"
                        >
                          Reset Layout
                        </button>
                      )}
                      {onOpenLayoutEditor && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenLayoutEditor();
                          }}
                          className="tactile-press rounded-md bg-[#A78BFA] px-3 py-1 text-[11px] font-bold text-[#070910] hover:bg-[#C4B5FD]"
                        >
                          Drag Positions
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <div className="flex justify-between text-xs text-[#94A3B8]">
                        <span>Button Scale</span>
                        <span className="font-mono-tabular font-bold text-[#F8FAFC]">
                          {Math.round(currentGameLayout.scale * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.75}
                        max={1.3}
                        step={0.05}
                        value={currentGameLayout.scale}
                        onChange={(e) =>
                          onUpdateGameLayout({ scale: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#22D3EE]"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <div className="flex justify-between text-xs text-[#94A3B8]">
                        <span>Pad Opacity</span>
                        <span className="font-mono-tabular font-bold text-[#F8FAFC]">
                          {Math.round(currentGameLayout.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.35}
                        max={1}
                        step={0.05}
                        value={currentGameLayout.opacity}
                        onChange={(e) =>
                          onUpdateGameLayout({ opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#A78BFA]"
                      />
                    </label>
                  </div>
                </section>
              )}

              {/* Turbo Rapid-Fire Speed */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-[#F59E0B] uppercase">
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Turbo Rapid-Fire Speed (TA / TB)</span>
                  </h3>
                  <span className="font-mono-tabular text-xs font-bold text-[#FCD34D]">
                    {profile.turboRateHz} Hz
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TURBO_RATE_PRESETS.map((hz) => (
                    <button
                      key={hz}
                      type="button"
                      aria-pressed={profile.turboRateHz === hz}
                      onClick={() =>
                        onUpdateCoreSettings(editingCoreId, { turboRateHz: hz })
                      }
                      className={`tactile-press font-mono-tabular rounded-lg border py-2 text-xs font-bold transition-colors ${
                        profile.turboRateHz === hz
                          ? 'border-[#F59E0B] bg-[#F59E0B] text-[#070910]'
                          : 'border-white/10 bg-[#101625] text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      {hz} Hz
                    </button>
                  ))}
                </div>
              </section>

              {/* USB / Bluetooth / Keyboard Mapping */}
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#22D3EE]/30 bg-[#0D1A28] px-4 py-3.5">
                <div>
                  <div className="text-xs font-bold text-[#F8FAFC]">
                    USB / Bluetooth &amp; Keyboard Mapping
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">
                    Remap Player 1 &amp; Player 2 buttons and inspect connected gamepads.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenControllers();
                  }}
                  className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-4 text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9]"
                >
                  <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Mapping</span>
                </button>
              </section>
            </div>
          )}

          {/* 3. GAMEPLAY & SAVES */}
          {activeTab === 'gameplay' && (
            <div className="space-y-5" data-testid="settings-panel-gameplay">
              {/* Save Slots */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                    Quick Save Slots (1–3)
                  </h3>
                  <span className="text-[11px] text-[#94A3B8]">
                    {hasActiveRom ? 'Ready for current game' : 'Start a game to save'}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([1, 2, 3] as SaveSlotId[]).map((slot) => {
                    const info = slots[slot];
                    return (
                      <div
                        key={slot}
                        className="flex flex-col justify-between gap-2.5 rounded-xl border border-white/10 bg-[#101625] p-3"
                      >
                        <div>
                          <div className="font-display text-xs font-bold text-[#F8FAFC]">
                            Slot {slot}
                          </div>
                          <div className="font-mono-tabular mt-0.5 text-[11px] text-[#94A3B8]">
                            {info ? `Saved ${formatClock(info.savedAt)}` : 'Empty slot'}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={!hasActiveRom}
                            onClick={() => onSaveSlot(slot)}
                            className="tactile-press inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#22D3EE]/35 bg-[#0D2332] text-[11px] font-bold text-[#22D3EE] hover:bg-[#133247] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Save className="h-3 w-3" aria-hidden="true" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            disabled={!hasActiveRom || !info}
                            onClick={() => {
                              onLoadSlot(slot);
                              onClose();
                            }}
                            className="tactile-press inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-white/12 bg-[#161F33] text-[11px] font-bold text-[#E2E8F0] hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Upload className="h-3 w-3" aria-hidden="true" />
                            <span>Load</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Gameplay Assists */}
              <section className="space-y-2">
                <h3 className="font-display text-xs font-bold tracking-wider text-[#A78BFA] uppercase">
                  Gameplay Tools
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {renderToggleRow(
                    'Auto-Save on Exit',
                    'Automatically save to Slot 1 when leaving a game',
                    profile.autoSaveEnabled,
                    () =>
                      onUpdateCoreSettings(editingCoreId, {
                        autoSaveEnabled: !profile.autoSaveEnabled,
                      }),
                    'cyan'
                  )}
                  {renderToggleRow(
                    'Fast-Forward (2x)',
                    'Double gameplay speed for intros and grinding',
                    profile.fastForwardEnabled,
                    () =>
                      onUpdateCoreSettings(editingCoreId, {
                        fastForwardEnabled: !profile.fastForwardEnabled,
                      }),
                    'gold'
                  )}
                  {renderToggleRow(
                    'Instant Rewind',
                    'Keep recent snapshots ready for quick recovery',
                    profile.rewindEnabled,
                    () =>
                      onUpdateCoreSettings(editingCoreId, {
                        rewindEnabled: !profile.rewindEnabled,
                      }),
                    'violet'
                  )}
                  {renderToggleRow(
                    'Game Cheats',
                    'Allow classic practice codes (disables ranked mode)',
                    profile.cheatsEnabled,
                    () =>
                      onUpdateCoreSettings(editingCoreId, {
                        cheatsEnabled: !profile.cheatsEnabled,
                      }),
                    'violet'
                  )}
                </div>
              </section>

              {/* Audio Volume & Focus */}
              <section className="space-y-3 rounded-xl border border-white/10 bg-[#101625] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-[#F59E0B] uppercase">
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Audio &amp; Volume</span>
                  </h3>
                  <span className="font-mono-tabular text-xs font-bold text-[#F8FAFC]">
                    {Math.round(profile.masterVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={profile.masterVolume}
                  aria-label="Master Volume"
                  onChange={(e) =>
                    onUpdateCoreSettings(editingCoreId, {
                      masterVolume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#22D3EE]"
                />
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {AUDIO_FOCUS_MODES.map((af) => {
                    const active = profile.audioFocus === af.id;
                    return (
                      <button
                        key={af.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateCoreSettings(editingCoreId, { audioFocus: af.id })
                        }
                        className={`tactile-press rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                          active
                            ? 'border-[#22D3EE] bg-[#0D2332] text-[#22D3EE]'
                            : 'border-white/10 bg-[#0B0F1A] text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {af.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* 4. TIMER & USAGE REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-5" data-testid="settings-panel-reports">
              {/* Top Summary Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-[#22D3EE]/35 bg-[#0D1E2C] p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#67E8F9]">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Current Session</span>
                  </div>
                  <div
                    data-testid="reports-live-session-timer"
                    className="font-mono-tabular mt-1.5 text-xl font-extrabold text-[#F8FAFC]"
                  >
                    {formatSessionDuration(sessionElapsedSeconds)}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-[#94A3B8]">
                    {activeGameTitle ?? 'Idle in menu'}
                  </div>
                </div>

                <div className="rounded-xl border border-[#A78BFA]/30 bg-[#18142C] p-3.5">
                  <div className="text-[11px] font-semibold text-[#C4B5FD]">Total Playtime</div>
                  <div
                    data-testid="reports-total-playtime"
                    className="font-mono-tabular mt-1.5 text-xl font-extrabold text-[#F8FAFC]"
                  >
                    {formatHumanDuration(usageReport.totalPlaySeconds + sessionElapsedSeconds)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#94A3B8]">Across all games</div>
                </div>

                <div className="rounded-xl border border-[#F59E0B]/30 bg-[#231A0D] p-3.5">
                  <div className="text-[11px] font-semibold text-[#FCD34D]">Saved Sessions</div>
                  <div className="font-mono-tabular mt-1.5 text-xl font-extrabold text-[#F8FAFC]">
                    {usageReport.totalSessions}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#94A3B8]">Recorded runs</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#101625] p-3.5">
                  <div className="text-[11px] font-semibold text-[#94A3B8]">Games Played</div>
                  <div className="font-mono-tabular mt-1.5 text-xl font-extrabold text-[#F8FAFC]">
                    {usageReport.games.length}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#94A3B8]">Tracked titles</div>
                </div>
              </div>

              {/* Per-Game Breakdown */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
                    Playtime by Game
                  </h3>
                  {usageReport.totalSessions > 0 && (
                    <button
                      type="button"
                      onClick={onClearUsageReports}
                      className="tactile-press inline-flex items-center gap-1 rounded-md border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-[#FCA5A5] hover:border-[#F87171]/50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Clear Reports</span>
                    </button>
                  )}
                </div>

                {usageReport.games.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/12 bg-[#0F1524] px-4 py-6 text-center text-xs text-[#94A3B8]">
                    Every time you play a game, the live corner timer starts at 00:00 and saves your
                    playtime here automatically.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {usageReport.games.map((g) => (
                      <div
                        key={g.gameId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101625] px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-[#F8FAFC]">
                            {g.gameName}
                          </div>
                          <div className="text-[11px] text-[#94A3B8]">
                            {g.sessions} {g.sessions === 1 ? 'session' : 'sessions'} · Last played{' '}
                            {formatDateShort(g.lastPlayedAt)}
                          </div>
                        </div>
                        <div className="font-mono-tabular shrink-0 text-xs font-extrabold text-[#22D3EE]">
                          {formatHumanDuration(g.totalSeconds)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Recent Sessions Log */}
              {usageReport.recentSessions.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-display text-xs font-bold tracking-wider text-[#A78BFA] uppercase">
                    Recent Sessions
                  </h3>
                  <div className="space-y-1.5">
                    {usageReport.recentSessions.slice(0, 8).map((sess) => (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-[#0E1422] px-3.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-[#E2E8F0]">{sess.gameName}</span>
                          <span className="ml-2 text-[11px] text-[#94A3B8]">
                            {formatDateShort(sess.endedAt)} · {formatClock(sess.endedAt)}
                          </span>
                        </div>
                        <span className="font-mono-tabular shrink-0 font-bold text-[#FCD34D]">
                          {formatSessionDuration(sess.durationSeconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#080C16] px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <Cpu className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span className="font-semibold text-[#E2E8F0]">{PRIMARY_NES_CORE.label}</span>
            <span className="hidden sm:inline">· Primary NES Engine</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tactile-press rounded-lg bg-[#22D3EE] px-5 py-2 font-display text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9]"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

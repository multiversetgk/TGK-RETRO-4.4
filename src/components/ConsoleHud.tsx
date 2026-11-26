import React from 'react';
import {
  AlertTriangle,
  Clock,
  FolderOpen,
  Gamepad2,
  Home,
  Menu,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { RomMetadata } from '../emulator/core/inesParser';
import type { NetplaySessionState } from '../emulator/netplay/INetplayTransport';
import type { EmulatorSettingsProfile } from '../emulator/settings/emulatorSettingsStore';
import { formatSessionDuration } from '../emulator/settings/sessionTimerStore';
import type { EffectiveOrientation } from '../emulator/settings/viewportLayout';

interface ConsoleHudProps {
  romMetadata: RomMetadata | null;
  settings: EmulatorSettingsProfile;
  effectiveOrientation: EffectiveOrientation;
  isEditingLayout: boolean;
  sessionElapsedSeconds: number;
  netplay: NetplaySessionState;
  netplayDisconnectReason: string | null;
  statusBanner: string | null;
  onLoadRomFile: () => void;
  onToggleOnScreenPad: () => void;
  onOpenQuickDrawer: () => void;
  onOpenNetplay: () => void;
  onRetryNetplay: () => void;
  onExitToMenu: () => void;
  gameScreen: React.ReactNode;
  controllerOverlay: React.ReactNode;
}

function cleanGameTitle(name: string): string {
  return name.replace(/\.nes$/i, '').replace(/[_]+/g, ' ').trim();
}

export const ConsoleHud: React.FC<ConsoleHudProps> = ({
  romMetadata,
  settings,
  effectiveOrientation,
  isEditingLayout,
  sessionElapsedSeconds,
  netplay,
  netplayDisconnectReason,
  statusBanner,
  onLoadRomFile,
  onToggleOnScreenPad,
  onOpenQuickDrawer,
  onOpenNetplay,
  onRetryNetplay,
  onExitToMenu,
  gameScreen,
  controllerOverlay,
}) => {
  const isOnline =
    (netplay.status === 'connected' || netplay.status === 'reconnecting') &&
    Boolean(netplay.roomCode);
  const showReconnectEscape =
    netplay.status === 'reconnecting' || Boolean(netplayDisconnectReason);
  const isPortraitSplit =
    effectiveOrientation === 'portrait' && settings.showOnScreenPad && !isEditingLayout;

  return (
    <>
      {/* Minimal Clean Top Gameplay Bar (Unified TGK RETRO 4.4 Branding) */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0B0F1A] px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onExitToMenu();
            }}
            className="font-display text-xs font-extrabold tracking-wide text-[#22D3EE] hover:text-white whitespace-nowrap shrink-0"
          >
            TGK RETRO 4.4
          </button>
          <span aria-hidden="true" className="text-white/15">
            /
          </span>
          {romMetadata ? (
            <span
              data-testid="hud-loaded-rom-name"
              title={cleanGameTitle(romMetadata.name)}
              className="font-display truncate text-xs font-bold text-[#F8FAFC] sm:text-sm"
            >
              {cleanGameTitle(romMetadata.name)}
            </span>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-load-rom-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onLoadRomFile();
              }}
              className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-3 text-xs font-bold text-[#070910] hover:bg-[#38BDF8] whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Choose .nes Game</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOnline && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenNetplay();
              }}
              className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A78BFA]/50 bg-[#181430] px-2.5 text-xs font-semibold text-[#DDD6FE] hover:border-[#A78BFA] whitespace-nowrap shrink-0"
            >
              <Radio className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
              <span>Room {netplay.roomCode}</span>
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-pressed={settings.showOnScreenPad}
            aria-label={
              settings.showOnScreenPad ? 'Hide Touch Controls' : 'Show Touch Controls'
            }
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleOnScreenPad();
            }}
            className={`tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
              settings.showOnScreenPad
                ? 'border-[#22D3EE]/50 bg-[#0D212B] text-[#A5F3FC]'
                : 'border-white/10 bg-[#131929] text-[#94A3B8] hover:text-white'
            }`}
          >
            <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Controls</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="gameplay-menu-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenQuickDrawer();
            }}
            aria-label="Open Game Menu"
            className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-3.5 font-display text-xs font-extrabold text-[#070910] hover:bg-[#38BDF8] whitespace-nowrap shrink-0"
          >
            <Menu className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      {/* Always-Active Netplay Disconnect / Reconnect Escape Bar */}
      {showReconnectEscape && (
        <div
          role="alert"
          data-testid="netplay-reconnect-banner"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#F59E0B]/40 bg-[#1C160E] px-4 py-2 text-xs text-[#FDE68A]"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <span>
              {netplay.status === 'reconnecting'
                ? 'Reconnecting to your friend...'
                : netplayDisconnectReason ?? 'Online connection disconnected.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-netplay-retry-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onRetryNetplay();
              }}
              className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-md bg-[#F59E0B] px-3 font-display text-xs font-bold text-[#070910] hover:bg-[#FBBF24]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Now</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-netplay-exit-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onExitToMenu();
              }}
              className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-md border border-white/20 bg-[#141926] px-3 text-xs font-semibold text-white hover:border-white/40"
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Exit to Menu</span>
            </button>
          </div>
        </div>
      )}

      {/* Transient Non-Blocking Feedback Line */}
      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-14 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[#22D3EE]/35 bg-[#0D1322] px-3.5 py-1.5 text-xs font-medium text-[#F8FAFC] shadow-lg shadow-black/65"
        >
          {statusBanner}
        </div>
      )}

      {/* Responsive Gameplay Stage:
          - Portrait Mode: Top clean game screen (zero overlap) + dedicated bottom touch deck
          - Landscape Mode: Full-height center game screen + translucent left/right touch controls */}
      <main
        data-testid="gameplay-main-stage"
        data-effective-orientation={effectiveOrientation}
        className={`relative flex min-h-0 flex-1 overflow-hidden bg-[#06080E] ${
          isPortraitSplit ? 'flex-col' : 'items-center justify-center'
        }`}
      >
        {/* Top Game Screen Container (Upper 48% in Portrait Split, Full Viewport in Landscape) */}
        <div
          data-testid="gameplay-video-zone"
          className={`relative flex min-h-0 w-full items-center justify-center overflow-hidden ${
            isPortraitSplit ? 'h-[48%] shrink-0 bg-[#05070D]' : 'h-full flex-1'
          }`}
        >
          {/* Live Running Session Timer in Top-Left Corner */}
          <div
            data-testid="gameplay-session-timer"
            aria-label={`Session time ${formatSessionDuration(sessionElapsedSeconds)}`}
            className="pointer-events-none absolute top-2.5 left-2.5 z-25 inline-flex items-center gap-1.5 rounded-lg border border-[#22D3EE]/35 bg-[#0A0F1C]/88 px-2.5 py-1 shadow-md shadow-black/60"
          >
            <Clock className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span className="font-mono-tabular text-xs font-bold tracking-wider text-[#F8FAFC]">
              {formatSessionDuration(sessionElapsedSeconds)}
            </span>
          </div>

          {gameScreen}
        </div>

        {/* Controls Layer: Dedicated Lower Deck in Portrait, Translucent Side Overlay in Landscape */}
        {isPortraitSplit ? (
          <div
            data-testid="gameplay-portrait-controls-zone"
            className="min-h-0 w-full flex-1 overflow-hidden"
          >
            {controllerOverlay}
          </div>
        ) : (
          controllerOverlay
        )}
      </main>
    </>
  );
};

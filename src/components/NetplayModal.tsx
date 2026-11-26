import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FolderOpen,
  HardDriveDownload,
  Home,
  LogOut,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { NetplaySessionState } from '../emulator/netplay/INetplayTransport';
import {
  sanitizeRoomCode,
  type NetplayRoomMode,
  type PeerHandshakeMeta,
  type PlayerPort,
  type RomTransferOffer,
} from '../emulator/netplay/protocol';
import type {
  HandshakeVerificationResult,
  RollbackMetricsSnapshot,
} from '../emulator/netplay/rollbackEngine';
import type { NetplayDebugSnapshot } from '../emulator/netplay/debugTelemetry';
import { NetplayDebugPanel } from './NetplayDebugPanel';

interface PublicRoomItem {
  code: string;
  mode?: NetplayRoomMode;
  romName: string;
  romSha256?: string;
  coreVersion?: string;
  turnBasedSharedPort1?: boolean;
  playerCount: number;
  hasOpenSlot: boolean;
}

export interface RomTransferUiProgress {
  direction: 'send' | 'receive';
  done: number;
  total: number;
  romName: string;
}

interface NetplayModalProps {
  netplay: NetplaySessionState;
  netplayDisconnectReason: string | null;
  currentRomName: string | null;
  determinismOk: boolean;
  peerHandshake: PeerHandshakeMeta | null;
  handshakeCheck: HandshakeVerificationResult | null;
  rollbackMetrics: RollbackMetricsSnapshot | null;
  netplayDebug: NetplayDebugSnapshot;
  onlineMatchRunning: boolean;
  manualInputDelay: number | null;
  incomingRomOffer: RomTransferOffer | null;
  romTransferProgress: RomTransferUiProgress | null;
  defaultRoomMode?: NetplayRoomMode;
  onRequestLoadRomFile: () => void;
  onCreateRoom: (
    playerName: string,
    roomMode: NetplayRoomMode,
    options?: { turnBasedSharedPort1?: boolean }
  ) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onLeaveRoom: () => void;
  onRetryConnection: () => void;
  onExitToMenu: () => void;
  onSyncStart: () => void;
  onSyncPauseToggle: () => void;
  onSyncReset: () => void;
  onSwapTurnOwner: () => void;
  onChangeManualDelay: (frames: number | null) => void;
  onForceAuthoritativeResync: () => void;
  onResetNetplayDebug: () => void;
  onOfferRomTransfer: () => void;
  onAcceptRomTransfer: (saveToLocalStorage: boolean) => void;
  onDeclineRomTransfer: () => void;
  onSyncStateNow: () => void;
  onClose: () => void;
}

function qualityBadgeClass(quality: RollbackMetricsSnapshot['connectionQuality']): string {
  switch (quality) {
    case 'good':
      return 'border-[#22D3EE]/45 bg-[#0D2332] text-[#67E8F9]';
    case 'fair':
      return 'border-[#F59E0B]/45 bg-[#261D0D] text-[#FCD34D]';
    case 'poor':
      return 'border-[#FB923C]/45 bg-[#2B190E] text-[#FDBA74]';
    case 'unstable':
      return 'border-[#F87171]/50 bg-[#2C141A] text-[#FCA5A5]';
    default:
      return 'border-white/15 bg-[#12192A] text-[#94A3B8]';
  }
}

function formatFriendlySyncState(
  state: RollbackMetricsSnapshot['checksumSyncState'],
  options: {
    bothConnected: boolean;
    handshakeCompatible: boolean;
    syncReady: boolean;
  }
): { label: string; colorClass: string } {
  if (!options.bothConnected) {
    return { label: 'Waiting for P2', colorClass: 'text-[#94A3B8]' };
  }
  if (!options.handshakeCompatible) {
    return { label: 'Syncing...', colorClass: 'text-[#FCD34D]' };
  }
  switch (state) {
    case 'verified':
      return { label: 'Synced / Ready', colorClass: 'text-[#34D399]' };
    case 'desynced':
      return { label: 'Syncing...', colorClass: 'text-[#FCD34D]' };
    case 'recovering':
      return { label: 'Auto-Recovering', colorClass: 'text-[#FCD34D]' };
    default:
      return options.syncReady
        ? { label: 'Synced / Ready', colorClass: 'text-[#34D399]' }
        : { label: 'Synced / Ready', colorClass: 'text-[#67E8F9]' };
  }
}

function cleanGameTitle(name: string): string {
  return name.replace(/\.nes$/i, '').replace(/[_]+/g, ' ').trim();
}

export const NetplayModal: React.FC<NetplayModalProps> = ({
  netplay,
  netplayDisconnectReason,
  currentRomName,
  determinismOk,
  peerHandshake,
  handshakeCheck,
  rollbackMetrics,
  netplayDebug,
  onlineMatchRunning,
  manualInputDelay,
  incomingRomOffer,
  romTransferProgress,
  defaultRoomMode = 'shared-2p',
  onRequestLoadRomFile,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onRetryConnection,
  onExitToMenu,
  onSyncStart,
  onSyncPauseToggle,
  onSyncReset,
  onSwapTurnOwner,
  onChangeManualDelay,
  onForceAuthoritativeResync,
  onResetNetplayDebug,
  onOfferRomTransfer,
  onAcceptRomTransfer,
  onDeclineRomTransfer,
  onSyncStateNow,
  onClose,
}) => {
  const [playerName, setPlayerName] = React.useState('Player');
  const [roomMode, setRoomMode] = React.useState<NetplayRoomMode>(defaultRoomMode);
  const [turnBasedSharedPort1, setTurnBasedSharedPort1] = React.useState(false);
  const [roomInput, setRoomInput] = React.useState('');
  const [saveTransferLocally, setSaveTransferLocally] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<'code' | 'link' | null>(null);
  const [publicRooms, setPublicRooms] = React.useState<PublicRoomItem[]>([]);

  const fetchRooms = React.useCallback(async () => {
    try {
      const res = await fetch('/api/netplay/rooms');
      if (!res.ok) return;
      const data = (await res.json()) as { rooms?: PublicRoomItem[] };
      setPublicRooms(data.rooms ?? []);
    } catch {
      // ignore transient network errors
    }
  }, []);

  React.useEffect(() => {
    void fetchRooms();
  }, [fetchRooms, netplay.status, netplay.roomCode]);

  const handleCopyCode = async () => {
    if (!netplay.roomCode) return;
    try {
      await navigator.clipboard.writeText(netplay.roomCode);
      setCopied('code');
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyInviteLink = async () => {
    if (!netplay.roomCode) return;
    const url = `${window.location.origin}/?room=${netplay.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('link');
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeRoomCode(roomInput);
    if (cleaned.length < 4) {
      setValidationError('Enter a valid 4 to 6 character room code.');
      return;
    }
    setValidationError(null);
    onJoinRoom(cleaned, playerName.trim() || 'Player 2');
  };

  const isConnected =
    (netplay.status === 'connected' || netplay.status === 'reconnecting') &&
    Boolean(netplay.roomCode);
  const isRollbackRoom = netplay.roomMode === 'shared-2p';
  const isHost = netplay.assignedPort === 1;
  const bothConnected = netplay.players.length >= 2;
  const canStartSynced =
    isRollbackRoom && bothConnected && Boolean(handshakeCheck?.compatible) && determinismOk;

  const showConnectionEscape =
    netplay.status === 'reconnecting' ||
    Boolean(netplay.error) ||
    Boolean(netplayDisconnectReason);

  const syncInfo = rollbackMetrics
    ? formatFriendlySyncState(rollbackMetrics.checksumSyncState, {
        bothConnected,
        handshakeCompatible: Boolean(handshakeCheck?.compatible),
        syncReady: rollbackMetrics.syncReady,
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="netplay-modal-title"
      data-testid="netplay-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060B]/85 p-3 sm:p-5 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#22D3EE]/25 bg-[#0B0F1A] text-[#F1F5F9] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        {/* Neon Top Trim */}
        <div className="h-1 w-full bg-gradient-to-r from-[#22D3EE] via-[#A78BFA] to-[#F59E0B]" />

        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-mono-tabular text-[11px] font-bold tracking-wider text-[#22D3EE] uppercase">
                TGK RETRO 4.4 · 2-Player Netplay Sync
              </div>
              <h2
                id="netplay-modal-title"
                className="font-display mt-0.5 text-xl font-extrabold text-[#F8FAFC]"
              >
                Online NES Multiplayer
              </h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Frame-numbered input sync, adaptive or manual delay buffer, synced Start/Pause/Reset,
                and automatic desync recovery on FCEUmm.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Online Multiplayer"
              className="tactile-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-[#111827] text-[#CBD5E1] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Netplay Disconnect / Reconnecting Escape Panel (User can never get stuck) */}
          {showConnectionEscape && (
            <div
              role="alert"
              data-testid="netplay-escape-panel"
              className="mb-4 rounded-xl border border-[#F59E0B]/45 bg-[#23190B] p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#FDE68A]">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                  <span className="truncate">
                    {netplay.status === 'reconnecting'
                      ? `Reconnecting to your online room (attempt ${netplay.reconnectAttempt}/5)...`
                      : netplay.error ??
                        netplayDisconnectReason ??
                        'Connection interrupted. You can retry or exit cleanly.'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    data-testid="netplay-retry-btn"
                    onClick={onRetryConnection}
                    className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#F59E0B] px-3 text-xs font-extrabold text-[#070910] hover:bg-[#FBBF24]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Retry Now</span>
                  </button>
                  <button
                    type="button"
                    data-testid="netplay-exit-menu-btn"
                    onClick={onExitToMenu}
                    className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-[#121826] px-3 text-xs font-bold text-[#F8FAFC] hover:border-white/35"
                  >
                    <Home className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Exit to Menu</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {validationError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#F87171]/45 bg-[#2A1219] px-3.5 py-2.5 text-xs text-[#FCA5A5]"
            >
              {validationError}
            </div>
          )}

          {isConnected ? (
            <div className="space-y-4">
              {/* Room Header Card */}
              <div className="rounded-xl border border-[#22D3EE]/35 bg-[#0D1E2C] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#94A3B8]">
                      Room Code ·{' '}
                      {isRollbackRoom
                        ? netplay.turnBasedSharedPort1
                          ? '2P Online (Turn-Based)'
                          : '2P Online (Simultaneous)'
                        : 'Dual-Screen VS Race'}
                    </div>
                    <div
                      data-testid="netplay-room-code"
                      className="font-mono-tabular mt-0.5 text-2xl font-extrabold tracking-widest text-[#22D3EE]"
                    >
                      {netplay.roomCode}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="tactile-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/15 bg-[#111C2D] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-[#22D3EE]/50"
                    >
                      {copied === 'code' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyInviteLink}
                      className="tactile-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#F59E0B]/40 bg-[#261D0D] px-3 text-xs font-bold text-[#FCD34D] hover:border-[#F59E0B]/70"
                    >
                      {copied === 'link' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                          <span>Invite Copied</span>
                        </>
                      ) : (
                        <span>Copy Invite Link</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="font-mono-tabular mt-3 flex flex-wrap items-center gap-2.5 text-xs text-[#CBD5E1]">
                  <span className="font-bold text-[#F8FAFC]">
                    Your Controller: Player {netplay.assignedPort}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-[#67E8F9]">
                    {netplay.transportChannel === 'webrtc' ? (
                      <>
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        <span>Direct P2P</span>
                      </>
                    ) : (
                      <>
                        <Wifi className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
                        <span>Online Room</span>
                      </>
                    )}
                  </span>
                </div>

                {netplay.holdState.active && (
                  <div className="mt-2.5 rounded-lg bg-[#241A0B] px-3 py-2 text-[11px] font-medium text-[#FCD34D]">
                    Match paused briefly while waiting for Player {netplay.holdState.port ?? 2} to
                    return.
                  </div>
                )}
              </div>

              {/* Incoming Consent-Based Game Share Prompt */}
              {incomingRomOffer && (
                <div
                  data-testid="rom-transfer-consent-card"
                  className="rounded-xl border border-[#22D3EE]/45 bg-[#0D2130] p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#67E8F9]">
                    <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                    <span>Game File Share Request</span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#CBD5E1]">
                    Host offered <strong className="text-white">{incomingRomOffer.romName}</strong>{' '}
                    ({Math.max(1, Math.round(incomingRomOffer.sizeBytes / 1024))} KB). Only accept
                    game files you are legally permitted to use. File integrity is checked
                    automatically before loading.
                  </p>

                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#E2E8F0]">
                    <input
                      type="checkbox"
                      checked={saveTransferLocally}
                      onChange={(e) => setSaveTransferLocally(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#22D3EE]"
                    />
                    <span>Save this game locally for faster rejoin next time</span>
                  </label>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAcceptRomTransfer(saveTransferLocally)}
                      className="tactile-press inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-3 text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9]"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Accept &amp; Load Game</span>
                    </button>
                    <button
                      type="button"
                      onClick={onDeclineRomTransfer}
                      className="tactile-press inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#12192A] px-3 text-xs font-semibold text-[#CBD5E1] hover:text-white"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Active Transfer Progress */}
              {romTransferProgress && (
                <div className="rounded-xl border border-[#22D3EE]/30 bg-[#0E1E2B] p-3 text-xs text-[#BAE6FD]">
                  <div className="flex items-center justify-between">
                    <span>
                      {romTransferProgress.direction === 'send' ? 'Sending' : 'Receiving'}{' '}
                      {cleanGameTitle(romTransferProgress.romName)}
                    </span>
                    <span className="font-mono-tabular">
                      {Math.min(
                        100,
                        Math.round(
                          (romTransferProgress.done / Math.max(1, romTransferProgress.total)) * 100
                        )
                      )}
                      %
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
                    <div
                      className="h-full bg-[#22D3EE] transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (romTransferProgress.done / Math.max(1, romTransferProgress.total)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Players + Game Match Status */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#101625] p-3.5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#94A3B8]">
                    <Users className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                    <span>Players ({netplay.players.length}/2)</span>
                  </div>
                  <div className="space-y-1.5">
                    {([1, 2] as PlayerPort[]).map((port) => {
                      const player = netplay.players.find((p) => p.port === port);
                      return (
                        <div
                          key={port}
                          className="flex items-center justify-between rounded-lg bg-[#0A0F1B] px-2.5 py-2 text-xs"
                        >
                          <span
                            className={`font-display font-bold ${
                              port === 1 ? 'text-[#22D3EE]' : 'text-[#F59E0B]'
                            }`}
                          >
                            Player {port}
                          </span>
                          <span className="truncate text-[#F1F5F9]">
                            {player
                              ? `${player.name}${
                                  netplay.assignedPort === port ? ' (You)' : ''
                                }`
                              : 'Waiting for friend...'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#101625] p-3.5">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#94A3B8]">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                      <span>Game Match</span>
                    </span>
                    <span
                      data-testid="netplay-verify-status"
                      className={`font-mono-tabular text-[11px] font-bold ${
                        handshakeCheck?.compatible
                          ? 'text-[#67E8F9]'
                          : peerHandshake
                            ? 'text-[#FCA5A5]'
                            : 'text-[#FCD34D]'
                      }`}
                    >
                      {handshakeCheck?.compatible
                        ? 'MATCHED'
                        : peerHandshake
                          ? 'MISMATCH'
                          : 'WAITING'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-[#CBD5E1]">
                    <div className="truncate">
                      Your Game:{' '}
                      <span className="font-semibold text-white">
                        {currentRomName ? cleanGameTitle(currentRomName) : 'Not selected'}
                      </span>
                    </div>
                    <div className="truncate">
                      Friend&apos;s Game:{' '}
                      <span className="font-semibold text-white">
                        {peerHandshake?.romName
                          ? cleanGameTitle(peerHandshake.romName)
                          : 'Waiting...'}
                      </span>
                    </div>
                    <div className="pt-0.5 text-[11px] text-[#94A3B8]">
                      {handshakeCheck?.compatible
                        ? 'Both players have the exact same game ready.'
                        : peerHandshake
                          ? 'Both players need the same .nes game file to play together.'
                          : 'Share your room code so your friend can join.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Clean Connection Status & Input Smoothness */}
              {isRollbackRoom && rollbackMetrics && (
                <div
                  data-testid="rollback-telemetry-panel"
                  className="rounded-xl border border-white/10 bg-[#101625] p-3.5"
                >
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#F8FAFC]">Connection &amp; Sync</div>
                    <span
                      data-testid="connection-quality-badge"
                      className={`font-mono-tabular rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${qualityBadgeClass(
                        rollbackMetrics.connectionQuality
                      )}`}
                    >
                      {rollbackMetrics.connectionQuality}
                    </span>
                  </div>

                  <div className="font-mono-tabular grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-lg bg-[#0A0F1B] p-2.5">
                      <div className="text-[10px] text-[#94A3B8]">Ping</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">
                        {rollbackMetrics.pingMs !== null ? `${rollbackMetrics.pingMs} ms` : '-- ms'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0A0F1B] p-2.5">
                      <div className="text-[10px] text-[#94A3B8]">Sync Status</div>
                      <div
                        data-testid="rollback-sync-status"
                        className={`mt-0.5 font-bold ${syncInfo?.colorClass ?? 'text-[#CBD5E1]'}`}
                      >
                        {syncInfo?.label ?? 'Ready'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0A0F1B] p-2.5">
                      <div className="text-[10px] text-[#94A3B8]">Clock Pulse</div>
                      <div
                        data-testid="rollback-clock-sync"
                        className={`mt-0.5 font-bold ${
                          rollbackMetrics.clockAligned ? 'text-[#34D399]' : 'text-[#FCD34D]'
                        }`}
                      >
                        {rollbackMetrics.clockAligned
                          ? 'Aligned'
                          : `Aligning (${Math.abs(rollbackMetrics.clockDriftMs)}ms)`}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0A0F1B] p-2.5">
                      <div className="text-[10px] text-[#94A3B8]">Input Delay</div>
                      <div className="mt-0.5 font-bold text-[#F8FAFC]">
                        {rollbackMetrics.adaptiveDelayEnabled
                          ? `Auto (${rollbackMetrics.inputDelayFrames}F)`
                          : rollbackMetrics.highPingSafeFloorActive
                            ? `${rollbackMetrics.inputDelayFrames}F (Safe min)`
                            : `${rollbackMetrics.inputDelayFrames} frames`}
                      </div>
                    </div>
                  </div>

                  {/* Input Delay Adjustment */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs">
                    <div className="text-[#94A3B8]">
                      Input Smoothness
                      {rollbackMetrics.turnBasedSharedPort1 && (
                        <span className="ml-2 font-semibold text-[#FCD34D]">
                          · Turn: Player {rollbackMetrics.activeTurnPort}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {([null, 0, 1, 2, 3, 4, 5, 6] as (number | null)[]).map((val) => {
                        const active = manualInputDelay === val;
                        return (
                          <button
                            key={val === null ? 'auto' : String(val)}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChangeManualDelay(val)}
                            className={`font-mono-tabular h-6 rounded-md px-2 text-[11px] font-bold ${
                              active
                                ? 'bg-[#22D3EE] text-[#070910]'
                                : 'border border-white/10 bg-[#0A0F1B] text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            {val === null ? 'Auto' : String(val)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {rollbackMetrics.highPingDelayWarning && (
                    <div
                      role="status"
                      data-testid="netplay-high-ping-delay-warning"
                      className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#F59E0B]/45 bg-[#241A0B] px-3 py-2 text-[11px] font-medium text-[#FDE68A]"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                      <span>{rollbackMetrics.highPingDelayWarning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Netplay Debug Section: Local & Peer Jitter, Packet Loss, and Buffer Size */}
              <NetplayDebugPanel
                debugStats={netplayDebug}
                localLabel={`Local (Player ${netplay.assignedPort ?? 1})`}
                peerLabel={`Peer (Player ${netplay.assignedPort === 1 ? 2 : 1})`}
                peerConnected={bothConnected}
                onResetCounters={onResetNetplayDebug}
              />

              {/* Match Controls */}
              <div className="space-y-2 pt-1">
                {isRollbackRoom ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="netplay-sync-start-btn"
                        disabled={!canStartSynced}
                        onClick={onSyncStart}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-4 text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        <span>Start Match</span>
                      </button>

                      <button
                        type="button"
                        disabled={!bothConnected}
                        onClick={onSyncPauseToggle}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-white/30 disabled:opacity-45"
                      >
                        {onlineMatchRunning ? (
                          <>
                            <Pause className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                            <span>Resume</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={!canStartSynced}
                        onClick={onSyncReset}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-white/30 disabled:opacity-45"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Restart</span>
                      </button>

                      {netplay.turnBasedSharedPort1 && (
                        <button
                          type="button"
                          onClick={onSwapTurnOwner}
                          className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F59E0B]/40 bg-[#261D0D] px-3 text-xs font-bold text-[#FCD34D] hover:border-[#F59E0B]"
                        >
                          <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Swap Turn</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {isHost && bothConnected && (
                          <>
                            <button
                              type="button"
                              onClick={onForceAuthoritativeResync}
                              className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#F1F5F9] hover:border-[#22D3EE]/50"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                              <span>Resync Match</span>
                            </button>
                            <button
                              type="button"
                              data-testid="netplay-offer-rom-btn"
                              onClick={onOfferRomTransfer}
                              className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#A78BFA]/45 bg-[#1B1433] px-3 text-xs font-bold text-[#C4B5FD] hover:border-[#A78BFA]"
                            >
                              <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Share Game File</span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onLeaveRoom}
                          className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F87171]/40 bg-[#2A1219] px-3.5 text-xs font-bold text-[#FCA5A5] hover:bg-[#3A1721]"
                        >
                          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Leave Room</span>
                        </button>
                        <button
                          type="button"
                          onClick={onExitToMenu}
                          className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] hover:text-white"
                        >
                          <Home className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Exit to Menu</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {isHost && (
                        <button
                          type="button"
                          onClick={onSyncStateNow}
                          className="tactile-press inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[#111827] px-3.5 text-xs font-semibold text-[#F1F5F9] hover:border-[#22D3EE]/50"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                          <span>Sync Game &amp; Rules to P2</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onLeaveRoom}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F87171]/40 bg-[#2A1219] px-3.5 text-xs font-bold text-[#FCA5A5] hover:bg-[#3A1721]"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Leave Room</span>
                      </button>
                      <button
                        type="button"
                        onClick={onExitToMenu}
                        className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] hover:text-white"
                      >
                        <Home className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Exit to Menu</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected Game Readiness */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#101625] px-4 py-3 text-xs">
                <div className="flex min-w-0 items-center gap-2.5">
                  {currentRomName && determinismOk ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22D3EE]" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[#F8FAFC]">
                      {currentRomName ? cleanGameTitle(currentRomName) : 'No .nes Game Selected'}
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {currentRomName
                        ? 'FCEUmm engine ready for online play'
                        : 'Pick a .nes game from your device to host a room'}
                    </div>
                  </div>
                </div>
                {currentRomName ? (
                  <span className="font-mono-tabular text-[11px] font-bold text-[#22D3EE]">
                    READY
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onRequestLoadRomFile}
                    className="tactile-press inline-flex items-center gap-1.5 rounded-lg bg-[#22D3EE] px-3 py-1.5 text-[11px] font-extrabold text-[#070910] hover:bg-[#67E8F9]"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pick .nes Game</span>
                  </button>
                )}
              </div>

              <div>
                <label
                  htmlFor="netplay-player-name"
                  className="mb-1.5 block text-xs font-semibold text-[#CBD5E1]"
                >
                  Player Name
                </label>
                <input
                  id="netplay-player-name"
                  type="text"
                  maxLength={24}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Player 1"
                  className="h-10 w-full rounded-xl border border-white/12 bg-[#080C16] px-3.5 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus-visible:outline-2 focus-visible:outline-[#22D3EE]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Host Room Card */}
                <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101625] p-4">
                  <div>
                    <div className="font-display text-sm font-extrabold text-[#F8FAFC]">
                      Host Room (Player 1)
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#080C16] p-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setRoomMode('shared-2p')}
                        className={`rounded-md py-1.5 font-bold transition-colors ${
                          roomMode === 'shared-2p'
                            ? 'bg-[#22D3EE] text-[#070910]'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        2P Co-op / VS
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoomMode('dual-race')}
                        className={`rounded-md py-1.5 font-bold transition-colors ${
                          roomMode === 'dual-race'
                            ? 'bg-[#A78BFA] text-[#070910]'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        Dual Race
                      </button>
                    </div>

                    {roomMode === 'shared-2p' && (
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#CBD5E1]">
                        <input
                          type="checkbox"
                          checked={turnBasedSharedPort1}
                          onChange={(e) => setTurnBasedSharedPort1(e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#22D3EE]"
                        />
                        <span>Turn-Based Mode (pass controller on P1)</span>
                      </label>
                    )}
                  </div>

                  <button
                    type="button"
                    data-testid="netplay-create-room-btn"
                    disabled={netplay.status === 'connecting'}
                    onClick={() => {
                      if (!currentRomName) {
                        setValidationError(
                          'Pick a .nes game file first before hosting an online room.'
                        );
                        return;
                      }
                      setValidationError(null);
                      onCreateRoom(playerName.trim() || 'Player 1', roomMode, {
                        turnBasedSharedPort1: roomMode === 'shared-2p' && turnBasedSharedPort1,
                      });
                    }}
                    className="tactile-press mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#22D3EE] font-display text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9] disabled:opacity-50"
                  >
                    <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {netplay.status === 'connecting'
                        ? 'Connecting...'
                        : currentRomName
                          ? 'Create Room Code'
                          : 'Pick .nes Game to Host'}
                    </span>
                  </button>
                </div>

                {/* Join Room Form */}
                <form
                  onSubmit={handleJoinSubmit}
                  className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101625] p-4"
                >
                  <div>
                    <div className="font-display text-sm font-extrabold text-[#F8FAFC]">
                      Join Room (Player 2)
                    </div>
                    <label
                      htmlFor="netplay-room-code-input"
                      className="mt-2 mb-1 block text-[11px] text-[#94A3B8]"
                    >
                      Enter your friend&apos;s Room Code
                    </label>
                    <input
                      id="netplay-room-code-input"
                      type="text"
                      maxLength={6}
                      value={roomInput}
                      onChange={(e) => {
                        setRoomInput(sanitizeRoomCode(e.target.value));
                        setValidationError(null);
                      }}
                      placeholder="e.g. TGK48"
                      className="font-mono-tabular h-10 w-full rounded-lg border border-white/12 bg-[#080C16] px-3 text-sm font-bold tracking-widest text-[#F8FAFC] uppercase placeholder:font-normal placeholder:tracking-normal placeholder:text-[#64748B]"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="netplay-join-room-btn"
                    disabled={netplay.status === 'connecting'}
                    className="tactile-press mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#F59E0B]/50 bg-[#261D0D] font-display text-xs font-extrabold text-[#FCD34D] hover:bg-[#352711] disabled:opacity-50"
                  >
                    Join as Player 2
                  </button>
                </form>
              </div>

              {/* Active Public Rooms */}
              {publicRooms.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>Open Rooms</span>
                    <button
                      type="button"
                      onClick={() => void fetchRooms()}
                      className="text-xs font-semibold text-[#22D3EE] hover:text-white"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {publicRooms.map((room) => (
                      <div
                        key={room.code}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#101625] px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="font-mono-tabular font-bold text-[#22D3EE]">
                            {room.code}
                          </span>
                          <span className="truncate text-[#E2E8F0]">
                            {cleanGameTitle(room.romName)}
                          </span>
                          <span className="font-mono-tabular shrink-0 text-[10px] text-[#94A3B8]">
                            {room.mode === 'dual-race' ? 'RACE' : '2P ONLINE'} · {room.playerCount}
                            /2
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={!room.hasOpenSlot}
                          onClick={() =>
                            onJoinRoom(room.code, playerName.trim() || 'Player 2')
                          }
                          className="tactile-press shrink-0 rounded-lg border border-[#22D3EE]/40 bg-[#0D2332] px-3 py-1 text-xs font-bold text-[#22D3EE] hover:bg-[#133247] disabled:opacity-40"
                        >
                          {room.hasOpenSlot ? 'Join' : 'Full'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="max-w-lg text-[11px] leading-relaxed text-[#94A3B8]">
              Both devices run live FCEUmm gameplay with frame-numbered inputs and periodic state
              checks—no video streaming. Real-world Wi-Fi or mobile latency varies; we never
              promise zero latency or perfect sync.
            </p>
            {!isConnected && (
              <button
                type="button"
                data-testid="netplay-idle-exit-menu-btn"
                onClick={onExitToMenu}
                className="tactile-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-[#111827] px-3 text-xs font-semibold text-[#CBD5E1] hover:text-white"
              >
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Exit to Menu</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

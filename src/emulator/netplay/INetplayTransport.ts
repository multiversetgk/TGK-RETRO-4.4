import type { ActiveChaosTwist } from '../race/chaosEngine';
import type { RaceMatchConfig } from '../race/ramJudge';
import type {
  FrameInputEntry,
  NesButtonName,
  NetplayRoomMode,
  PeerDebugTelemetryPayload,
  PeerHandshakeMeta,
  PlayerPort,
  RaceTelemetryPacket,
  RomTransferOffer,
} from './protocol';

export type NetplayStatus =
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'error';

export type NetplayChannelKind = 'websocket' | 'webrtc';

export interface NetplayPlayer {
  port: PlayerPort;
  name: string;
}

export interface NetplayHoldState {
  active: boolean;
  port: PlayerPort | null;
  reason: 'disconnect' | 'background' | 'call' | 'manual' | null;
  graceSeconds: number;
}

export interface NetplaySessionState {
  status: NetplayStatus;
  roomCode: string | null;
  roomMode: NetplayRoomMode;
  assignedPort: PlayerPort | null;
  romName: string | null;
  romSha256: string | null;
  romSizeBytes: number;
  coreId: string | null;
  coreVersion: string | null;
  protocolVersion: string;
  turnBasedSharedPort1: boolean;
  players: NetplayPlayer[];
  pingMs: number | null;
  transportChannel: NetplayChannelKind;
  holdState: NetplayHoldState;
  reconnectAttempt: number;
  error: string | null;
}

export interface NetplayEventHandlers {
  onStateChange: (state: NetplaySessionState) => void;
  onRemoteInput: (port: PlayerPort, button: NesButtonName, pressed: boolean, frame: number) => void;
  onRemoteRom: (romName: string, romHash: string, romBytes: Uint8Array) => void;
  onRemoteState: (stateJson: string, frame: number, romHash: string) => void;
  onRemoteControl: (action: 'pause' | 'resume' | 'reset') => void;
  onPeerJoined?: (reconnected?: boolean) => void;
  onPeerHello?: (port: PlayerPort, meta: PeerHandshakeMeta) => void;
  onRemoteFrameInputs?: (batch: {
    port: PlayerPort;
    latestFrame: number;
    ackFrame: number;
    inputs: FrameInputEntry[];
  }) => void;
  onRemoteChecksum?: (port: PlayerPort, frame: number, checksum: string) => void;
  onSyncPulse?: (pulse: {
    port: PlayerPort;
    pulseId: number;
    frame: number;
    sentAtMs: number;
  }) => void;
  onPeerDebugTelemetry?: (port: PlayerPort, telemetry: PeerDebugTelemetryPayload) => void;
  onAuthoritativeSnapshot?: (snapshot: {
    port: PlayerPort;
    frame: number;
    stateJson: string;
    checksum: string;
    romSha256: string;
    romHash: string;
    reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment';
  }) => void;
  onSyncControl?: (control: {
    port: PlayerPort;
    action: 'start' | 'pause' | 'resume' | 'reset' | 'turn_swap';
    targetFrame: number;
    activeTurnPort?: PlayerPort;
  }) => void;
  onRomTransferOffer?: (port: PlayerPort, offer: RomTransferOffer) => void;
  onRomTransferAccept?: (port: PlayerPort, transferId: string, saveToLocalStorage: boolean) => void;
  onRomTransferDecline?: (port: PlayerPort, transferId: string, reason: string) => void;
  onRomTransferChunk?: (
    port: PlayerPort,
    transferId: string,
    chunkIndex: number,
    chunkCount: number,
    dataBase64: string
  ) => void;
  onRomTransferComplete?: (
    port: PlayerPort,
    transferId: string,
    verified: boolean,
    sha256: string,
    error?: string
  ) => void;
  onPingSample?: (rttMs: number) => void;
  onRemoteRaceConfig?: (config: RaceMatchConfig) => void;
  onRemoteRaceTelemetry?: (packet: RaceTelemetryPacket) => void;
  onRemoteChaos?: (twist: ActiveChaosTwist | null) => void;
  onPeerHoldChange?: (hold: NetplayHoldState) => void;
}

export interface CreateRoomOptions {
  romName: string;
  romHash: string;
  romSha256?: string;
  romSizeBytes?: number;
  coreId?: string;
  coreVersion?: string;
  playerName?: string;
  roomMode?: NetplayRoomMode;
  turnBasedSharedPort1?: boolean;
}

/**
 * Decoupled Netplay transport interface supporting TGK RETRO 2.0 Rollback Netcode
 * over WebSocket signaling + WebRTC DataChannel P2P, consent-based ROM transfer,
 * and Smart Auto-Pause & Reconnect.
 */
export interface INetplayTransport {
  getState(): NetplaySessionState;
  createRoom(
    romName: string,
    romHash: string,
    playerName?: string,
    roomMode?: NetplayRoomMode,
    extra?: Partial<CreateRoomOptions>
  ): Promise<void>;
  joinRoom(
    roomCode: string,
    playerName?: string,
    meta?: { coreId?: string; coreVersion?: string; romName?: string; romSha256?: string }
  ): Promise<void>;
  leaveRoom(): void;
  sendPeerHello(meta: PeerHandshakeMeta): void;
  sendFrameInputs(
    port: PlayerPort,
    latestFrame: number,
    ackFrame: number,
    inputs: FrameInputEntry[]
  ): void;
  sendChecksum(frame: number, checksum: string): void;
  sendSyncPulse(pulseId: number, frame: number, sentAtMs: number): void;
  sendDebugTelemetry(telemetry: PeerDebugTelemetryPayload): void;
  sendAuthoritativeSnapshot(snapshot: {
    frame: number;
    stateJson: string;
    checksum: string;
    romSha256: string;
    romHash: string;
    reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment';
  }): void;
  sendSyncControl(
    action: 'start' | 'pause' | 'resume' | 'reset' | 'turn_swap',
    targetFrame: number,
    activeTurnPort?: PlayerPort
  ): void;
  sendRomTransferOffer(offer: RomTransferOffer): void;
  acceptRomTransfer(transferId: string, saveToLocalStorage: boolean): void;
  declineRomTransfer(transferId: string, reason: string): void;
  sendRomTransferChunk(
    transferId: string,
    chunkIndex: number,
    chunkCount: number,
    dataBase64: string
  ): void;
  sendRomTransferComplete(
    transferId: string,
    verified: boolean,
    sha256: string,
    error?: string
  ): void;
  sendInput(port: PlayerPort, button: NesButtonName, pressed: boolean, frame: number): void;
  broadcastRom(romName: string, romHash: string, romBytes: Uint8Array): void;
  broadcastState(stateJson: string, frame: number, romHash: string): void;
  broadcastControl(action: 'pause' | 'resume' | 'reset'): void;
  broadcastRaceConfig(config: RaceMatchConfig): void;
  sendRaceTelemetry(packet: RaceTelemetryPacket): void;
  broadcastChaos(twist: ActiveChaosTwist | null): void;
  setLocalHold(held: boolean, reason: 'background' | 'call' | 'manual'): void;
  dispose(): void;
}

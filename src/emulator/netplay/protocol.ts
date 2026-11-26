import type { ActiveChaosTwist } from '../race/chaosEngine';
import type { PlayerTelemetry, RaceMatchConfig } from '../race/ramJudge';

export const NETPLAY_PROTOCOL_VERSION = 'tgk-retro-2.0';
export const MAX_ROM_TRANSFER_BYTES = 4 * 1024 * 1024; // 4 MB max .nes ROM transfer
export const ROM_TRANSFER_CHUNK_BYTES = 48 * 1024; // 48 KB raw (~64 KB base64) per chunk

export type PlayerPort = 1 | 2;
export type NetplayRoomMode = 'shared-2p' | 'dual-race';

export type NesButtonName =
  | 'A'
  | 'B'
  | 'SELECT'
  | 'START'
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT';

export interface FrameInputEntry {
  frame: number;
  /** 8-bit NES joypad bitmask: A=1, B=2, SELECT=4, START=8, UP=16, DOWN=32, LEFT=64, RIGHT=128 */
  mask: number;
}

export interface PeerHandshakeMeta {
  protocolVersion: string;
  coreId: string;
  coreVersion: string;
  romName: string;
  romHash: string;
  romSha256: string;
  romSizeBytes: number;
  determinismVerified: boolean;
}

export interface RomTransferOffer {
  transferId: string;
  romName: string;
  sizeBytes: number;
  sha256: string;
  chunkCount: number;
}

export interface RaceTelemetryPacket {
  port: PlayerPort;
  telemetry: PlayerTelemetry;
  frame: number;
  /** Optional small JPEG/WebP preview frame data URL for Dual-Screen spectator view only (never used for shared 2P rollback). */
  previewDataUrl?: string | null;
}

export interface PeerDebugTelemetryPayload {
  port: PlayerPort;
  packetJitterMs: number;
  peakJitterMs: number;
  packetsLost: number;
  packetsReceived: number;
  bufferSizeFrames: number;
  inputDelayFrames: number;
  bufferedQueueFrames: number;
  bufferCapacityFrames: number;
}

export type NetplayClientMessage =
  | {
      type: 'room:create';
      romName: string;
      romHash: string;
      romSha256?: string;
      romSizeBytes?: number;
      coreId?: string;
      coreVersion?: string;
      protocolVersion?: string;
      playerName: string;
      roomMode?: NetplayRoomMode;
      turnBasedSharedPort1?: boolean;
    }
  | {
      type: 'room:join';
      roomCode: string;
      playerName: string;
      coreId?: string;
      coreVersion?: string;
      romName?: string;
      romSha256?: string;
      protocolVersion?: string;
    }
  | {
      type: 'room:rejoin';
      roomCode: string;
      port: PlayerPort;
      playerName: string;
      coreId?: string;
      coreVersion?: string;
      romSha256?: string;
    }
  | { type: 'room:leave' }
  | {
      type: 'room:hold';
      reason: 'background' | 'call' | 'manual';
      held: boolean;
    }
  | {
      type: 'peer:hello';
      meta: PeerHandshakeMeta;
    }
  | {
      type: 'input:frame';
      port: PlayerPort;
      latestFrame: number;
      ackFrame: number;
      inputs: FrameInputEntry[];
    }
  | {
      type: 'sync:checksum';
      frame: number;
      checksum: string;
    }
  | {
      type: 'sync:pulse';
      pulseId: number;
      frame: number;
      sentAtMs: number;
    }
  | {
      type: 'debug:telemetry';
      telemetry: PeerDebugTelemetryPayload;
    }
  | {
      type: 'state:snapshot';
      frame: number;
      stateJson: string;
      checksum: string;
      romSha256: string;
      romHash: string;
      reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment';
    }
  | {
      type: 'control:sync';
      action: 'start' | 'pause' | 'resume' | 'reset' | 'turn_swap';
      targetFrame: number;
      activeTurnPort?: PlayerPort;
    }
  | {
      type: 'rom:transfer_offer';
      offer: RomTransferOffer;
    }
  | {
      type: 'rom:transfer_accept';
      transferId: string;
      saveToLocalStorage: boolean;
    }
  | {
      type: 'rom:transfer_decline';
      transferId: string;
      reason: string;
    }
  | {
      type: 'rom:transfer_chunk';
      transferId: string;
      chunkIndex: number;
      chunkCount: number;
      dataBase64: string;
    }
  | {
      type: 'rom:transfer_complete';
      transferId: string;
      verified: boolean;
      sha256: string;
      error?: string;
    }
  | {
      type: 'input:event';
      port: PlayerPort;
      button: NesButtonName;
      pressed: boolean;
      frame: number;
    }
  | {
      type: 'rom:sync';
      romName: string;
      romHash: string;
      romBase64: string;
    }
  | {
      type: 'state:sync';
      stateJson: string;
      frame: number;
      romHash: string;
    }
  | {
      type: 'control:action';
      action: 'pause' | 'resume' | 'reset';
    }
  | {
      type: 'race:config';
      config: RaceMatchConfig;
    }
  | {
      type: 'race:telemetry';
      packet: RaceTelemetryPacket;
    }
  | {
      type: 'race:chaos';
      twist: ActiveChaosTwist | null;
    }
  | {
      type: 'webrtc:offer';
      sdp: string;
    }
  | {
      type: 'webrtc:answer';
      sdp: string;
    }
  | {
      type: 'webrtc:ice';
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    }
  | { type: 'ping'; sentAt: number };

export type NetplayServerMessage =
  | {
      type: 'room:created';
      roomCode: string;
      assignedPort: PlayerPort;
      roomMode: NetplayRoomMode;
      romName: string;
      romHash: string;
      romSha256: string;
      romSizeBytes: number;
      coreId: string;
      coreVersion: string;
      protocolVersion: string;
      turnBasedSharedPort1: boolean;
      players: { port: PlayerPort; name: string }[];
    }
  | {
      type: 'room:joined';
      roomCode: string;
      assignedPort: PlayerPort;
      roomMode: NetplayRoomMode;
      romName: string;
      romHash: string;
      romSha256: string;
      romSizeBytes: number;
      coreId: string;
      coreVersion: string;
      protocolVersion: string;
      turnBasedSharedPort1: boolean;
      players: { port: PlayerPort; name: string }[];
    }
  | {
      type: 'room:peer_joined';
      players: { port: PlayerPort; name: string }[];
      reconnected?: boolean;
    }
  | {
      type: 'room:peer_left';
      port: PlayerPort;
      players: { port: PlayerPort; name: string }[];
    }
  | {
      type: 'room:peer_hold';
      port: PlayerPort;
      held: boolean;
      reason: 'disconnect' | 'background' | 'call' | 'manual';
      graceSeconds?: number;
    }
  | {
      type: 'peer:hello';
      port: PlayerPort;
      meta: PeerHandshakeMeta;
    }
  | {
      type: 'input:frame';
      port: PlayerPort;
      latestFrame: number;
      ackFrame: number;
      inputs: FrameInputEntry[];
    }
  | {
      type: 'sync:checksum';
      port: PlayerPort;
      frame: number;
      checksum: string;
    }
  | {
      type: 'sync:pulse';
      port: PlayerPort;
      pulseId: number;
      frame: number;
      sentAtMs: number;
    }
  | {
      type: 'debug:telemetry';
      port: PlayerPort;
      telemetry: PeerDebugTelemetryPayload;
    }
  | {
      type: 'state:snapshot';
      port: PlayerPort;
      frame: number;
      stateJson: string;
      checksum: string;
      romSha256: string;
      romHash: string;
      reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment';
    }
  | {
      type: 'control:sync';
      port: PlayerPort;
      action: 'start' | 'pause' | 'resume' | 'reset' | 'turn_swap';
      targetFrame: number;
      activeTurnPort?: PlayerPort;
    }
  | {
      type: 'rom:transfer_offer';
      port: PlayerPort;
      offer: RomTransferOffer;
    }
  | {
      type: 'rom:transfer_accept';
      port: PlayerPort;
      transferId: string;
      saveToLocalStorage: boolean;
    }
  | {
      type: 'rom:transfer_decline';
      port: PlayerPort;
      transferId: string;
      reason: string;
    }
  | {
      type: 'rom:transfer_chunk';
      port: PlayerPort;
      transferId: string;
      chunkIndex: number;
      chunkCount: number;
      dataBase64: string;
    }
  | {
      type: 'rom:transfer_complete';
      port: PlayerPort;
      transferId: string;
      verified: boolean;
      sha256: string;
      error?: string;
    }
  | {
      type: 'input:event';
      port: PlayerPort;
      button: NesButtonName;
      pressed: boolean;
      frame: number;
    }
  | {
      type: 'rom:sync';
      romName: string;
      romHash: string;
      romBase64: string;
    }
  | {
      type: 'state:sync';
      stateJson: string;
      frame: number;
      romHash: string;
    }
  | {
      type: 'control:action';
      action: 'pause' | 'resume' | 'reset';
    }
  | {
      type: 'race:config';
      config: RaceMatchConfig;
    }
  | {
      type: 'race:telemetry';
      packet: RaceTelemetryPacket;
    }
  | {
      type: 'race:chaos';
      twist: ActiveChaosTwist | null;
    }
  | {
      type: 'webrtc:offer';
      sdp: string;
    }
  | {
      type: 'webrtc:answer';
      sdp: string;
    }
  | {
      type: 'webrtc:ice';
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    }
  | { type: 'pong'; sentAt: number }
  | { type: 'error'; message: string };

export function sanitizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,6}$/.test(code);
}

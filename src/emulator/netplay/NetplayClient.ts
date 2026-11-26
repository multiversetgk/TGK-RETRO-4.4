import {
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../core/inesParser';
import type { ActiveChaosTwist } from '../race/chaosEngine';
import type { RaceMatchConfig } from '../race/ramJudge';
import type {
  CreateRoomOptions,
  INetplayTransport,
  NetplayEventHandlers,
  NetplayHoldState,
  NetplaySessionState,
} from './INetplayTransport';
import {
  isValidRoomCode,
  NETPLAY_PROTOCOL_VERSION,
  sanitizeRoomCode,
  type FrameInputEntry,
  type NesButtonName,
  type NetplayClientMessage,
  type NetplayRoomMode,
  type NetplayServerMessage,
  type PeerDebugTelemetryPayload,
  type PeerHandshakeMeta,
  type PlayerPort,
  type RaceTelemetryPacket,
  type RomTransferOffer,
} from './protocol';

const EMPTY_HOLD: NetplayHoldState = {
  active: false,
  port: null,
  reason: null,
  graceSeconds: 0,
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * TGK RETRO 2.0 Dual-Transport Netplay Client:
 * - WebSocket `/ws/netplay` handles Room Codes, core/ROM SHA-256 handshake,
 *   consent-based chunked ROM transfer, authoritative desync snapshots, and WebRTC signaling.
 * - WebRTC `RTCPeerConnection` + `RTCDataChannel` provides low-latency per-frame
 *   input exchange whenever NAT permits, transparently falling back to WebSocket relay.
 * - Smart Auto-Pause & Reconnect holds the room on background/disconnect and rejoins with backoff.
 */
export class NetplayClient implements INetplayTransport {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private pingInterval: number | null = null;
  private reconnectTimer: number | null = null;
  private intentionalDisconnect = false;
  private lastJoinContext: {
    roomCode: string;
    port: PlayerPort;
    playerName: string;
    coreId?: string;
    coreVersion?: string;
    romSha256?: string;
  } | null = null;

  private handlers: NetplayEventHandlers;

  private state: NetplaySessionState = {
    status: 'disconnected',
    roomCode: null,
    roomMode: 'shared-2p',
    assignedPort: null,
    romName: null,
    romSha256: null,
    romSizeBytes: 0,
    coreId: null,
    coreVersion: null,
    protocolVersion: NETPLAY_PROTOCOL_VERSION,
    turnBasedSharedPort1: false,
    players: [],
    pingMs: null,
    transportChannel: 'websocket',
    holdState: { ...EMPTY_HOLD },
    reconnectAttempt: 0,
    error: null,
  };

  constructor(handlers: NetplayEventHandlers) {
    this.handlers = handlers;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public getState(): NetplaySessionState {
    return {
      ...this.state,
      players: [...this.state.players],
      holdState: { ...this.state.holdState },
    };
  }

  private updateState(patch: Partial<NetplaySessionState>): void {
    this.state = { ...this.state, ...patch };
    this.handlers.onStateChange(this.getState());
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/netplay`;
  }

  private ensureConnection(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    this.closeSocketOnly();
    this.updateState({
      status: this.state.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
      error: null,
    });

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.getWebSocketUrl());
      this.ws = ws;

      const onOpen = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        this.startPingLoop();
        // Trigger an immediate initial RTT sample
        this.sendWsRaw({ type: 'ping', sentAt: performance.now() });
        resolve(ws);
      };

      const onError = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        this.updateState({
          status: 'error',
          error: 'Could not reach the Netplay signaling server.',
        });
        reject(new Error('WebSocket connection failed'));
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('message', this.handleMessage);
      ws.addEventListener('close', this.handleClose);
    });
  }

  private isSocketCongested(maxBytes: number): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      return this.dataChannel.bufferedAmount > maxBytes;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws.bufferedAmount > maxBytes;
    }
    return false;
  }

  private sendWsRaw(msg: NetplayClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendLowLatency(msg: NetplayClientMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      if (this.dataChannel.bufferedAmount > 96 * 1024) {
        return;
      }
      try {
        this.dataChannel.send(JSON.stringify(msg));
        return;
      } catch {
        // transparent fallback to WebSocket relay below
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.bufferedAmount > 96 * 1024) {
      return;
    }
    this.sendWsRaw(msg);
  }

  public async createRoom(
    romName: string,
    romHash: string,
    playerName = 'Player 1',
    roomMode: NetplayRoomMode = 'shared-2p',
    extra?: Partial<CreateRoomOptions>
  ): Promise<void> {
    this.intentionalDisconnect = false;
    this.clearReconnectTimer();
    try {
      await this.ensureConnection();
      this.lastJoinContext = {
        roomCode: '',
        port: 1,
        playerName,
        coreId: extra?.coreId,
        coreVersion: extra?.coreVersion,
        romSha256: extra?.romSha256,
      };
      this.sendWsRaw({
        type: 'room:create',
        romName,
        romHash,
        romSha256: extra?.romSha256,
        romSizeBytes: extra?.romSizeBytes,
        coreId: extra?.coreId,
        coreVersion: extra?.coreVersion,
        protocolVersion: NETPLAY_PROTOCOL_VERSION,
        playerName,
        roomMode,
        turnBasedSharedPort1: Boolean(extra?.turnBasedSharedPort1),
      });
    } catch {
      // Error state already emitted
    }
  }

  public async joinRoom(
    roomCode: string,
    playerName = 'Player 2',
    meta?: { coreId?: string; coreVersion?: string; romName?: string; romSha256?: string }
  ): Promise<void> {
    const clean = sanitizeRoomCode(roomCode);
    if (!isValidRoomCode(clean)) {
      this.updateState({
        error: 'Enter a valid 4-6 character room code (e.g. TGK48).',
      });
      return;
    }

    this.intentionalDisconnect = false;
    this.clearReconnectTimer();
    try {
      await this.ensureConnection();
      this.lastJoinContext = {
        roomCode: clean,
        port: 2,
        playerName,
        coreId: meta?.coreId,
        coreVersion: meta?.coreVersion,
        romSha256: meta?.romSha256,
      };
      this.sendWsRaw({
        type: 'room:join',
        roomCode: clean,
        playerName,
        coreId: meta?.coreId,
        coreVersion: meta?.coreVersion,
        romName: meta?.romName,
        romSha256: meta?.romSha256,
        protocolVersion: NETPLAY_PROTOCOL_VERSION,
      });
    } catch {
      // Error state already emitted
    }
  }

  public leaveRoom(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.lastJoinContext = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsRaw({ type: 'room:leave' });
    }
    this.closePeerConnection();
    this.closeSocketOnly();
    this.updateState({
      status: 'disconnected',
      roomCode: null,
      roomMode: 'shared-2p',
      assignedPort: null,
      romName: null,
      romSha256: null,
      romSizeBytes: 0,
      coreId: null,
      coreVersion: null,
      turnBasedSharedPort1: false,
      players: [],
      pingMs: null,
      transportChannel: 'websocket',
      holdState: { ...EMPTY_HOLD },
      reconnectAttempt: 0,
      error: null,
    });
  }

  public sendPeerHello(meta: PeerHandshakeMeta): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({ type: 'peer:hello', meta });
  }

  public sendFrameInputs(
    port: PlayerPort,
    latestFrame: number,
    ackFrame: number,
    inputs: FrameInputEntry[]
  ): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendLowLatency({
      type: 'input:frame',
      port,
      latestFrame,
      ackFrame,
      inputs,
    });
  }

  public sendChecksum(frame: number, checksum: string): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendLowLatency({
      type: 'sync:checksum',
      frame,
      checksum,
    });
  }

  public sendSyncPulse(pulseId: number, frame: number, sentAtMs: number): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendLowLatency({
      type: 'sync:pulse',
      pulseId,
      frame,
      sentAtMs,
    });
  }

  public sendDebugTelemetry(telemetry: PeerDebugTelemetryPayload): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendLowLatency({
      type: 'debug:telemetry',
      telemetry,
    });
  }

  public sendAuthoritativeSnapshot(snapshot: {
    frame: number;
    stateJson: string;
    checksum: string;
    romSha256: string;
    romHash: string;
    reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment';
  }): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'state:snapshot',
      ...snapshot,
    });
  }

  public sendSyncControl(
    action: 'start' | 'pause' | 'resume' | 'reset' | 'turn_swap',
    targetFrame: number,
    activeTurnPort?: PlayerPort
  ): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'control:sync',
      action,
      targetFrame,
      activeTurnPort,
    });
  }

  public sendRomTransferOffer(offer: RomTransferOffer): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({ type: 'rom:transfer_offer', offer });
  }

  public acceptRomTransfer(transferId: string, saveToLocalStorage: boolean): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({ type: 'rom:transfer_accept', transferId, saveToLocalStorage });
  }

  public declineRomTransfer(transferId: string, reason: string): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({ type: 'rom:transfer_decline', transferId, reason });
  }

  public sendRomTransferChunk(
    transferId: string,
    chunkIndex: number,
    chunkCount: number,
    dataBase64: string
  ): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'rom:transfer_chunk',
      transferId,
      chunkIndex,
      chunkCount,
      dataBase64,
    });
  }

  public sendRomTransferComplete(
    transferId: string,
    verified: boolean,
    sha256: string,
    error?: string
  ): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'rom:transfer_complete',
      transferId,
      verified,
      sha256,
      error,
    });
  }

  public sendInput(
    port: PlayerPort,
    button: NesButtonName,
    pressed: boolean,
    frame: number
  ): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendLowLatency({
      type: 'input:event',
      port,
      button,
      pressed,
      frame,
    });
  }

  public broadcastRom(romName: string, romHash: string, romBytes: Uint8Array): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'rom:sync',
      romName,
      romHash,
      romBase64: uint8ArrayToBase64(romBytes),
    });
  }

  public broadcastState(stateJson: string, frame: number, romHash: string): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'state:sync',
      stateJson,
      frame,
      romHash,
    });
  }

  public broadcastControl(action: 'pause' | 'resume' | 'reset'): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'control:action',
      action,
    });
  }

  public broadcastRaceConfig(config: RaceMatchConfig): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'race:config',
      config,
    });
  }

  public sendRaceTelemetry(packet: RaceTelemetryPacket): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    // Drop heavy screen-share image frames immediately if socket is congested so local loop never backs up
    const safePacket =
      packet.previewDataUrl && this.isSocketCongested(32 * 1024)
        ? { ...packet, previewDataUrl: null }
        : packet;
    this.sendLowLatency({
      type: 'race:telemetry',
      packet: safePacket,
    });
  }

  public broadcastChaos(twist: ActiveChaosTwist | null): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'race:chaos',
      twist,
    });
  }

  public setLocalHold(held: boolean, reason: 'background' | 'call' | 'manual'): void {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    this.sendWsRaw({
      type: 'room:hold',
      held,
      reason,
    });
  }

  private handleVisibilityChange = (): void => {
    if (this.state.status !== 'connected' || !this.state.roomCode) return;
    if (document.hidden) {
      this.setLocalHold(true, 'background');
    } else {
      this.setLocalHold(false, 'background');
    }
  };

  private setupPeerConnection(isInitiator: boolean): void {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.closePeerConnection();

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.pc = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate && ev.candidate.candidate) {
          this.sendWsRaw({
            type: 'webrtc:ice',
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid ?? null,
            sdpMLineIndex: ev.candidate.sdpMLineIndex ?? null,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.updateState({ transportChannel: 'websocket' });
        }
      };

      const bindChannel = (channel: RTCDataChannel) => {
        this.dataChannel = channel;
        channel.onopen = () => {
          this.updateState({ transportChannel: 'webrtc' });
        };
        channel.onclose = () => {
          this.updateState({ transportChannel: 'websocket' });
        };
        channel.onmessage = (ev) => {
          this.processPayloadString(String(ev.data));
        };
      };

      if (isInitiator) {
        const dc = pc.createDataChannel('tgk-nes-netplay', {
          ordered: false,
          maxRetransmits: 0,
        });
        bindChannel(dc);
        void pc
          .createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            if (offer.sdp) {
              this.sendWsRaw({ type: 'webrtc:offer', sdp: offer.sdp });
            }
          })
          .catch(() => {
            // Silently continue on WebSocket relay
          });
      } else {
        pc.ondatachannel = (ev) => {
          bindChannel(ev.channel);
        };
      }
    } catch {
      // Keep WebSocket relay
    }
  }

  private async handleWebRtcOffer(sdp: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.setupPeerConnection(false);
    const pc = this.pc;
    if (!pc) return;
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (answer.sdp) {
        this.sendWsRaw({ type: 'webrtc:answer', sdp: answer.sdp });
      }
    } catch {
      this.closePeerConnection();
    }
  }

  private async handleWebRtcAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
    } catch {
      this.closePeerConnection();
    }
  }

  private async handleWebRtcIce(
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate({ candidate, sdpMid, sdpMLineIndex });
    } catch {
      // ignore stale ICE candidates
    }
  }

  private closePeerConnection(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    this.processPayloadString(String(event.data));
  };

  private processPayloadString(raw: string): void {
    let msg: NetplayServerMessage;
    try {
      msg = JSON.parse(raw) as NetplayServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'room:created':
      case 'room:joined':
        if (this.lastJoinContext) {
          this.lastJoinContext.roomCode = msg.roomCode;
          this.lastJoinContext.port = msg.assignedPort;
        }
        this.updateState({
          status: 'connected',
          roomCode: msg.roomCode,
          roomMode: msg.roomMode,
          assignedPort: msg.assignedPort,
          romName: msg.romName,
          romSha256: msg.romSha256 || null,
          romSizeBytes: msg.romSizeBytes || 0,
          coreId: msg.coreId || null,
          coreVersion: msg.coreVersion || null,
          protocolVersion: msg.protocolVersion || NETPLAY_PROTOCOL_VERSION,
          turnBasedSharedPort1: Boolean(msg.turnBasedSharedPort1),
          players: msg.players,
          holdState: { ...EMPTY_HOLD },
          reconnectAttempt: 0,
          error: null,
        });
        break;
      case 'room:peer_joined':
        this.updateState({
          players: msg.players,
          holdState: { ...EMPTY_HOLD },
          error: null,
        });
        if (this.state.assignedPort === 1) {
          this.setupPeerConnection(true);
        }
        this.handlers.onPeerJoined?.(msg.reconnected);
        break;
      case 'room:peer_left':
        this.closePeerConnection();
        this.updateState({
          players: msg.players,
          transportChannel: 'websocket',
          holdState: { ...EMPTY_HOLD },
        });
        break;
      case 'room:peer_hold': {
        const nextHold: NetplayHoldState = {
          active: msg.held,
          port: msg.held ? msg.port : null,
          reason: msg.held ? msg.reason : null,
          graceSeconds: msg.graceSeconds ?? 0,
        };
        this.updateState({ holdState: nextHold });
        this.handlers.onPeerHoldChange?.(nextHold);
        break;
      }
      case 'peer:hello':
        this.handlers.onPeerHello?.(msg.port, msg.meta);
        break;
      case 'input:frame':
        this.handlers.onRemoteFrameInputs?.({
          port: msg.port,
          latestFrame: msg.latestFrame,
          ackFrame: msg.ackFrame,
          inputs: msg.inputs,
        });
        break;
      case 'sync:checksum':
        this.handlers.onRemoteChecksum?.(msg.port, msg.frame, msg.checksum);
        break;
      case 'sync:pulse':
        this.handlers.onSyncPulse?.({
          port: msg.port,
          pulseId: msg.pulseId,
          frame: msg.frame,
          sentAtMs: msg.sentAtMs,
        });
        break;
      case 'debug:telemetry':
        this.handlers.onPeerDebugTelemetry?.(msg.port ?? msg.telemetry.port, msg.telemetry);
        break;
      case 'state:snapshot':
        this.handlers.onAuthoritativeSnapshot?.({
          port: msg.port,
          frame: msg.frame,
          stateJson: msg.stateJson,
          checksum: msg.checksum,
          romSha256: msg.romSha256,
          romHash: msg.romHash,
          reason: msg.reason,
        });
        break;
      case 'control:sync':
        this.handlers.onSyncControl?.({
          port: msg.port,
          action: msg.action,
          targetFrame: msg.targetFrame,
          activeTurnPort: msg.activeTurnPort,
        });
        break;
      case 'rom:transfer_offer':
        this.handlers.onRomTransferOffer?.(msg.port, msg.offer);
        break;
      case 'rom:transfer_accept':
        this.handlers.onRomTransferAccept?.(msg.port, msg.transferId, msg.saveToLocalStorage);
        break;
      case 'rom:transfer_decline':
        this.handlers.onRomTransferDecline?.(msg.port, msg.transferId, msg.reason);
        break;
      case 'rom:transfer_chunk':
        this.handlers.onRomTransferChunk?.(
          msg.port,
          msg.transferId,
          msg.chunkIndex,
          msg.chunkCount,
          msg.dataBase64
        );
        break;
      case 'rom:transfer_complete':
        this.handlers.onRomTransferComplete?.(
          msg.port,
          msg.transferId,
          msg.verified,
          msg.sha256,
          msg.error
        );
        break;
      case 'input:event':
        this.handlers.onRemoteInput(msg.port, msg.button, msg.pressed, msg.frame);
        break;
      case 'rom:sync': {
        const bytes = base64ToUint8Array(msg.romBase64);
        this.updateState({ romName: msg.romName });
        this.handlers.onRemoteRom(msg.romName, msg.romHash, bytes);
        break;
      }
      case 'state:sync':
        this.handlers.onRemoteState(msg.stateJson, msg.frame, msg.romHash);
        break;
      case 'control:action':
        this.handlers.onRemoteControl(msg.action);
        break;
      case 'race:config':
        this.handlers.onRemoteRaceConfig?.(msg.config);
        break;
      case 'race:telemetry':
        this.handlers.onRemoteRaceTelemetry?.(msg.packet);
        break;
      case 'race:chaos':
        this.handlers.onRemoteChaos?.(msg.twist);
        break;
      case 'webrtc:offer':
        void this.handleWebRtcOffer(msg.sdp);
        break;
      case 'webrtc:answer':
        void this.handleWebRtcAnswer(msg.sdp);
        break;
      case 'webrtc:ice':
        void this.handleWebRtcIce(msg.candidate, msg.sdpMid, msg.sdpMLineIndex);
        break;
      case 'pong': {
        const rtt = Math.max(1, Math.round(performance.now() - msg.sentAt));
        this.updateState({ pingMs: rtt });
        this.handlers.onPingSample?.(rtt);
        break;
      }
      case 'error':
        this.updateState({ error: msg.message });
        break;
    }
  }

  private handleClose = (): void => {
    this.stopPingLoop();
    this.closePeerConnection();

    if (
      !this.intentionalDisconnect &&
      this.lastJoinContext &&
      this.lastJoinContext.roomCode &&
      this.state.reconnectAttempt < 5
    ) {
      const nextAttempt = this.state.reconnectAttempt + 1;
      const delayMs = Math.min(8000, 1000 * Math.pow(2, nextAttempt - 1));
      this.updateState({
        status: 'reconnecting',
        transportChannel: 'websocket',
        reconnectAttempt: nextAttempt,
        holdState: {
          active: true,
          port: this.state.assignedPort,
          reason: 'disconnect',
          graceSeconds: 45,
        },
        error: `Connection dropped — auto-reconnecting (attempt ${nextAttempt}/5)...`,
      });
      this.handlers.onPeerHoldChange?.(this.state.holdState);

      this.clearReconnectTimer();
      this.reconnectTimer = window.setTimeout(() => {
        const ctx = this.lastJoinContext;
        if (!ctx || !ctx.roomCode || this.intentionalDisconnect) return;
        void this.ensureConnection()
          .then(() => {
            this.sendWsRaw({
              type: 'room:rejoin',
              roomCode: ctx.roomCode,
              port: ctx.port,
              playerName: ctx.playerName,
              coreId: ctx.coreId,
              coreVersion: ctx.coreVersion,
              romSha256: ctx.romSha256,
            });
          })
          .catch(() => {
            // Next retry handled via close/error
          });
      }, delayMs);
      return;
    }

    if (this.state.status !== 'disconnected') {
      this.updateState({
        status: 'disconnected',
        roomCode: null,
        assignedPort: null,
        players: [],
        pingMs: null,
        transportChannel: 'websocket',
        holdState: { ...EMPTY_HOLD },
        reconnectAttempt: 0,
      });
    }
  };

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWsRaw({ type: 'ping', sentAt: performance.now() });
      }
    }, 1500);
  }

  private stopPingLoop(): void {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private closeSocketOnly(): void {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.removeEventListener('close', this.handleClose);
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  public dispose(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.closePeerConnection();
    this.closeSocketOnly();
  }
}

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  MAX_ROM_TRANSFER_BYTES,
  NETPLAY_PROTOCOL_VERSION,
  ROM_TRANSFER_CHUNK_BYTES,
  sanitizeRoomCode,
  type FrameInputEntry,
  type NesButtonName,
  type NetplayClientMessage,
  type NetplayRoomMode,
  type NetplayServerMessage,
  type PlayerPort,
} from './src/emulator/netplay/protocol.ts';

interface PeerInfo {
  ws: WebSocket;
  port: PlayerPort;
  name: string;
}

interface DisconnectedSlot {
  port: PlayerPort;
  name: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

interface NetplayRoom {
  code: string;
  mode: NetplayRoomMode;
  romName: string;
  romHash: string;
  romSha256: string;
  romSizeBytes: number;
  coreId: string;
  coreVersion: string;
  protocolVersion: string;
  turnBasedSharedPort1: boolean;
  peers: Map<PlayerPort, PeerInfo>;
  holdSlots: Map<PlayerPort, DisconnectedSlot>;
  activeTransferId: string | null;
  transferConsentedByGuest: boolean;
  createdAt: number;
}

const PORT = Number(process.env.PORT) || 3000;
const RECONNECT_GRACE_MS = 45_000;
const MAX_SDP_BYTES = 24_000;
const MAX_ICE_BYTES = 4_096;
const MAX_STATE_SNAPSHOT_BYTES = 1_500_000; // 1.5 MB cap for state snapshots
const MAX_CHUNK_BASE64_LEN = Math.ceil((ROM_TRANSFER_CHUNK_BYTES * 4) / 3) + 256;
const MAX_CHUNKS_ALLOWED = Math.ceil(MAX_ROM_TRANSFER_BYTES / ROM_TRANSFER_CHUNK_BYTES) + 2;
const VALID_BUTTONS = new Set<NesButtonName>([
  'A',
  'B',
  'SELECT',
  'START',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = new Map<string, NetplayRoom>();
const socketToRoom = new Map<WebSocket, { roomCode: string; port: PlayerPort }>();

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `TGK${Math.floor(10 + Math.random() * 89)}`;
}

function sendMsg(ws: WebSocket, payload: NetplayServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function roomPlayerList(room: NetplayRoom): { port: PlayerPort; name: string }[] {
  return Array.from(room.peers.values())
    .sort((a, b) => a.port - b.port)
    .map((p) => ({ port: p.port, name: p.name }));
}

function clearHoldSlot(room: NetplayRoom, port: PlayerPort): void {
  const existing = room.holdSlots.get(port);
  if (existing) {
    clearTimeout(existing.timer);
    room.holdSlots.delete(port);
  }
}

function cleanupRoomIfEmpty(room: NetplayRoom): void {
  if (room.peers.size === 0 && room.holdSlots.size === 0) {
    rooms.delete(room.code);
  }
}

function detachSocket(ws: WebSocket, intentionalLeave = false): void {
  const membership = socketToRoom.get(ws);
  if (!membership) return;
  socketToRoom.delete(ws);

  const room = rooms.get(membership.roomCode);
  if (!room) return;

  const leavingPeer = room.peers.get(membership.port);
  room.peers.delete(membership.port);

  if (!intentionalLeave && leavingPeer && room.peers.size > 0) {
    clearHoldSlot(room, membership.port);
    const graceSeconds = Math.round(RECONNECT_GRACE_MS / 1000);
    const timer = setTimeout(() => {
      room.holdSlots.delete(membership.port);
      const players = roomPlayerList(room);
      for (const peer of room.peers.values()) {
        sendMsg(peer.ws, {
          type: 'room:peer_hold',
          port: membership.port,
          held: false,
          reason: 'disconnect',
          graceSeconds: 0,
        });
        sendMsg(peer.ws, {
          type: 'room:peer_left',
          port: membership.port,
          players,
        });
      }
      cleanupRoomIfEmpty(room);
    }, RECONNECT_GRACE_MS);

    room.holdSlots.set(membership.port, {
      port: membership.port,
      name: leavingPeer.name,
      expiresAt: Date.now() + RECONNECT_GRACE_MS,
      timer,
    });

    for (const peer of room.peers.values()) {
      sendMsg(peer.ws, {
        type: 'room:peer_hold',
        port: membership.port,
        held: true,
        reason: 'disconnect',
        graceSeconds,
      });
    }
    return;
  }

  clearHoldSlot(room, membership.port);
  if (room.peers.size === 0) {
    for (const port of Array.from(room.holdSlots.keys())) {
      clearHoldSlot(room, port);
    }
    rooms.delete(room.code);
    return;
  }

  const players = roomPlayerList(room);
  for (const peer of room.peers.values()) {
    sendMsg(peer.ws, {
      type: 'room:peer_left',
      port: membership.port,
      players,
    });
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'TGK RETRO 2.0 Netplay Signaling & Rollback Relay',
      protocolVersion: NETPLAY_PROTOCOL_VERSION,
      activeRooms: rooms.size,
    });
  });

  app.get('/api/netplay/rooms', (_req, res) => {
    const publicRooms = Array.from(rooms.values()).map((room) => ({
      code: room.code,
      mode: room.mode,
      romName: room.romName,
      romSha256: room.romSha256,
      coreVersion: room.coreVersion,
      turnBasedSharedPort1: room.turnBasedSharedPort1,
      playerCount: room.peers.size,
      hasOpenSlot: room.peers.size + room.holdSlots.size < 2,
    }));
    res.json({ rooms: publicRooms });
  });

  // Serve optional self-hosted Libretro WASM cores from public/cores, returning 404 if absent
  const localCoresDir = path.resolve(__dirname, 'public/cores');
  app.use('/cores', express.static(localCoresDir));
  app.use('/cores', (_req, res) => {
    res.status(404).end();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws/netplay',
    maxPayload: 2 * 1024 * 1024, // 2MB cap per WS frame (chunked ROM transfers use ~64KB frames)
  });

  wss.on('connection', (ws) => {
    ws.on('message', (rawData) => {
      let msg: NetplayClientMessage;
      try {
        msg = JSON.parse(rawData.toString()) as NetplayClientMessage;
      } catch {
        sendMsg(ws, { type: 'error', message: 'Invalid Netplay payload.' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ping') {
        sendMsg(ws, { type: 'pong', sentAt: Number(msg.sentAt) || 0 });
        return;
      }

      if (msg.type === 'room:leave') {
        detachSocket(ws, true);
        return;
      }

      if (msg.type === 'room:create') {
        detachSocket(ws, true);
        const code = generateRoomCode();
        const playerName = (msg.playerName || 'Player 1').trim().slice(0, 24) || 'Player 1';
        const mode: NetplayRoomMode = msg.roomMode === 'dual-race' ? 'dual-race' : 'shared-2p';
        const safeSha256 =
          typeof msg.romSha256 === 'string' && /^[a-f0-9]{64}$/i.test(msg.romSha256)
            ? msg.romSha256.toLowerCase()
            : '';
        const room: NetplayRoom = {
          code,
          mode,
          romName: String(msg.romName || 'NES Cartridge').slice(0, 80),
          romHash: String(msg.romHash || '').slice(0, 64),
          romSha256: safeSha256,
          romSizeBytes: Math.max(0, Math.min(MAX_ROM_TRANSFER_BYTES, Number(msg.romSizeBytes) || 0)),
          coreId: String(msg.coreId || 'jsnes-6502').slice(0, 48),
          coreVersion: String(msg.coreVersion || 'jsnes-3.0.0-tgk2').slice(0, 64),
          protocolVersion: String(msg.protocolVersion || NETPLAY_PROTOCOL_VERSION).slice(0, 32),
          turnBasedSharedPort1: Boolean(msg.turnBasedSharedPort1),
          peers: new Map(),
          holdSlots: new Map(),
          activeTransferId: null,
          transferConsentedByGuest: false,
          createdAt: Date.now(),
        };
        room.peers.set(1, { ws, port: 1, name: playerName });
        rooms.set(code, room);
        socketToRoom.set(ws, { roomCode: code, port: 1 });

        sendMsg(ws, {
          type: 'room:created',
          roomCode: code,
          assignedPort: 1,
          roomMode: room.mode,
          romName: room.romName,
          romHash: room.romHash,
          romSha256: room.romSha256,
          romSizeBytes: room.romSizeBytes,
          coreId: room.coreId,
          coreVersion: room.coreVersion,
          protocolVersion: room.protocolVersion,
          turnBasedSharedPort1: room.turnBasedSharedPort1,
          players: roomPlayerList(room),
        });
        return;
      }

      if (msg.type === 'room:rejoin') {
        detachSocket(ws, true);
        const code = sanitizeRoomCode(msg.roomCode || '');
        const room = rooms.get(code);
        const targetPort: PlayerPort = msg.port === 2 ? 2 : 1;
        if (!room) {
          sendMsg(ws, {
            type: 'error',
            message: `Room "${code || '?'}" expired during disconnect.`,
          });
          return;
        }
        if (room.peers.has(targetPort)) {
          sendMsg(ws, {
            type: 'error',
            message: `Port ${targetPort} is already active in room "${code}".`,
          });
          return;
        }
        clearHoldSlot(room, targetPort);
        const playerName =
          (msg.playerName || `Player ${targetPort}`).trim().slice(0, 24) || `Player ${targetPort}`;
        room.peers.set(targetPort, { ws, port: targetPort, name: playerName });
        socketToRoom.set(ws, { roomCode: code, port: targetPort });

        const players = roomPlayerList(room);
        sendMsg(ws, {
          type: 'room:joined',
          roomCode: code,
          assignedPort: targetPort,
          roomMode: room.mode,
          romName: room.romName,
          romHash: room.romHash,
          romSha256: room.romSha256,
          romSizeBytes: room.romSizeBytes,
          coreId: room.coreId,
          coreVersion: room.coreVersion,
          protocolVersion: room.protocolVersion,
          turnBasedSharedPort1: room.turnBasedSharedPort1,
          players,
        });

        for (const peer of room.peers.values()) {
          if (peer.ws !== ws) {
            sendMsg(peer.ws, {
              type: 'room:peer_hold',
              port: targetPort,
              held: false,
              reason: 'disconnect',
              graceSeconds: 0,
            });
            sendMsg(peer.ws, {
              type: 'room:peer_joined',
              players,
              reconnected: true,
            });
          }
        }
        return;
      }

      if (msg.type === 'room:join') {
        detachSocket(ws, true);
        const code = sanitizeRoomCode(msg.roomCode || '');
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, {
            type: 'error',
            message: `Room "${code || '?'}" not found. Ask Player 1 to create a room first.`,
          });
          return;
        }
        const assignedPort: PlayerPort | null =
          !room.peers.has(2) && !room.holdSlots.has(2)
            ? 2
            : !room.peers.has(1) && !room.holdSlots.has(1)
              ? 1
              : !room.peers.has(2)
                ? 2
                : !room.peers.has(1)
                  ? 1
                  : null;
        if (!assignedPort) {
          sendMsg(ws, {
            type: 'error',
            message: `Room "${code}" already has 2 players connected.`,
          });
          return;
        }
        clearHoldSlot(room, assignedPort);
        const playerName =
          (msg.playerName || `Player ${assignedPort}`).trim().slice(0, 24) ||
          `Player ${assignedPort}`;
        room.peers.set(assignedPort, { ws, port: assignedPort, name: playerName });
        socketToRoom.set(ws, { roomCode: code, port: assignedPort });

        const players = roomPlayerList(room);
        sendMsg(ws, {
          type: 'room:joined',
          roomCode: code,
          assignedPort,
          roomMode: room.mode,
          romName: room.romName,
          romHash: room.romHash,
          romSha256: room.romSha256,
          romSizeBytes: room.romSizeBytes,
          coreId: room.coreId,
          coreVersion: room.coreVersion,
          protocolVersion: room.protocolVersion,
          turnBasedSharedPort1: room.turnBasedSharedPort1,
          players,
        });

        for (const peer of room.peers.values()) {
          if (peer.ws !== ws) {
            sendMsg(peer.ws, {
              type: 'room:peer_joined',
              players,
            });
          }
        }
        return;
      }

      const membership = socketToRoom.get(ws);
      if (!membership) return;
      const room = rooms.get(membership.roomCode);
      if (!room) return;

      const forwardToPeers = (payload: NetplayServerMessage) => {
        for (const peer of room.peers.values()) {
          if (peer.ws !== ws) {
            sendMsg(peer.ws, payload);
          }
        }
      };

      if (msg.type === 'room:hold') {
        const safeReason =
          msg.reason === 'call' || msg.reason === 'manual' ? msg.reason : 'background';
        forwardToPeers({
          type: 'room:peer_hold',
          port: membership.port,
          held: Boolean(msg.held),
          reason: safeReason,
          graceSeconds: msg.held ? Math.round(RECONNECT_GRACE_MS / 1000) : 0,
        });
        return;
      }

      // === TGK RETRO 2.0 Rollback Protocol Messages ===
      if (msg.type === 'peer:hello' && msg.meta) {
        const safeMeta = {
          protocolVersion: String(msg.meta.protocolVersion || NETPLAY_PROTOCOL_VERSION).slice(0, 32),
          coreId: String(msg.meta.coreId || '').slice(0, 48),
          coreVersion: String(msg.meta.coreVersion || '').slice(0, 64),
          romName: String(msg.meta.romName || '').slice(0, 80),
          romHash: String(msg.meta.romHash || '').slice(0, 64),
          romSha256:
            typeof msg.meta.romSha256 === 'string' && /^[a-f0-9]{64}$/i.test(msg.meta.romSha256)
              ? msg.meta.romSha256.toLowerCase()
              : '',
          romSizeBytes: Math.max(0, Math.min(MAX_ROM_TRANSFER_BYTES, Number(msg.meta.romSizeBytes) || 0)),
          determinismVerified: Boolean(msg.meta.determinismVerified),
        };
        if (membership.port === 1 && safeMeta.romSha256) {
          room.romName = safeMeta.romName || room.romName;
          room.romHash = safeMeta.romHash || room.romHash;
          room.romSha256 = safeMeta.romSha256;
          room.romSizeBytes = safeMeta.romSizeBytes;
          room.coreId = safeMeta.coreId || room.coreId;
          room.coreVersion = safeMeta.coreVersion || room.coreVersion;
        }
        forwardToPeers({
          type: 'peer:hello',
          port: membership.port,
          meta: safeMeta,
        });
        return;
      }

      if (msg.type === 'input:frame' && Array.isArray(msg.inputs)) {
        const cleanInputs: FrameInputEntry[] = [];
        const maxCount = Math.min(msg.inputs.length, 16);
        for (let i = 0; i < maxCount; i++) {
          const item = msg.inputs[i];
          if (!item) continue;
          const frame = Math.max(0, Math.floor(Number(item.frame) || 0));
          const mask = (Number(item.mask) || 0) & 0xff;
          cleanInputs.push({ frame, mask });
        }
        forwardToPeers({
          type: 'input:frame',
          // Authoritatively stamp the sender's assigned port so a client cannot spoof the peer's port
          port: membership.port,
          latestFrame: Math.max(0, Math.floor(Number(msg.latestFrame) || 0)),
          ackFrame: Math.max(0, Math.floor(Number(msg.ackFrame) || 0)),
          inputs: cleanInputs,
        });
        return;
      }

      if (msg.type === 'sync:checksum') {
        const checksum = String(msg.checksum || '').slice(0, 64);
        if (!checksum) return;
        forwardToPeers({
          type: 'sync:checksum',
          port: membership.port,
          frame: Math.max(0, Math.floor(Number(msg.frame) || 0)),
          checksum,
        });
        return;
      }

      if (msg.type === 'sync:pulse') {
        forwardToPeers({
          type: 'sync:pulse',
          port: membership.port,
          pulseId: Math.max(0, Math.floor(Number(msg.pulseId) || 0)),
          frame: Math.max(0, Math.floor(Number(msg.frame) || 0)),
          sentAtMs: Math.max(0, Math.floor(Number(msg.sentAtMs) || Date.now())),
        });
        return;
      }

      if (msg.type === 'debug:telemetry' && msg.telemetry && typeof msg.telemetry === 'object') {
        const t = msg.telemetry;
        const clampNum = (v: unknown, max: number) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
        };
        forwardToPeers({
          type: 'debug:telemetry',
          port: membership.port,
          telemetry: {
            port: membership.port,
            packetJitterMs: Math.round(clampNum(t.packetJitterMs, 1000) * 10) / 10,
            peakJitterMs: Math.round(clampNum(t.peakJitterMs, 1000) * 10) / 10,
            packetsLost: Math.floor(clampNum(t.packetsLost, 1_000_000)),
            packetsReceived: Math.floor(clampNum(t.packetsReceived, 10_000_000)),
            bufferSizeFrames: Math.floor(clampNum(t.bufferSizeFrames, 120)),
            inputDelayFrames: Math.floor(clampNum(t.inputDelayFrames, 30)),
            bufferedQueueFrames: Math.floor(clampNum(t.bufferedQueueFrames, 120)),
            bufferCapacityFrames: Math.max(1, Math.floor(clampNum(t.bufferCapacityFrames, 120))),
          },
        });
        return;
      }

      if (msg.type === 'state:snapshot') {
        if (
          typeof msg.stateJson !== 'string' ||
          msg.stateJson.length === 0 ||
          msg.stateJson.length > MAX_STATE_SNAPSHOT_BYTES
        ) {
          return;
        }
        const safeReason =
          msg.reason === 'desync-recovery' ||
          msg.reason === 'reconnect' ||
          msg.reason === 'manual' ||
          msg.reason === 'clock-alignment'
            ? msg.reason
            : 'initial';
        forwardToPeers({
          type: 'state:snapshot',
          port: membership.port,
          frame: Math.max(0, Math.floor(Number(msg.frame) || 0)),
          stateJson: msg.stateJson,
          checksum: String(msg.checksum || '').slice(0, 64),
          romSha256: String(msg.romSha256 || '').slice(0, 64),
          romHash: String(msg.romHash || '').slice(0, 64),
          reason: safeReason,
        });
        return;
      }

      if (msg.type === 'control:sync') {
        if (
          msg.action !== 'start' &&
          msg.action !== 'pause' &&
          msg.action !== 'resume' &&
          msg.action !== 'reset' &&
          msg.action !== 'turn_swap'
        ) {
          return;
        }
        forwardToPeers({
          type: 'control:sync',
          port: membership.port,
          action: msg.action,
          targetFrame: Math.max(0, Math.floor(Number(msg.targetFrame) || 0)),
          activeTurnPort: msg.activeTurnPort === 2 ? 2 : msg.activeTurnPort === 1 ? 1 : undefined,
        });
        return;
      }

      // === Consent-Based ROM File Transfer (Server Enforces Consent Gate & Size Caps) ===
      if (msg.type === 'rom:transfer_offer' && msg.offer) {
        if (membership.port !== 1) return; // Only room host offers ROM file
        const sizeBytes = Math.floor(Number(msg.offer.sizeBytes) || 0);
        const chunkCount = Math.floor(Number(msg.offer.chunkCount) || 0);
        const sha256 = String(msg.offer.sha256 || '').toLowerCase();
        const transferId = String(msg.offer.transferId || '').slice(0, 48);
        if (
          !transferId ||
          sizeBytes < 16 ||
          sizeBytes > MAX_ROM_TRANSFER_BYTES ||
          chunkCount < 1 ||
          chunkCount > MAX_CHUNKS_ALLOWED ||
          !/^[a-f0-9]{64}$/.test(sha256)
        ) {
          sendMsg(ws, { type: 'error', message: 'Invalid or oversized ROM transfer offer.' });
          return;
        }
        room.activeTransferId = transferId;
        room.transferConsentedByGuest = false;
        forwardToPeers({
          type: 'rom:transfer_offer',
          port: membership.port,
          offer: {
            transferId,
            romName: String(msg.offer.romName || 'cartridge.nes').slice(0, 80),
            sizeBytes,
            sha256,
            chunkCount,
          },
        });
        return;
      }

      if (msg.type === 'rom:transfer_accept') {
        const transferId = String(msg.transferId || '').slice(0, 48);
        if (!transferId || transferId !== room.activeTransferId) return;
        room.transferConsentedByGuest = true;
        forwardToPeers({
          type: 'rom:transfer_accept',
          port: membership.port,
          transferId,
          saveToLocalStorage: Boolean(msg.saveToLocalStorage),
        });
        return;
      }

      if (msg.type === 'rom:transfer_decline') {
        const transferId = String(msg.transferId || '').slice(0, 48);
        if (transferId && transferId === room.activeTransferId) {
          room.activeTransferId = null;
          room.transferConsentedByGuest = false;
        }
        forwardToPeers({
          type: 'rom:transfer_decline',
          port: membership.port,
          transferId,
          reason: String(msg.reason || 'Declined by recipient').slice(0, 120),
        });
        return;
      }

      if (msg.type === 'rom:transfer_chunk') {
        const transferId = String(msg.transferId || '').slice(0, 48);
        if (
          membership.port !== 1 ||
          !room.transferConsentedByGuest ||
          transferId !== room.activeTransferId
        ) {
          return; // Hard server-side consent enforcement: never relay unconsented ROM chunks
        }
        const chunkIndex = Math.floor(Number(msg.chunkIndex));
        const chunkCount = Math.floor(Number(msg.chunkCount));
        if (
          !Number.isFinite(chunkIndex) ||
          !Number.isFinite(chunkCount) ||
          chunkIndex < 0 ||
          chunkIndex >= chunkCount ||
          chunkCount > MAX_CHUNKS_ALLOWED ||
          typeof msg.dataBase64 !== 'string' ||
          msg.dataBase64.length > MAX_CHUNK_BASE64_LEN
        ) {
          return;
        }
        forwardToPeers({
          type: 'rom:transfer_chunk',
          port: membership.port,
          transferId,
          chunkIndex,
          chunkCount,
          dataBase64: msg.dataBase64,
        });
        return;
      }

      if (msg.type === 'rom:transfer_complete') {
        const transferId = String(msg.transferId || '').slice(0, 48);
        if (transferId === room.activeTransferId) {
          room.activeTransferId = null;
          room.transferConsentedByGuest = false;
        }
        forwardToPeers({
          type: 'rom:transfer_complete',
          port: membership.port,
          transferId,
          verified: Boolean(msg.verified),
          sha256: String(msg.sha256 || '').slice(0, 64),
          error: typeof msg.error === 'string' ? msg.error.slice(0, 160) : undefined,
        });
        return;
      }

      // === Existing Dual-Race & Legacy Netplay Messages (100% Preserved) ===
      if (msg.type === 'input:event') {
        if (!VALID_BUTTONS.has(msg.button)) return;
        forwardToPeers({
          type: 'input:event',
          port: membership.port,
          button: msg.button,
          pressed: Boolean(msg.pressed),
          frame: Number(msg.frame) || 0,
        });
        return;
      }

      if (msg.type === 'rom:sync') {
        room.romName = String(msg.romName || 'Cartridge.nes').slice(0, 80);
        room.romHash = String(msg.romHash || '').slice(0, 64);
        forwardToPeers({
          type: 'rom:sync',
          romName: room.romName,
          romHash: room.romHash,
          romBase64: String(msg.romBase64 || ''),
        });
        return;
      }

      if (msg.type === 'state:sync') {
        forwardToPeers({
          type: 'state:sync',
          stateJson: String(msg.stateJson || ''),
          frame: Number(msg.frame) || 0,
          romHash: String(msg.romHash || '').slice(0, 64),
        });
        return;
      }

      if (msg.type === 'control:action') {
        if (msg.action !== 'pause' && msg.action !== 'resume' && msg.action !== 'reset') return;
        forwardToPeers({
          type: 'control:action',
          action: msg.action,
        });
        return;
      }

      if (msg.type === 'race:config' && msg.config) {
        forwardToPeers({
          type: 'race:config',
          config: msg.config,
        });
        return;
      }

      if (msg.type === 'race:telemetry' && msg.packet) {
        const preview =
          typeof msg.packet.previewDataUrl === 'string' &&
          msg.packet.previewDataUrl.startsWith('data:image/') &&
          msg.packet.previewDataUrl.length <= 120_000
            ? msg.packet.previewDataUrl
            : null;
        forwardToPeers({
          type: 'race:telemetry',
          packet: {
            port: membership.port,
            telemetry: msg.packet.telemetry,
            frame: Number(msg.packet.frame) || 0,
            previewDataUrl: preview,
          },
        });
        return;
      }

      if (msg.type === 'race:chaos') {
        forwardToPeers({
          type: 'race:chaos',
          twist: msg.twist ?? null,
        });
        return;
      }

      // WebRTC P2P Signaling Relay
      if (msg.type === 'webrtc:offer') {
        if (typeof msg.sdp !== 'string' || msg.sdp.length > MAX_SDP_BYTES) return;
        forwardToPeers({ type: 'webrtc:offer', sdp: msg.sdp });
        return;
      }

      if (msg.type === 'webrtc:answer') {
        if (typeof msg.sdp !== 'string' || msg.sdp.length > MAX_SDP_BYTES) return;
        forwardToPeers({ type: 'webrtc:answer', sdp: msg.sdp });
        return;
      }

      if (msg.type === 'webrtc:ice') {
        if (typeof msg.candidate !== 'string' || msg.candidate.length > MAX_ICE_BYTES) return;
        forwardToPeers({
          type: 'webrtc:ice',
          candidate: msg.candidate,
          sdpMid: typeof msg.sdpMid === 'string' ? msg.sdpMid.slice(0, 64) : null,
          sdpMLineIndex: typeof msg.sdpMLineIndex === 'number' ? msg.sdpMLineIndex : null,
        });
      }
    });

    ws.on('close', () => {
      detachSocket(ws, false);
    });

    ws.on('error', () => {
      detachSocket(ws, false);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TGK RETRO 2.0 server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TGK TEST EMULATORS server:', err);
  process.exit(1);
});

import React from 'react';
import { AiGamerComingSoonModal } from './components/AiGamerComingSoonModal';
import { ChampionsDashboard } from './components/ChampionsDashboard';
import { ConsoleHud } from './components/ConsoleHud';
import { ControllerModal } from './components/ControllerModal';
import { DualRaceSetupModal } from './components/DualRaceSetupModal';
import { DualScreenRaceStage } from './components/DualScreenRaceStage';
import { EmulatorCanvas } from './components/EmulatorCanvas';
import { NetplayModal, type RomTransferUiProgress } from './components/NetplayModal';
import { QuickDrawer } from './components/QuickDrawer';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal';
import { TitleStage } from './components/TitleStage';
import { VirtualControllerOverlay } from './components/VirtualControllerOverlay';
import { YouTubeCreatorHub } from './components/YouTubeCreatorHub';
import { NesAudioEngine } from './emulator/audio/NesAudioEngine';
import { ChampionsProfileStore } from './emulator/champions/championsStore';
import { identifyUserRomInCatalog } from './emulator/champions/nesCatalog60';
import type {
  PlaySessionMode,
  RunSessionIntegrityState,
} from './emulator/champions/types';
import { ChampionsVerificationEngine } from './emulator/champions/verificationEngine';
import { CreatorHubStore } from './emulator/creator/creatorHubStore';
import {
  createNesCore,
  getCoreDescriptor,
  PRIMARY_NES_CORE_ID,
} from './emulator/core/CoreRegistry';
import {
  BUTTON_BIT_MAP,
  NES_TARGET_FPS,
  type INesEmulatorCore,
  type NesCoreId,
} from './emulator/core/INesEmulatorCore';
import {
  base64ToUint8Array,
  computeSha256Hex,
  uint8ArrayToBase64,
  type RomMetadata,
} from './emulator/core/inesParser';
import {
  SaveStateStore,
  type SaveSlotId,
  type SaveSlotSummary,
} from './emulator/core/saveStateStore';
import {
  cloneBindings,
  DEFAULT_CONTROLLER_BINDINGS,
  type ControllerBindings,
} from './emulator/input/controllerMappings';
import {
  InputManager,
  type ConnectedGamepadInfo,
} from './emulator/input/InputManager';
import { TurboEngine, type TurboButtonName } from './emulator/input/turboEngine';
import { AsyncNetplayOutbox } from './emulator/netplay/asyncOutbox';
import type {
  INetplayTransport,
  NetplaySessionState,
} from './emulator/netplay/INetplayTransport';
import { NetplayClient } from './emulator/netplay/NetplayClient';
import {
  NETPLAY_PROTOCOL_VERSION,
  type NesButtonName,
  type NetplayRoomMode,
  type PeerHandshakeMeta,
  type PlayerPort,
  type RaceTelemetryPacket,
  type RomTransferOffer,
} from './emulator/netplay/protocol';
import {
  NetplayDebugTracker,
  type NetplayDebugSnapshot,
} from './emulator/netplay/debugTelemetry';
import {
  createRomTransferOffer,
  MAX_ROLLBACK_FRAMES,
  RollbackNetplayEngine,
  RomTransferReceiver,
  verifyCoreDeterminism,
  verifyPeerHandshake,
  type HandshakeVerificationResult,
  type RollbackMetricsSnapshot,
} from './emulator/netplay/rollbackEngine';
import type { ActiveChaosTwist } from './emulator/race/chaosEngine';
import {
  DEFAULT_RACE_CONFIG,
  type RaceMatchConfig,
} from './emulator/race/ramJudge';
import {
  FriendRivalryStore,
  type FriendRival,
} from './emulator/race/rivalryStore';
import {
  UserRomLibraryStore,
  type UserRomEntry,
} from './emulator/roms/userRomLibraryStore';
import {
  EmulatorSettingsStore,
  type EmulatorSettingsProfile,
} from './emulator/settings/emulatorSettingsStore';
import {
  createDefaultGameLayout,
  GameLayoutStore,
  type GameLayoutProfile,
} from './emulator/settings/gameLayoutStore';
import {
  HighlightBookmarkStore,
  type HighlightBookmarkSummary,
} from './emulator/settings/highlightBookmarkStore';
import {
  SessionTimerStore,
  type UsageReportSnapshot,
} from './emulator/settings/sessionTimerStore';
import { resolveEffectiveOrientation } from './emulator/settings/viewportLayout';

type AppScreenState =
  | 'title'
  | 'playing'
  | 'paused'
  | 'dual-race'
  | 'creator-hub'
  | 'champions';

interface PendingRomLoad {
  bytes: Uint8Array;
  fileName: string;
  userRomId: string | null;
  broadcastToPeer: boolean;
}

const EMPTY_SLOTS: Record<SaveSlotId, SaveSlotSummary | null> = {
  1: null,
  2: null,
  3: null,
};

interface LastNetplayAttempt {
  type: 'host' | 'join';
  playerName: string;
  roomMode?: NetplayRoomMode;
  turnBasedSharedPort1?: boolean;
  roomCode?: string;
}

interface ActivePlaySession {
  gameId: string;
  gameName: string;
  startedAt: number;
  elapsedSeconds: number;
}

export default function App() {
  // Single default primary NES core: FCEUmm (libretro-fceumm) behind INesEmulatorCore
  const selectedCoreId: NesCoreId = PRIMARY_NES_CORE_ID;
  const [core] = React.useState<INesEmulatorCore>(() =>
    createNesCore(PRIMARY_NES_CORE_ID)
  );
  const coreRef = React.useRef<INesEmulatorCore>(core);
  coreRef.current = core;

  const romLibraryStoreRef = React.useRef<UserRomLibraryStore | null>(null);
  if (!romLibraryStoreRef.current) romLibraryStoreRef.current = new UserRomLibraryStore();
  const romLibraryStore = romLibraryStoreRef.current;

  const audioRef = React.useRef<NesAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new NesAudioEngine();
  const audio = audioRef.current;

  const saveStoreRef = React.useRef<SaveStateStore | null>(null);
  if (!saveStoreRef.current) saveStoreRef.current = new SaveStateStore();
  const saveStore = saveStoreRef.current;

  const settingsStoreRef = React.useRef<EmulatorSettingsStore | null>(null);
  if (!settingsStoreRef.current) settingsStoreRef.current = new EmulatorSettingsStore();
  const settingsStore = settingsStoreRef.current;

  const layoutStoreRef = React.useRef<GameLayoutStore | null>(null);
  if (!layoutStoreRef.current) layoutStoreRef.current = new GameLayoutStore();
  const layoutStore = layoutStoreRef.current;

  const highlightStoreRef = React.useRef<HighlightBookmarkStore | null>(null);
  if (!highlightStoreRef.current) highlightStoreRef.current = new HighlightBookmarkStore();
  const highlightStore = highlightStoreRef.current;

  const turboEngineRef = React.useRef<TurboEngine | null>(null);
  if (!turboEngineRef.current) turboEngineRef.current = new TurboEngine();
  const turboEngine = turboEngineRef.current;

  const rivalryStoreRef = React.useRef<FriendRivalryStore | null>(null);
  if (!rivalryStoreRef.current) rivalryStoreRef.current = new FriendRivalryStore();
  const rivalryStore = rivalryStoreRef.current;

  const creatorHubStoreRef = React.useRef<CreatorHubStore | null>(null);
  if (!creatorHubStoreRef.current) creatorHubStoreRef.current = new CreatorHubStore();
  const creatorHubStore = creatorHubStoreRef.current;

  const championsProfileStoreRef = React.useRef<ChampionsProfileStore | null>(null);
  if (!championsProfileStoreRef.current) {
    championsProfileStoreRef.current = new ChampionsProfileStore();
  }
  const championsProfileStore = championsProfileStoreRef.current;

  const championsEngineRef = React.useRef<ChampionsVerificationEngine | null>(null);
  if (!championsEngineRef.current) {
    championsEngineRef.current = new ChampionsVerificationEngine({
      mode: 'official-ranked',
      coreId: PRIMARY_NES_CORE_ID,
      coreVersion: core.coreVersion ?? PRIMARY_NES_CORE_ID,
      gameId: null,
      romSha256: null,
      romName: null,
    });
  }

  const sessionTimerStoreRef = React.useRef<SessionTimerStore | null>(null);
  if (!sessionTimerStoreRef.current) sessionTimerStoreRef.current = new SessionTimerStore();
  const sessionTimerStore = sessionTimerStoreRef.current;

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const inputManagerRef = React.useRef<InputManager | null>(null);
  const lastNetplayAttemptRef = React.useRef<LastNetplayAttempt | null>(null);
  const activeSessionRef = React.useRef<ActivePlaySession | null>(null);
  const netplayRef = React.useRef<INetplayTransport | null>(null);
  const rollbackEngineRef = React.useRef<RollbackNetplayEngine | null>(null);
  if (!rollbackEngineRef.current) {
    rollbackEngineRef.current = new RollbackNetplayEngine(core);
  }
  const romReceiverRef = React.useRef<RomTransferReceiver | null>(null);
  if (!romReceiverRef.current) {
    romReceiverRef.current = new RomTransferReceiver();
  }
  const outgoingRomOfferRef = React.useRef<{
    offer: RomTransferOffer;
    chunks: string[];
  } | null>(null);
  const localButtonBitsRef = React.useRef(0);
  const turboButtonBitsRef = React.useRef(0);
  const lastDesyncPushRef = React.useRef(0);
  const netplayOutboxRef = React.useRef<AsyncNetplayOutbox | null>(null);
  if (!netplayOutboxRef.current) {
    netplayOutboxRef.current = new AsyncNetplayOutbox();
  }
  const metricsDirtyRef = React.useRef(false);
  const netplayDebugTrackerRef = React.useRef<NetplayDebugTracker>(new NetplayDebugTracker());
  const lastDebugBroadcastRef = React.useRef(0);
  const canvasReadyCoreRef = React.useRef<INesEmulatorCore | null>(null);
  const pendingRomRef = React.useRef<PendingRomLoad | null>(null);
  const lastRomRef = React.useRef<PendingRomLoad | null>(null);
  const loadSeqRef = React.useRef(0);

  const [screen, setScreen] = React.useState<AppScreenState>('title');
  const [userRoms, setUserRoms] = React.useState<UserRomEntry[]>([]);
  const [selectedUserRomId, setSelectedUserRomId] = React.useState<string | null>(null);
  const [activeUserRomId, setActiveUserRomId] = React.useState<string | null>(null);
  const [romMetadata, setRomMetadata] = React.useState<RomMetadata | null>(null);
  const [romError, setRomError] = React.useState<string | null>(null);
  const [isLoadingCore, setIsLoadingCore] = React.useState(false);
  const [coreError, setCoreError] = React.useState<string | null>(null);

  // Hydrate persisted user-selected .nes cartridges from IndexedDB on mount
  React.useEffect(() => {
    let active = true;
    void romLibraryStore.listRoms().then((list) => {
      if (!active) return;
      setUserRoms(list);
      if (list.length > 0) {
        setSelectedUserRomId((prev) => prev ?? list[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [romLibraryStore]);

  // Per-Emulator Settings state for FCEUmm
  const [settingsVersion, setSettingsVersion] = React.useState(0);
  const activeSettings = React.useMemo(
    () => settingsStore.getSettings(selectedCoreId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCoreId, settingsStore, settingsVersion]
  );

  // Live responsive viewport tracking for Portrait vs Landscape orientation switching
  const [viewportDims, setViewportDims] = React.useState<{ width: number; height: number }>(() =>
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1280, height: 720 }
  );

  React.useEffect(() => {
    const syncViewport = () => {
      setViewportDims((prev) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (prev.width === w && prev.height === h) return prev;
        return { width: w, height: h };
      });
    };
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  const effectiveOrientation = React.useMemo(
    () =>
      resolveEffectiveOrientation(
        activeSettings.orientation,
        viewportDims.width,
        viewportDims.height
      ),
    [activeSettings.orientation, viewportDims.width, viewportDims.height]
  );

  // Per-Game Custom Layout Profile & Live Editor state
  const [currentGameLayout, setCurrentGameLayout] = React.useState<GameLayoutProfile>(() =>
    createDefaultGameLayout('default', 'NES Cartridge', 'dpad')
  );
  const [isEditingLayout, setIsEditingLayout] = React.useState(false);

  // Save Slots, Highlights & Live Session Timer + Usage Reports
  const [slots, setSlots] = React.useState<Record<SaveSlotId, SaveSlotSummary | null>>(
    EMPTY_SLOTS
  );
  const [highlights, setHighlights] = React.useState<HighlightBookmarkSummary[]>([]);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = React.useState(0);
  const [usageReport, setUsageReport] = React.useState<UsageReportSnapshot>(() =>
    sessionTimerStore.getSnapshot()
  );

  // Modals & Dual-Screen VS Race state
  const [showControllers, setShowControllers] = React.useState(false);
  const [showNetplay, setShowNetplay] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = React.useState<SettingsTabId>('display');
  const [showRaceSetup, setShowRaceSetup] = React.useState(false);
  const [showAiComingSoon, setShowAiComingSoon] = React.useState(false);
  const [netplayDisconnectReason, setNetplayDisconnectReason] = React.useState<string | null>(null);
  const [raceConfig, setRaceConfig] = React.useState<RaceMatchConfig>(() => ({
    ...DEFAULT_RACE_CONFIG,
  }));
  const [raceRom, setRaceRom] = React.useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [isOnlineDualRace, setIsOnlineDualRace] = React.useState(false);
  const [rivals, setRivals] = React.useState<FriendRival[]>(() => rivalryStore.listRivals());
  const [creatorHubState, setCreatorHubState] = React.useState(() =>
    creatorHubStore.getSnapshot()
  );
  const [championsStoreVersion, setChampionsStoreVersion] = React.useState(0);
  const [championsSessionMode, setChampionsSessionMode] =
    React.useState<PlaySessionMode>('official-ranked');
  const [liveChampionsIntegrity, setLiveChampionsIntegrity] =
    React.useState<RunSessionIntegrityState>(() =>
      championsEngineRef.current!.getSnapshot()
    );
  const championsSessionModeRef = React.useRef<PlaySessionMode>(championsSessionMode);
  championsSessionModeRef.current = championsSessionMode;
  const syncLiveIntegrity = React.useCallback(() => {
    if (championsEngineRef.current) {
      setLiveChampionsIntegrity(championsEngineRef.current.getSnapshot());
    }
  }, []);
  const startChampionsVerificationSession = React.useCallback(
    (
      mode: PlaySessionMode,
      meta: RomMetadata | null,
      coreId: string,
      coreVersion: string
    ) => {
      const matched = meta
        ? identifyUserRomInCatalog({
            id: meta.sha256,
            name: meta.name,
            fileName: meta.name,
            hash: meta.hash,
            sha256: meta.sha256,
            prgSizeKb: meta.prgRomSizeKb,
          })
        : null;
      const engine = new ChampionsVerificationEngine({
        mode,
        coreId,
        coreVersion,
        gameId: matched?.game.gameId ?? null,
        romSha256: meta?.sha256 ?? null,
        romName: meta?.name ?? null,
      });
      const currentSettings = settingsStore.getSettings('libretro-fceumm');
      if (mode === 'official-ranked') {
        if (currentSettings.fastForwardEnabled) {
          engine.recordFastForward(1);
        }
        if (currentSettings.rewindEnabled) {
          engine.recordRewind();
        }
        if (currentSettings.cheatsEnabled) {
          engine.recordCheatsEnabled('Cheats Enabled at Launch');
        }
      }
      championsEngineRef.current = engine;
      setLiveChampionsIntegrity(engine.getSnapshot());
    },
    [settingsStore]
  );
  const [remoteTelemetryPacket, setRemoteTelemetryPacket] =
    React.useState<RaceTelemetryPacket | null>(null);
  const [remoteChaosTwist, setRemoteChaosTwist] =
    React.useState<ActiveChaosTwist | null>(null);

  const [bindings, setBindings] = React.useState<ControllerBindings>(() =>
    cloneBindings(DEFAULT_CONTROLLER_BINDINGS)
  );
  const [gamepads, setGamepads] = React.useState<ConnectedGamepadInfo[]>([]);
  const [statusBanner, setStatusBanner] = React.useState<string | null>(null);
  const bannerTimerRef = React.useRef<number | null>(null);

  const [netplayState, setNetplayState] = React.useState<NetplaySessionState>({
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
    holdState: {
      active: false,
      port: null,
      reason: null,
      graceSeconds: 0,
    },
    reconnectAttempt: 0,
    error: null,
  });

  // TGK RETRO 2.0 Rollback Netcode & Verification UI state
  const [determinismOk, setDeterminismOk] = React.useState(true);
  const [determinismError, setDeterminismError] = React.useState<string | null>(null);
  const [peerHandshake, setPeerHandshake] = React.useState<PeerHandshakeMeta | null>(null);
  const [handshakeCheck, setHandshakeCheck] = React.useState<HandshakeVerificationResult | null>(
    null
  );
  const [rollbackMetrics, setRollbackMetrics] = React.useState<RollbackMetricsSnapshot | null>(
    null
  );
  const [netplayDebug, setNetplayDebug] = React.useState<NetplayDebugSnapshot>(() =>
    netplayDebugTrackerRef.current.getSnapshot()
  );
  const [onlineMatchRunning, setOnlineMatchRunning] = React.useState(false);
  const [manualInputDelay, setManualInputDelay] = React.useState<number | null>(null);
  const [incomingRomOffer, setIncomingRomOffer] = React.useState<RomTransferOffer | null>(null);
  const [romTransferProgress, setRomTransferProgress] =
    React.useState<RomTransferUiProgress | null>(null);

  const screenRef = React.useRef<AppScreenState>(screen);
  screenRef.current = screen;
  const raceConfigRef = React.useRef<RaceMatchConfig>(raceConfig);
  raceConfigRef.current = raceConfig;
  const raceRomRef = React.useRef(raceRom);
  raceRomRef.current = raceRom;
  const modalsOpenRef = React.useRef(false);
  modalsOpenRef.current =
    showControllers ||
    showNetplay ||
    showSettings ||
    showRaceSetup ||
    showAiComingSoon ||
    isEditingLayout;
  const netplayStateRef = React.useRef(netplayState);
  netplayStateRef.current = netplayState;
  const onlineMatchRunningRef = React.useRef(onlineMatchRunning);
  onlineMatchRunningRef.current = onlineMatchRunning;
  const determinismOkRef = React.useRef(determinismOk);
  determinismOkRef.current = determinismOk;
  const peerHandshakeRef = React.useRef<PeerHandshakeMeta | null>(peerHandshake);
  peerHandshakeRef.current = peerHandshake;
  const manualInputDelayRef = React.useRef<number | null>(manualInputDelay);
  manualInputDelayRef.current = manualInputDelay;
  const fastForwardRef = React.useRef(activeSettings.fastForwardEnabled);
  fastForwardRef.current = activeSettings.fastForwardEnabled;

  // Enable folder selection attribute on hidden folder scanner input
  React.useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const flashBanner = React.useCallback((message: string) => {
    setStatusBanner(message);
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = window.setTimeout(() => {
      setStatusBanner(null);
    }, 2400);
  }, []);

  const flushActivePlaySession = React.useCallback(() => {
    const active = activeSessionRef.current;
    if (!active) return;
    activeSessionRef.current = null;
    if (active.elapsedSeconds > 0) {
      sessionTimerStore.recordSession({
        gameId: active.gameId,
        gameName: active.gameName,
        startedAt: active.startedAt,
        endedAt: Date.now(),
        durationSeconds: active.elapsedSeconds,
      });
      setUsageReport(sessionTimerStore.getSnapshot());
    }
  }, [sessionTimerStore]);

  const startFreshPlaySession = React.useCallback(
    (gameId: string, gameName: string) => {
      flushActivePlaySession();
      const cleanedName = gameName.replace(/\.nes$/i, '').replace(/[_]+/g, ' ').trim() || gameName;
      activeSessionRef.current = {
        gameId,
        gameName: cleanedName,
        startedAt: Date.now(),
        elapsedSeconds: 0,
      };
      setSessionElapsedSeconds(0);
    },
    [flushActivePlaySession]
  );

  // Real-time 1-second session timer ticking during active gameplay
  React.useEffect(() => {
    if (screen !== 'playing') return;
    const timer = window.setInterval(() => {
      if (modalsOpenRef.current) return;
      setSessionElapsedSeconds((prev) => {
        const next = prev + 1;
        if (activeSessionRef.current) {
          activeSessionRef.current.elapsedSeconds = next;
        }
        return next;
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [screen]);

  // Persist active session if the user closes or refreshes the tab
  React.useEffect(() => {
    const handleUnload = () => {
      flushActivePlaySession();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      flushActivePlaySession();
    };
  }, [flushActivePlaySession]);

  // Apply active core's settings to AudioEngine, TurboEngine, and Core audio state
  React.useEffect(() => {
    audio.setVolume(activeSettings.masterVolume);
    audio.setAudioFocus(activeSettings.audioFocus);
    audio.setAudioLatencyMs(activeSettings.audioLatencyMs);
    const muted = activeSettings.audioFocus === 'muted';
    audio.setMuted(muted);
    coreRef.current.setMuted?.(muted);
    turboEngine.setRateHz(activeSettings.turboRateHz);
  }, [activeSettings, audio, turboEngine]);

  const updateCoreSettings = React.useCallback(
    (coreId: NesCoreId, patch: Partial<EmulatorSettingsProfile>) => {
      settingsStore.updateSettings(coreId, patch);
      setSettingsVersion((v) => v + 1);

      const engine = championsEngineRef.current;
      if (engine && coreRef.current.hasRomLoaded()) {
        let violatedLabel: string | null = null;
        if (patch.fastForwardEnabled === true) {
          engine.recordFastForward(1);
          violatedLabel = 'Fast-Forward';
        }
        if (patch.rewindEnabled === true) {
          engine.recordRewind();
          violatedLabel = 'Rewind';
        }
        if (patch.cheatsEnabled === true) {
          engine.recordCheatsEnabled('Cheats Setting Enabled');
          violatedLabel = 'Cheats';
        }
        if (violatedLabel) {
          syncLiveIntegrity();
          if (championsSessionModeRef.current === 'official-ranked') {
            flashBanner(`90s Arcade Rule: ${violatedLabel} invalidated this Official Ranked run`);
          }
        }
      }
    },
    [flashBanner, settingsStore, syncLiveIntegrity]
  );

  const resetCoreSettings = React.useCallback(
    (coreId: NesCoreId) => {
      settingsStore.resetSettings(coreId);
      setSettingsVersion((v) => v + 1);
      flashBanner(`Reset settings for ${getCoreDescriptor(coreId).shortName}`);
    },
    [flashBanner, settingsStore]
  );

  const refreshSlotsAndHighlights = React.useCallback(
    (coreId: NesCoreId, meta: RomMetadata | null) => {
      if (!meta) {
        setSlots(EMPTY_SLOTS);
        setHighlights([]);
        return;
      }
      setSlots(saveStore.listSlots(coreId, meta.hash));
      setHighlights(highlightStore.listBookmarks(coreId, meta.hash));
    },
    [highlightStore, saveStore]
  );

  const buildLocalPeerHandshake = React.useCallback((): PeerHandshakeMeta | null => {
    const activeCore = coreRef.current;
    const meta = activeCore.getRomMetadata();
    if (!meta) return null;
    return {
      protocolVersion: NETPLAY_PROTOCOL_VERSION,
      coreId: activeCore.coreId,
      coreVersion: activeCore.coreVersion ?? activeCore.coreId,
      romName: meta.name,
      romHash: meta.hash,
      romSha256: meta.sha256,
      romSizeBytes: meta.sizeBytes,
      determinismVerified: determinismOkRef.current,
    };
  }, []);

  const tryLoadCachedVerifiedRom = React.useCallback(
    (sha256: string): Uint8Array | null => {
      if (!/^[a-f0-9]{64}$/i.test(sha256)) return null;
      try {
        const raw = window.localStorage.getItem(`tgk_retro2_rom_cache_v1_${sha256.toLowerCase()}`);
        if (!raw) return null;
        const decoded = base64ToUint8Array(raw);
        if (computeSha256Hex(decoded) === sha256.toLowerCase()) {
          return decoded;
        }
      } catch {
        // ignore storage errors
      }
      return null;
    },
    []
  );

  const executeRomLoadOnCore = React.useCallback(
    async (targetCore: INesEmulatorCore, pending: PendingRomLoad) => {
      const seq = ++loadSeqRef.current;
      setCoreError(null);
      setRomError(null);
      if (targetCore.rendersOwnCanvas) {
        setIsLoadingCore(true);
      }

      try {
        const meta = await targetCore.loadRom(pending.bytes, pending.fileName);
        if (seq !== loadSeqRef.current || coreRef.current !== targetCore) {
          return;
        }
        const coreSettings = settingsStore.getSettings(targetCore.coreId);
        targetCore.setMuted?.(coreSettings.audioFocus === 'muted');
        setRomMetadata(meta);
        setActiveUserRomId(pending.userRomId ?? meta.sha256);
        setSelectedUserRomId(pending.userRomId ?? meta.sha256);
        setIsLoadingCore(false);
        refreshSlotsAndHighlights(targetCore.coreId, meta);
        setCurrentGameLayout(
          layoutStore.getLayout(meta.hash, meta.name, coreSettings.defaultStickMode)
        );

        // Verify deterministic execution & save-state readiness
        const det = targetCore.rendersOwnCanvas
          ? { ok: true, checksumBefore: meta.sha256.slice(0, 8), checksumAfter: meta.sha256.slice(0, 8) }
          : verifyCoreDeterminism(targetCore);
        setDeterminismOk(det.ok);
        setDeterminismError(det.ok ? null : det.error ?? 'Determinism verification failed.');

        // Start a fresh TGK RETRO 2.0 NES Champions verification session for this ROM
        startChampionsVerificationSession(
          championsSessionModeRef.current,
          meta,
          targetCore.coreId,
          targetCore.coreVersion ?? targetCore.coreId
        );

        // Start a fresh 00:00 Session Timer for this game
        startFreshPlaySession(pending.userRomId ?? meta.sha256, meta.name);

        flashBanner(`Loaded ${meta.name.replace(/\.nes$/i, '')}`);

        const np = netplayStateRef.current;
        if (np.status === 'connected' && np.roomCode) {
          const localMeta: PeerHandshakeMeta = {
            protocolVersion: NETPLAY_PROTOCOL_VERSION,
            coreId: targetCore.coreId,
            coreVersion: targetCore.coreVersion ?? targetCore.coreId,
            romName: meta.name,
            romHash: meta.hash,
            romSha256: meta.sha256,
            romSizeBytes: meta.sizeBytes,
            determinismVerified: det.ok,
          };
          netplayRef.current?.sendPeerHello(localMeta);
          if (peerHandshakeRef.current) {
            setHandshakeCheck(verifyPeerHandshake(localMeta, peerHandshakeRef.current));
          }
          if (
            pending.broadcastToPeer &&
            np.roomMode === 'dual-race' &&
            np.assignedPort === 1
          ) {
            netplayRef.current?.broadcastRom(meta.name, meta.hash, pending.bytes);
          }
        }
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to load .nes ROM.';
        setIsLoadingCore(false);
        setCoreError(msg);
        setRomError(msg);
        flashBanner(msg);
      }
    },
    [
      flashBanner,
      layoutStore,
      refreshSlotsAndHighlights,
      settingsStore,
      startChampionsVerificationSession,
      startFreshPlaySession,
    ]
  );

  const bootRomBytes = React.useCallback(
    (
      bytes: Uint8Array,
      fileName: string,
      userRomId: string | null,
      options?: { broadcastToPeer?: boolean; enterPlaying?: boolean }
    ) => {
      const job: PendingRomLoad = {
        bytes: new Uint8Array(bytes),
        fileName,
        userRomId,
        broadcastToPeer: options?.broadcastToPeer !== false,
      };
      lastRomRef.current = job;

      if (
        options?.enterPlaying !== false &&
        (screenRef.current === 'title' ||
          screenRef.current === 'champions' ||
          screenRef.current === 'creator-hub')
      ) {
        pendingRomRef.current = job;
        setScreen('playing');
        return;
      }

      const activeCore = coreRef.current;
      if (canvasReadyCoreRef.current === activeCore) {
        pendingRomRef.current = null;
        void executeRomLoadOnCore(activeCore, job);
      } else {
        pendingRomRef.current = job;
      }
    },
    [executeRomLoadOnCore]
  );

  const bootUserRom = React.useCallback(
    (id: string, enterPlaying = true) => {
      const found = userRoms.find((r) => r.id === id);
      if (!found) {
        fileInputRef.current?.click();
        return;
      }
      bootRomBytes(found.bytes, found.fileName, found.id, { enterPlaying });
    },
    [bootRomBytes, userRoms]
  );

  const handleRemoveUserRom = React.useCallback(
    async (id: string) => {
      await romLibraryStore.removeRom(id);
      const next = await romLibraryStore.listRoms();
      setUserRoms(next);
      setSelectedUserRomId((prev) => (prev === id ? next[0]?.id ?? null : prev));
      if (activeUserRomId === id) {
        setActiveUserRomId(null);
      }
    },
    [activeUserRomId, romLibraryStore]
  );

  const handleRetryFceumm = React.useCallback(() => {
    const last = lastRomRef.current;
    if (!last) {
      fileInputRef.current?.click();
      return;
    }
    setCoreError(null);
    void executeRomLoadOnCore(coreRef.current, last);
  }, [executeRomLoadOnCore]);

  const handleCanvasReady = React.useCallback(
    (mountedCore: INesEmulatorCore, canvas: HTMLCanvasElement) => {
      canvasReadyCoreRef.current = mountedCore;
      activeCanvasRef.current = canvas;
      const pending = pendingRomRef.current;
      if (pending) {
        pendingRomRef.current = null;
        void executeRomLoadOnCore(mountedCore, pending);
      }
    },
    [executeRomLoadOnCore]
  );

  // Sync document.body.dataset.state for predictable game-shell state machine
  React.useEffect(() => {
    document.body.dataset.state = screen;
  }, [screen]);

  // Wire APU audio stream from active INesEmulatorCore -> NesAudioEngine
  React.useEffect(() => {
    const unsubAudio = core.onAudioSample((left, right) => {
      audio.pushSample(left, right);
    });
    return () => {
      unsubAudio();
    };
  }, [audio, core]);

  const snapshotPushInFlightRef = React.useRef(false);

  const resetLocalInputsForMatch = React.useCallback(() => {
    localButtonBitsRef.current = 0;
    turboButtonBitsRef.current = 0;
    const released = turboEngine.releaseAll();
    for (const ev of released) {
      coreRef.current.setButton(ev.port, ev.button, false);
    }
    coreRef.current.releaseAllButtons();
    netplayOutboxRef.current?.clearPending();
  }, [turboEngine]);

  const pushHostAuthoritativeSnapshot = React.useCallback(
    (reason: 'initial' | 'desync-recovery' | 'reconnect' | 'manual' | 'clock-alignment') => {
      const engine = rollbackEngineRef.current;
      if (!engine || snapshotPushInFlightRef.current) return;
      snapshotPushInFlightRef.current = true;
      void engine
        .exportAuthoritativeSnapshotAsync()
        .then((snap) => {
          if (!snap) return;
          netplayRef.current?.sendAuthoritativeSnapshot({
            frame: snap.frame,
            stateJson: snap.stateJson,
            checksum: snap.checksum,
            romSha256: snap.romSha256,
            romHash: snap.romHash,
            reason,
          });
          setRollbackMetrics(engine.getMetrics());
        })
        .finally(() => {
          snapshotPushInFlightRef.current = false;
        });
    },
    []
  );

  // Initialize InputManager & TGK RETRO 2.0 NetplayClient once
  React.useEffect(() => {
    let lastRoomSessionKey = '';

    const netplay = new NetplayClient({
      onStateChange: (next) => {
        setNetplayState(next);
        const sessionKey =
          next.status === 'connected' && next.roomCode && next.assignedPort
            ? `${next.roomCode}:${next.assignedPort}:${next.roomMode}`
            : '';

        const tracker = netplayDebugTrackerRef.current;
        tracker.setTransportChannel(next.transportChannel);

        if (next.status === 'connected' && next.assignedPort) {
          setNetplayDisconnectReason(null);
          inputManagerRef.current?.setLocalPorts([next.assignedPort]);
          if (next.players.length < 2) {
            tracker.clearPeer();
          }

          if (next.roomMode === 'dual-race' && screenRef.current !== 'dual-race') {
            coreRef.current.pause();
            audio.suspend();
            setIsOnlineDualRace(true);
            setScreen('dual-race');
          } else if (next.roomMode === 'shared-2p' && sessionKey !== lastRoomSessionKey) {
            lastRoomSessionKey = sessionKey;
            tracker.reset();
            tracker.setTransportChannel(next.transportChannel);
            rollbackEngineRef.current?.configureSession({
              localPort: next.assignedPort,
              turnBasedSharedPort1: next.turnBasedSharedPort1,
              initialFrame: 0,
            });
            rollbackEngineRef.current?.setManualInputDelay(manualInputDelayRef.current);
            const initMetrics = rollbackEngineRef.current?.getMetrics() ?? null;
            setRollbackMetrics(initMetrics);
            if (initMetrics) {
              tracker.updateLocalBuffer(initMetrics.inputDelayFrames, 0, MAX_ROLLBACK_FRAMES);
            }
            setNetplayDebug(tracker.getSnapshot());
            setOnlineMatchRunning(false);

            // If Guest has a previously consented cached ROM matching room game, load it automatically
            if (
              next.assignedPort === 2 &&
              next.romSha256 &&
              coreRef.current.getRomMetadata()?.sha256.toLowerCase() !==
                next.romSha256.toLowerCase()
            ) {
              const cached = tryLoadCachedVerifiedRom(next.romSha256);
              if (cached) {
                bootRomBytes(cached, next.romName ?? 'cartridge.nes', null, {
                  broadcastToPeer: false,
                  enterPlaying: true,
                });
                flashBanner(`Loaded saved game: ${(next.romName ?? 'cartridge').replace(/\.nes$/i, '')}`);
              }
            }

            const localMeta = buildLocalPeerHandshake();
            if (localMeta) {
              netplay.sendPeerHello(localMeta);
            }
          }
        } else if (next.status === 'reconnecting') {
          setNetplayDisconnectReason('Connection interrupted. Trying to reconnect...');
        } else if (next.status === 'disconnected') {
          if (next.error) {
            setNetplayDisconnectReason('Disconnected from online room.');
          }
          lastRoomSessionKey = '';
          tracker.reset();
          setNetplayDebug(tracker.getSnapshot());
          inputManagerRef.current?.setLocalPorts([1, 2]);
          localButtonBitsRef.current = 0;
          turboButtonBitsRef.current = 0;
          setOnlineMatchRunning(false);
          setPeerHandshake(null);
          setHandshakeCheck(null);
          setRollbackMetrics(null);
          setIncomingRomOffer(null);
          setRomTransferProgress(null);
          outgoingRomOfferRef.current = null;
          romReceiverRef.current?.decline();
        }
      },
      onPeerHello: (_port, remoteMeta) => {
        setPeerHandshake(remoteMeta);
        const localMeta = buildLocalPeerHandshake();
        if (localMeta) {
          const verdict = verifyPeerHandshake(localMeta, remoteMeta);
          setHandshakeCheck(verdict);
          if (verdict.compatible && rollbackEngineRef.current) {
            rollbackEngineRef.current.markInitialSyncReady();
            const m = rollbackEngineRef.current.getMetrics();
            setRollbackMetrics(m);
            netplayDebugTrackerRef.current.updateLocalBuffer(
              m.inputDelayFrames,
              Math.max(0, m.currentFrame - m.confirmedFrame),
              MAX_ROLLBACK_FRAMES
            );
            setNetplayDebug(netplayDebugTrackerRef.current.getSnapshot());
          }
        }
        const localPort = netplayStateRef.current.assignedPort;
        if (localPort) {
          netplay.sendDebugTelemetry(netplayDebugTrackerRef.current.exportSummaryForPeer(localPort));
        }
      },
      onPingSample: (rttMs) => {
        rollbackEngineRef.current?.recordRttMs(rttMs);
        const tracker = netplayDebugTrackerRef.current;
        tracker.recordPingSample(rttMs);
        const m = rollbackEngineRef.current?.getMetrics();
        if (m) {
          tracker.updateLocalBuffer(
            m.inputDelayFrames,
            Math.max(0, m.currentFrame - m.confirmedFrame) +
              m.pendingClockHoldFrames +
              m.pendingClockCatchUpFrames,
            MAX_ROLLBACK_FRAMES
          );
        }
        setNetplayDebug(tracker.getSnapshot());
        const np = netplayStateRef.current;
        if (np.status === 'connected' && np.assignedPort && np.players.length >= 2) {
          netplay.sendDebugTelemetry(tracker.exportSummaryForPeer(np.assignedPort));
        }
        if (np.roomMode === 'shared-2p') {
          metricsDirtyRef.current = true;
        }
      },
      onPeerDebugTelemetry: (_port, telemetry) => {
        const tracker = netplayDebugTrackerRef.current;
        tracker.ingestPeerSummary(telemetry);
        setNetplayDebug(tracker.getSnapshot());
      },
      onRemoteFrameInputs: (batch) => {
        const np = netplayStateRef.current;
        if (np.roomMode !== 'shared-2p') return;
        const engine = rollbackEngineRef.current;
        if (!engine) return;
        const res = engine.receiveRemoteInputs(batch);
        netplayDebugTrackerRef.current.recordIncomingFramePacket(batch.latestFrame);
        metricsDirtyRef.current = true;
        if (res.needsAuthoritativeResync && np.assignedPort === 1) {
          queueMicrotask(() => pushHostAuthoritativeSnapshot('desync-recovery'));
        }
      },
      onRemoteChecksum: (_port, frame, checksum) => {
        const np = netplayStateRef.current;
        if (np.roomMode !== 'shared-2p') return;
        const engine = rollbackEngineRef.current;
        if (!engine) return;
        const verdict = engine.receiveRemoteChecksum(frame, checksum);
        metricsDirtyRef.current = true;
        if (verdict.desyncDetected && np.assignedPort === 1) {
          const now = Date.now();
          if (now - lastDesyncPushRef.current >= 1500) {
            lastDesyncPushRef.current = now;
            queueMicrotask(() => pushHostAuthoritativeSnapshot('desync-recovery'));
            flashBanner('Syncing match with Player 2...');
          }
        }
      },
      onSyncPulse: (pulse) => {
        const np = netplayStateRef.current;
        if (np.roomMode !== 'shared-2p') return;
        const engine = rollbackEngineRef.current;
        if (!engine) return;
        const alignment = engine.receiveSyncPulse(pulse);
        netplayDebugTrackerRef.current.recordIncomingSyncPulse(pulse.pulseId);
        metricsDirtyRef.current = true;
        if (alignment.alignmentForced) {
          if (alignment.needsAuthoritativeResync && np.assignedPort === 1) {
            const now = Date.now();
            if (now - lastDesyncPushRef.current >= 1000) {
              lastDesyncPushRef.current = now;
              queueMicrotask(() => pushHostAuthoritativeSnapshot('clock-alignment'));
            }
          }
          flashBanner('Aligning 2P clocks...');
        }
      },
      onAuthoritativeSnapshot: (snapshot) => {
        const np = netplayStateRef.current;
        if (np.roomMode !== 'shared-2p') return;
        const engine = rollbackEngineRef.current;
        if (!engine) return;
        const localSha = coreRef.current.getRomMetadata()?.sha256 ?? '';
        if (snapshot.romSha256 && localSha.toLowerCase() !== snapshot.romSha256.toLowerCase()) {
          return;
        }
        resetLocalInputsForMatch();
        void engine
          .applyAuthoritativeSnapshotAsync({
            frame: snapshot.frame,
            stateJson: snapshot.stateJson,
            checksum: snapshot.checksum,
            romHash: snapshot.romHash,
          })
          .then((ok) => {
            if (ok) {
              setRollbackMetrics(engine.getMetrics());
              flashBanner('Online match synced');
            }
          });
      },
      onSyncControl: (control) => {
        const activeCore = coreRef.current;
        const engine = rollbackEngineRef.current;
        if (control.action === 'start') {
          resetLocalInputsForMatch();
          activeCore.reset();
          engine?.resetTimeline(0);
          engine?.markInitialSyncReady();
          if (control.activeTurnPort && netplayStateRef.current.turnBasedSharedPort1) {
            engine?.setTurnBasedMode(true, control.activeTurnPort);
          }
          activeCore.resume();
          audio.flush();
          audio.resume();
          onlineMatchRunningRef.current = true;
          screenRef.current = 'playing';
          modalsOpenRef.current = false;
          inputManagerRef.current?.setEnabled(true);
          setOnlineMatchRunning(true);
          setScreen('playing');
          setShowNetplay(false);
          setRollbackMetrics(engine?.getMetrics() ?? null);
          flashBanner('Online match started');
        } else if (control.action === 'pause') {
          onlineMatchRunningRef.current = false;
          setOnlineMatchRunning(false);
          activeCore.pause();
          audio.suspend();
          flashBanner('Online match paused');
        } else if (control.action === 'resume') {
          activeCore.resume();
          audio.resume();
          onlineMatchRunningRef.current = true;
          screenRef.current = 'playing';
          modalsOpenRef.current = false;
          inputManagerRef.current?.setEnabled(true);
          setOnlineMatchRunning(true);
          setScreen('playing');
          setShowNetplay(false);
          flashBanner('Online match resumed');
        } else if (control.action === 'reset') {
          resetLocalInputsForMatch();
          activeCore.reset();
          engine?.resetTimeline(0);
          engine?.markInitialSyncReady();
          activeCore.resume();
          audio.flush();
          audio.resume();
          onlineMatchRunningRef.current = true;
          screenRef.current = 'playing';
          modalsOpenRef.current = false;
          inputManagerRef.current?.setEnabled(true);
          setOnlineMatchRunning(true);
          setScreen('playing');
          setShowNetplay(false);
          setRollbackMetrics(engine?.getMetrics() ?? null);
          flashBanner('Online match restarted');
        } else if (control.action === 'turn_swap' && control.activeTurnPort) {
          engine?.setTurnBasedMode(true, control.activeTurnPort);
          setRollbackMetrics(engine?.getMetrics() ?? null);
          flashBanner(`Active turn: Player ${control.activeTurnPort}`);
        }
      },
      onRomTransferOffer: (_port, offer) => {
        const receiver = romReceiverRef.current;
        if (!receiver) return;
        const check = receiver.receiveOffer(offer);
        if (check.ok) {
          setIncomingRomOffer(offer);
          setShowNetplay(true);
          flashBanner(`Host offered ROM "${offer.romName}" — consent required`);
        }
      },
      onRomTransferAccept: (_port, transferId) => {
        const pending = outgoingRomOfferRef.current;
        if (!pending || pending.offer.transferId !== transferId) return;
        const total = pending.chunks.length;
        setRomTransferProgress({
          direction: 'send',
          done: 0,
          total,
          romName: pending.offer.romName,
        });
        let idx = 0;
        const pumpNext = () => {
          if (idx >= total || netplayStateRef.current.status !== 'connected') return;
          netplay.sendRomTransferChunk(transferId, idx, total, pending.chunks[idx]);
          idx += 1;
          setRomTransferProgress({
            direction: 'send',
            done: idx,
            total,
            romName: pending.offer.romName,
          });
          if (idx < total) {
            window.setTimeout(pumpNext, 12);
          }
        };
        pumpNext();
      },
      onRomTransferDecline: (_port, _transferId, reason) => {
        outgoingRomOfferRef.current = null;
        setRomTransferProgress(null);
        flashBanner(`Peer declined ROM transfer (${reason})`);
      },
      onRomTransferChunk: (_port, transferId, chunkIndex, _chunkCount, dataBase64) => {
        const receiver = romReceiverRef.current;
        if (!receiver) return;
        const res = receiver.ingestChunk(transferId, chunkIndex, dataBase64);
        if (!res.ok) {
          setRomTransferProgress(null);
          setIncomingRomOffer(null);
          netplay.sendRomTransferComplete(transferId, false, '', res.error);
          flashBanner(res.error ?? 'ROM transfer verification failed');
          return;
        }
        if (!res.completed) {
          setRomTransferProgress({
            direction: 'receive',
            done: res.chunksDone,
            total: res.chunkCount,
            romName: incomingRomOffer?.romName ?? 'cartridge.nes',
          });
          return;
        }
        setRomTransferProgress(null);
        setIncomingRomOffer(null);
        if (res.bytes) {
          const sha256 = computeSha256Hex(res.bytes);
          if (res.saveToLocalStorage) {
            try {
              window.localStorage.setItem(
                `tgk_retro2_rom_cache_v1_${sha256}`,
                uint8ArrayToBase64(res.bytes)
              );
            } catch {
              // ignore quota error
            }
          }
          const romName = netplayStateRef.current.romName ?? 'transferred.nes';
          bootRomBytes(res.bytes, romName, null, {
            broadcastToPeer: false,
            enterPlaying: true,
          });
          netplay.sendRomTransferComplete(transferId, true, sha256);
          flashBanner(
            `Game file loaded${res.saveToLocalStorage ? ' & saved locally' : ''}`
          );
        }
      },
      onRomTransferComplete: (_port, _transferId, verified, _sha256, error) => {
        outgoingRomOfferRef.current = null;
        setRomTransferProgress(null);
        flashBanner(
          verified
            ? 'Player 2 received and loaded the game!'
            : `Game share failed: ${error ?? 'error'}`
        );
      },
      onRemoteInput: (port, button, pressed) => {
        if (netplayStateRef.current.roomMode !== 'shared-2p') {
          coreRef.current.setButton(port, button, pressed);
        }
      },
      onRemoteRom: (romName, _romHash, romBytes) => {
        setRaceRom({ bytes: new Uint8Array(romBytes), name: romName });
        if (netplayStateRef.current.roomMode === 'dual-race') {
          coreRef.current.pause();
          audio.suspend();
          setIsOnlineDualRace(true);
          setScreen('dual-race');
          flashBanner(`Synced race game from Host: ${romName.replace(/\.nes$/i, '')}`);
        }
      },
      onRemoteState: (stateJson, frame, romHash) => {
        const activeCore = coreRef.current;
        void Promise.resolve(
          activeCore.loadState({
            version: 1,
            coreId: activeCore.coreId,
            romName: activeCore.getRomMetadata()?.name ?? 'Synced ROM',
            romHash,
            frameCount: frame,
            savedAt: Date.now(),
            stateJson,
          })
        )
          .then(() => flashBanner('Match state synced'))
          .catch(() => {});
      },
      onRemoteControl: (action) => {
        const activeCore = coreRef.current;
        if (action === 'pause') {
          activeCore.pause();
          audio.suspend();
          setScreen('paused');
        } else if (action === 'resume') {
          activeCore.resume();
          audio.resume();
          setScreen('playing');
        } else if (action === 'reset') {
          activeCore.reset();
          flashBanner('Rematch started by friend');
        }
      },
      onPeerJoined: (reconnected) => {
        const np = netplayStateRef.current;
        const localMeta = buildLocalPeerHandshake();
        if (localMeta) {
          netplay.sendPeerHello(localMeta);
        }
        if (reconnected) {
          flashBanner('Friend reconnected · Syncing match...');
          if (np.roomMode === 'shared-2p' && np.assignedPort === 1) {
            pushHostAuthoritativeSnapshot('reconnect');
          }
          return;
        }
        if (np.roomMode === 'dual-race') {
          flashBanner('Friend joined Dual-Screen Race!');
          const currentRaceRom = raceRomRef.current;
          if (currentRaceRom) {
            netplay.broadcastRom(currentRaceRom.name, 'dual-race', currentRaceRom.bytes);
          }
          netplay.broadcastRaceConfig(raceConfigRef.current);
          return;
        }
        flashBanner('Player 2 joined the room!');
      },
      onRemoteRaceConfig: (incomingConfig) => {
        setRaceConfig(incomingConfig);
        flashBanner(`Synced VS Rules: ${incomingConfig.mode}`);
      },
      onRemoteRaceTelemetry: (packet) => {
        setRemoteTelemetryPacket(packet);
      },
      onRemoteChaos: (twist) => {
        setRemoteChaosTwist(twist);
      },
      onPeerHoldChange: (hold) => {
        if (hold.active) {
          setOnlineMatchRunning(false);
          if (screenRef.current === 'playing') {
            coreRef.current.pause();
            audio.suspend();
          }
          flashBanner(`Paused: waiting for Player ${hold.port ?? 2}`);
        } else if (screenRef.current === 'playing') {
          coreRef.current.resume();
          audio.resume();
          if (netplayStateRef.current.roomMode === 'shared-2p') {
            setOnlineMatchRunning(true);
          }
          flashBanner('Friend returned · Match resumed');
        }
      },
    });
    netplayRef.current = netplay;

    const inputManager = new InputManager(
      (port, button, pressed) => {
        const np = netplayStateRef.current;
        const isRollbackOnline =
          (np.status === 'connected' || np.status === 'reconnecting') &&
          Boolean(np.roomCode) &&
          np.roomMode === 'shared-2p';

        if (isRollbackOnline && onlineMatchRunningRef.current) {
          if (np.assignedPort !== port) return;
          const bit = BUTTON_BIT_MAP[button];
          localButtonBitsRef.current = pressed
            ? localButtonBitsRef.current | bit
            : localButtonBitsRef.current & ~bit;
          return;
        }

        const activeCore = coreRef.current;
        activeCore.setButton(port, button, pressed);
      },
      (pads) => {
        setGamepads(pads);
      },
      (port, button, held) => {
        const np = netplayStateRef.current;
        const isRollbackOnline =
          (np.status === 'connected' || np.status === 'reconnecting') &&
          Boolean(np.roomCode) &&
          np.roomMode === 'shared-2p';

        const activeCore = coreRef.current;
        if (held) {
          championsEngineRef.current?.recordTurboOrCheat(`Gamepad Turbo ${button}`);
          syncLiveIntegrity();
        }
        const edges = turboEngine.setTurboHeld(port, button, held);
        for (const ev of edges) {
          if (isRollbackOnline && onlineMatchRunningRef.current) {
            if (np.assignedPort !== ev.port) continue;
            const bit = BUTTON_BIT_MAP[ev.button];
            turboButtonBitsRef.current = ev.pressed
              ? turboButtonBitsRef.current | bit
              : turboButtonBitsRef.current & ~bit;
          } else {
            activeCore.setButton(ev.port, ev.button, ev.pressed);
          }
        }
      }
    );
    inputManager.attach();
    inputManagerRef.current = inputManager;

    return () => {
      inputManager.detach();
      netplay.dispose();
    };
  }, [
    audio,
    bootRomBytes,
    buildLocalPeerHandshake,
    flashBanner,
    pushHostAuthoritativeSnapshot,
    resetLocalInputsForMatch,
    syncLiveIntegrity,
    tryLoadCachedVerifiedRom,
  ]);

  // Enable/disable local single-screen game inputs based on active screen & open modals
  React.useEffect(() => {
    const active =
      screen === 'playing' &&
      !showControllers &&
      !showNetplay &&
      !showSettings &&
      !showRaceSetup &&
      !showAiComingSoon &&
      !isEditingLayout &&
      !isLoadingCore;
    inputManagerRef.current?.setEnabled(active);
    if (!active) {
      localButtonBitsRef.current = 0;
      turboButtonBitsRef.current = 0;
      const released = turboEngine.releaseAll();
      for (const ev of released) {
        coreRef.current.setButton(ev.port, ev.button, false);
      }
      coreRef.current.releaseAllButtons();
    }
  }, [
    screen,
    showControllers,
    showNetplay,
    showSettings,
    showRaceSetup,
    showAiComingSoon,
    isEditingLayout,
    isLoadingCore,
    turboEngine,
  ]);

  // Clamped-delta fixed-timestep 60.0988Hz emulation + Rollback + Fast-Forward + Turbo loop
  React.useEffect(() => {
    let rafId = 0;
    const frameIntervalMs = 1000 / NES_TARGET_FPS;
    let lastTime = performance.now();
    let accumulator = 0;
    let rollbackMetricsTick = 0;

    const tick = (now: number) => {
      const rawDtMs = Math.min(now - lastTime, 50);
      lastTime = now;

      const activeCore = coreRef.current;
      const np = netplayStateRef.current;
      const isRollbackOnline =
        (np.status === 'connected' || np.status === 'reconnecting') &&
        Boolean(np.roomCode) &&
        np.roomMode === 'shared-2p';

      if (isRollbackOnline) {
        if (
          onlineMatchRunningRef.current &&
          screenRef.current === 'playing' &&
          activeCore.hasRomLoaded() &&
          activeCore.isRunning()
        ) {
          if (!modalsOpenRef.current) {
            inputManagerRef.current?.pollGamepads();
          }
          accumulator += rawDtMs;

          const engine = rollbackEngineRef.current;
          const outbox = netplayOutboxRef.current;
          const outboxHandlers = {
            sendFrameInputs: (batch: {
              port: PlayerPort;
              latestFrame: number;
              ackFrame: number;
              inputs: { frame: number; mask: number }[];
            }) => {
              netplayRef.current?.sendFrameInputs(
                batch.port,
                batch.latestFrame,
                batch.ackFrame,
                batch.inputs
              );
            },
            sendChecksum: (c: { frame: number; checksum: string }) => {
              netplayRef.current?.sendChecksum(c.frame, c.checksum);
            },
            sendSyncPulse: (p: { pulseId: number; frame: number; sentAtMs: number }) => {
              netplayRef.current?.sendSyncPulse(p.pulseId, p.frame, p.sentAtMs);
            },
          };

          // Allow bounded extra catch-up steps when a >200ms sync pulse pulls a lagging clock forward
          const catchUpBudget = engine ? Math.min(3, engine.getPendingClockCatchUpFrames()) : 0;
          const maxSteps = 3 + catchUpBudget;
          let steps = 0;
          while (
            (accumulator >= frameIntervalMs ||
              (engine && engine.getPendingClockCatchUpFrames() > 0 && steps < maxSteps)) &&
            steps < maxSteps &&
            engine
          ) {
            const isCatchUpStep = accumulator < frameIntervalMs;
            const turboEdges = turboEngine.tickFrame();
            for (const ev of turboEdges) {
              if (np.assignedPort === ev.port) {
                const bit = BUTTON_BIT_MAP[ev.button];
                turboButtonBitsRef.current = ev.pressed
                  ? turboButtonBitsRef.current | bit
                  : turboButtonBitsRef.current & ~bit;
              }
            }

            const rawLocalMask =
              (localButtonBitsRef.current | turboButtonBitsRef.current) & 0xff;
            const stepResult = engine.advanceLocalFrame(rawLocalMask);
            if (stepResult.autoRecoveredFromStall) {
              netplayDebugTrackerRef.current.recordStallTimeoutLoss(1);
            }

            // Queue lightweight network packets asynchronously (never blocks 60 FPS RAF loop)
            if (outbox) {
              if (stepResult.outgoingInputBatch && stepResult.outgoingInputBatch.inputs.length > 0) {
                outbox.enqueueInput(stepResult.outgoingInputBatch, outboxHandlers);
              }
              if (stepResult.outgoingChecksum) {
                outbox.enqueueChecksum(stepResult.outgoingChecksum, outboxHandlers);
              }
              if (stepResult.outgoingSyncPulse) {
                outbox.enqueueSyncPulse(stepResult.outgoingSyncPulse, outboxHandlers);
              }
            }

            if (!isCatchUpStep) {
              accumulator -= frameIntervalMs;
            }
            steps += 1;
            metricsDirtyRef.current = true;
          }

          // Throttle React HUD metrics updates (~4Hz) so React re-renders never stall 60 FPS emulation
          rollbackMetricsTick += 1;
          if (rollbackMetricsTick >= 15 && engine && metricsDirtyRef.current) {
            rollbackMetricsTick = 0;
            metricsDirtyRef.current = false;
            const latestMetrics = engine.getMetrics();
            setRollbackMetrics(latestMetrics);
            const tracker = netplayDebugTrackerRef.current;
            tracker.updateLocalBuffer(
              latestMetrics.inputDelayFrames,
              Math.max(0, latestMetrics.currentFrame - latestMetrics.confirmedFrame) +
                latestMetrics.pendingClockHoldFrames +
                latestMetrics.pendingClockCatchUpFrames,
              MAX_ROLLBACK_FRAMES
            );
            setNetplayDebug(tracker.getSnapshot());
            const nowMs = Date.now();
            if (
              np.assignedPort &&
              np.players.length >= 2 &&
              nowMs - lastDebugBroadcastRef.current >= 1000
            ) {
              lastDebugBroadcastRef.current = nowMs;
              netplayRef.current?.sendDebugTelemetry(tracker.exportSummaryForPeer(np.assignedPort));
            }
          }
        } else {
          accumulator = 0;
          rollbackMetricsTick += 1;
          if (rollbackMetricsTick >= 15 && rollbackEngineRef.current && metricsDirtyRef.current) {
            rollbackMetricsTick = 0;
            metricsDirtyRef.current = false;
            const latestMetrics = rollbackEngineRef.current.getMetrics();
            setRollbackMetrics(latestMetrics);
            const tracker = netplayDebugTrackerRef.current;
            tracker.updateLocalBuffer(
              latestMetrics.inputDelayFrames,
              Math.max(0, latestMetrics.currentFrame - latestMetrics.confirmedFrame) +
                latestMetrics.pendingClockHoldFrames +
                latestMetrics.pendingClockCatchUpFrames,
              MAX_ROLLBACK_FRAMES
            );
            setNetplayDebug(tracker.getSnapshot());
          }
        }
      } else if (
        screenRef.current === 'playing' &&
        activeCore.isRunning() &&
        !modalsOpenRef.current
      ) {
        inputManagerRef.current?.pollGamepads();
        const speedMultiplier = fastForwardRef.current ? 2 : 1;
        const maxSteps = fastForwardRef.current ? 6 : 3;
        accumulator += rawDtMs * speedMultiplier;

        let steps = 0;
        while (accumulator >= frameIntervalMs && steps < maxSteps) {
          const turboEdges = turboEngine.tickFrame();
          for (const ev of turboEdges) {
            activeCore.setButton(ev.port, ev.button, ev.pressed);
          }

          activeCore.stepFrame();
          const champEngine = championsEngineRef.current;
          if (champEngine) {
            if (fastForwardRef.current) {
              champEngine.recordFastForward(1);
            }
            champEngine.recordFrameStep(1);
            const snap = champEngine.getSnapshot();
            if (
              snap.gameId &&
              snap.elapsedFrames > 0 &&
              snap.elapsedFrames % 15 === 0 &&
              activeCore.readRamSlice
            ) {
              const wram = activeCore.readRamSlice(0x0000, 2048);
              if (wram && wram.length >= 2048) {
                const unlockedIds = new Set(
                  championsProfileStore.listUnlockedAchievements().map((u) => u.achievementId)
                );
                const result = champEngine.evaluateRamSnapshot(wram, unlockedIds);
                if (result.newStageSplits.length > 0) {
                  const officialSplits = result.newStageSplits.filter((s) => s.verifiedOfficial);
                  if (officialSplits.length > 0 && snap.gameId) {
                    championsProfileStore.recordVerifiedStageSplits(snap.gameId, officialSplits);
                  }
                  const latestSplit = result.newStageSplits[result.newStageSplits.length - 1];
                  flashBanner(
                    `${latestSplit.stageLabel} · ${latestSplit.splitTimeMs}${
                      latestSplit.verifiedOfficial ? '' : ' (Non-Official)'
                    }`
                  );
                  setLiveChampionsIntegrity(champEngine.getSnapshot());
                  setChampionsStoreVersion((v) => v + 1);
                }
                if (result.newlyUnlocked.length > 0) {
                  championsProfileStore.recordUnlockedAchievements(result.newlyUnlocked);
                  setLiveChampionsIntegrity(champEngine.getSnapshot());
                  setChampionsStoreVersion((v) => v + 1);
                }
              }
            }
          }
          accumulator -= frameIntervalMs;
          steps += 1;
        }
      } else {
        accumulator = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [championsProfileStore, flashBanner, turboEngine]);

  // Cleanup active core and audio on app unmount
  React.useEffect(() => {
    return () => {
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current);
      }
      netplayOutboxRef.current?.dispose();
      audio.dispose();
      coreRef.current.dispose();
    };
  }, [audio]);

  // Unlock Web Audio lazily on first real user gesture
  React.useEffect(() => {
    const unlockOnce = () => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, [audio]);

  // Handle ?autostart=1 and ?room=XXXXXX query parameters without booting any dummy ROM
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setScreen('playing');
      void netplayRef.current?.joinRoom(roomParam, 'Player 2', {
        coreId: coreRef.current.coreId,
        coreVersion: coreRef.current.coreVersion ?? coreRef.current.coreId,
      });
      setShowNetplay(true);
      return;
    }
    if (params.get('autostart') === '1') {
      setScreen('playing');
    }
  }, []);

  const handleBookmarkHighlight = React.useCallback(async () => {
    const activeCore = coreRef.current;
    const meta = activeCore.getRomMetadata();
    if (!meta) return;

    try {
      const payload = await activeCore.saveState();
      let thumb: string | null = null;
      const canvas = activeCanvasRef.current;
      if (canvas) {
        try {
          thumb = canvas.toDataURL('image/png');
        } catch {
          thumb = null;
        }
      }
      const added = highlightStore.addBookmark(payload, { thumbnailDataUrl: thumb });
      setHighlights(highlightStore.listBookmarks(activeCore.coreId, meta.hash));
      flashBanner(`Bookmarked ${added.label}`);
    } catch (err) {
      flashBanner(err instanceof Error ? err.message : 'Highlight bookmark failed.');
    }
  }, [flashBanner, highlightStore]);

  const handleJumpHighlight = React.useCallback(
    async (id: string) => {
      const activeCore = coreRef.current;
      const meta = activeCore.getRomMetadata();
      if (!meta) return;
      const bookmark = highlightStore.getBookmark(activeCore.coreId, meta.hash, id);
      if (!bookmark) return;
      try {
        await activeCore.loadState(bookmark.statePayload);
        championsEngineRef.current?.recordSaveStateLoad();
        syncLiveIntegrity();
        activeCore.resume();
        audio.flush();
        audio.resume();
        setScreen('playing');
        flashBanner(`Jumped to ${bookmark.label}`);
      } catch (err) {
        flashBanner(err instanceof Error ? err.message : 'Failed to jump to highlight.');
      }
    },
    [audio, flashBanner, highlightStore, syncLiveIntegrity]
  );

  const handleDeleteHighlight = React.useCallback(
    (id: string) => {
      const activeCore = coreRef.current;
      const meta = activeCore.getRomMetadata();
      if (!meta) return;
      highlightStore.deleteBookmark(activeCore.coreId, meta.hash, id);
      setHighlights(highlightStore.listBookmarks(activeCore.coreId, meta.hash));
    },
    [highlightStore]
  );

  // Global Start / Quick Drawer (Esc) / Highlight (F9) / Mute (M) keyboard shortcuts
  React.useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.tagName === 'SELECT')
      ) {
        return;
      }

      if (screenRef.current === 'title' && !modalsOpenRef.current) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (selectedUserRomId) {
            bootUserRom(selectedUserRomId, true);
          } else {
            fileInputRef.current?.click();
          }
        }
        return;
      }

      if (e.code === 'F9' && screenRef.current === 'playing' && !modalsOpenRef.current) {
        e.preventDefault();
        void handleBookmarkHighlight();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (isEditingLayout) {
          setIsEditingLayout(false);
          return;
        }
        if (showAiComingSoon) {
          setShowAiComingSoon(false);
          return;
        }
        if (showRaceSetup) {
          setShowRaceSetup(false);
          return;
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (showControllers) {
          setShowControllers(false);
          return;
        }
        if (showNetplay) {
          setShowNetplay(false);
          return;
        }
        if (screenRef.current === 'dual-race') {
          return;
        }
        if (screenRef.current === 'creator-hub' || screenRef.current === 'champions') {
          setScreen('title');
          return;
        }
        const activeCore = coreRef.current;
        if (screenRef.current === 'playing') {
          activeCore.pause();
          audio.suspend();
          championsEngineRef.current?.recordPause();
          syncLiveIntegrity();
          setScreen('paused');
        } else if (screenRef.current === 'paused') {
          activeCore.resume();
          audio.resume();
          championsEngineRef.current?.recordResume();
          syncLiveIntegrity();
          setScreen('playing');
        }
        return;
      }

      if (e.code === 'KeyM' && !modalsOpenRef.current && screenRef.current === 'playing') {
        e.preventDefault();
        const nextFocus = activeSettings.audioFocus === 'muted' ? 'standard' : 'muted';
        updateCoreSettings(selectedCoreId, { audioFocus: nextFocus });
        flashBanner(nextFocus === 'muted' ? 'Audio muted' : 'Audio unmuted');
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [
    activeSettings.audioFocus,
    audio,
    bootUserRom,
    flashBanner,
    handleBookmarkHighlight,
    isEditingLayout,
    selectedCoreId,
    selectedUserRomId,
    showAiComingSoon,
    showControllers,
    showNetplay,
    showRaceSetup,
    showSettings,
    syncLiveIntegrity,
    updateCoreSettings,
  ]);

  const handleFileSelected = React.useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const saved = await romLibraryStore.saveRom(bytes, file.name);
        const updatedList = await romLibraryStore.listRoms();
        setUserRoms(updatedList);
        setSelectedUserRomId(saved.id);
        setRomError(null);
        setRaceRom({ bytes: new Uint8Array(saved.bytes), name: saved.fileName });
        if (showRaceSetup) {
          flashBanner(`Selected ${saved.fileName} for Dual-Screen Race`);
          return;
        }
        if (showNetplay) {
          bootRomBytes(saved.bytes, saved.fileName, saved.id, { enterPlaying: false });
          flashBanner(`Selected ${saved.fileName} for FCEUmm Netplay`);
          return;
        }
        if (screenRef.current === 'champions') {
          const matched = identifyUserRomInCatalog(saved);
          flashBanner(
            matched
              ? `Added ${saved.fileName} · Matched #${matched.game.catalogNumber} ${matched.game.title}`
              : `Added ${saved.fileName} to your local NES library`
          );
          return;
        }
        bootRomBytes(saved.bytes, saved.fileName, saved.id, { enterPlaying: true });
      } catch (err) {
        setRomError(
          err instanceof Error
            ? err.message
            : 'Could not read the selected .nes file. Make sure it is a valid iNES (.nes) ROM.'
        );
      }
    },
    [bootRomBytes, flashBanner, romLibraryStore, showNetplay, showRaceSetup]
  );

  const handleScanFolderFiles = React.useCallback(
    async (files: FileList) => {
      const nesFiles = Array.from(files).filter((f) =>
        f.name.toLowerCase().endsWith('.nes')
      );
      if (nesFiles.length === 0) {
        setRomError('No .nes game files were found in the selected folder.');
        return;
      }

      let importedCount = 0;
      let firstImportedId: string | null = null;
      for (const file of nesFiles) {
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const saved = await romLibraryStore.saveRom(bytes, file.name);
          if (!firstImportedId) firstImportedId = saved.id;
          importedCount += 1;
        } catch {
          // skip unreadable or invalid files cleanly
        }
      }

      const updatedList = await romLibraryStore.listRoms();
      setUserRoms(updatedList);
      if (firstImportedId) {
        setSelectedUserRomId(firstImportedId);
      }
      if (importedCount > 0) {
        setRomError(null);
        flashBanner(
          `Scanned folder · Added ${importedCount} .nes ${importedCount === 1 ? 'game' : 'games'}`
        );
      } else {
        setRomError('Could not import valid .nes games from the selected folder.');
      }
    },
    [flashBanner, romLibraryStore]
  );

  const handleTriggerFileBrowser = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTriggerFolderScan = React.useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleOpenQuickDrawer = React.useCallback(() => {
    const activeCore = coreRef.current;
    if (screen === 'playing') {
      activeCore.pause();
      audio.suspend();
      championsEngineRef.current?.recordPause();
      syncLiveIntegrity();
      setScreen('paused');
      netplayRef.current?.broadcastControl('pause');
    } else if (screen === 'paused') {
      activeCore.resume();
      audio.resume();
      championsEngineRef.current?.recordResume();
      syncLiveIntegrity();
      setScreen('playing');
      netplayRef.current?.broadcastControl('resume');
    }
  }, [audio, screen, syncLiveIntegrity]);

  const handleRematch = React.useCallback(() => {
    coreRef.current.reset();
    championsEngineRef.current?.recordReset(true);
    syncLiveIntegrity();
    audio.flush();
    audio.resume();
    setScreen('playing');
    flashBanner('Rematch started · Console reset');
    netplayRef.current?.broadcastControl('reset');
  }, [audio, flashBanner, syncLiveIntegrity]);

  const handleSaveState = React.useCallback(
    async (slot: SaveSlotId) => {
      const activeCore = coreRef.current;
      try {
        const payload = await activeCore.saveState();
        saveStore.save(slot, payload);
        refreshSlotsAndHighlights(activeCore.coreId, activeCore.getRomMetadata());
        flashBanner(`Saved Slot ${slot}`);
      } catch (err) {
        flashBanner(err instanceof Error ? err.message : 'Save state failed.');
      }
    },
    [flashBanner, refreshSlotsAndHighlights, saveStore]
  );

  const handleLoadState = React.useCallback(
    async (slot: SaveSlotId) => {
      const activeCore = coreRef.current;
      const meta = activeCore.getRomMetadata();
      if (!meta) return;
      const payload = saveStore.load(activeCore.coreId, meta.hash, slot);
      if (!payload) {
        flashBanner(`Slot ${slot} is empty`);
        return;
      }
      try {
        await activeCore.loadState(payload);
        championsEngineRef.current?.recordSaveStateLoad();
        syncLiveIntegrity();
        activeCore.resume();
        audio.flush();
        audio.resume();
        setScreen('playing');
        flashBanner(`Loaded Slot ${slot}`);
        if (
          netplayStateRef.current.status === 'connected' &&
          netplayStateRef.current.assignedPort === 1
        ) {
          netplayRef.current?.broadcastState(
            payload.stateJson,
            payload.frameCount,
            payload.romHash
          );
        }
      } catch (err) {
        flashBanner(err instanceof Error ? err.message : 'Load state failed.');
      }
    },
    [audio, flashBanner, saveStore, syncLiveIntegrity]
  );

  const handleVirtualButton = React.useCallback(
    (port: PlayerPort, button: NesButtonName, pressed: boolean) => {
      const activeCore = coreRef.current;
      if (!activeCore.hasRomLoaded()) return;
      audio.unlock();

      const np = netplayStateRef.current;
      const isRollbackOnline =
        (np.status === 'connected' || np.status === 'reconnecting') &&
        Boolean(np.roomCode) &&
        np.roomMode === 'shared-2p';

      if (isRollbackOnline && onlineMatchRunningRef.current) {
        if (np.assignedPort !== port) return;
        const bit = BUTTON_BIT_MAP[button];
        localButtonBitsRef.current = pressed
          ? localButtonBitsRef.current | bit
          : localButtonBitsRef.current & ~bit;
        return;
      }

      activeCore.setButton(port, button, pressed);
    },
    [audio]
  );

  const handleTurboButton = React.useCallback(
    (port: PlayerPort, button: TurboButtonName, held: boolean) => {
      const activeCore = coreRef.current;
      if (!activeCore.hasRomLoaded()) return;
      audio.unlock();
      const np = netplayStateRef.current;
      const isRollbackOnline =
        (np.status === 'connected' || np.status === 'reconnecting') &&
        Boolean(np.roomCode) &&
        np.roomMode === 'shared-2p';

      if (held) {
        championsEngineRef.current?.recordTurboOrCheat(`Touch Turbo ${button}`);
        syncLiveIntegrity();
      }
      const edges = turboEngine.setTurboHeld(port, button, held);
      for (const ev of edges) {
        if (isRollbackOnline) {
          if (np.assignedPort !== ev.port) continue;
          const bit = BUTTON_BIT_MAP[ev.button];
          turboButtonBitsRef.current = ev.pressed
            ? turboButtonBitsRef.current | bit
            : turboButtonBitsRef.current & ~bit;
        } else {
          activeCore.setButton(ev.port, ev.button, ev.pressed);
        }
      }
    },
    [audio, syncLiveIntegrity, turboEngine]
  );

  const handleUpdateBinding = React.useCallback(
    (port: PlayerPort, button: NesButtonName, code: string) => {
      setBindings((prev) => {
        const next = cloneBindings(prev);
        next[port][button] = code;
        inputManagerRef.current?.setBindings(next);
        return next;
      });
    },
    []
  );

  const handleResetBindings = React.useCallback(() => {
    const fresh = cloneBindings(DEFAULT_CONTROLLER_BINDINGS);
    setBindings(fresh);
    inputManagerRef.current?.setBindings(fresh);
  }, []);

  const resolveCurrentRomForRace = React.useCallback((): {
    bytes: Uint8Array;
    name: string;
  } | null => {
    const activeCore = coreRef.current;
    const loadedBytes = activeCore.getRomBytes();
    const loadedMeta = activeCore.getRomMetadata();
    if (loadedBytes && loadedMeta) {
      return { bytes: new Uint8Array(loadedBytes), name: loadedMeta.name };
    }
    if (lastRomRef.current) {
      return {
        bytes: new Uint8Array(lastRomRef.current.bytes),
        name: lastRomRef.current.fileName,
      };
    }
    const found =
      userRoms.find((r) => r.id === selectedUserRomId) ?? userRoms[0] ?? null;
    if (!found) return null;
    return { bytes: new Uint8Array(found.bytes), name: found.fileName };
  }, [selectedUserRomId, userRoms]);

  const handleOpenDualRaceSetup = React.useCallback(() => {
    const targetRom = resolveCurrentRomForRace();
    setRaceRom(targetRom);
    setShowRaceSetup(true);
  }, [resolveCurrentRomForRace]);

  const handleOpenCreatorHub = React.useCallback(() => {
    coreRef.current.pause();
    audio.suspend();
    setIsEditingLayout(false);
    setScreen('creator-hub');
  }, [audio]);

  const handleOpenChampions = React.useCallback(() => {
    coreRef.current.pause();
    audio.suspend();
    syncLiveIntegrity();
    setIsEditingLayout(false);
    setScreen('champions');
  }, [audio, syncLiveIntegrity]);

  const handleChangeChampionsSessionMode = React.useCallback(
    (mode: PlaySessionMode) => {
      setChampionsSessionMode(mode);
      championsSessionModeRef.current = mode;
      const activeCore = coreRef.current;
      startChampionsVerificationSession(
        mode,
        activeCore.getRomMetadata(),
        activeCore.coreId,
        activeCore.coreVersion ?? activeCore.coreId
      );
      flashBanner(
        mode === 'official-ranked'
          ? 'Official Ranked Mode active (Strict Anti-Cheat)'
          : 'Practice Mode active (Save-States & Turbo allowed · Non-Official)'
      );
    },
    [flashBanner, startChampionsVerificationSession]
  );

  const handleStartLocalRace = React.useCallback(
    (nextConfig: RaceMatchConfig) => {
      const targetRom = resolveCurrentRomForRace();
      if (!targetRom) {
        fileInputRef.current?.click();
        return;
      }
      coreRef.current.pause();
      audio.suspend();
      setRaceRom(targetRom);
      setRaceConfig(nextConfig);
      setIsOnlineDualRace(false);
      setRemoteTelemetryPacket(null);
      setRemoteChaosTwist(null);
      setShowRaceSetup(false);
      setScreen('dual-race');
    },
    [audio, resolveCurrentRomForRace]
  );

  const handleHostOnlineRace = React.useCallback(
    (nextConfig: RaceMatchConfig) => {
      const targetRom = resolveCurrentRomForRace();
      if (!targetRom) {
        fileInputRef.current?.click();
        return;
      }
      coreRef.current.pause();
      audio.suspend();
      setRaceRom(targetRom);
      setRaceConfig(nextConfig);
      setIsOnlineDualRace(true);
      setRemoteTelemetryPacket(null);
      setRemoteChaosTwist(null);
      setShowRaceSetup(false);
      setScreen('dual-race');
      void netplayRef.current?.createRoom(
        targetRom.name,
        'dual-race',
        'Player 1',
        'dual-race'
      );
      setShowNetplay(true);
    },
    [audio, resolveCurrentRomForRace]
  );

  const handleCreateRoom = React.useCallback(
    (
      playerName: string,
      roomMode: NetplayRoomMode = 'shared-2p',
      options?: { turnBasedSharedPort1?: boolean }
    ) => {
      const targetRom = resolveCurrentRomForRace();
      if (!targetRom) {
        flashBanner('Pick a .nes game before hosting a room.');
        fileInputRef.current?.click();
        return;
      }

      lastNetplayAttemptRef.current = {
        type: 'host',
        playerName,
        roomMode,
        turnBasedSharedPort1: Boolean(options?.turnBasedSharedPort1),
      };
      setNetplayDisconnectReason(null);

      if (roomMode === 'dual-race') {
        setRaceRom(targetRom);
        setIsOnlineDualRace(true);
        coreRef.current.pause();
        audio.suspend();
        setScreen('dual-race');
        void netplayRef.current?.createRoom(
          targetRom.name,
          'dual-race',
          playerName,
          'dual-race'
        );
        return;
      }

      const activeCore = coreRef.current;
      if (!activeCore.hasRomLoaded()) {
        const selected = userRoms.find((r) => r.id === selectedUserRomId) ?? userRoms[0] ?? null;
        if (selected) {
          bootRomBytes(selected.bytes, selected.fileName, selected.id, { enterPlaying: true });
        }
      }
      const meta = activeCore.getRomMetadata();
      const romSha256 = meta?.sha256 ?? computeSha256Hex(targetRom.bytes);
      const romSizeBytes = meta?.sizeBytes ?? targetRom.bytes.byteLength;

      void netplayRef.current?.createRoom(
        meta?.name ?? targetRom.name,
        meta?.hash ?? romSha256.slice(0, 8),
        playerName,
        'shared-2p',
        {
          romSha256,
          romSizeBytes,
          coreId: activeCore.coreId,
          coreVersion: activeCore.coreVersion ?? activeCore.coreId,
          turnBasedSharedPort1: Boolean(options?.turnBasedSharedPort1),
        }
      );
    },
    [audio, bootRomBytes, flashBanner, resolveCurrentRomForRace, selectedUserRomId, userRoms]
  );

  const handleJoinRoom = React.useCallback(
    (roomCode: string, playerName: string) => {
      lastNetplayAttemptRef.current = {
        type: 'join',
        playerName,
        roomCode,
      };
      setNetplayDisconnectReason(null);

      const activeCore = coreRef.current;
      if (!activeCore.hasRomLoaded()) {
        const selected = userRoms.find((r) => r.id === selectedUserRomId) ?? userRoms[0] ?? null;
        if (selected) {
          bootRomBytes(selected.bytes, selected.fileName, selected.id, { enterPlaying: true });
        } else {
          setScreen('playing');
        }
      }
      const meta = activeCore.getRomMetadata();
      const selected = userRoms.find((r) => r.id === selectedUserRomId) ?? userRoms[0] ?? null;
      void netplayRef.current?.joinRoom(roomCode, playerName, {
        coreId: activeCore.coreId,
        coreVersion: activeCore.coreVersion ?? activeCore.coreId,
        romName: meta?.name ?? selected?.name,
        romSha256: meta?.sha256 ?? selected?.sha256,
      });
    },
    [bootRomBytes, selectedUserRomId, userRoms]
  );

  const handleSyncStart = React.useCallback(() => {
    const activeCore = coreRef.current;
    const engine = rollbackEngineRef.current;
    if (!activeCore.hasRomLoaded() || !engine) return;
    resetLocalInputsForMatch();
    activeCore.reset();
    engine.resetTimeline(0);
    engine.markInitialSyncReady();
    if (netplayStateRef.current.turnBasedSharedPort1) {
      engine.setTurnBasedMode(true, 1);
    }
    activeCore.resume();
    audio.flush();
    audio.resume();
    onlineMatchRunningRef.current = true;
    screenRef.current = 'playing';
    modalsOpenRef.current = false;
    inputManagerRef.current?.setEnabled(true);
    setOnlineMatchRunning(true);
    setScreen('playing');
    setShowNetplay(false);
    setRollbackMetrics(engine.getMetrics());
    netplayRef.current?.sendSyncControl('start', 0, 1);
    if (netplayStateRef.current.assignedPort === 1) {
      window.setTimeout(() => pushHostAuthoritativeSnapshot('initial'), 120);
    }
    flashBanner('Online match started');
  }, [audio, flashBanner, pushHostAuthoritativeSnapshot, resetLocalInputsForMatch]);

  const handleSyncPauseToggle = React.useCallback(() => {
    const activeCore = coreRef.current;
    const engine = rollbackEngineRef.current;
    const frame = engine?.getMetrics().currentFrame ?? activeCore.getFrameCount();
    if (onlineMatchRunningRef.current) {
      onlineMatchRunningRef.current = false;
      setOnlineMatchRunning(false);
      activeCore.pause();
      audio.suspend();
      netplayRef.current?.sendSyncControl('pause', frame);
      flashBanner('Online match paused');
    } else {
      activeCore.resume();
      audio.resume();
      onlineMatchRunningRef.current = true;
      screenRef.current = 'playing';
      modalsOpenRef.current = false;
      inputManagerRef.current?.setEnabled(true);
      setOnlineMatchRunning(true);
      setScreen('playing');
      setShowNetplay(false);
      netplayRef.current?.sendSyncControl('resume', frame);
      flashBanner('Online match resumed');
    }
  }, [audio, flashBanner]);

  const handleSyncReset = React.useCallback(() => {
    const activeCore = coreRef.current;
    const engine = rollbackEngineRef.current;
    resetLocalInputsForMatch();
    activeCore.reset();
    engine?.resetTimeline(0);
    engine?.markInitialSyncReady();
    activeCore.resume();
    audio.flush();
    audio.resume();
    onlineMatchRunningRef.current = true;
    screenRef.current = 'playing';
    modalsOpenRef.current = false;
    inputManagerRef.current?.setEnabled(true);
    setOnlineMatchRunning(true);
    setScreen('playing');
    setShowNetplay(false);
    setRollbackMetrics(engine?.getMetrics() ?? null);
    netplayRef.current?.sendSyncControl('reset', 0);
    if (netplayStateRef.current.assignedPort === 1) {
      window.setTimeout(() => pushHostAuthoritativeSnapshot('initial'), 120);
    }
    flashBanner('Online match restarted');
  }, [audio, flashBanner, pushHostAuthoritativeSnapshot, resetLocalInputsForMatch]);

  const handleSwapTurnOwner = React.useCallback(() => {
    const engine = rollbackEngineRef.current;
    if (!engine) return;
    const m = engine.getMetrics();
    const nextPort: PlayerPort = m.activeTurnPort === 1 ? 2 : 1;
    engine.setTurnBasedMode(true, nextPort);
    setRollbackMetrics(engine.getMetrics());
    netplayRef.current?.sendSyncControl('turn_swap', m.currentFrame, nextPort);
    flashBanner(`Active turn: Player ${nextPort}`);
  }, [flashBanner]);

  const handleChangeManualDelay = React.useCallback(
    (frames: number | null) => {
      setManualInputDelay(frames);
      rollbackEngineRef.current?.setManualInputDelay(frames);
      const metrics = rollbackEngineRef.current?.getMetrics() ?? null;
      setRollbackMetrics(metrics);
      if (metrics) {
        const tracker = netplayDebugTrackerRef.current;
        tracker.updateLocalBuffer(
          metrics.inputDelayFrames,
          Math.max(0, metrics.currentFrame - metrics.confirmedFrame) +
            metrics.pendingClockHoldFrames +
            metrics.pendingClockCatchUpFrames,
          MAX_ROLLBACK_FRAMES
        );
        setNetplayDebug(tracker.getSnapshot());
        const np = netplayStateRef.current;
        if (np.status === 'connected' && np.assignedPort && np.players.length >= 2) {
          netplayRef.current?.sendDebugTelemetry(tracker.exportSummaryForPeer(np.assignedPort));
        }
      }
      if (metrics?.highPingDelayWarning) {
        flashBanner(metrics.highPingDelayWarning);
      }
    },
    [flashBanner]
  );

  const handleResetNetplayDebug = React.useCallback(() => {
    const tracker = netplayDebugTrackerRef.current;
    tracker.resetCounters();
    setNetplayDebug(tracker.getSnapshot());
    const np = netplayStateRef.current;
    if (np.status === 'connected' && np.assignedPort && np.players.length >= 2) {
      netplayRef.current?.sendDebugTelemetry(tracker.exportSummaryForPeer(np.assignedPort));
    }
  }, []);

  const handleOfferRomTransfer = React.useCallback(() => {
    const activeCore = coreRef.current;
    const meta = activeCore.getRomMetadata();
    const bytes = activeCore.getRomBytes();
    if (!meta || !bytes) {
      flashBanner('Load a .nes ROM first before offering a transfer.');
      return;
    }
    const prepared = createRomTransferOffer(meta.name, bytes);
    if (!prepared.ok) {
      flashBanner(prepared.error);
      return;
    }
    outgoingRomOfferRef.current = { offer: prepared.offer, chunks: prepared.chunks };
    netplayRef.current?.sendRomTransferOffer(prepared.offer);
    flashBanner(`Sent consent-based ROM transfer offer (${meta.name})`);
  }, [flashBanner]);

  const handleAcceptRomTransfer = React.useCallback(
    (saveToLocalStorage: boolean) => {
      const accepted = romReceiverRef.current?.grantConsent(saveToLocalStorage);
      if (!accepted) return;
      setIncomingRomOffer(null);
      setRomTransferProgress({
        direction: 'receive',
        done: 0,
        total: accepted.chunkCount,
        romName: accepted.romName,
      });
      netplayRef.current?.acceptRomTransfer(accepted.transferId, saveToLocalStorage);
    },
    []
  );

  const handleDeclineRomTransfer = React.useCallback(() => {
    if (incomingRomOffer) {
      netplayRef.current?.declineRomTransfer(incomingRomOffer.transferId, 'User declined');
    }
    romReceiverRef.current?.decline();
    setIncomingRomOffer(null);
  }, [incomingRomOffer]);

  const handleSyncStateNow = React.useCallback(async () => {
    const activeCore = coreRef.current;
    const meta = activeCore.getRomMetadata();
    const bytes = activeCore.getRomBytes();
    if (!meta || !bytes) return;
    netplayRef.current?.broadcastRom(meta.name, meta.hash, bytes);
    try {
      const snap = await activeCore.saveState();
      netplayRef.current?.broadcastState(snap.stateJson, snap.frameCount, snap.romHash);
      flashBanner('Broadcasted ROM & Save State to Player 2');
    } catch {
      flashBanner('Broadcasted ROM to Player 2');
    }
  }, [flashBanner]);

  const handleReturnToTitle = React.useCallback(() => {
    if (activeSettings.autoSaveEnabled && coreRef.current.hasRomLoaded()) {
      void Promise.resolve(coreRef.current.saveState())
        .then((payload) => {
          saveStore.save(1, payload);
          refreshSlotsAndHighlights(
            coreRef.current.coreId,
            coreRef.current.getRomMetadata()
          );
        })
        .catch(() => {});
    }
    flushActivePlaySession();
    coreRef.current.pause();
    audio.suspend();
    setIsEditingLayout(false);
    setScreen('title');
  }, [activeSettings.autoSaveEnabled, audio, flushActivePlaySession, refreshSlotsAndHighlights, saveStore]);

  const handleRetryNetplay = React.useCallback(() => {
    setNetplayDisconnectReason(null);
    const last = lastNetplayAttemptRef.current;
    if (!last) {
      setShowNetplay(true);
      return;
    }
    netplayRef.current?.leaveRoom();
    if (last.type === 'host') {
      handleCreateRoom(last.playerName, last.roomMode ?? 'shared-2p', {
        turnBasedSharedPort1: last.turnBasedSharedPort1,
      });
    } else if (last.roomCode) {
      handleJoinRoom(last.roomCode, last.playerName);
    }
    flashBanner('Retrying online connection...');
  }, [flashBanner, handleCreateRoom, handleJoinRoom]);

  const handleExitToMenuFromNetplay = React.useCallback(() => {
    netplayRef.current?.leaveRoom();
    setNetplayDisconnectReason(null);
    setShowNetplay(false);
    handleReturnToTitle();
  }, [handleReturnToTitle]);

  const openSettingsAtTab = React.useCallback((tab: SettingsTabId = 'display') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);

  const activeTouchPort: PlayerPort =
    netplayState.status === 'connected' && netplayState.assignedPort
      ? netplayState.assignedPort
      : 1;

  return (
    <div className="h-full w-full overflow-hidden bg-[#070910] text-[#F1F5F9]">
      {/* Hidden native .nes file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".nes,application/octet-stream"
        className="sr-only"
        aria-label="Pick NES game file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleFileSelected(file);
          }
          e.target.value = '';
        }}
      />

      {/* Hidden folder scanner for .nes game libraries */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept=".nes,application/octet-stream"
        className="sr-only"
        aria-label="Scan folder for NES games"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleScanFolderFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {screen === 'title' ? (
        <TitleStage
          userRoms={userRoms}
          selectedRomId={selectedUserRomId}
          activeSettings={activeSettings}
          usageReport={usageReport}
          onSelectUserRom={(id) => setSelectedUserRomId(id)}
          onLaunchUserRom={(id) => bootUserRom(id, true)}
          onRemoveUserRom={(id) => void handleRemoveUserRom(id)}
          onDropRomFile={(file) => void handleFileSelected(file)}
          onStart={() => {
            if (selectedUserRomId) {
              bootUserRom(selectedUserRomId, true);
            } else if (userRoms[0]) {
              bootUserRom(userRoms[0].id, true);
            } else {
              handleTriggerFileBrowser();
            }
          }}
          onOpenChampions={handleOpenChampions}
          onOpenDualRace={handleOpenDualRaceSetup}
          onOpenCreatorHub={handleOpenCreatorHub}
          onOpenAiComingSoon={() => setShowAiComingSoon(true)}
          onRequestLoadRomFile={handleTriggerFileBrowser}
          onRequestScanFolder={handleTriggerFolderScan}
          onOpenNetplay={() => setShowNetplay(true)}
          onOpenSettings={() => openSettingsAtTab('display')}
          romError={romError}
        />
      ) : screen === 'champions' ? (
        <ChampionsDashboard
          userRoms={userRoms}
          sessionMode={championsSessionMode}
          liveIntegrity={liveChampionsIntegrity}
          profileStore={championsProfileStore}
          storeVersion={championsStoreVersion}
          onProfileStoreMutated={() => setChampionsStoreVersion((v) => v + 1)}
          onChangeSessionMode={handleChangeChampionsSessionMode}
          onLaunchUserRom={(userRomId) => bootUserRom(userRomId, true)}
          onRequestLoadRomFile={handleTriggerFileBrowser}
          onBack={() => setScreen('title')}
        />
      ) : screen === 'creator-hub' ? (
        <YouTubeCreatorHub
          state={creatorHubState}
          onUpdateMyChannel={(patch) => {
            const res = creatorHubStore.updateMyChannel(patch);
            if (res.ok) setCreatorHubState(creatorHubStore.getSnapshot());
            return res;
          }}
          onUpsertMyVideo={(input) => {
            const res = creatorHubStore.upsertMyVideo(input);
            if (res.ok) setCreatorHubState(creatorHubStore.getSnapshot());
            return res;
          }}
          onDeleteMyVideo={(id) => {
            creatorHubStore.deleteMyVideo(id);
            setCreatorHubState(creatorHubStore.getSnapshot());
          }}
          onUpsertRetroCreator={(input) => {
            const res = creatorHubStore.upsertRetroCreator(input);
            if (res.ok) setCreatorHubState(creatorHubStore.getSnapshot());
            return res;
          }}
          onDeleteRetroCreator={(id) => {
            creatorHubStore.deleteRetroCreator(id);
            setCreatorHubState(creatorHubStore.getSnapshot());
          }}
          onResetRetroCreators={() => {
            creatorHubStore.resetRetroCreators();
            setCreatorHubState(creatorHubStore.getSnapshot());
          }}
          onBackToEmulator={() => setScreen('title')}
        />
      ) : screen === 'dual-race' && raceRom ? (
        <DualScreenRaceStage
          romBytes={raceRom.bytes}
          romName={raceRom.name}
          config={raceConfig}
          bindings={bindings}
          videoFilter={activeSettings.videoFilter}
          crtMode={activeSettings.crtMode}
          audioLatencyMs={activeSettings.audioLatencyMs}
          isOnlineVsMode={isOnlineDualRace}
          netplay={netplayState}
          netplayTransport={netplayRef.current}
          remoteTelemetryPacket={remoteTelemetryPacket}
          remoteChaosTwist={remoteChaosTwist}
          activeRival={rivals.find((r) => r.id === raceConfig.rivalId) ?? null}
          onRecordResult={({ winner, p1Score, p2Score }) => {
            const outcome = winner === 1 ? 'win' : winner === 2 ? 'loss' : 'draw';
            rivalryStore.recordMatchResult({
              rivalId: raceConfig.rivalId,
              rivalNameFallback: raceConfig.p2Name || 'Rival P2',
              outcome,
              p1Score,
              p2Score,
              romName: raceRom.name,
            });
            setRivals(rivalryStore.listRivals());
            const eloUpdate = championsProfileStore.recordVsEloMatch({ outcome });
            if (eloUpdate) {
              setChampionsStoreVersion((v) => v + 1);
              const sign = eloUpdate.delta >= 0 ? '+' : '';
              flashBanner(`2P VS ELO Updated: ${eloUpdate.newElo} (${sign}${eloUpdate.delta})`);
            }
          }}
          onOpenNetplay={() => setShowNetplay(true)}
          onRetryNetplay={handleRetryNetplay}
          onExitRace={() => {
            setIsOnlineDualRace(false);
            setRemoteTelemetryPacket(null);
            setRemoteChaosTwist(null);
            setScreen('title');
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col overflow-hidden bg-[#070910]">
          <ConsoleHud
            romMetadata={romMetadata}
            settings={activeSettings}
            effectiveOrientation={effectiveOrientation}
            isEditingLayout={isEditingLayout}
            sessionElapsedSeconds={sessionElapsedSeconds}
            netplay={netplayState}
            netplayDisconnectReason={netplayDisconnectReason}
            statusBanner={statusBanner}
            onLoadRomFile={handleTriggerFileBrowser}
            onToggleOnScreenPad={() =>
              updateCoreSettings(selectedCoreId, {
                showOnScreenPad: !activeSettings.showOnScreenPad,
              })
            }
            onOpenQuickDrawer={handleOpenQuickDrawer}
            onOpenNetplay={() => setShowNetplay(true)}
            onRetryNetplay={handleRetryNetplay}
            onExitToMenu={handleExitToMenuFromNetplay}
            gameScreen={
              <EmulatorCanvas
                core={core}
                hasRomLoaded={Boolean(romMetadata)}
                videoFilter={activeSettings.videoFilter}
                crtMode={activeSettings.crtMode}
                aspectRatio={activeSettings.aspectRatio}
                orientation={effectiveOrientation}
                isLoadingCore={isLoadingCore}
                coreError={coreError}
                isOnlineMatchActive={
                  netplayState.status === 'connecting' ||
                  netplayState.status === 'connected' ||
                  netplayState.status === 'reconnecting'
                }
                bypassShaderOverhead={false}
                onCanvasReady={handleCanvasReady}
                onRequestLoadRomFile={handleTriggerFileBrowser}
                onRetryCore={handleRetryFceumm}
                onDropRomFile={(file) => void handleFileSelected(file)}
              />
            }
            controllerOverlay={
              <VirtualControllerOverlay
                visible={activeSettings.showOnScreenPad}
                isEditingLayout={isEditingLayout}
                orientation={effectiveOrientation}
                activePort={activeTouchPort}
                turboRateHz={activeSettings.turboRateHz}
                layout={currentGameLayout}
                onButtonChange={handleVirtualButton}
                onTurboChange={handleTurboButton}
                onLayoutDraftChange={(next) => setCurrentGameLayout(next)}
                onSaveLayout={(profile) => {
                  const saved = layoutStore.saveLayout(profile);
                  setCurrentGameLayout(saved);
                  flashBanner(`Saved custom layout for ${saved.romName.replace(/\.nes$/i, '')}`);
                }}
                onResetLayout={() => {
                  const meta = coreRef.current.getRomMetadata();
                  const fresh = layoutStore.resetLayout(
                    meta?.hash ?? currentGameLayout.romHash,
                    meta?.name ?? currentGameLayout.romName,
                    activeSettings.defaultStickMode
                  );
                  setCurrentGameLayout(fresh);
                  flashBanner('Reset layout to default');
                }}
                onExitEditLayout={() => setIsEditingLayout(false)}
              />
            }
          />
        </div>
      )}

      {/* In-Game Menu Drawer */}
      <QuickDrawer
        open={screen === 'paused'}
        romMetadata={romMetadata}
        sessionElapsedSeconds={sessionElapsedSeconds}
        slots={slots}
        settings={activeSettings}
        highlights={highlights}
        onResume={handleOpenQuickDrawer}
        onSaveSlot={(slot) => void handleSaveState(slot)}
        onLoadSlot={(slot) => void handleLoadState(slot)}
        onChangeAudioFocus={(audioFocus) =>
          updateCoreSettings(selectedCoreId, { audioFocus })
        }
        onChangeVolume={(masterVolume) =>
          updateCoreSettings(selectedCoreId, { masterVolume })
        }
        onChangeTurboRate={(turboRateHz) =>
          updateCoreSettings(selectedCoreId, { turboRateHz })
        }
        onOpenControls={() => setShowControllers(true)}
        onStartEditGameLayout={() => {
          updateCoreSettings(selectedCoreId, { showOnScreenPad: true });
          coreRef.current.resume();
          audio.resume();
          setScreen('playing');
          setIsEditingLayout(true);
        }}
        onOpenSettings={() => openSettingsAtTab('display')}
        onOpenReports={() => openSettingsAtTab('reports')}
        onOpenNetplay={() => setShowNetplay(true)}
        onOpenChampions={handleOpenChampions}
        onOpenCreatorHub={handleOpenCreatorHub}
        onOpenAiComingSoon={() => setShowAiComingSoon(true)}
        onCreateHighlight={() => void handleBookmarkHighlight()}
        onJumpHighlight={(id) => void handleJumpHighlight(id)}
        onDeleteHighlight={handleDeleteHighlight}
        onRematch={handleRematch}
        onExitToShelf={handleReturnToTitle}
      />

      {/* 4-Section Organized Settings Modal */}
      {showSettings && (
        <SettingsModal
          activeCoreId={selectedCoreId}
          initialTab={settingsInitialTab}
          getSettingsForCore={(id) => settingsStore.getSettings(id)}
          onUpdateCoreSettings={updateCoreSettings}
          onResetCoreSettings={resetCoreSettings}
          currentGameLayout={currentGameLayout}
          onUpdateGameLayout={(patch) => {
            const next = layoutStore.saveLayout({
              ...currentGameLayout,
              ...patch,
              isCustomized: true,
            });
            setCurrentGameLayout(next);
          }}
          onOpenLayoutEditor={
            screen === 'playing' || screen === 'paused'
              ? () => {
                  updateCoreSettings(selectedCoreId, { showOnScreenPad: true });
                  if (screen === 'paused') {
                    coreRef.current.resume();
                    audio.resume();
                    setScreen('playing');
                  }
                  setIsEditingLayout(true);
                }
              : undefined
          }
          onResetGameLayout={() => {
            const meta = coreRef.current.getRomMetadata();
            const fresh = layoutStore.resetLayout(
              meta?.hash ?? currentGameLayout.romHash,
              meta?.name ?? currentGameLayout.romName,
              activeSettings.defaultStickMode
            );
            setCurrentGameLayout(fresh);
            flashBanner('Reset layout to default');
          }}
          onOpenControllers={() => setShowControllers(true)}
          hasActiveRom={Boolean(romMetadata)}
          slots={slots}
          onSaveSlot={(slot) => void handleSaveState(slot)}
          onLoadSlot={(slot) => void handleLoadState(slot)}
          sessionElapsedSeconds={sessionElapsedSeconds}
          activeGameTitle={romMetadata ? romMetadata.name.replace(/\.nes$/i, '') : null}
          usageReport={usageReport}
          onClearUsageReports={() => {
            sessionTimerStore.clearReports();
            setUsageReport(sessionTimerStore.getSnapshot());
            flashBanner('Cleared usage reports');
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showControllers && (
        <ControllerModal
          bindings={bindings}
          gamepads={gamepads}
          onUpdateBinding={handleUpdateBinding}
          onResetDefaults={handleResetBindings}
          onClose={() => setShowControllers(false)}
        />
      )}

      {showRaceSetup && (
        <DualRaceSetupModal
          romName={raceRom?.name ?? romMetadata?.name ?? userRoms.find((r) => r.id === selectedUserRomId)?.fileName ?? null}
          initialConfig={raceConfig}
          rivals={rivals}
          onRequestLoadRomFile={handleTriggerFileBrowser}
          onAddFriend={(name) => {
            const added = rivalryStore.addFriend(name);
            setRivals(rivalryStore.listRivals());
            return added;
          }}
          onRemoveFriend={(id) => {
            rivalryStore.removeFriend(id);
            setRivals(rivalryStore.listRivals());
          }}
          onStartLocalRace={handleStartLocalRace}
          onHostOnlineRace={handleHostOnlineRace}
          onClose={() => setShowRaceSetup(false)}
        />
      )}

      {showNetplay && (
        <NetplayModal
          netplay={netplayState}
          netplayDisconnectReason={netplayDisconnectReason}
          currentRomName={
            screen === 'dual-race'
              ? raceRom?.name ?? null
              : romMetadata?.name ??
                userRoms.find((r) => r.id === selectedUserRomId)?.name ??
                userRoms[0]?.name ??
                null
          }
          determinismOk={determinismOk}
          peerHandshake={peerHandshake}
          handshakeCheck={handshakeCheck}
          rollbackMetrics={rollbackMetrics}
          netplayDebug={netplayDebug}
          onlineMatchRunning={onlineMatchRunning}
          manualInputDelay={manualInputDelay}
          incomingRomOffer={incomingRomOffer}
          romTransferProgress={romTransferProgress}
          defaultRoomMode={screen === 'dual-race' ? 'dual-race' : 'shared-2p'}
          onRequestLoadRomFile={handleTriggerFileBrowser}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={() => {
            netplayRef.current?.leaveRoom();
            setNetplayDisconnectReason(null);
          }}
          onRetryConnection={handleRetryNetplay}
          onExitToMenu={handleExitToMenuFromNetplay}
          onSyncStart={handleSyncStart}
          onSyncPauseToggle={handleSyncPauseToggle}
          onSyncReset={handleSyncReset}
          onSwapTurnOwner={handleSwapTurnOwner}
          onChangeManualDelay={handleChangeManualDelay}
          onForceAuthoritativeResync={() => {
            pushHostAuthoritativeSnapshot('manual');
            flashBanner('Synced match with Player 2');
          }}
          onResetNetplayDebug={handleResetNetplayDebug}
          onOfferRomTransfer={handleOfferRomTransfer}
          onAcceptRomTransfer={handleAcceptRomTransfer}
          onDeclineRomTransfer={handleDeclineRomTransfer}
          onSyncStateNow={() => void handleSyncStateNow()}
          onClose={() => setShowNetplay(false)}
        />
      )}

      <AiGamerComingSoonModal
        open={showAiComingSoon}
        onClose={() => setShowAiComingSoon(false)}
      />
    </div>
  );
}

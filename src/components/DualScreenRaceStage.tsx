import React from 'react';
import {
  Flame,
  Home,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  Zap,
} from 'lucide-react';
import { NES_HEIGHT, NES_TARGET_FPS, NES_WIDTH } from '../emulator/core/INesEmulatorCore';
import { LibretroFceummAdapter } from '../emulator/core/LibretroFceummAdapter';
import { InputManager } from '../emulator/input/InputManager';
import type { ControllerBindings } from '../emulator/input/controllerMappings';
import { AsyncFrameShareGate } from '../emulator/netplay/asyncOutbox';
import type { INetplayTransport, NetplaySessionState } from '../emulator/netplay/INetplayTransport';
import type {
  NesButtonName,
  PlayerPort,
  RaceTelemetryPacket,
} from '../emulator/netplay/protocol';
import {
  ChaosModifierEngine,
  type ActiveChaosTwist,
  type ChaosEngineSnapshot,
} from '../emulator/race/chaosEngine';
import {
  createEmptyManualOverrides,
  createEmptyTelemetry,
  evaluateRaceMatch,
  formatRaceClock,
  readCoreTelemetry,
  resolveRamProfile,
  type ManualJudgeOverrides,
  type PlayerTelemetry,
  type RaceAudioFocus,
  type RaceEvaluation,
  type RaceMatchConfig,
} from '../emulator/race/ramJudge';
import {
  VS_SHARE_HEIGHT,
  VS_SHARE_MIN_INTERVAL_MS,
  VS_SHARE_WIDTH,
  captureCompressedVsFrame,
  resolveVsCorePlan,
  resolveVsShaderPolicy,
  scheduleIdleCaptureTask,
  shouldCaptureRemoteFrame,
} from '../emulator/race/remoteFrameCapture';
import type { FriendRival } from '../emulator/race/rivalryStore';
import type { CrtDisplayMode, VideoFilterMode } from '../emulator/settings/emulatorSettingsStore';
import { RemoteOpponentCanvas } from './EmulatorCanvas';

interface DualScreenRaceStageProps {
  romBytes: Uint8Array;
  romName: string;
  config: RaceMatchConfig;
  bindings: ControllerBindings;
  videoFilter: VideoFilterMode;
  crtMode: CrtDisplayMode;
  audioLatencyMs: 24 | 48 | 96;
  isOnlineVsMode: boolean;
  netplay: NetplaySessionState;
  netplayTransport: INetplayTransport | null;
  remoteTelemetryPacket: RaceTelemetryPacket | null;
  remoteChaosTwist: ActiveChaosTwist | null;
  activeRival: FriendRival | null;
  onRecordResult: (params: {
    winner: PlayerPort | 'draw';
    p1Score: number;
    p2Score: number;
  }) => void;
  onOpenNetplay: () => void;
  onRetryNetplay: () => void;
  onExitRace: () => void;
}

const TOUCH_DIRECTIONS: { label: string; btn: NesButtonName }[] = [
  { label: '◀', btn: 'LEFT' },
  { label: '▶', btn: 'RIGHT' },
  { label: '▲', btn: 'UP' },
  { label: '▼', btn: 'DOWN' },
];

export const DualScreenRaceStage: React.FC<DualScreenRaceStageProps> = ({
  romBytes,
  romName,
  config,
  bindings,
  videoFilter,
  crtMode,
  audioLatencyMs,
  isOnlineVsMode,
  netplay,
  netplayTransport,
  remoteTelemetryPacket,
  remoteChaosTwist,
  activeRival,
  onRecordResult,
  onOpenNetplay,
  onRetryNetplay,
  onExitRace,
}) => {
  const p1CanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const p2CanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const core1Ref = React.useRef<LibretroFceummAdapter | null>(null);
  const core2Ref = React.useRef<LibretroFceummAdapter | null>(null);
  const chaosRef = React.useRef<ChaosModifierEngine>(new ChaosModifierEngine());

  const [audioFocus, setAudioFocus] = React.useState<RaceAudioFocus>('p1');
  const audioFocusRef = React.useRef<RaceAudioFocus>('p1');
  const [isPaused, setIsPaused] = React.useState(false);
  const isPausedRef = React.useRef(false);
  const [matchNonce, setMatchNonce] = React.useState(0);

  const [p1Telemetry, setP1Telemetry] = React.useState<PlayerTelemetry>(() =>
    createEmptyTelemetry(true)
  );
  const [p2Telemetry, setP2Telemetry] = React.useState<PlayerTelemetry>(() =>
    createEmptyTelemetry(true)
  );
  const [manualJudge, setManualJudge] = React.useState<ManualJudgeOverrides>(() =>
    createEmptyManualOverrides()
  );
  const manualJudgeRef = React.useRef<ManualJudgeOverrides>(manualJudge);
  manualJudgeRef.current = manualJudge;

  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [chaosSnapshot, setChaosSnapshot] = React.useState<ChaosEngineSnapshot>({
    enabled: config.chaosEnabled,
    activeTwist: null,
    secondsUntilNextTwist: 0,
    secondsRemaining: 0,
  });
  const [evaluation, setEvaluation] = React.useState<RaceEvaluation>(() =>
    evaluateRaceMatch({
      config,
      p1: createEmptyTelemetry(true),
      p2: createEmptyTelemetry(true),
      p1BaselineLives: 3,
      p2BaselineLives: 3,
      elapsedSeconds: 0,
      manual: createEmptyManualOverrides(),
    })
  );

  const resultRecordedRef = React.useRef(false);
  const p1BaselineLivesRef = React.useRef(3);
  const p2BaselineLivesRef = React.useRef(3);
  const elapsedRef = React.useRef(0);
  const remoteTelemetryRef = React.useRef<RaceTelemetryPacket | null>(null);
  remoteTelemetryRef.current = remoteTelemetryPacket;
  const onRecordResultRef = React.useRef(onRecordResult);
  onRecordResultRef.current = onRecordResult;
  const configRef = React.useRef(config);
  configRef.current = config;
  const netplayTransportRef = React.useRef(netplayTransport);
  netplayTransportRef.current = netplayTransport;
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;
  const inputMgrRef = React.useRef<InputManager | null>(null);

  React.useEffect(() => {
    inputMgrRef.current?.setBindings(bindings);
  }, [bindings]);

  // Strictly treat Online VS Mode as single-core even while connecting/reconnecting so
  // a second FCEUmm core NEVER boots on the local device during Online VS!
  const isOnlineRace =
    isOnlineVsMode ||
    ((netplay.status === 'connected' ||
      netplay.status === 'reconnecting' ||
      netplay.status === 'connecting') &&
      netplay.roomMode === 'dual-race');
  const localOnlinePort: PlayerPort = netplay.assignedPort ?? 1;
  const corePlan = React.useMemo(
    () => resolveVsCorePlan({ isOnlineMode: isOnlineRace, localPort: localOnlinePort }),
    [isOnlineRace, localOnlinePort]
  );
  const hasRemotePeerRef = React.useRef(false);
  hasRemotePeerRef.current = netplay.players.length >= 2;
  // ZERO LOCAL DELAY RULE: In Dual-Screen 1P VS Mode, the local player's FCEUmm core
  // runs 100% independently at 60 FPS and NEVER blocks/freezes on opponent network latency.
  const isOpponentNetworkSlow =
    isOnlineRace && (netplay.status === 'reconnecting' || netplay.holdState.active);

  const ramProfile = React.useMemo(() => resolveRamProfile(romName), [romName]);

  // Apply Audio Focus + Chaos Audio Flip
  const activeTwist = chaosSnapshot.activeTwist;
  const effectiveAudioFocus: RaceAudioFocus = React.useMemo(() => {
    if (activeTwist?.type === 'audio-flip') {
      if (audioFocus === 'p1') return 'p2';
      if (audioFocus === 'p2') return 'p1';
      return 'p2';
    }
    return audioFocus;
  }, [audioFocus, activeTwist?.type]);

  React.useEffect(() => {
    audioFocusRef.current = effectiveAudioFocus;
    core1Ref.current?.setMuted(effectiveAudioFocus !== 'p1');
    core2Ref.current?.setMuted(effectiveAudioFocus !== 'p2');
  }, [effectiveAudioFocus]);

  // Sync incoming remote Chaos twist in online mode
  React.useEffect(() => {
    if (remoteChaosTwist !== undefined && isOnlineRace && localOnlinePort === 2) {
      chaosRef.current.applyRemoteTwist(remoteChaosTwist, performance.now());
      setChaosSnapshot(chaosRef.current.getSnapshot(performance.now()));
    }
  }, [remoteChaosTwist, isOnlineRace, localOnlinePort]);

  // Boot FCEUmm core(s) according to corePlan:
  // - Online Dual-Screen VS Mode: strictly ONE (1) local FCEUmm core; opponent viewport renders
  //   only lightweight incoming remote frames (ZERO second emulator core!).
  // - Local 2P Couch VS: 2 local cores (P1 + P2 on same device).
  React.useEffect(() => {
    let cancelled = false;
    const core1 = corePlan.bootCore1 ? new LibretroFceummAdapter() : null;
    const core2 = corePlan.bootCore2 ? new LibretroFceummAdapter() : null;
    core1Ref.current = core1;
    core2Ref.current = core2;

    if (core1 && p1CanvasRef.current) core1.attachCanvas(p1CanvasRef.current);
    if (core2 && p2CanvasRef.current) core2.attachCanvas(p2CanvasRef.current);
    core1?.setMuted(isOnlineRace ? false : audioFocusRef.current !== 'p1');
    core2?.setMuted(isOnlineRace ? false : audioFocusRef.current !== 'p2');

    void (async () => {
      try {
        const loads: Promise<unknown>[] = [];
        if (core1) loads.push(core1.loadRom(romBytes, romName));
        if (core2) loads.push(core2.loadRom(romBytes, romName));
        await Promise.all(loads);
        if (cancelled) return;
        core1?.setMuted(audioFocusRef.current !== 'p1');
        core2?.setMuted(audioFocusRef.current !== 'p2');
      } catch {
        // Keep stage responsive if core asset is unavailable offline
      }
    })();

    const init1 = core1 ? readCoreTelemetry(core1, ramProfile, 0) : createEmptyTelemetry(true);
    const init2 = core2 ? readCoreTelemetry(core2, ramProfile, 0) : createEmptyTelemetry(true);
    p1BaselineLivesRef.current = Math.max(1, init1.lives);
    p2BaselineLivesRef.current = Math.max(1, init2.lives);
    setP1Telemetry(init1);
    setP2Telemetry(init2);
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    resultRecordedRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setManualJudge(createEmptyManualOverrides());

    const now0 = performance.now();
    chaosRef.current.configure(configRef.current.chaosEnabled, now0);
    setChaosSnapshot(chaosRef.current.getSnapshot(now0));

    // Dual-Port Keyboard + Gamepad input routed directly to local FCEUmm core (ZERO network wait)
    const inputMgr = new InputManager((port, button, pressed) => {
      if (isPausedRef.current) return;

      if (isOnlineRace) {
        if (port === 1) {
          const localCore = corePlan.localPort === 1 ? core1 : core2;
          localCore?.setButton(1, button, pressed);
        }
        return;
      }

      if (port === 1) {
        core1?.setButton(1, button, pressed);
      } else {
        core2?.setButton(1, button, pressed);
      }
    });
    inputMgr.setBindings(bindingsRef.current);
    inputMgr.setEnabled(true);
    inputMgr.attach();
    inputMgrRef.current = inputMgr;

    // Separate low-priority asynchronous opponent screen-share loop:
    // - Strictly throttled to 12 FPS (83ms min interval, within 10-15 FPS)
    // - Low-resolution 128x120 compressed WebP/JPEG (4x fewer pixels than native NES)
    // - Scheduled via idle callback off the 60Hz emulation loop and skipped when solo/backpressured
    const shareGate = new AsyncFrameShareGate(VS_SHARE_MIN_INTERVAL_MS);
    const shareCanvas = document.createElement('canvas');
    shareCanvas.width = VS_SHARE_WIDTH;
    shareCanvas.height = VS_SHARE_HEIGHT;
    const shareCtx = shareCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
    let cancelIdleCapture: (() => void) | null = null;

    const shareTimerId = isOnlineRace
      ? window.setInterval(() => {
          const transport = netplayTransportRef.current;
          if (cancelled || !transport) return;
          const localCore = corePlan.localPort === 1 ? core1 : core2;
          const localCanvas = corePlan.localPort === 1 ? p1CanvasRef.current : p2CanvasRef.current;
          if (!localCore || !localCanvas || !shareCtx) return;

          const nowMs = performance.now();
          if (
            !shouldCaptureRemoteFrame({
              isOnlineMode: isOnlineRace,
              hasRemotePeer: hasRemotePeerRef.current,
              isPaused: isPausedRef.current,
              isFinished: resultRecordedRef.current,
              nowMs,
              gate: shareGate,
            })
          ) {
            return;
          }

          cancelIdleCapture = scheduleIdleCaptureTask(() => {
            if (cancelled) {
              shareGate.markCaptureAborted();
              return;
            }
            const localTel = readCoreTelemetry(localCore, ramProfile, elapsedRef.current);
            const frameNum = localCore.getFrameCount();
            void captureCompressedVsFrame(localCanvas, shareCanvas, shareCtx, () => cancelled).then(
              (previewDataUrl) => {
                if (cancelled) {
                  shareGate.markCaptureAborted();
                  return;
                }
                shareGate.markCaptureComplete();
                netplayTransportRef.current?.sendRaceTelemetry({
                  port: corePlan.localPort,
                  telemetry: localTel,
                  frame: frameNum,
                  previewDataUrl,
                });
              }
            );
          });
        }, VS_SHARE_MIN_INTERVAL_MS)
      : null;

    // Pure 60.0988Hz Local Emulation Loop — 100% independent of network/remote screen state
    const frameMs = 1000 / NES_TARGET_FPS;
    let accumulator = 0;
    let lastTime = performance.now();
    let lastUiSync = lastTime;
    let turboPulseFrame = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      const paused = isPausedRef.current || resultRecordedRef.current;

      if (!paused) {
        inputMgr.pollGamepads();
        accumulator += dt;
        elapsedRef.current += dt / 1000;

        const canTriggerChaos = !isOnlineRace || corePlan.localPort === 1;
        const { snapshot: chaosSnap, newlyTriggered } = chaosRef.current.tick(
          now,
          canTriggerChaos
        );
        if (newlyTriggered && isOnlineRace && corePlan.localPort === 1) {
          queueMicrotask(() => {
            netplayTransportRef.current?.broadcastChaos(newlyTriggered);
          });
        }

        let steps = 0;
        while (accumulator >= frameMs && steps < 3) {
          if (chaosSnap.activeTwist?.type === 'turbo-pulse') {
            turboPulseFrame += 1;
            const pulseOn = turboPulseFrame % 4 < 2;
            core1?.setButton(1, 'A', pulseOn);
            core2?.setButton(1, 'A', pulseOn);
          } else if (turboPulseFrame > 0) {
            turboPulseFrame = 0;
            core1?.setButton(1, 'A', false);
            core2?.setButton(1, 'A', false);
          }

          core1?.stepFrame();
          core2?.stepFrame();

          accumulator -= frameMs;
          steps += 1;
        }

        // Update HUD telemetry & Judge evaluation at 5Hz (lightweight UI updates)
        if (now - lastUiSync >= 200) {
          lastUiSync = now;
          const elapsed = elapsedRef.current;
          setElapsedSeconds(elapsed);
          setChaosSnapshot(chaosSnap);

          let t1 = core1 ? readCoreTelemetry(core1, ramProfile, elapsed) : createEmptyTelemetry(true);
          let t2 = core2 ? readCoreTelemetry(core2, ramProfile, elapsed) : createEmptyTelemetry(true);

          const remotePkt = remoteTelemetryRef.current;
          if (isOnlineRace && remotePkt) {
            if (corePlan.localPort === 1 && remotePkt.port === 2) {
              t2 = remotePkt.telemetry;
            } else if (corePlan.localPort === 2 && remotePkt.port === 1) {
              t1 = remotePkt.telemetry;
            }
          }

          setP1Telemetry(t1);
          setP2Telemetry(t2);

          const nextEval = evaluateRaceMatch({
            config: configRef.current,
            p1: t1,
            p2: t2,
            p1BaselineLives: p1BaselineLivesRef.current,
            p2BaselineLives: p2BaselineLivesRef.current,
            elapsedSeconds: elapsed,
            manual: manualJudgeRef.current,
          });
          setEvaluation(nextEval);

          if (nextEval.finished && nextEval.winner && !resultRecordedRef.current) {
            resultRecordedRef.current = true;
            core1?.pause();
            core2?.pause();
            onRecordResultRef.current({
              winner: nextEval.winner,
              p1Score: nextEval.p1EffectiveScore,
              p2Score: nextEval.p2EffectiveScore,
            });
          }
        }
      } else {
        accumulator = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      if (shareTimerId !== null) window.clearInterval(shareTimerId);
      cancelIdleCapture?.();
      inputMgr.detach();
      inputMgrRef.current = null;
      core1?.dispose();
      core2?.dispose();
      core1Ref.current = null;
      core2Ref.current = null;
    };
  }, [
    romBytes,
    romName,
    ramProfile,
    isOnlineRace,
    corePlan.bootCore1,
    corePlan.bootCore2,
    corePlan.localPort,
    matchNonce,
  ]);

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      if (next) {
        core1Ref.current?.pause();
        core2Ref.current?.pause();
      } else {
        core1Ref.current?.resume();
        core2Ref.current?.resume();
      }
      return next;
    });
  };

  const handleRematch = () => {
    setMatchNonce((n) => n + 1);
  };

  const handleTouchButton = (port: PlayerPort, btn: NesButtonName, pressed: boolean) => {
    if (isPausedRef.current) return;
    const core = port === 1 ? core1Ref.current : core2Ref.current;
    core?.setButton(1, btn, pressed);
  };

  const handleTriggerChaosNow = () => {
    const twist = chaosRef.current.triggerNow(performance.now());
    setChaosSnapshot(chaosRef.current.getSnapshot(performance.now()));
    if (isOnlineRace && localOnlinePort === 1) {
      netplayTransport?.broadcastChaos(twist);
    }
  };

  const applyManualOverride = (updater: (prev: ManualJudgeOverrides) => ManualJudgeOverrides) => {
    setManualJudge((prev) => {
      const next = updater(prev);
      manualJudgeRef.current = next;
      const evalNow = evaluateRaceMatch({
        config,
        p1: p1Telemetry,
        p2: p2Telemetry,
        p1BaselineLives: p1BaselineLivesRef.current,
        p2BaselineLives: p2BaselineLivesRef.current,
        elapsedSeconds,
        manual: next,
      });
      setEvaluation(evalNow);
      if (evalNow.finished && evalNow.winner && !resultRecordedRef.current) {
        resultRecordedRef.current = true;
        core1Ref.current?.setMuted?.(true);
        core2Ref.current?.setMuted?.(true);
        onRecordResult({
          winner: evalNow.winner,
          p1Score: evalNow.p1EffectiveScore,
          p2Score: evalNow.p2EffectiveScore,
        });
      }
      return next;
    });
  };

  // Automatically bypass heavy CRT/PVM shaders & CSS color filters in Dual-Screen VS Mode
  // so local gameplay runs directly on the GPU canvas at locked 60 FPS.
  const shaderPolicy = React.useMemo(
    () => resolveVsShaderPolicy(videoFilter, crtMode),
    [videoFilter, crtMode]
  );
  const canvasFilterClass = shaderPolicy.canvasFilterClass;

  const screensSwapped = activeTwist?.type === 'screen-swap';

  const renderPlayerViewport = (port: PlayerPort) => {
    const isP1 = port === 1;
    const isLeading = evaluation.leader === port;
    const tel = isP1 ? p1Telemetry : p2Telemetry;
    const effectiveScore = isP1 ? evaluation.p1EffectiveScore : evaluation.p2EffectiveScore;
    const effectiveLives = isP1 ? evaluation.p1EffectiveLives : evaluation.p2EffectiveLives;
    const stageNum = isP1 ? evaluation.p1StageProgress : evaluation.p2StageProgress;
    const playerName = isP1 ? config.p1Name : config.p2Name;
    const isRemoteStream = isOnlineRace && localOnlinePort !== port;
    const remotePreview =
      isRemoteStream && remoteTelemetryPacket?.port === port
        ? remoteTelemetryPacket.previewDataUrl
        : null;
    const isAudioOwner = effectiveAudioFocus === (isP1 ? 'p1' : 'p2');

    const isLocalTouchOwner = isOnlineRace ? port === localOnlinePort : isP1;

    return (
      <div
        data-testid={`race-screen-p${port}`}
        className={`relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-2 pt-9 sm:py-2 transition-colors ${
          isLocalTouchOwner ? 'pb-12 sm:pb-2' : 'pb-2'
        } ${
          isLeading
            ? isP1
              ? 'bg-[#171115]'
              : 'bg-[#18150F]'
            : 'bg-[#0C0E12]'
        }`}
      >
        {/* Screen Corner Identity + AHEAD 🔥 Tag */}
        <div className="pointer-events-none absolute top-1.5 right-3 left-3 z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#14171F]/92 px-2.5 py-1 text-[11px] shadow-md">
            <span
              className={`font-display font-extrabold ${
                isP1 ? 'text-[#E03131]' : 'text-[#F59E0B]'
              }`}
            >
              P{port}
            </span>
            <span className="max-w-[110px] truncate font-semibold text-[#F4F1EA]">
              {playerName}
            </span>
            {isAudioOwner && (
              <Volume2 className="h-3 w-3 text-[#34D399]" aria-label="Audio Focus Active" />
            )}
            {isRemoteStream && (
              <span className="font-mono-tabular text-[10px] text-[#93C5FD]">LIVE STREAM</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isLeading && (
              <span
                data-testid={`ahead-badge-p${port}`}
                className="inline-flex items-center gap-1 rounded-md border border-[#F59E0B]/70 bg-[#C82333] px-2 py-0.5 font-display text-[11px] font-extrabold tracking-wide text-white shadow-md"
              >
                <span>AHEAD 🔥</span>
              </span>
            )}
            <div className="font-mono-tabular flex items-center gap-2 rounded-md border border-white/10 bg-[#14171F]/92 px-2.5 py-1 text-[11px] text-[#ECEAE4]">
              <span>PTS {effectiveScore.toLocaleString()}</span>
              {ramProfile.isRamMapped && (
                <>
                  <span className="text-white/25">·</span>
                  <span>C {tel.coins}</span>
                  <span className="text-white/25">·</span>
                  <span>S{stageNum}</span>
                  <span className="text-white/25">·</span>
                  <span>♥{effectiveLives}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 4:3 CRT NES Screen */}
        <div
          className={`relative flex max-h-full max-w-full items-center justify-center rounded-lg border-2 bg-black p-1 shadow-xl ${
            isLeading
              ? isP1
                ? 'border-[#C82333]'
                : 'border-[#F59E0B]'
              : 'border-white/12'
          }`}
          style={{ aspectRatio: '4 / 3', width: 'min(100%, 540px)', maxHeight: '100%' }}
        >
          <div className="relative h-full w-full overflow-hidden rounded bg-black">
            {isRemoteStream ? (
              <RemoteOpponentCanvas
                previewDataUrl={remotePreview ?? null}
                alt={`Player ${port} live opponent screen`}
                emptyMessage={
                  isOpponentNetworkSlow
                    ? 'Opponent network slow — Your game stays at 60 FPS'
                    : 'Waiting for opponent screen preview...'
                }
                testId={`race-remote-canvas-p${port}`}
              />
            ) : (
              <canvas
                ref={isP1 ? p1CanvasRef : p2CanvasRef}
                width={NES_WIDTH}
                height={NES_HEIGHT}
                data-testid={`race-canvas-p${port}`}
                data-core-canvas="true"
                className={`${canvasFilterClass} block h-full w-full`}
              />
            )}
          </div>
        </div>

        {/* Compact Touch Quick-Controls on Mobile for Local Active Player */}
        {isLocalTouchOwner && (
          <div className="absolute right-2 bottom-1.5 left-2 z-10 flex items-center justify-between sm:hidden">
            <div className="flex gap-1">
              {TOUCH_DIRECTIONS.map((d) => (
                <button
                  key={d.btn}
                  type="button"
                  onPointerDown={() => handleTouchButton(port, d.btn, true)}
                  onPointerUp={() => handleTouchButton(port, d.btn, false)}
                  onPointerLeave={() => handleTouchButton(port, d.btn, false)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-[#1B1E27]/90 text-xs font-bold text-white"
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onPointerDown={() => handleTouchButton(port, 'B', true)}
                onPointerUp={() => handleTouchButton(port, 'B', false)}
                onPointerLeave={() => handleTouchButton(port, 'B', false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E03131] bg-[#B41E2D] text-xs font-extrabold text-white"
              >
                B
              </button>
              <button
                type="button"
                onPointerDown={() => handleTouchButton(port, 'A', true)}
                onPointerUp={() => handleTouchButton(port, 'A', false)}
                onPointerLeave={() => handleTouchButton(port, 'A', false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E03131] bg-[#C82333] text-xs font-extrabold text-white"
              >
                A
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="dual-screen-race-stage"
      data-active-cores={corePlan.activeCoreCount}
      data-crt-bypassed={shaderPolicy.bypassCrtShaders ? 'true' : 'false'}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#0C0E12] text-[#F4F1EA]"
    >
      {/* Top Live Mini-HUD Bar (Timer · AHEAD 🔥 · Audio Focus · Chaos · Controls) */}
      <div
        role="region"
        aria-label="Dual-Screen VS Race Live Mini-HUD"
        className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-[#14171F] px-3 py-2 shadow-xl"
      >
        {/* Left: Match Mode + Clock + Lead Status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xs font-extrabold tracking-wider text-[#E03131]">
            VS RACE
          </span>
          <span className="font-mono-tabular inline-flex items-center gap-1 rounded border border-white/12 bg-[#0E1014] px-2 py-0.5 text-xs font-bold text-[#FCD34D]">
            <Timer className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
            <span>{formatRaceClock(evaluation.remainingSeconds)}</span>
          </span>
          <span className="font-mono-tabular hidden text-[11px] text-[#B8B3A8] md:inline">
            {evaluation.leadMetricLabel}
          </span>

          {/* Audio Focus Switch (P1 / P2 / Mute) */}
          <div
            className="flex items-center rounded-md border border-white/10 bg-[#0E1014] p-0.5"
            role="group"
            aria-label="Dual-Screen Audio Focus"
          >
            {(
              [
                { id: 'p1', label: 'P1' },
                { id: 'p2', label: 'P2' },
                { id: 'mute', label: 'Mute' },
              ] as const
            ).map((opt) => {
              const active = effectiveAudioFocus === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAudioFocus(opt.id)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-[#C82333] text-white'
                      : 'text-[#8E8A82] hover:text-white'
                  }`}
                >
                  {opt.id === 'mute' ? (
                    <span className="inline-flex items-center gap-1">
                      <VolumeX className="h-3 w-3" aria-hidden="true" />
                      <span>Mute</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Volume2 className="h-3 w-3" aria-hidden="true" />
                      <span>{opt.label}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Active Chaos Modifier OR Universal Fallback Judge Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {chaosSnapshot.activeTwist ? (
            <div
              data-testid="active-chaos-banner"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#F59E0B] bg-[#2D1E0B] px-2.5 py-1 text-[11px] font-bold text-[#FCD34D]"
            >
              <Zap className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>
                {chaosSnapshot.activeTwist.label} ({chaosSnapshot.secondsRemaining}s)
              </span>
            </div>
          ) : config.chaosEnabled ? (
            <button
              type="button"
              onClick={handleTriggerChaosNow}
              className="tactile-press inline-flex items-center gap-1 rounded-md border border-[#F59E0B]/35 bg-[#201A12] px-2 py-1 text-[10px] font-semibold text-[#F5D28C] hover:border-[#F59E0B]/70"
            >
              <Sparkles className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
              <span>Chaos in {chaosSnapshot.secondsUntilNextTwist}s</span>
            </button>
          ) : null}

          {/* Universal Fallback Judge Quick Buttons when ROM RAM is unmapped */}
          {!ramProfile.isRamMapped && (
            <div className="flex items-center gap-1 rounded-md border border-[#F59E0B]/30 bg-[#1B1813] px-1.5 py-0.5 text-[10px]">
              <span className="font-semibold text-[#F5D28C]">Judge:</span>
              <button
                type="button"
                onClick={() =>
                  applyManualOverride((p) => ({ ...p, p1BonusScore: p.p1BonusScore + 100 }))
                }
                className="rounded bg-[#2A171B] px-1.5 py-0.5 font-semibold text-[#FCA5A5] hover:bg-[#3A1E24]"
              >
                P1 +100
              </button>
              <button
                type="button"
                onClick={() =>
                  applyManualOverride((p) => ({ ...p, p2BonusScore: p.p2BonusScore + 100 }))
                }
                className="rounded bg-[#2B2314] px-1.5 py-0.5 font-semibold text-[#FCD34D] hover:bg-[#3B301B]"
              >
                P2 +100
              </button>
              <button
                type="button"
                onClick={() =>
                  applyManualOverride((p) => ({
                    ...p,
                    manualWinner:
                      evaluation.p1EffectiveScore >= evaluation.p2EffectiveScore ? 1 : 2,
                    manualReason: 'Match Judge Decision',
                  }))
                }
                className="rounded bg-[#C82333] px-1.5 py-0.5 font-bold text-white"
              >
                Crown
              </button>
            </div>
          )}
        </div>

        {/* Right: Netplay Channel Badge + Pause + Rematch + Exit */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenNetplay}
            className={`tactile-press inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-semibold ${
              isOnlineRace
                ? 'border-[#34D399]/50 bg-[#12261E] text-[#6EE7B7]'
                : 'border-white/12 bg-[#1D2028] text-[#C8C3B8] hover:text-white'
            }`}
          >
            <Radio className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
            <span>
              {isOnlineRace ? `${netplay.roomCode} · Live` : 'Online'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleTogglePause}
            aria-label={isPaused ? 'Resume Race' : 'Pause Race'}
            className="tactile-press inline-flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-[#1D2028] text-[#F4F1EA] hover:bg-[#272B36]"
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handleRematch}
            aria-label="Rematch"
            className="tactile-press inline-flex h-7 items-center gap-1 rounded border border-white/12 bg-[#1D2028] px-2 text-[10px] font-semibold text-[#F4F1EA] hover:bg-[#272B36]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Rematch</span>
          </button>

          <button
            type="button"
            onClick={onExitRace}
            aria-label="Exit VS Race"
            className="tactile-press inline-flex h-7 items-center gap-1 rounded border border-[#E03131]/40 bg-[#261619] px-2 text-[10px] font-semibold text-[#FCA5A5] hover:bg-[#351D22]"
          >
            <Home className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Responsive Split Viewports: Side-by-side on Landscape/Desktop, Stacked Top/Bottom on Portrait */}
      <div className="flex min-h-0 flex-1 flex-col divide-y divide-white/10 md:flex-row md:divide-x md:divide-y-0">
        {renderPlayerViewport(screensSwapped ? 2 : 1)}
        {renderPlayerViewport(screensSwapped ? 1 : 2)}
      </div>

      {/* Non-Blocking Opponent Network Slow Banner (NEVER pauses local 60 FPS gameplay!) */}
      {isOpponentNetworkSlow && !evaluation.finished && (
        <div
          role="status"
          aria-live="polite"
          data-testid="dual-race-nonblocking-reconnect"
          className="pointer-events-auto absolute right-3 bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-[#F59E0B]/50 bg-[#171A22]/95 px-3.5 py-2 shadow-2xl"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
          <span className="text-xs font-medium text-[#FDE68A]">
            Opponent reconnecting · Local 60 FPS unaffected
          </span>
          <button
            type="button"
            onClick={onRetryNetplay}
            className="tactile-press rounded-md bg-[#F59E0B] px-2.5 py-1 text-[11px] font-bold text-[#070910] hover:bg-[#FBBF24]"
          >
            Retry Now
          </button>
          <button
            type="button"
            onClick={onExitRace}
            className="tactile-press rounded-md border border-white/20 bg-[#141926] px-2.5 py-1 text-[11px] font-semibold text-white hover:border-white/40"
          >
            Exit to Menu
          </button>
        </div>
      )}

      {/* Clear Match Winner Declaration Modal */}
      {evaluation.finished && evaluation.winner && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="race-winner-overlay"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4"
        >
          <div className="w-full max-w-md rounded-xl border-2 border-[#F59E0B]/70 bg-[#151820] p-6 text-center shadow-2xl shadow-black/90">
            <Trophy className="mx-auto mb-2.5 h-10 w-10 text-[#F59E0B]" aria-hidden="true" />
            <div className="font-mono-tabular text-[11px] font-semibold tracking-widest text-[#F59E0B] uppercase">
              VS MATCH COMPLETE
            </div>
            <h2 className="font-display mt-1 text-2xl font-extrabold text-[#F4F1EA]">
              {evaluation.winner === 'draw'
                ? 'PHOTO FINISH DRAW!'
                : evaluation.winner === 1
                  ? `${config.p1Name.toUpperCase()} WINS!`
                  : `${config.p2Name.toUpperCase()} WINS!`}
            </h2>
            <p className="mt-1.5 text-xs text-[#C8C3B8]">{evaluation.winReason}</p>

            {/* Score Breakdown */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg border border-white/10 bg-[#0E1014] p-3">
              <div>
                <div className="text-[11px] font-bold text-[#E03131]">{config.p1Name}</div>
                <div className="font-mono-tabular mt-0.5 text-lg font-extrabold text-white">
                  {evaluation.p1EffectiveScore.toLocaleString()}
                </div>
                <div className="font-mono-tabular text-[10px] text-[#8E8A82]">
                  Stage {evaluation.p1StageProgress} · ♥{evaluation.p1EffectiveLives}
                </div>
              </div>
              <div className="border-l border-white/10">
                <div className="text-[11px] font-bold text-[#F59E0B]">{config.p2Name}</div>
                <div className="font-mono-tabular mt-0.5 text-lg font-extrabold text-white">
                  {evaluation.p2EffectiveScore.toLocaleString()}
                </div>
                <div className="font-mono-tabular text-[10px] text-[#8E8A82]">
                  Stage {evaluation.p2StageProgress} · ♥{evaluation.p2EffectiveLives}
                </div>
              </div>
            </div>

            {activeRival && (
              <div className="font-mono-tabular mt-3 text-[11px] text-[#9C978E]">
                Rivalry vs {activeRival.name}:{' '}
                <strong className="text-[#FCD34D]">
                  {activeRival.wins}W - {activeRival.losses}L
                </strong>{' '}
                · Best {activeRival.highScore.toLocaleString()} pts
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleRematch}
                className="tactile-press inline-flex h-10 items-center gap-2 rounded-lg bg-[#C82333] px-5 font-display text-xs font-extrabold text-white hover:bg-[#DC2C3D]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Rematch</span>
              </button>
              <button
                type="button"
                onClick={onExitRace}
                className="tactile-press inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-[#1F232D] px-4 text-xs font-semibold text-[#ECEAE4] hover:bg-[#2A2F3B]"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Back to Shelf</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

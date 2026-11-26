/**
 * Zero-dependency Web Audio API ring-buffer output engine for NES APU samples.
 * Decoupled from React and from the emulator core implementation.
 */
export class NesAudioEngine {
  private audioCtx: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;

  private readonly bufferCapacity = 16384;
  private readonly leftRing = new Float32Array(16384);
  private readonly rightRing = new Float32Array(16384);
  private writePtr = 0;
  private readPtr = 0;
  private available = 0;

  private muted = false;
  private volume = 0.75;
  private audioFocus: 'standard' | 'game-focus' | 'voice-duck' | 'muted' = 'standard';
  private maxBufferedSamples = 2048;

  private computeEffectiveGain(): number {
    if (this.muted || this.audioFocus === 'muted') return 0;
    if (this.audioFocus === 'voice-duck') return this.volume * 0.35;
    if (this.audioFocus === 'game-focus') return Math.min(1, this.volume * 1.15);
    return this.volume;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioCtxCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxCtor) return;

      this.audioCtx = new AudioCtxCtor({ sampleRate: 44100 });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.computeEffectiveGain();

      // 1024-sample stereo script processor provides reliable low-latency playback across browsers
      this.scriptNode = this.audioCtx.createScriptProcessor(1024, 0, 2);
      this.scriptNode.onaudioprocess = (event) => {
        const outL = event.outputBuffer.getChannelData(0);
        const outR = event.outputBuffer.getChannelData(1);
        const len = outL.length;

        if (this.muted || this.audioFocus === 'muted' || this.available === 0) {
          outL.fill(0);
          outR.fill(0);
          return;
        }

        const mask = this.bufferCapacity - 1;
        for (let i = 0; i < len; i++) {
          if (this.available > 0) {
            outL[i] = this.leftRing[this.readPtr];
            outR[i] = this.rightRing[this.readPtr];
            this.readPtr = (this.readPtr + 1) & mask;
            this.available -= 1;
          } else {
            outL[i] = 0;
            outR[i] = 0;
          }
        }
      };

      this.scriptNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public pushSample(left: number, right: number): void {
    if (this.muted || this.audioFocus === 'muted') return;
    const mask = this.bufferCapacity - 1;
    this.leftRing[this.writePtr] = left;
    this.rightRing[this.writePtr] = right;
    this.writePtr = (this.writePtr + 1) & mask;
    if (this.available < this.maxBufferedSamples) {
      this.available += 1;
    } else {
      this.readPtr = (this.readPtr + 1) & mask;
    }
  }

  public flush(): void {
    this.writePtr = 0;
    this.readPtr = 0;
    this.available = 0;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.flush();
    }
    if (this.gainNode) {
      this.gainNode.gain.value = this.computeEffectiveGain();
    }
  }

  public isMuted(): boolean {
    return this.muted || this.audioFocus === 'muted';
  }

  public setAudioFocus(mode: 'standard' | 'game-focus' | 'voice-duck' | 'muted'): void {
    this.audioFocus = mode;
    if (mode === 'muted') {
      this.flush();
    }
    if (this.gainNode) {
      this.gainNode.gain.value = this.computeEffectiveGain();
    }
  }

  public setAudioLatencyMs(latencyMs: 24 | 48 | 96): void {
    // 44.1 samples per ms -> bound queued audio ring samples to match chosen latency budget
    const samples = Math.round(44.1 * latencyMs);
    this.maxBufferedSamples = Math.max(1024, Math.min(this.bufferCapacity, samples));
    if (this.available > this.maxBufferedSamples) {
      const excess = this.available - this.maxBufferedSamples;
      this.readPtr = (this.readPtr + excess) & (this.bufferCapacity - 1);
      this.available = this.maxBufferedSamples;
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.computeEffectiveGain();
    }
  }

  public suspend(): void {
    this.flush();
    if (this.audioCtx && this.audioCtx.state === 'running') {
      void this.audioCtx.suspend();
    }
  }

  public resume(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended' && !this.muted) {
      void this.audioCtx.resume();
    }
  }

  public dispose(): void {
    this.flush();
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode.onaudioprocess = null;
      this.scriptNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

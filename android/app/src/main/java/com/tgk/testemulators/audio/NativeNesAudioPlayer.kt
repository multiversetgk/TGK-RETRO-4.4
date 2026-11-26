package com.tgk.testemulators.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.max

/**
 * Low-latency native Android AudioTrack output for stereo PCM-16 NES APU audio
 * with configurable latency budget and Audio Focus gain multiplier.
 */
class NativeNesAudioPlayer {

    private var audioTrack: AudioTrack? = null
    private var currentSampleRate: Int = 44100
    private var currentLatencyMs: Int = 48

    @Volatile
    var isMuted: Boolean = false
        private set

    @Volatile
    private var focusGain: Float = 1.0f

    fun start(sampleRate: Int = 44100, latencyMs: Int = 48) {
        val targetRate = sampleRate.coerceIn(22050, 48000)
        val targetLatency = latencyMs.coerceIn(24, 96)
        if (audioTrack != null && currentSampleRate == targetRate && currentLatencyMs == targetLatency) {
            if (audioTrack?.playState != AudioTrack.PLAYSTATE_PLAYING) {
                audioTrack?.play()
            }
            return
        }

        release()
        currentSampleRate = targetRate
        currentLatencyMs = targetLatency

        val minBufBytes = AudioTrack.getMinBufferSize(
            targetRate,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        // Stereo 16-bit = 4 bytes per frame
        val desiredBytes = ((targetRate * targetLatency) / 1000) * 4
        val bufferBytes = max(minBufBytes, max(desiredBytes, 4096))

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()

        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(targetRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
            .build()

        val track = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferBytes)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        track.setVolume(if (isMuted) 0f else focusGain)
        track.play()
        audioTrack = track
    }

    fun writeStereoPcm(samples: ShortArray, sampleCount: Int) {
        if (sampleCount <= 0 || isMuted || focusGain <= 0.001f) return
        val track = audioTrack ?: return
        if (track.playState == AudioTrack.PLAYSTATE_PLAYING) {
            track.write(samples, 0, sampleCount, AudioTrack.WRITE_NON_BLOCKING)
        }
    }

    fun setAudioFocusGain(gain: Float) {
        focusGain = gain.coerceIn(0f, 1f)
        isMuted = focusGain <= 0.001f
        audioTrack?.setVolume(if (isMuted) 0f else focusGain)
    }

    fun setMuted(muted: Boolean) {
        isMuted = muted
        audioTrack?.setVolume(if (muted) 0f else focusGain)
    }

    fun pause() {
        runCatching { audioTrack?.pause() }
    }

    fun resume() {
        runCatching { audioTrack?.play() }
    }

    fun release() {
        runCatching {
            audioTrack?.pause()
            audioTrack?.flush()
            audioTrack?.release()
        }
        audioTrack = null
    }
}

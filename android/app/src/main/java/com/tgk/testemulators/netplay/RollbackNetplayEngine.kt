package com.tgk.testemulators.netplay

import com.tgk.testemulators.core.IEmulatorCore
import com.tgk.testemulators.core.PlayerPort
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

enum class ConnectionQuality(val label: String) {
    GOOD("Good"),
    FAIR("Fair"),
    POOR("Poor"),
    UNSTABLE("Unstable"),
    UNKNOWN("Measuring")
}

enum class ChecksumSyncStatus(val label: String) {
    IDLE("Pending"),
    VERIFIED("Verified"),
    DESYNCED("Desync"),
    RECOVERING("Recovering")
}

enum class ClockAlignmentAction(val label: String) {
    IN_SYNC("Aligned"),
    HOLD_AHEAD("Holding Ahead"),
    CATCH_UP("Catching Up"),
    AUTHORITATIVE_RESYNC("Authoritative Resync")
}

data class SyncPulseReceiveResult(
    val pulseId: Int,
    val driftMs: Int,
    val frameDrift: Double,
    val alignmentForced: Boolean,
    val action: ClockAlignmentAction,
    val holdFrames: Int,
    val catchUpFrames: Int,
    val needsAuthoritativeResync: Boolean
)

data class RollbackMetrics(
    val currentFrame: Int,
    val confirmedFrame: Int,
    val remoteLatestFrame: Int,
    val frameAdvantage: Int,
    val inputDelayFrames: Int,
    val adaptiveDelay: Boolean,
    val pingMs: Int?,
    val jitterMs: Int,
    val quality: ConnectionQuality,
    val rollbackCount: Int,
    val lastRollbackDepth: Int,
    val maxRollbackDepth: Int,
    val desyncCount: Int,
    val recoveryCount: Int,
    val syncStatus: ChecksumSyncStatus,
    val lastVerifiedFrame: Int,
    val throttledFrames: Int,
    val clockDriftMs: Int,
    val clockAligned: Boolean,
    val syncPulseCount: Int,
    val clockAlignmentCount: Int,
    val pendingClockHoldFrames: Int,
    val pendingClockCatchUpFrames: Int,
    val turnBasedSharedPort1: Boolean,
    val activeTurnPort: PlayerPort
)

data class StepResult(
    val stepped: Boolean,
    val throttled: Boolean,
    val clockAlignmentHold: Boolean,
    val frame: Int,
    val renderedFrame: Boolean,
    val outgoingPort: PlayerPort,
    val outgoingLatestFrame: Int,
    val outgoingAckFrame: Int,
    val outgoingInputs: List<FrameInputEntry>,
    val outgoingChecksum: Pair<Int, String>?,
    val outgoingSyncPulse: SyncPulsePacket?
)

data class RemoteInputApplyResult(
    val rolledBack: Boolean,
    val rollbackDepth: Int,
    val needsAuthoritativeResync: Boolean
)

/**
 * TGK RETRO 2.0 Native Android Deterministic Rollback Netcode Engine.
 *
 * Operates exclusively via per-frame 8-bit controller bitmasks, native C++ binary save-state
 * ring buffers, silent rollback re-simulation, periodic state checksum comparison, adaptive
 * input delay, and automatic authoritative desync recovery (never screen streaming).
 */
class RollbackNetplayEngine(
    private val core: IEmulatorCore,
    private val maxRollbackWindow: Int = 8
) {
    private val lock = Any()

    private var localPort: PlayerPort = PlayerPort.PORT_1
    private var remotePort: PlayerPort = PlayerPort.PORT_2
    private var turnBasedSharedPort1: Boolean = false
    private var activeTurnPort: PlayerPort = PlayerPort.PORT_1

    private var currentFrame: Int = 0
    private var confirmedFrame: Int = -1
    private var remoteLatestFrame: Int = -1
    private var lastSentChecksumFrame: Int = -1

    private val localInputs = HashMap<Int, Int>(64)
    private val remoteInputs = HashMap<Int, Int>(64)
    private val predictedRemoteInputs = HashMap<Int, Int>(32)
    private val stateSnapshots = HashMap<Int, ByteArray>(24)
    private val confirmedChecksums = HashMap<Int, String>(16)
    private val pendingRemoteChecksums = HashMap<Int, String>(16)

    private var lastConfirmedRemoteMask: Int = 0
    private var rollbackCount: Int = 0
    private var lastRollbackDepth: Int = 0
    private var maxRollbackDepth: Int = 0
    private var desyncCount: Int = 0
    private var recoveryCount: Int = 0
    private var throttledFrames: Int = 0
    private var syncStatus: ChecksumSyncStatus = ChecksumSyncStatus.IDLE
    private var lastVerifiedFrame: Int = -1

    // Adaptive delay & RTT/jitter tracker
    private var smoothedRttMs: Int? = null
    private var lastRttMs: Int? = null
    private var jitterMs: Int = 0
    private var recommendedDelay: Int = 2
    private var manualDelay: Int? = null
    private var stableLowSamples: Int = 0

    // Periodic Network Sync Pulse & >200ms Clock Drift Alignment state
    private var syncPulseIntervalMs: Long = SYNC_PULSE_INTERVAL_MS
    private var syncPulseDriftThresholdMs: Int = SYNC_PULSE_DRIFT_THRESHOLD_MS
    private var syncPulseSeq: Int = 0
    private var lastSyncPulseSentAtMs: Long? = null
    private var syncPulseCount: Int = 0
    private var clockAlignmentCount: Int = 0
    private var lastClockDriftMs: Int = 0
    private var baselineWallOffsetMs: Double? = null
    private var pendingClockHoldFrames: Int = 0
    private var remoteFrameAtHoldStart: Int = -1
    private var pendingClockCatchUpFrames: Int = 0

    fun configureSession(
        localPort: PlayerPort,
        turnBasedSharedPort1: Boolean = false,
        initialFrame: Int = 0
    ) = synchronized(lock) {
        this.localPort = localPort
        this.remotePort = if (localPort == PlayerPort.PORT_1) PlayerPort.PORT_2 else PlayerPort.PORT_1
        this.turnBasedSharedPort1 = turnBasedSharedPort1
        this.activeTurnPort = PlayerPort.PORT_1
        resetTimelineLocked(initialFrame)
    }

    fun setTurnOwner(port: PlayerPort) = synchronized(lock) {
        activeTurnPort = port
    }

    fun setManualInputDelay(frames: Int?) = synchronized(lock) {
        manualDelay = frames?.coerceIn(0, 8)
    }

    fun recordRttMs(rttMs: Int): Int = synchronized(lock) {
        val clamped = rttMs.coerceIn(1, 2000)
        val prevSmooth = smoothedRttMs
        if (prevSmooth == null) {
            smoothedRttMs = clamped
            jitterMs = 0
        } else {
            val diff = abs(clamped - (lastRttMs ?: clamped))
            jitterMs = ((jitterMs * 3) + diff) / 4
            smoothedRttMs = ((prevSmooth * 3) + clamped) / 4
        }
        lastRttMs = clamped

        val effectiveOneWayMs = (smoothedRttMs ?: clamped) * 0.5 + jitterMs * 0.6
        val target = ceil(effectiveOneWayMs / NES_FRAME_MS).toInt().coerceIn(1, 6)
        when {
            target > recommendedDelay -> {
                recommendedDelay = target
                stableLowSamples = 0
            }
            target < recommendedDelay -> {
                stableLowSamples += 1
                if (stableLowSamples >= 4) {
                    recommendedDelay = max(target, recommendedDelay - 1)
                    stableLowSamples = 0
                }
            }
            else -> stableLowSamples = 0
        }
        activeDelayLocked()
    }

    fun resetTimeline(startFrame: Int = 0) = synchronized(lock) {
        resetTimelineLocked(startFrame)
    }

    private var lastScheduledLocalFrame: Int = -1

    fun getPendingClockCatchUpFrames(): Int = synchronized(lock) { pendingClockCatchUpFrames }

    private fun buildSyncPulseIfDueLocked(nowMs: Long): SyncPulsePacket? {
        val last = lastSyncPulseSentAtMs
        if (last == null || nowMs - last >= syncPulseIntervalMs) {
            syncPulseSeq += 1
            lastSyncPulseSentAtMs = nowMs
            return SyncPulsePacket(
                pulseId = syncPulseSeq,
                port = localPort,
                frame = currentFrame,
                sentAtMs = nowMs
            )
        }
        return null
    }

    fun receiveSyncPulse(
        pulse: SyncPulsePacket,
        receivedAtMs: Long = System.currentTimeMillis()
    ): SyncPulseReceiveResult = synchronized(lock) {
        if (pulse.port != remotePort) {
            return SyncPulseReceiveResult(
                pulseId = pulse.pulseId,
                driftMs = lastClockDriftMs,
                frameDrift = 0.0,
                alignmentForced = false,
                action = ClockAlignmentAction.IN_SYNC,
                holdFrames = 0,
                catchUpFrames = 0,
                needsAuthoritativeResync = false
            )
        }

        syncPulseCount += 1
        if (pulse.frame > remoteLatestFrame) {
            remoteLatestFrame = pulse.frame
        }

        val oneWayMs = (smoothedRttMs ?: 0) * 0.5
        val estimatedRemoteFrameNow = pulse.frame + (oneWayMs / NES_FRAME_MS)
        val frameDrift = currentFrame - estimatedRemoteFrameNow
        val simDriftMs = frameDrift * NES_FRAME_MS

        val observedWallOffset = (receivedAtMs - oneWayMs) - pulse.sentAtMs
        if (baselineWallOffsetMs == null) {
            baselineWallOffsetMs = observedWallOffset
        }
        val relativeWallDriftMs = observedWallOffset - (baselineWallOffsetMs ?: observedWallOffset)

        val effectiveDriftMs = if (abs(simDriftMs) >= abs(relativeWallDriftMs)) {
            simDriftMs
        } else {
            relativeWallDriftMs
        }
        val roundedDriftMs = effectiveDriftMs.toInt()
        lastClockDriftMs = roundedDriftMs

        if (abs(effectiveDriftMs) <= syncPulseDriftThresholdMs) {
            baselineWallOffsetMs = (baselineWallOffsetMs ?: observedWallOffset) * 0.85 + observedWallOffset * 0.15
            return SyncPulseReceiveResult(
                pulseId = pulse.pulseId,
                driftMs = roundedDriftMs,
                frameDrift = frameDrift,
                alignmentForced = false,
                action = ClockAlignmentAction.IN_SYNC,
                holdFrames = 0,
                catchUpFrames = 0,
                needsAuthoritativeResync = false
            )
        }

        clockAlignmentCount += 1
        baselineWallOffsetMs = observedWallOffset

        val framesOff = max(1, kotlin.math.round(abs(effectiveDriftMs) / NES_FRAME_MS).toInt())
        val severe = abs(frameDrift) > maxRollbackWindow

        if (effectiveDriftMs > 0.0) {
            val hold = min(24, framesOff)
            pendingClockHoldFrames = max(pendingClockHoldFrames, hold)
            remoteFrameAtHoldStart = remoteLatestFrame
            pendingClockCatchUpFrames = 0
            if (severe) syncStatus = ChecksumSyncStatus.RECOVERING
            return SyncPulseReceiveResult(
                pulseId = pulse.pulseId,
                driftMs = roundedDriftMs,
                frameDrift = frameDrift,
                alignmentForced = true,
                action = if (severe) ClockAlignmentAction.AUTHORITATIVE_RESYNC else ClockAlignmentAction.HOLD_AHEAD,
                holdFrames = hold,
                catchUpFrames = 0,
                needsAuthoritativeResync = severe
            )
        }

        val catchUp = min(12, framesOff)
        pendingClockCatchUpFrames = max(pendingClockCatchUpFrames, catchUp)
        pendingClockHoldFrames = 0
        if (severe) syncStatus = ChecksumSyncStatus.RECOVERING
        SyncPulseReceiveResult(
            pulseId = pulse.pulseId,
            driftMs = roundedDriftMs,
            frameDrift = frameDrift,
            alignmentForced = true,
            action = if (severe) ClockAlignmentAction.AUTHORITATIVE_RESYNC else ClockAlignmentAction.CATCH_UP,
            holdFrames = 0,
            catchUpFrames = catchUp,
            needsAuthoritativeResync = severe
        )
    }

    private fun resetTimelineLocked(startFrame: Int) {
        currentFrame = max(0, startFrame)
        confirmedFrame = currentFrame - 1
        remoteLatestFrame = currentFrame - 1
        lastScheduledLocalFrame = currentFrame - 1
        lastSentChecksumFrame = -1
        localInputs.clear()
        remoteInputs.clear()
        predictedRemoteInputs.clear()
        stateSnapshots.clear()
        confirmedChecksums.clear()
        pendingRemoteChecksums.clear()
        lastConfirmedRemoteMask = 0
        syncStatus = ChecksumSyncStatus.IDLE
        lastSyncPulseSentAtMs = null
        lastClockDriftMs = 0
        baselineWallOffsetMs = null
        pendingClockHoldFrames = 0
        remoteFrameAtHoldStart = -1
        pendingClockCatchUpFrames = 0
    }

    fun stepLocalFrame(
        rawLocalMask: Int,
        outArgbPixels: IntArray,
        nowMs: Long = System.currentTimeMillis()
    ): StepResult = synchronized(lock) {
        val cleanMask = rawLocalMask and 0xFF
        val delay = activeDelayLocked()
        val outgoingPulse = buildSyncPulseIfDueLocked(nowMs)

        // Honor forced clock alignment hold when ahead by >200ms
        if (pendingClockHoldFrames > 0) {
            if (remoteLatestFrame > remoteFrameAtHoldStart && remoteLatestFrame >= currentFrame - 1) {
                pendingClockHoldFrames = 0
                lastClockDriftMs = 0
            } else {
                pendingClockHoldFrames -= 1
                throttledFrames += 1
                val latestScheduled = max(currentFrame, lastScheduledLocalFrame)
                return StepResult(
                    stepped = false,
                    throttled = true,
                    clockAlignmentHold = true,
                    frame = currentFrame,
                    renderedFrame = false,
                    outgoingPort = localPort,
                    outgoingLatestFrame = latestScheduled,
                    outgoingAckFrame = max(0, remoteLatestFrame),
                    outgoingInputs = buildRedundantBatchLocked(latestScheduled),
                    outgoingChecksum = null,
                    outgoingSyncPulse = outgoingPulse
                )
            }
        }

        // Throttle smoothly if ahead of peer beyond rollback buffer to preserve accurate 60.0988Hz sync
        val advantage = currentFrame - max(0, remoteLatestFrame)
        if (remoteLatestFrame >= 0 && advantage >= maxRollbackWindow) {
            throttledFrames += 1
            val latestScheduled = max(currentFrame, lastScheduledLocalFrame)
            return StepResult(
                stepped = false,
                throttled = true,
                clockAlignmentHold = false,
                frame = currentFrame,
                renderedFrame = false,
                outgoingPort = localPort,
                outgoingLatestFrame = latestScheduled,
                outgoingAckFrame = max(0, remoteLatestFrame),
                outgoingInputs = buildRedundantBatchLocked(latestScheduled),
                outgoingChecksum = null,
                outgoingSyncPulse = outgoingPulse
            )
        }

        val desiredTarget = currentFrame + delay
        if (desiredTarget > lastScheduledLocalFrame) {
            val isInitialRamp = lastScheduledLocalFrame < currentFrame
            val fillStart = max(currentFrame, lastScheduledLocalFrame + 1)
            for (f in fillStart..desiredTarget) {
                localInputs[f] = if (isInitialRamp && f < desiredTarget) 0 else cleanMask
            }
            lastScheduledLocalFrame = desiredTarget
        }

        val frameToRun = currentFrame
        val localMaskForFrame = localInputs[frameToRun] ?: cleanMask
        localInputs[frameToRun] = localMaskForFrame

        // Save pre-frame binary state snapshot into ring buffer
        core.saveStateBytes()?.let { bytes ->
            stateSnapshots[frameToRun] = bytes
            val minKeep = frameToRun - (maxRollbackWindow + 4)
            stateSnapshots.keys.removeAll { it < minKeep }
        }

        val remoteMaskForFrame = if (remoteInputs.containsKey(frameToRun)) {
            val confirmed = remoteInputs[frameToRun] ?: 0
            lastConfirmedRemoteMask = confirmed
            confirmed
        } else {
            predictedRemoteInputs[frameToRun] = lastConfirmedRemoteMask
            lastConfirmedRemoteMask
        }

        val (p1Mask, p2Mask) = resolvePortMasksLocked(localMaskForFrame, remoteMaskForFrame)
        val rendered = core.stepFrameDeterministic(
            p1Mask = p1Mask,
            p2Mask = p2Mask,
            renderVideo = true,
            recordAudio = true,
            outArgb256x240 = outArgbPixels
        )
        currentFrame = frameToRun + 1
        if (pendingClockCatchUpFrames > 0) {
            pendingClockCatchUpFrames -= 1
        }

        while (confirmedFrame + 1 < currentFrame &&
            localInputs.containsKey(confirmedFrame + 1) &&
            remoteInputs.containsKey(confirmedFrame + 1)
        ) {
            confirmedFrame += 1
        }

        var outgoingChecksum: Pair<Int, String>? = null
        if (confirmedFrame >= 0 &&
            confirmedFrame == currentFrame - 1 &&
            currentFrame % CHECKSUM_INTERVAL_FRAMES == 0 &&
            currentFrame > lastSentChecksumFrame
        ) {
            val digest = core.computeStateChecksum()
            confirmedChecksums[currentFrame] = digest
            lastSentChecksumFrame = currentFrame
            outgoingChecksum = currentFrame to digest
            evaluatePendingChecksumLocked(currentFrame)
        }

        pruneHistoryLocked()

        val latestOutgoing = max(frameToRun, lastScheduledLocalFrame)
        StepResult(
            stepped = true,
            throttled = false,
            clockAlignmentHold = false,
            frame = currentFrame,
            renderedFrame = rendered,
            outgoingPort = localPort,
            outgoingLatestFrame = latestOutgoing,
            outgoingAckFrame = max(0, remoteLatestFrame),
            outgoingInputs = buildRedundantBatchLocked(latestOutgoing),
            outgoingChecksum = outgoingChecksum,
            outgoingSyncPulse = outgoingPulse
        )
    }

    fun receiveRemoteInputs(
        port: PlayerPort,
        inputs: List<FrameInputEntry>,
        outArgbPixels: IntArray
    ): RemoteInputApplyResult = synchronized(lock) {
        if (port != remotePort && !turnBasedSharedPort1) {
            return RemoteInputApplyResult(false, 0, false)
        }

        var earliestMispredict: Int? = null
        for (entry in inputs) {
            val f = max(0, entry.frame)
            val mask = entry.mask and 0xFF
            if (f > remoteLatestFrame) {
                remoteLatestFrame = f
            }
            if (!remoteInputs.containsKey(f)) {
                remoteInputs[f] = mask
                if (f < currentFrame) {
                    val predicted = predictedRemoteInputs.remove(f)
                    if (predicted != null && predicted != mask) {
                        if (earliestMispredict == null || f < earliestMispredict) {
                            earliestMispredict = f
                        }
                    }
                }
            }
        }

        while (confirmedFrame + 1 < currentFrame &&
            localInputs.containsKey(confirmedFrame + 1) &&
            remoteInputs.containsKey(confirmedFrame + 1)
        ) {
            confirmedFrame += 1
            remoteInputs[confirmedFrame]?.let { lastConfirmedRemoteMask = it }
        }

        val misFrame = earliestMispredict ?: return RemoteInputApplyResult(false, 0, false)
        val depth = currentFrame - misFrame
        val saved = stateSnapshots[misFrame]
        if (saved == null || depth > maxRollbackWindow + 2) {
            syncStatus = ChecksumSyncStatus.DESYNCED
            desyncCount += 1
            return RemoteInputApplyResult(false, depth, true)
        }

        // Deterministic rollback + silent re-simulation up to currentFrame
        if (!core.loadStateBytes(saved)) {
            syncStatus = ChecksumSyncStatus.DESYNCED
            desyncCount += 1
            return RemoteInputApplyResult(false, depth, true)
        }

        for (f in misFrame until currentFrame) {
            core.saveStateBytes()?.let { stateSnapshots[f] = it }
            val localMask = localInputs[f] ?: 0
            val remoteMask = if (remoteInputs.containsKey(f)) {
                val c = remoteInputs[f] ?: 0
                lastConfirmedRemoteMask = c
                c
            } else {
                predictedRemoteInputs[f] = lastConfirmedRemoteMask
                lastConfirmedRemoteMask
            }
            val (p1Mask, p2Mask) = resolvePortMasksLocked(localMask, remoteMask)
            val isFinal = (f == currentFrame - 1)
            core.stepFrameDeterministic(
                p1Mask = p1Mask,
                p2Mask = p2Mask,
                renderVideo = isFinal,
                recordAudio = false,
                outArgb256x240 = if (isFinal) outArgbPixels else null
            )

            val nextFrame = f + 1
            if (nextFrame <= confirmedFrame + 1 && nextFrame % CHECKSUM_INTERVAL_FRAMES == 0) {
                confirmedChecksums[nextFrame] = core.computeStateChecksum()
                evaluatePendingChecksumLocked(nextFrame)
            }
        }

        rollbackCount += 1
        lastRollbackDepth = depth
        if (depth > maxRollbackDepth) maxRollbackDepth = depth
        RemoteInputApplyResult(true, depth, false)
    }

    fun receiveRemoteChecksum(frame: Int, remoteChecksum: String): Boolean = synchronized(lock) {
        pendingRemoteChecksums[frame] = remoteChecksum
        evaluatePendingChecksumLocked(frame)
    }

    fun exportAuthoritativeSnapshot(): Triple<Int, ByteArray, String>? = synchronized(lock) {
        val bytes = core.saveStateBytes() ?: return null
        val digest = core.computeStateChecksum()
        confirmedChecksums[currentFrame] = digest
        Triple(currentFrame, bytes, digest)
    }

    fun applyAuthoritativeSnapshot(frame: Int, stateBytes: ByteArray, checksum: String): Boolean =
        synchronized(lock) {
            if (!core.loadStateBytes(stateBytes)) return false
            resetTimelineLocked(frame)
            confirmedChecksums[frame] = checksum
            lastVerifiedFrame = frame
            syncStatus = ChecksumSyncStatus.VERIFIED
            recoveryCount += 1
            true
        }

    fun getMetrics(): RollbackMetrics = synchronized(lock) {
        val rtt = smoothedRttMs
        val quality = when {
            rtt == null -> ConnectionQuality.UNKNOWN
            rtt <= 45 && jitterMs <= 12 -> ConnectionQuality.GOOD
            rtt <= 95 && jitterMs <= 28 -> ConnectionQuality.FAIR
            rtt <= 165 && jitterMs <= 55 -> ConnectionQuality.POOR
            else -> ConnectionQuality.UNSTABLE
        }
        val advantage = if (remoteLatestFrame >= 0) currentFrame - remoteLatestFrame else 0
        RollbackMetrics(
            currentFrame = currentFrame,
            confirmedFrame = max(0, confirmedFrame),
            remoteLatestFrame = max(0, remoteLatestFrame),
            frameAdvantage = advantage,
            inputDelayFrames = activeDelayLocked(),
            adaptiveDelay = manualDelay == null,
            pingMs = rtt,
            jitterMs = jitterMs,
            quality = quality,
            rollbackCount = rollbackCount,
            lastRollbackDepth = lastRollbackDepth,
            maxRollbackDepth = maxRollbackDepth,
            desyncCount = desyncCount,
            recoveryCount = recoveryCount,
            syncStatus = syncStatus,
            lastVerifiedFrame = max(0, lastVerifiedFrame),
            throttledFrames = throttledFrames,
            clockDriftMs = lastClockDriftMs,
            clockAligned = abs(lastClockDriftMs) <= syncPulseDriftThresholdMs,
            syncPulseCount = syncPulseCount,
            clockAlignmentCount = clockAlignmentCount,
            pendingClockHoldFrames = pendingClockHoldFrames,
            pendingClockCatchUpFrames = pendingClockCatchUpFrames,
            turnBasedSharedPort1 = turnBasedSharedPort1,
            activeTurnPort = activeTurnPort
        )
    }

    private fun evaluatePendingChecksumLocked(frame: Int): Boolean {
        val local = confirmedChecksums[frame] ?: return false
        val remote = pendingRemoteChecksums.remove(frame) ?: return false
        return if (local == remote) {
            syncStatus = ChecksumSyncStatus.VERIFIED
            lastVerifiedFrame = max(lastVerifiedFrame, frame)
            false
        } else {
            syncStatus = ChecksumSyncStatus.DESYNCED
            desyncCount += 1
            true
        }
    }

    private fun resolvePortMasksLocked(localMask: Int, remoteMask: Int): Pair<Int, Int> {
        if (turnBasedSharedPort1) {
            val driver = if (activeTurnPort == localPort) localMask else remoteMask
            return (driver and 0xFF) to 0
        }
        return if (localPort == PlayerPort.PORT_1) {
            (localMask and 0xFF) to (remoteMask and 0xFF)
        } else {
            (remoteMask and 0xFF) to (localMask and 0xFF)
        }
    }

    private fun buildRedundantBatchLocked(latestFrame: Int): List<FrameInputEntry> {
        val start = max(0, latestFrame - (INPUT_REDUNDANCY_FRAMES - 1))
        val list = ArrayList<FrameInputEntry>(INPUT_REDUNDANCY_FRAMES)
        for (f in start..latestFrame) {
            val m = localInputs[f] ?: continue
            list.add(FrameInputEntry(f, m))
        }
        return list
    }

    private fun pruneHistoryLocked() {
        val minKeep = currentFrame - (maxRollbackWindow + 24)
        if (minKeep <= 0) return
        localInputs.keys.removeAll { it < minKeep }
        remoteInputs.keys.removeAll { it < minKeep }
        predictedRemoteInputs.keys.removeAll { it < minKeep }
        confirmedChecksums.keys.removeAll { it < currentFrame - 180 }
        pendingRemoteChecksums.keys.removeAll { it < currentFrame - 180 }
    }

    private fun activeDelayLocked(): Int = manualDelay ?: recommendedDelay

    companion object {
        private const val NES_FRAME_MS = 1000.0 / 60.0988
        private const val CHECKSUM_INTERVAL_FRAMES = 30
        private const val INPUT_REDUNDANCY_FRAMES = 4
        const val SYNC_PULSE_INTERVAL_MS = 1000L
        const val SYNC_PULSE_DRIFT_THRESHOLD_MS = 200

        fun verifyHandshake(local: PeerHandshakeInfo, remote: PeerHandshakeInfo): Pair<Boolean, String> {
            if (local.protocolVersion != remote.protocolVersion) {
                return false to "Protocol mismatch (${local.protocolVersion} vs ${remote.protocolVersion})."
            }
            if (local.coreId != remote.coreId || local.coreVersion != remote.coreVersion) {
                return false to "Emulator core mismatch (${local.coreVersion} vs ${remote.coreVersion}). Both devices must run the same core build."
            }
            if (local.romSha256.isBlank() || !local.romSha256.equals(remote.romSha256, ignoreCase = true)) {
                return false to "ROM SHA-256 mismatch. Load the matching .nes file or accept optional ROM transfer."
            }
            return true to "Core version & ROM SHA-256 verified."
        }
    }
}

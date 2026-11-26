package com.tgk.testemulators.input

import com.tgk.testemulators.core.IEmulatorCore
import com.tgk.testemulators.core.NesButton
import com.tgk.testemulators.core.PlayerPort
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Frame-accurate rapid-fire Turbo engine for dedicated Turbo A & Turbo B buttons (5Hz..30Hz).
 */
class TurboController(private val core: IEmulatorCore) {

    @Volatile
    var rateHz: Int = 15

    /**
     * When true (during TGK RETRO 2.0 online rollback), turbo phase transitions are read via
     * [getTurboBitmask] inside the deterministic frame loop instead of mutating core state asynchronously.
     */
    @Volatile
    var suppressDirectCoreCalls: Boolean = false

    private var frameCounter: Int = 0
    private val heldA = BooleanArray(2)
    private val heldB = BooleanArray(2)
    private val emittedA = BooleanArray(2)
    private val emittedB = BooleanArray(2)

    @Synchronized
    fun setTurboHeld(port: PlayerPort, button: NesButton, held: Boolean) {
        val idx = port.index
        when (button) {
            NesButton.A -> {
                if (heldA[idx] == held) return
                heldA[idx] = held
                emittedA[idx] = held
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.A, held)
                }
            }
            NesButton.B -> {
                if (heldB[idx] == held) return
                heldB[idx] = held
                emittedB[idx] = held
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.B, held)
                }
            }
            else -> Unit
        }
    }

    @Synchronized
    fun getTurboBitmask(port: PlayerPort): Int {
        val idx = port.index
        var mask = 0
        if (emittedA[idx]) mask = mask or NesButton.A.netplayBit
        if (emittedB[idx]) mask = mask or NesButton.B.netplayBit
        return mask
    }

    @Synchronized
    fun tickFrame() {
        frameCounter += 1
        val clampedHz = rateHz.coerceIn(5, 30)
        val halfPeriod = max(1, (60.0 / (clampedHz * 2.0)).roundToInt())
        val highPhase = ((frameCounter / halfPeriod) % 2) == 0

        for (port in PlayerPort.values()) {
            val idx = port.index
            if (heldA[idx] && emittedA[idx] != highPhase) {
                emittedA[idx] = highPhase
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.A, highPhase)
                }
            }
            if (heldB[idx] && emittedB[idx] != highPhase) {
                emittedB[idx] = highPhase
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.B, highPhase)
                }
            }
        }
    }

    @Synchronized
    fun releaseAll() {
        for (port in PlayerPort.values()) {
            val idx = port.index
            heldA[idx] = false
            heldB[idx] = false
            if (emittedA[idx]) {
                emittedA[idx] = false
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.A, false)
                }
            }
            if (emittedB[idx]) {
                emittedB[idx] = false
                if (!suppressDirectCoreCalls) {
                    core.setButton(port, NesButton.B, false)
                }
            }
        }
    }
}

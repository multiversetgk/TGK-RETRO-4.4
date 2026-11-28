package com.tgk.testemulators.input

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import com.tgk.testemulators.core.IEmulatorCore
import com.tgk.testemulators.core.NesButton
import com.tgk.testemulators.core.PlayerPort
import kotlin.math.abs

/**
 * Independent 2-Player VS Mode input router for Port 1 and Port 2.
 * Supports dual USB/Bluetooth gamepads, physical keyboards, and native touch controls.
 */
class DualPortInputController(
    private val core: IEmulatorCore,
    private val onLocalButtonChanged: ((PlayerPort, NesButton, Boolean) -> Unit)? = null,
    private val onTurboButtonChanged: ((PlayerPort, NesButton, Boolean) -> Unit)? = null,
    private val keyMap: GamepadMappingStore? = null
) {
    private val deviceToPort = LinkedHashMap<Int, PlayerPort>()
    private val hatState = mutableMapOf<PlayerPort, IntArray>() // [dx, dy]
    private val portBitmasks = arrayOf(
        java.util.concurrent.atomic.AtomicInteger(0),
        java.util.concurrent.atomic.AtomicInteger(0)
    )

    @Volatile
    var activeTouchPort: PlayerPort = PlayerPort.PORT_1

    /**
     * When active during TGK RETRO 2.0 online rollback multiplayer, all local USB/BT
     * gamepads, keyboard, and touch controls feed strictly into this local port's
     * deterministic bitmask without mutating the remote port directly.
     */
    @Volatile
    var onlineLockedPort: PlayerPort? = null

    fun getLocalBitmask(port: PlayerPort): Int = portBitmasks[port.index].get() and 0xFF

    fun setTouchButton(button: NesButton, pressed: Boolean) {
        val target = onlineLockedPort ?: activeTouchPort
        dispatch(target, button, pressed)
    }

    fun setRemoteButton(port: PlayerPort, button: NesButton, pressed: Boolean) {
        core.setButton(port, button, pressed)
    }

    fun handleKeyEvent(event: KeyEvent): Boolean {
        val pressed = when (event.action) {
            KeyEvent.ACTION_DOWN -> true
            KeyEvent.ACTION_UP -> false
            else -> return false
        }
        if (event.repeatCount > 0) return true

        val isGamepad = (event.source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
            (event.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK

        if (isGamepad) {
            val port = onlineLockedPort ?: resolveGamepadPort(event.deviceId)
            val turboTarget = if (keyMap?.buttonFor(event.keyCode) != null) null else mapGamepadTurboKeyCode(event.keyCode)
            if (turboTarget != null) {
                onTurboButtonChanged?.invoke(port, turboTarget, pressed)
                return true
            }
            val button = mapGamepadKeyCode(event.keyCode) ?: return false
            dispatch(port, button, pressed)
            return true
        }

        // Physical keyboard dual-player split (preserved intact for offline 2P):
        // Port 1: WASD + J(B) + K(A) + Shift(Select) + Enter(Start)
        // Port 2: Arrows + Numpad 1/U(B) + Numpad 2/I(A) + O(Select) + P(Start)
        val kbMapping = mapKeyboardKeyCode(event.keyCode) ?: return false
        val targetPort = onlineLockedPort ?: kbMapping.first
        dispatch(targetPort, kbMapping.second, pressed)
        return true
    }

    fun handleGenericMotionEvent(event: MotionEvent): Boolean {
        if ((event.source and InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK &&
            (event.source and InputDevice.SOURCE_DPAD) != InputDevice.SOURCE_DPAD
        ) {
            return false
        }
        if (event.action != MotionEvent.ACTION_MOVE) return false

        val port = onlineLockedPort ?: resolveGamepadPort(event.deviceId)
        val hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X)
        val hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
        val stickX = event.getAxisValue(MotionEvent.AXIS_X)
        val stickY = event.getAxisValue(MotionEvent.AXIS_Y)

        val axisX = if (abs(hatX) > 0.35f) hatX else stickX
        val axisY = if (abs(hatY) > 0.35f) hatY else stickY

        val dx = when {
            axisX < -0.45f -> -1
            axisX > 0.45f -> 1
            else -> 0
        }
        val dy = when {
            axisY < -0.45f -> -1
            axisY > 0.45f -> 1
            else -> 0
        }

        val prev = hatState.getOrPut(port) { intArrayOf(0, 0) }
        if (prev[0] != dx) {
            dispatch(port, NesButton.LEFT, dx < 0)
            dispatch(port, NesButton.RIGHT, dx > 0)
            prev[0] = dx
        }
        if (prev[1] != dy) {
            dispatch(port, NesButton.UP, dy < 0)
            dispatch(port, NesButton.DOWN, dy > 0)
            prev[1] = dy
        }
        return true
    }

    /** Frees the port held by a disconnected gamepad so a re-plugged pad gets assigned correctly. */
    fun onInputDeviceRemoved(deviceId: Int) {
        val port = deviceToPort.remove(deviceId) ?: return
        hatState.remove(port)
        portBitmasks[port.index].set(0)
        if (onlineLockedPort == null) {
            core.releaseAllButtons(port)
        }
    }

    fun releaseAll() {
        portBitmasks[0].set(0)
        portBitmasks[1].set(0)
        core.releaseAllButtons(PlayerPort.PORT_1)
        core.releaseAllButtons(PlayerPort.PORT_2)
        hatState.clear()
    }

    private fun dispatch(port: PlayerPort, button: NesButton, pressed: Boolean) {
        val bit = button.netplayBit
        val atomicMask = portBitmasks[port.index]
        while (true) {
            val prev = atomicMask.get()
            val next = if (pressed) prev or bit else prev and bit.inv()
            if (atomicMask.compareAndSet(prev, next)) break
        }
        // In offline mode, update core immediately; in online rollback mode, RollbackNetplayEngine
        // latches per-frame bitmasks deterministically inside stepFrameDeterministic().
        if (onlineLockedPort == null) {
            core.setButton(port, button, pressed)
        }
        onLocalButtonChanged?.invoke(port, button, pressed)
    }

    private fun resolveGamepadPort(deviceId: Int): PlayerPort {
        deviceToPort[deviceId]?.let { return it }
        val assigned = if (deviceToPort.values.none { it == PlayerPort.PORT_1 }) {
            PlayerPort.PORT_1
        } else {
            PlayerPort.PORT_2
        }
        deviceToPort[deviceId] = assigned
        return assigned
    }

    private fun mapGamepadTurboKeyCode(keyCode: Int): NesButton? = when (keyCode) {
        KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_X -> NesButton.A
        KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_Y -> NesButton.B
        else -> null
    }

    private fun mapGamepadKeyCode(keyCode: Int): NesButton? =
        if (keyMap != null) keyMap.buttonFor(keyCode) else defaultGamepadKeyCode(keyCode)

    private fun defaultGamepadKeyCode(keyCode: Int): NesButton? = when (keyCode) {
        KeyEvent.KEYCODE_BUTTON_A -> NesButton.A
        KeyEvent.KEYCODE_BUTTON_B -> NesButton.B
        KeyEvent.KEYCODE_BUTTON_START -> NesButton.START
        KeyEvent.KEYCODE_BUTTON_SELECT -> NesButton.SELECT
        KeyEvent.KEYCODE_DPAD_UP -> NesButton.UP
        KeyEvent.KEYCODE_DPAD_DOWN -> NesButton.DOWN
        KeyEvent.KEYCODE_DPAD_LEFT -> NesButton.LEFT
        KeyEvent.KEYCODE_DPAD_RIGHT -> NesButton.RIGHT
        else -> null
    }

    private fun mapKeyboardKeyCode(keyCode: Int): Pair<PlayerPort, NesButton>? = when (keyCode) {
        // Port 1
        KeyEvent.KEYCODE_W -> PlayerPort.PORT_1 to NesButton.UP
        KeyEvent.KEYCODE_S -> PlayerPort.PORT_1 to NesButton.DOWN
        KeyEvent.KEYCODE_A -> PlayerPort.PORT_1 to NesButton.LEFT
        KeyEvent.KEYCODE_D -> PlayerPort.PORT_1 to NesButton.RIGHT
        KeyEvent.KEYCODE_J -> PlayerPort.PORT_1 to NesButton.B
        KeyEvent.KEYCODE_K -> PlayerPort.PORT_1 to NesButton.A
        KeyEvent.KEYCODE_SHIFT_LEFT -> PlayerPort.PORT_1 to NesButton.SELECT
        KeyEvent.KEYCODE_ENTER -> PlayerPort.PORT_1 to NesButton.START

        // Port 2
        KeyEvent.KEYCODE_DPAD_UP -> PlayerPort.PORT_2 to NesButton.UP
        KeyEvent.KEYCODE_DPAD_DOWN -> PlayerPort.PORT_2 to NesButton.DOWN
        KeyEvent.KEYCODE_DPAD_LEFT -> PlayerPort.PORT_2 to NesButton.LEFT
        KeyEvent.KEYCODE_DPAD_RIGHT -> PlayerPort.PORT_2 to NesButton.RIGHT
        KeyEvent.KEYCODE_U, KeyEvent.KEYCODE_NUMPAD_1 -> PlayerPort.PORT_2 to NesButton.B
        KeyEvent.KEYCODE_I, KeyEvent.KEYCODE_NUMPAD_2 -> PlayerPort.PORT_2 to NesButton.A
        KeyEvent.KEYCODE_O, KeyEvent.KEYCODE_NUMPAD_3 -> PlayerPort.PORT_2 to NesButton.SELECT
        KeyEvent.KEYCODE_P, KeyEvent.KEYCODE_NUMPAD_ENTER -> PlayerPort.PORT_2 to NesButton.START
        else -> null
    }
}

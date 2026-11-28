package com.tgk.testemulators.input

import android.content.Context
import android.view.KeyEvent
import com.tgk.testemulators.core.NesButton

/**
 * Persistent USB / OTG / Bluetooth gamepad button mapping (Android key code -> NES button).
 * Each NES button has one controller key; assigning a key already used by another button swaps them.
 */
class GamepadMappingStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("tgk_gamepad_map", Context.MODE_PRIVATE)

    @Volatile
    private var map: Map<Int, NesButton> = load()

    fun buttonFor(keyCode: Int): NesButton? = map[keyCode]

    fun keyFor(button: NesButton): Int? = map.entries.firstOrNull { it.value == button }?.key

    fun assign(button: NesButton, keyCode: Int) {
        val m = LinkedHashMap(map)
        val oldKey = keyFor(button)
        val other = m[keyCode]
        m.entries.removeAll { it.value == button || it.key == keyCode }
        m[keyCode] = button
        if (other != null && other != button && oldKey != null) m[oldKey] = other
        map = m
        save()
    }

    fun resetDefaults() {
        map = defaults()
        prefs.edit().remove("map").apply()
    }

    private fun save() {
        prefs.edit().putString("map", map.entries.joinToString(",") { "${it.key}:${it.value.name}" }).apply()
    }

    private fun load(): Map<Int, NesButton> {
        val raw = prefs.getString("map", null) ?: return defaults()
        val out = LinkedHashMap<Int, NesButton>()
        runCatching {
            raw.split(',').filter { it.contains(':') }.forEach { part ->
                val key = part.substringBefore(':').toInt()
                val button = NesButton.valueOf(part.substringAfter(':'))
                out[key] = button
            }
        }
        return if (out.isEmpty()) defaults() else out
    }

    companion object {
        fun defaults(): Map<Int, NesButton> = linkedMapOf(
            KeyEvent.KEYCODE_BUTTON_A to NesButton.A,
            KeyEvent.KEYCODE_BUTTON_B to NesButton.B,
            KeyEvent.KEYCODE_BUTTON_START to NesButton.START,
            KeyEvent.KEYCODE_BUTTON_SELECT to NesButton.SELECT,
            KeyEvent.KEYCODE_DPAD_UP to NesButton.UP,
            KeyEvent.KEYCODE_DPAD_DOWN to NesButton.DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT to NesButton.LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT to NesButton.RIGHT
        )

        fun keyName(keyCode: Int?): String =
            if (keyCode == null) "—" else KeyEvent.keyCodeToString(keyCode).removePrefix("KEYCODE_")
    }
}

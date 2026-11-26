package com.tgk.testemulators.race

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

data class FriendRivalRecord(
    val id: String,
    val name: String,
    val wins: Int,
    val losses: Int,
    val draws: Int,
    val highScore: Int,
    val currentStreak: Int
)

/**
 * Local SharedPreferences store for Friends Group Rivalry stats (Win/Loss/Draw, Streak, High Score).
 */
class FriendRivalryRepository(context: Context) {

    private val prefs = context.getSharedPreferences("tgk_friend_rivalry_v1", Context.MODE_PRIVATE)

    fun listRivals(): List<FriendRivalRecord> {
        val raw = prefs.getString(KEY_RIVALS, null) ?: return defaultRivals()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(
                        FriendRivalRecord(
                            id = o.optString("id"),
                            name = o.optString("name"),
                            wins = o.optInt("wins", 0),
                            losses = o.optInt("losses", 0),
                            draws = o.optInt("draws", 0),
                            highScore = o.optInt("highScore", 0),
                            currentStreak = o.optInt("currentStreak", 0)
                        )
                    )
                }
            }
        }.getOrDefault(defaultRivals())
    }

    fun addFriend(name: String): FriendRivalRecord {
        val clean = name.trim().take(24).ifEmpty { "Friend" }
        val existing = listRivals().toMutableList()
        val record = FriendRivalRecord(
            id = "friend_${System.currentTimeMillis()}",
            name = clean,
            wins = 0,
            losses = 0,
            draws = 0,
            highScore = 0,
            currentStreak = 0
        )
        existing.add(0, record)
        persist(existing)
        return record
    }

    fun recordMatchResult(rivalId: String, winnerPort: Int, p1Score: Int, p2Score: Int) {
        val updated = listRivals().map { r ->
            if (r.id != rivalId) return@map r
            val nextHigh = max(r.highScore, max(p1Score, p2Score))
            when (winnerPort) {
                1 -> r.copy(
                    wins = r.wins + 1,
                    highScore = nextHigh,
                    currentStreak = if (r.currentStreak >= 0) r.currentStreak + 1 else 1
                )
                2 -> r.copy(
                    losses = r.losses + 1,
                    highScore = nextHigh,
                    currentStreak = if (r.currentStreak <= 0) r.currentStreak - 1 else -1
                )
                else -> r.copy(draws = r.draws + 1, highScore = nextHigh, currentStreak = 0)
            }
        }
        persist(updated)
    }

    private fun persist(items: List<FriendRivalRecord>) {
        val arr = JSONArray()
        for (r in items) {
            arr.put(
                JSONObject().apply {
                    put("id", r.id)
                    put("name", r.name)
                    put("wins", r.wins)
                    put("losses", r.losses)
                    put("draws", r.draws)
                    put("highScore", r.highScore)
                    put("currentStreak", r.currentStreak)
                }
            )
        }
        prefs.edit().putString(KEY_RIVALS, arr.toString()).apply()
    }

    private fun defaultRivals(): List<FriendRivalRecord> = listOf(
        FriendRivalRecord("rival_aarav", "Aarav (Squad)", 0, 0, 0, 0, 0),
        FriendRivalRecord("rival_kabir", "Kabir (90s Pro)", 0, 0, 0, 0, 0),
        FriendRivalRecord("rival_rohan", "Rohan (Speedrun)", 0, 0, 0, 0, 0)
    )

    companion object {
        private const val KEY_RIVALS = "rivals_json"
    }
}

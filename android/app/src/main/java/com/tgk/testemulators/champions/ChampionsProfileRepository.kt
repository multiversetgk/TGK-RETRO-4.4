package com.tgk.testemulators.champions

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.tgk.testemulators.core.LibretroFceummBridge
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

enum class RankTier(val label: String, val minXp: Int, val colorHex: Int) {
    ROOKIE("Rookie", 0, 0xFF94A3B8.toInt()),
    ARCADE_CHALLENGER("Arcade Challenger", 250, 0xFF38BDF8.toInt()),
    RETRO_CONTENDER("Retro Contender", 750, 0xFF34D399.toInt()),
    EIGHT_BIT_VETERAN("8-Bit Veteran", 1500, 0xFFA78BFA.toInt()),
    NES_MASTER("NES Master", 3000, 0xFFF59E0B.toInt()),
    GRAND_CHAMPION("Grand Champion", 6000, 0xFFFB7185.toInt()),
    TGK_LEGEND("TGK Legend", 10000, 0xFF22D3EE.toInt());

    companion object {
        fun forXp(xp: Int): RankTier {
            var current = ROOKIE
            for (tier in values()) {
                if (xp >= tier.minXp) current = tier
            }
            return current
        }
    }
}

data class NativePlayerProfile(
    val username: String,
    val countryCode: String,
    val xp: Int,
    val level: Int,
    val rankTier: RankTier,
    val eloRating: Int,
    val peakElo: Int,
    val vsWins: Int,
    val vsLosses: Int,
    val vsDraws: Int,
    val friends: List<String>,
    val isFounderCreator: Boolean,
    val founderBadgeLabel: String?,
    val bronze: Int,
    val silver: Int,
    val gold: Int,
    val platinum: Int
)

/**
 * TGK RETRO 4.4 Local persistent profile, XP Rank Tiers, 2P VS ELO, Friends,
 * TGK FOUNDER / CREATOR App Owner badge, Stage Splits, Trophy Book & Verified Hall of Fame repository
 * for Android (zero fake leaderboard records, zero mocked Google Cloud Sign-In).
 */
class ChampionsProfileRepository(context: Context) {
    companion object {
        const val DEFAULT_VS_ELO = 1200
        const val FOUNDER_BADGE_LABEL = "TGK FOUNDER / CREATOR"
    }

    private val prefs = context.applicationContext.getSharedPreferences("tgk_champions_profile", Context.MODE_PRIVATE)

    fun registerAccount(
        username: String,
        password: String,
        countryCode: String,
        claimFounderBadge: Boolean = false
    ): Boolean {
        val clean = username.trim()
        if (clean.length < 3 || password.length < 6) return false
        val salt = "tgk_android_${System.currentTimeMillis()}"
        val hash = LibretroFceummBridge.computeSha256Hex("$salt:$password".toByteArray())
        prefs.edit()
            .putString("username", clean)
            .putString("country", countryCode.uppercase().take(2).ifEmpty { "IN" })
            .putString("pwd_salt", salt)
            .putString("pwd_hash", hash)
            .putBoolean("is_founder_creator", claimFounderBadge)
            .apply()
        return true
    }

    fun setFounderCreatorBadge(enabled: Boolean) {
        prefs.edit().putBoolean("is_founder_creator", enabled).apply()
    }

    fun addFriend(friendUsername: String): Boolean {
        val clean = friendUsername.trim()
        if (clean.length < 2) return false
        val current = getFriends().toMutableList()
        if (current.any { it.equals(clean, ignoreCase = true) }) return false
        current.add(clean)
        val arr = JSONArray()
        current.forEach { arr.put(it) }
        prefs.edit().putString("friends_json", arr.toString()).apply()
        return true
    }

    fun getFriends(): List<String> {
        val raw = prefs.getString("friends_json", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } }
        }.getOrDefault(emptyList())
    }

    /**
     * Standard K=32 ELO update for verified 2P VS matches.
     */
    fun recordVsEloMatch(outcome: String, opponentElo: Int = DEFAULT_VS_ELO): Int {
        val currentElo = prefs.getInt("elo_rating", DEFAULT_VS_ELO)
        val expected = 1.0 / (1.0 + 10.0.pow((opponentElo - currentElo) / 400.0))
        val actual = when (outcome) {
            "win" -> 1.0
            "draw" -> 0.5
            else -> 0.0
        }
        val delta = (32.0 * (actual - expected)).roundToInt()
        val nextElo = (currentElo + delta).coerceAtLeast(100)
        val peakElo = maxOf(prefs.getInt("peak_elo", DEFAULT_VS_ELO), nextElo)
        val editor = prefs.edit()
            .putInt("elo_rating", nextElo)
            .putInt("peak_elo", peakElo)
        when (outcome) {
            "win" -> editor.putInt("vs_wins", prefs.getInt("vs_wins", 0) + 1)
            "loss" -> editor.putInt("vs_losses", prefs.getInt("vs_losses", 0) + 1)
            else -> editor.putInt("vs_draws", prefs.getInt("vs_draws", 0) + 1)
        }
        editor.apply()
        return nextElo
    }

    fun getProfile(): NativePlayerProfile {
        val xp = prefs.getInt("xp", 0)
        val level = floor(sqrt(xp / 100.0)).toInt() + 1
        val isFounder = prefs.getBoolean("is_founder_creator", false)
        return NativePlayerProfile(
            username = prefs.getString("username", "Guest Player") ?: "Guest Player",
            countryCode = prefs.getString("country", "IN") ?: "IN",
            xp = xp,
            level = level,
            rankTier = RankTier.forXp(xp),
            eloRating = prefs.getInt("elo_rating", DEFAULT_VS_ELO),
            peakElo = prefs.getInt("peak_elo", DEFAULT_VS_ELO),
            vsWins = prefs.getInt("vs_wins", 0),
            vsLosses = prefs.getInt("vs_losses", 0),
            vsDraws = prefs.getInt("vs_draws", 0),
            friends = getFriends(),
            isFounderCreator = isFounder,
            founderBadgeLabel = if (isFounder) FOUNDER_BADGE_LABEL else null,
            bronze = prefs.getInt("trophy_bronze", 0),
            silver = prefs.getInt("trophy_silver", 0),
            gold = prefs.getInt("trophy_gold", 0),
            platinum = prefs.getInt("trophy_platinum", 0)
        )
    }

    fun hasUnlocked(achievementId: String): Boolean =
        listUnlocked().any { it.achievementId == achievementId }

    fun recordStageSplits(gameId: String, splits: List<StageSplitEvent>) {
        val official = splits.filter { it.verifiedOfficial }
        if (official.isEmpty()) return
        val existing = getBestStageSplits(gameId).associateBy { it.stageNumber }.toMutableMap()
        for (split in official) {
            val prev = existing[split.stageNumber]
            if (prev == null || split.cumulativeFrames < prev.cumulativeFrames) {
                existing[split.stageNumber] = split
            }
        }
        val arr = JSONArray()
        for (s in existing.values.sortedBy { it.stageNumber }) {
            arr.put(JSONObject().apply {
                put("gameId", s.gameId)
                put("stageNumber", s.stageNumber)
                put("stageLabel", s.stageLabel)
                put("isFinalStage", s.isFinalStage)
                put("splitFrames", s.splitFrames)
                put("cumulativeFrames", s.cumulativeFrames)
                put("splitTimeMs", s.splitTimeMs)
                put("cumulativeTimeMs", s.cumulativeTimeMs)
                put("completedAtMs", s.completedAtMs)
                put("verifiedOfficial", s.verifiedOfficial)
            })
        }
        prefs.edit().putString("splits_$gameId", arr.toString()).apply()
    }

    fun getBestStageSplits(gameId: String): List<StageSplitEvent> {
        val raw = prefs.getString("splits_$gameId", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                StageSplitEvent(
                    gameId = o.optString("gameId", gameId),
                    stageNumber = o.optInt("stageNumber"),
                    stageLabel = o.optString("stageLabel"),
                    isFinalStage = o.optBoolean("isFinalStage"),
                    splitFrames = o.optLong("splitFrames"),
                    cumulativeFrames = o.optLong("cumulativeFrames"),
                    splitTimeMs = o.optLong("splitTimeMs"),
                    cumulativeTimeMs = o.optLong("cumulativeTimeMs"),
                    completedAtMs = o.optLong("completedAtMs"),
                    verifiedOfficial = o.optBoolean("verifiedOfficial", true)
                )
            }.sortedBy { it.stageNumber }
        }.getOrDefault(emptyList())
    }

    fun recordOfficialUnlock(ev: UnlockedTrophyEvent): Boolean {
        val existing = listUnlocked().toMutableList()
        if (existing.any { it.achievementId == ev.achievementId }) return false
        existing.add(0, ev)
        val arr = JSONArray()
        for (item in existing) {
            arr.put(JSONObject().apply {
                put("achievementId", item.achievementId)
                put("gameId", item.gameId)
                put("title", item.title)
                put("tier", item.tier.name)
                put("xpAwarded", item.xpAwarded)
                put("frameCount", item.frameCount)
                put("romSha256", item.romSha256)
                put("coreVersion", item.coreVersion)
                put("unlockedAtMs", item.unlockedAtMs)
            })
        }
        val tierKey = "trophy_${ev.tier.name.lowercase()}"
        prefs.edit()
            .putString("unlocked_json", arr.toString())
            .putInt("xp", prefs.getInt("xp", 0) + ev.xpAwarded)
            .putInt(tierKey, prefs.getInt(tierKey, 0) + 1)
            .apply()
        return true
    }

    fun listUnlocked(): List<UnlockedTrophyEvent> {
        val raw = prefs.getString("unlocked_json", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                UnlockedTrophyEvent(
                    achievementId = o.optString("achievementId"),
                    gameId = o.optString("gameId"),
                    title = o.optString("title"),
                    tier = runCatching { TrophyTier.valueOf(o.optString("tier")) }.getOrDefault(TrophyTier.BRONZE),
                    xpAwarded = o.optInt("xpAwarded"),
                    frameCount = o.optLong("frameCount"),
                    romSha256 = o.optString("romSha256"),
                    coreVersion = o.optString("coreVersion"),
                    unlockedAtMs = o.optLong("unlockedAtMs")
                )
            }
        }.getOrDefault(emptyList())
    }
}

/**
 * Pure Native Android View Dashboard for TGK RETRO 4.4 – NES CHAMPIONS SYSTEM (Zero WebView).
 * Surfaces the 60-game NES Catalog, real Local Library matching, Compatibility Matrix,
 * Strict 90s Arcade Rule status, Stage Splits (MM:SS.ms), XP Rank Tiers, 2P VS ELO,
 * 5 Leaderboard scopes, and TGK FOUNDER / CREATOR App Owner badge.
 */
object ChampionsDashboardDialog {

    fun show(
        context: Context,
        romLibrary: LocalNesRomLibrary,
        profileRepo: ChampionsProfileRepository,
        engine: ChampionsAchievementEngine,
        onModeChanged: (SessionMode) -> Unit
    ) {
        val density = context.resources.displayMetrics.density
        fun dp(v: Int): Int = (v * density).toInt()

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0A0C12"))
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }

        val profile = profileRepo.getProfile()
        val matches = NesChampionsCatalog.matchAgainstLibrary(romLibrary.listLocalRoms())
        val installedCount = matches.count { it.installed }
        val verifiedCount = NesChampionsCatalog.allGames.count {
            it.compatibilityTier == NesCompatibilityTier.VERIFIED_RAM_HOOKS
        }

        val header = TextView(context).apply {
            text = "TGK RETRO 4.4 · NES CHAMPIONS"
            setTextColor(Color.parseColor("#22D3EE"))
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
        }
        val founderTag = if (profile.isFounderCreator) " ★ ${ChampionsProfileRepository.FOUNDER_BADGE_LABEL}" else ""
        val subtitle = TextView(context).apply {
            text = "${profile.username} (${profile.countryCode})$founderTag\nRank: ${profile.rankTier.label} · Lv.${profile.level} (${profile.xp} XP) · 2P VS ELO: ${profile.eloRating}\n60 NES Titles · $installedCount Installed · $verifiedCount Verified WRAM"
            setTextColor(Color.parseColor("#CBD5E1"))
            textSize = 11f
            setPadding(0, dp(4), 0, dp(8))
        }
        root.addView(header)
        root.addView(subtitle)

        // Strict 90s Arcade Rule Status Banner
        val validity = engine.getRunValidityStatus()
        val ruleView = TextView(context).apply {
            text = "90s Arcade Rule: ${validity.label} (Save-State Load, Rewind, Fast-Forward, or Cheats immediately disqualify)"
            setTextColor(
                when (validity) {
                    RunValidityStatus.VALID_OFFICIAL -> Color.parseColor("#34D399")
                    RunValidityStatus.INVALID_DISQUALIFIED -> Color.parseColor("#FCA5A5")
                    RunValidityStatus.PRACTICE -> Color.parseColor("#C4B5FD")
                }
            )
            textSize = 10.5f
            setPadding(dp(10), dp(6), dp(10), dp(6))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#111827"))
                cornerRadius = dp(8).toFloat()
            }
        }
        root.addView(ruleView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(8)
        })

        // Official Ranked vs Practice Mode toggle + Founder Badge toggle
        val actionsRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val modeBtn = Button(context).apply {
            text = "Mode: ${engine.sessionMode.label}"
            setTextColor(Color.WHITE)
            textSize = 10.5f
            background = GradientDrawable().apply {
                setColor(if (engine.sessionMode == SessionMode.OFFICIAL_RANKED) Color.parseColor("#0E7490") else Color.parseColor("#4C1D95"))
                cornerRadius = dp(8).toFloat()
            }
            setOnClickListener {
                val next = if (engine.sessionMode == SessionMode.OFFICIAL_RANKED) SessionMode.PRACTICE else SessionMode.OFFICIAL_RANKED
                onModeChanged(next)
                text = "Mode: ${next.label}"
                background = GradientDrawable().apply {
                    setColor(if (next == SessionMode.OFFICIAL_RANKED) Color.parseColor("#0E7490") else Color.parseColor("#4C1D95"))
                    cornerRadius = dp(8).toFloat()
                }
            }
        }
        actionsRow.addView(modeBtn, LinearLayout.LayoutParams(0, dp(38), 1f).apply { marginEnd = dp(6) })

        val founderBtn = Button(context).apply {
            text = if (profile.isFounderCreator) "★ Founder Badge ON" else "Claim Founder Badge"
            setTextColor(Color.parseColor("#070910"))
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F59E0B"))
                cornerRadius = dp(8).toFloat()
            }
            setOnClickListener {
                val nextState = !profileRepo.getProfile().isFounderCreator
                profileRepo.setFounderCreatorBadge(nextState)
                text = if (nextState) "★ Founder Badge ON" else "Claim Founder Badge"
            }
        }
        actionsRow.addView(founderBtn, LinearLayout.LayoutParams(0, dp(38), 1f))
        root.addView(actionsRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(8)
        })

        // Search input for 60-Game Catalog & Compatibility Matrix
        val searchBox = EditText(context).apply {
            hint = "Search 60 NES games (Contra, Mario, Mega Man, Little Samson...)"
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            textSize = 12f
            setPadding(dp(10), dp(8), dp(10), dp(8))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#141824"))
                setStroke(dp(1), Color.parseColor("#334155"))
                cornerRadius = dp(8).toFloat()
            }
        }
        root.addView(searchBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(8)
        })

        val listContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
        }

        fun renderCatalog(query: String) {
            listContainer.removeAllViews()
            val q = query.trim().lowercase()
            val filtered = matches.filter {
                q.isEmpty() || it.game.title.lowercase().contains(q) || it.game.genre.lowercase().contains(q)
            }
            for (item in filtered) {
                val g = item.game
                val bestSplits = profileRepo.getBestStageSplits(g.gameId)
                val splitSummary = if (bestSplits.isEmpty()) {
                    "No official splits yet"
                } else {
                    "Best Splits: " + bestSplits.takeLast(2).joinToString(" · ") {
                        "S${it.stageNumber} ${ChampionsAchievementEngine.formatFramesToSplitMs(it.cumulativeFrames)}"
                    }
                }
                val card = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(10), dp(8), dp(10), dp(8))
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#131722"))
                        setStroke(dp(1), if (item.installed) Color.parseColor("#22D3EE") else Color.parseColor("#1E293B"))
                        cornerRadius = dp(8).toFloat()
                    }
                }
                val titleView = TextView(context).apply {
                    text = "#${g.catalogNumber} ${g.title} (${g.releaseYear}) · ${if (item.installed) "INSTALLED" else "Not Installed"}"
                    setTextColor(if (item.installed) Color.parseColor("#22D3EE") else Color.parseColor("#F8FAFC"))
                    textSize = 12.5f
                    typeface = Typeface.DEFAULT_BOLD
                }
                val metaView = TextView(context).apply {
                    text = "${g.genre} · ${g.regions.joinToString("/")} · ${g.compatibilityTier.label} · $splitSummary"
                    setTextColor(Color.parseColor("#94A3B8"))
                    textSize = 10.5f
                }
                card.addView(titleView)
                card.addView(metaView)
                listContainer.addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(6)
                })
            }
        }

        renderCatalog("")
        searchBox.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                renderCatalog(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        val scroll = ScrollView(context).apply {
            addView(listContainer)
        }
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(310)))

        val integrityNote = TextView(context).apply {
            text = "Boards: Global · Country · Friends (${profile.friends.size}) · Game-Wise · Speedrun/Challenge. Zero fake records. Trophies: B:${profile.bronze} S:${profile.silver} G:${profile.gold} P:${profile.platinum}"
            setTextColor(Color.parseColor("#F59E0B"))
            textSize = 10f
            gravity = Gravity.START
            setPadding(0, dp(8), 0, 0)
        }
        root.addView(integrityNote)

        AlertDialog.Builder(context)
            .setView(root)
            .setPositiveButton("Close", null)
            .show()
    }
}

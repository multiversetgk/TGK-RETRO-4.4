package com.tgk.testemulators.champions

import com.tgk.testemulators.core.IEmulatorCore
import kotlin.math.roundToLong

enum class TrophyTier(val label: String, val xpReward: Int, val colorHex: Int) {
    BRONZE("Bronze", 25, 0xFFCD7F32.toInt()),
    SILVER("Silver", 75, 0xFFC0C8D4.toInt()),
    GOLD("Gold", 150, 0xFFF59E0B.toInt()),
    PLATINUM("Platinum", 300, 0xFF22D3EE.toInt())
}

enum class SessionMode(val label: String) {
    OFFICIAL_RANKED("Official Ranked"),
    PRACTICE("Practice Mode")
}

enum class RunValidityStatus(val label: String) {
    VALID_OFFICIAL("VALID OFFICIAL (90s ARCADE)"),
    INVALID_DISQUALIFIED("INVALID · DISQUALIFIED"),
    PRACTICE("PRACTICE MODE")
}

data class IntegrityFlag(
    val code: String,
    val detail: String,
    val disqualifiesOfficial: Boolean
)

data class StageSplitEvent(
    val gameId: String,
    val stageNumber: Int,
    val stageLabel: String,
    val isFinalStage: Boolean,
    val splitFrames: Long,
    val cumulativeFrames: Long,
    val splitTimeMs: Long,
    val cumulativeTimeMs: Long,
    val completedAtMs: Long,
    val verifiedOfficial: Boolean
)

data class UnlockedTrophyEvent(
    val achievementId: String,
    val gameId: String,
    val title: String,
    val tier: TrophyTier,
    val xpAwarded: Int,
    val frameCount: Long,
    val romSha256: String,
    val coreVersion: String,
    val unlockedAtMs: Long
)

/**
 * TGK RETRO 4.4 Native Android WRAM, Strict 90s Arcade Rule & Stage-by-Stage Split Engine.
 * Reads live 2 KB NES System RAM ($0000-$07FF) directly from libretro-fceumm via
 * IEmulatorCore.readSystemRam() with zero screenshot/OCR heuristics.
 */
class ChampionsAchievementEngine(
    private val core: IEmulatorCore,
    private val repository: ChampionsProfileRepository
) {
    companion object {
        const val NES_NTSC_FPS = 60.0988

        fun framesToExactMs(frames: Long): Long {
            val safe = frames.coerceAtLeast(0L)
            return ((safe * 1000.0) / NES_NTSC_FPS).roundToLong()
        }

        fun formatFramesToSplitMs(frames: Long): String {
            val totalMs = framesToExactMs(frames)
            val mins = totalMs / 60_000L
            val secs = (totalMs % 60_000L) / 1000L
            val ms = totalMs % 1000L
            return String.format("%02d:%02d.%03d", mins, secs, ms)
        }
    }

    @Volatile
    var sessionMode: SessionMode = SessionMode.OFFICIAL_RANKED
        private set

    @Volatile
    var activeGame: NesCatalogEntry? = null
        private set

    @Volatile
    var elapsedFrames: Long = 0L
        private set

    @Volatile
    var pauseCount: Int = 0
        private set

    @Volatile
    var saveStateLoads: Int = 0
        private set

    @Volatile
    var rewindCount: Int = 0
        private set

    @Volatile
    var fastForwardCount: Int = 0
        private set

    @Volatile
    var cheatsEnabled: Boolean = false
        private set

    @Volatile
    var turboOrCheatFlagged: Boolean = false
        private set

    @Volatile
    var deathsObserved: Int = 0
        private set

    @Volatile
    var highestStageCleared: Int = 0
        private set

    @Volatile
    var gameCompleted: Boolean = false
        private set

    private val ramBuffer = ByteArray(2048)
    private val flags = ArrayList<IntegrityFlag>()
    private val sessionUnlocked = HashSet<String>()
    private val stageSplits = ArrayList<StageSplitEvent>()
    private var lastSplitFrame: Long = 0L
    private var lastLivesByte: Int? = null
    private var activeRomSha256: String = ""

    fun startSession(mode: SessionMode, fileName: String, romSha256: String) {
        sessionMode = mode
        activeGame = NesChampionsCatalog.identifyRom(fileName)
        activeRomSha256 = romSha256
        elapsedFrames = 0L
        pauseCount = 0
        saveStateLoads = 0
        rewindCount = 0
        fastForwardCount = 0
        cheatsEnabled = false
        turboOrCheatFlagged = false
        deathsObserved = 0
        highestStageCleared = 0
        gameCompleted = false
        lastSplitFrame = 0L
        lastLivesByte = null
        sessionUnlocked.clear()
        stageSplits.clear()
        flags.clear()

        if (mode == SessionMode.PRACTICE) {
            flags.add(IntegrityFlag("PRACTICE_MODE", "Practice Mode active; official unlocks disabled.", true))
        }
        if (core.coreId != "libretro-fceumm-android") {
            flags.add(IntegrityFlag("UNVERIFIED_CORE", "Unapproved core ID: ${core.coreId}", true))
        }
        if (activeGame == null) {
            flags.add(IntegrityFlag("ROM_UNIDENTIFIED", "ROM not matched to 60-game NES Catalog.", true))
        }
    }

    fun isOfficialEligible(): Boolean =
        sessionMode == SessionMode.OFFICIAL_RANKED &&
            activeGame != null &&
            flags.none { it.disqualifiesOfficial }

    fun getRunValidityStatus(): RunValidityStatus {
        if (sessionMode == SessionMode.PRACTICE) return RunValidityStatus.PRACTICE
        return if (isOfficialEligible()) {
            RunValidityStatus.VALID_OFFICIAL
        } else {
            RunValidityStatus.INVALID_DISQUALIFIED
        }
    }

    fun getIntegrityFlags(): List<IntegrityFlag> = flags.toList()

    fun getStageSplits(): List<StageSplitEvent> = stageSplits.toList()

    fun recordPause() {
        pauseCount += 1
        if (pauseCount > 12 && flags.none { it.code == "EXCESSIVE_PAUSE_ABUSE" }) {
            flags.add(IntegrityFlag("EXCESSIVE_PAUSE_ABUSE", "Exceeded 12 pauses in Ranked Mode.", true))
        }
    }

    fun recordReset() {
        elapsedFrames = 0L
        deathsObserved = 0
        highestStageCleared = 0
        gameCompleted = false
        lastSplitFrame = 0L
        lastLivesByte = null
        stageSplits.clear()
    }

    /**
     * Strict 90s Arcade Rule: loading a save state IMMEDIATELY invalidates Official Ranked Mode.
     */
    fun recordSaveStateLoad() {
        saveStateLoads += 1
        if (flags.none { it.code == "SAVE_STATE_USED" }) {
            flags.add(
                IntegrityFlag(
                    "SAVE_STATE_USED",
                    "Strict 90s Rule: Save-state load immediately disqualified this run.",
                    true
                )
            )
        }
    }

    fun recordRewind() {
        rewindCount += 1
        if (flags.none { it.code == "REWIND_USED" }) {
            flags.add(
                IntegrityFlag(
                    "REWIND_USED",
                    "Strict 90s Rule: Rewind immediately disqualified this run.",
                    true
                )
            )
        }
    }

    fun recordFastForward() {
        fastForwardCount += 1
        if (flags.none { it.code == "FAST_FORWARD_USED" }) {
            flags.add(
                IntegrityFlag(
                    "FAST_FORWARD_USED",
                    "Strict 90s Rule: Fast-Forward immediately disqualified this run.",
                    true
                )
            )
        }
    }

    fun recordCheatsEnabled(reason: String = "Game Genie / RAM Cheat") {
        cheatsEnabled = true
        turboOrCheatFlagged = true
        if (flags.none { it.code == "CHEATS_ENABLED" }) {
            flags.add(
                IntegrityFlag(
                    "CHEATS_ENABLED",
                    "Strict 90s Rule: Cheats ($reason) immediately disqualified this run.",
                    true
                )
            )
        }
    }

    fun recordTurboOrCheat(reason: String) {
        turboOrCheatFlagged = true
        if (flags.none { it.code == "TURBO_OR_CHEAT_ACTIVE" }) {
            flags.add(IntegrityFlag("TURBO_OR_CHEAT_ACTIVE", "Turbo/cheat flagged ($reason).", true))
        }
    }

    /**
     * Called once per rendered NES frame from MainActivity's native emulation thread.
     * Samples 2 KB WRAM every 15 frames (~4x/sec) for verified titles only.
     */
    fun onFrameAdvanced(onUnlocked: (UnlockedTrophyEvent) -> Unit) {
        elapsedFrames += 1L
        val game = activeGame ?: return
        if (game.compatibilityTier != NesCompatibilityTier.VERIFIED_RAM_HOOKS) return
        if (elapsedFrames % 15L != 0L) return
        if (!core.readSystemRam(ramBuffer)) return

        observeDeaths(game.gameId)
        val newSplits = observeStageSplits(game)
        if (!isOfficialEligible()) return

        if (newSplits.isNotEmpty()) {
            repository.recordStageSplits(game.gameId, newSplits)
        }

        val unlocked = evaluateVerifiedHooks(game, newSplits)
        for (ev in unlocked) {
            if (repository.recordOfficialUnlock(ev)) {
                onUnlocked(ev)
            }
        }
    }

    private fun ramU8(addr: Int): Int = ramBuffer[addr and 0x07FF].toInt() and 0xFF

    private fun observeDeaths(gameId: String) {
        val livesAddr = when (gameId) {
            "super-mario-bros" -> {
                if (ramU8(0x000E) == 0x0B) {
                    if (lastLivesByte != -1) {
                        deathsObserved += 1
                        lastLivesByte = -1
                    }
                    return
                }
                0x075A
            }
            "contra", "super-c" -> 0x0032
            "mega-man-2" -> 0x00A8
            "castlevania" -> 0x002A
            "ninja-gaiden" -> 0x0076
            "super-mario-bros-3" -> 0x0736
            "kirbys-adventure" -> 0x0594
            "ducktales" -> 0x00C9
            else -> return
        }
        val cur = ramU8(livesAddr)
        val prev = lastLivesByte
        if (prev != null && prev >= 0 && cur < prev) {
            deathsObserved += 1
        }
        lastLivesByte = cur
    }

    private fun observeStageSplits(game: NesCatalogEntry): List<StageSplitEvent> {
        val (clearedStage, totalStages, labelFn) = when (game.gameId) {
            "contra" -> Triple(ramU8(0x0030).coerceIn(0, 8), 8) { n: Int ->
                if (n == 8) "Stage 8 · Alien's Lair (Final)" else "Stage $n"
            }
            "super-c" -> Triple(ramU8(0x0030).coerceIn(0, 8), 8) { n: Int ->
                if (n == 8) "Stage 8 · Red Falcon Core (Final)" else "Stage $n"
            }
            "super-mario-bros" -> {
                val world = (ramU8(0x075F) and 0x07) + 1
                val sub = (ramU8(0x075C) and 0x03) + 1
                val clearedWorlds = (world - 1).coerceIn(0, 8) + if (world == 8 && sub >= 4 && ramU8(0x001D) == 0x03) 1 else 0
                Triple(clearedWorlds.coerceIn(0, 8), 8) { n: Int ->
                    if (n == 8) "World 8 · Final Castle" else "World $n"
                }
            }
            "mega-man-2" -> {
                val count = Integer.bitCount(ramU8(0x009A)).coerceIn(0, 8)
                Triple(count, 8) { n: Int -> "Robot Master #$n" }
            }
            "castlevania" -> {
                val block = (ramU8(0x0028) / 3).coerceIn(0, 6)
                Triple(block, 6) { n: Int -> if (n == 6) "Stage 6 · Dracula's Keep (Final)" else "Stage $n" }
            }
            "legend-of-zelda" -> {
                val triforce = Integer.bitCount(ramU8(0x0671)).coerceIn(0, 8)
                Triple(triforce, 8) { n: Int -> "Dungeon $n · Triforce" }
            }
            else -> return emptyList()
        }

        if (clearedStage <= highestStageCleared) return emptyList()
        val recorded = ArrayList<StageSplitEvent>()
        val nowMs = System.currentTimeMillis()
        val official = isOfficialEligible()
        for (stageNum in (highestStageCleared + 1)..clearedStage) {
            val isFinal = stageNum >= totalStages
            val splitFrames = (elapsedFrames - lastSplitFrame).coerceAtLeast(1L)
            val ev = StageSplitEvent(
                gameId = game.gameId,
                stageNumber = stageNum,
                stageLabel = labelFn(stageNum),
                isFinalStage = isFinal,
                splitFrames = splitFrames,
                cumulativeFrames = elapsedFrames,
                splitTimeMs = framesToExactMs(splitFrames),
                cumulativeTimeMs = framesToExactMs(elapsedFrames),
                completedAtMs = nowMs,
                verifiedOfficial = official
            )
            stageSplits.add(ev)
            recorded.add(ev)
            lastSplitFrame = elapsedFrames
            if (isFinal) {
                gameCompleted = true
            }
        }
        highestStageCleared = clearedStage
        return recorded
    }

    private fun evaluateVerifiedHooks(
        game: NesCatalogEntry,
        newSplits: List<StageSplitEvent>
    ): List<UnlockedTrophyEvent> {
        val out = ArrayList<UnlockedTrophyEvent>()
        fun tryUnlock(slug: String, label: String, tier: TrophyTier, condition: Boolean) {
            if (!condition) return
            val id = "nes_${game.gameId}_$slug"
            if (sessionUnlocked.contains(id) || repository.hasUnlocked(id)) return
            sessionUnlocked.add(id)
            out.add(
                UnlockedTrophyEvent(
                    achievementId = id,
                    gameId = game.gameId,
                    title = "${game.title}: $label",
                    tier = tier,
                    xpAwarded = tier.xpReward,
                    frameCount = elapsedFrames,
                    romSha256 = activeRomSha256,
                    coreVersion = core.coreName,
                    unlockedAtMs = System.currentTimeMillis()
                )
            )
        }

        // Stage-by-Stage Clear & Official 90s Game Completion milestones
        for (split in newSplits) {
            val tier = if (split.isFinalStage) TrophyTier.GOLD else if (split.stageNumber >= 4) TrophyTier.SILVER else TrophyTier.BRONZE
            tryUnlock(
                "stage-${split.stageNumber}-clear",
                "${split.stageLabel} Clear (${formatFramesToSplitMs(split.cumulativeFrames)})",
                tier,
                true
            )
            if (split.isFinalStage) {
                tryUnlock(
                    "official-game-completion",
                    "Official 90s Arcade Game Clear (${formatFramesToSplitMs(split.cumulativeFrames)})",
                    TrophyTier.PLATINUM,
                    true
                )
            }
        }

        when (game.gameId) {
            "super-mario-bros" -> {
                val linearStage = (ramU8(0x075F) and 0x07) * 4 + (ramU8(0x075C) and 0x03) + 1
                val coins = ramU8(0x075E)
                var score = 0
                for (a in 0x07DD..0x07E2) score = score * 10 + ramU8(a).coerceAtMost(9)
                score *= 10
                tryUnlock("first-stage-clear", "First Blood Clear", TrophyTier.BRONZE, linearStage >= 2)
                tryUnlock("stage1-no-death", "Untouched Opener", TrophyTier.BRONZE, linearStage >= 2 && deathsObserved == 0)
                tryUnlock("midgame-breach", "Midpoint Vanguard", TrophyTier.SILVER, linearStage >= 13)
                tryUnlock("collectible-starter", "First Hoard", TrophyTier.BRONZE, coins >= 25)
                tryUnlock("score-tier-1", "Arcade Rookie Score", TrophyTier.BRONZE, score >= 10_000)
                tryUnlock("score-tier-2", "High Score Contender", TrophyTier.SILVER, score >= 50_000)
                tryUnlock("score-tier-3", "Arcade Cabinet Legend", TrophyTier.GOLD, score >= 100_000)
            }
            "contra", "super-c" -> {
                val stage = ramU8(0x0030)
                val score = ((ramU8(0x07E3) shl 8) or ramU8(0x07E2)) * 100
                tryUnlock("first-stage-clear", "First Blood Clear", TrophyTier.BRONZE, stage >= 1)
                tryUnlock("stage1-no-death", "Untouched Opener", TrophyTier.BRONZE, stage >= 1 && deathsObserved == 0)
                tryUnlock("midgame-breach", "Midpoint Vanguard", TrophyTier.SILVER, stage >= 4)
                tryUnlock("score-tier-1", "Arcade Rookie Score", TrophyTier.BRONZE, score >= 10_000)
                tryUnlock("score-tier-2", "High Score Contender", TrophyTier.SILVER, score >= 50_000)
            }
            "mega-man-2" -> {
                val defeatedCount = Integer.bitCount(ramU8(0x009A))
                tryUnlock("first-stage-clear", "First Boss Down", TrophyTier.BRONZE, defeatedCount >= 1)
                tryUnlock("midgame-breach", "Midpoint Vanguard", TrophyTier.SILVER, defeatedCount >= 4)
                tryUnlock("final-stage-arrival", "Gates of the Finale", TrophyTier.GOLD, defeatedCount >= 8)
            }
            "castlevania" -> {
                val stage = ramU8(0x0028)
                val hearts = ramU8(0x0071)
                tryUnlock("first-stage-clear", "First Blood Clear", TrophyTier.BRONZE, stage >= 4)
                tryUnlock("collectible-starter", "First Hoard", TrophyTier.BRONZE, hearts >= 25)
            }
            "legend-of-zelda" -> {
                val triforce = Integer.bitCount(ramU8(0x0671))
                val rupees = ramU8(0x066D)
                tryUnlock("first-stage-clear", "First Boss Down", TrophyTier.BRONZE, triforce >= 1)
                tryUnlock("collectible-starter", "First Hoard", TrophyTier.BRONZE, rupees >= 25)
            }
            "tetris" -> {
                val level = ramU8(0x0044)
                val lines = ramU8(0x0050)
                tryUnlock("first-stage-clear", "Level 5 Clear", TrophyTier.BRONZE, level >= 5)
                tryUnlock("collectible-starter", "25 Lines Cleared", TrophyTier.BRONZE, lines >= 25)
            }
        }
        return out
    }
}

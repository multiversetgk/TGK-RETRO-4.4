package com.tgk.testemulators.champions

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

enum class NesCompatibilityTier(val label: String) {
    VERIFIED_RAM_HOOKS("Verified Native RAM Hooks"),
    PARTIAL_HOOKS_REVIEW("Frame-Timed + Manual Review"),
    PENDING_COMMUNITY_REVIEW("Pending RAM Hooks / Video Review")
}

data class NesCatalogEntry(
    val catalogNumber: Int,
    val gameId: String,
    val title: String,
    val releaseYear: Int,
    val publisher: String,
    val genre: String,
    val regions: List<String>,
    val mapperName: String,
    val filenamePatterns: List<String>,
    val compatibilityTier: NesCompatibilityTier,
    val ramAddresses: List<String>,
    val ramNotes: String,
    val coverPrimaryColor: Int,
    val coverAccentColor: Int,
    val targetAchievements: Int = 50,
    val activeAutoRules: Int = when (compatibilityTier) {
        NesCompatibilityTier.VERIFIED_RAM_HOOKS -> 14
        NesCompatibilityTier.PARTIAL_HOOKS_REVIEW -> 4
        NesCompatibilityTier.PENDING_COMMUNITY_REVIEW -> 0
    }
)

data class LocalRomRecord(
    val fileName: String,
    val sha256Hex: String,
    val crc32Hex: String,
    val sizeBytes: Int,
    val lastLoadedAtMs: Long
)

data class CatalogMatchEntry(
    val game: NesCatalogEntry,
    val installed: Boolean,
    val matchedFileName: String?,
    val matchedSha256: String?
)

/**
 * Modular 60-title NES-ONLY Champions Catalog (1. Contra through 60. Little Samson).
 * Strictly metadata & compatibility rules — ZERO copyrighted ROM files.
 */
object NesChampionsCatalog {

    val allGames: List<NesCatalogEntry> = listOf(
        entry(1, "contra", "Contra", 1988, "Konami", "Run & Gun", listOf("USA", "JPN"), "UxROM", listOf("contra", "gryzor"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0030 Stage", "\$0032 Lives", "\$00AA Weapon", "\$07E2-\$07E3 Score"), "Native WRAM hooks verified.", 0xFF991B1B.toInt(), 0xFF22D3EE.toInt()),
        entry(2, "super-c", "Super C", 1990, "Konami", "Run & Gun", listOf("USA", "JPN"), "MMC3", listOf("super c", "super contra"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0030 Stage", "\$0032 Lives", "\$00B8 Weapon", "\$07E2-\$07E3 Score"), "Native WRAM hooks verified.", 0xFFB91C1C.toInt(), 0xFFF59E0B.toInt()),
        entry(3, "contra-force", "Contra Force", 1992, "Konami", "Run & Gun", listOf("USA"), "MMC3", listOf("contra force"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending verified WRAM hooks.", 0xFF7C2D12.toInt(), 0xFFF59E0B.toInt()),
        entry(4, "jackal", "Jackal", 1988, "Konami", "Run & Gun", listOf("USA", "JPN"), "UxROM", listOf("jackal", "top gunner"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF3F6212.toInt(), 0xFF22D3EE.toInt()),
        entry(5, "rushn-attack", "Rush'n Attack", 1987, "Konami", "Run & Gun", listOf("USA", "EUR", "JPN"), "UxROM", listOf("rushn attack", "rush'n attack", "green beret"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF4D7C0F.toInt(), 0xFFF59E0B.toInt()),
        entry(6, "ninja-gaiden", "Ninja Gaiden", 1988, "Tecmo", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC1", listOf("ninja gaiden", "shadow warriors"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$006D Act", "\$0076 Lives", "\$0065 HP", "\$0060-\$0062 Score"), "Native WRAM hooks verified.", 0xFF4C1D95.toInt(), 0xFF22D3EE.toInt()),
        entry(7, "ninja-gaiden-ii", "Ninja Gaiden II", 1990, "Tecmo", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("ninja gaiden ii", "ninja gaiden 2"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF5B21B6.toInt(), 0xFFA78BFA.toInt()),
        entry(8, "ninja-gaiden-iii", "Ninja Gaiden III", 1991, "Tecmo", "Action Platformer", listOf("USA", "JPN"), "MMC3", listOf("ninja gaiden iii", "ninja gaiden 3"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending regional offset audit.", 0xFF6D28D9.toInt(), 0xFFF59E0B.toInt()),
        entry(9, "mega-man", "Mega Man", 1987, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "UxROM", listOf("mega man", "megaman", "rockman"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$006A HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF1D4ED8.toInt(), 0xFF22D3EE.toInt()),
        entry(10, "mega-man-2", "Mega Man 2", 1988, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC1", listOf("mega man 2", "megaman 2", "rockman 2"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$06C0 HP", "\$00A8 Lives", "\$002A Stage", "\$06C1 Boss HP", "\$009A Masters"), "Native WRAM hooks verified.", 0xFF0369A1.toInt(), 0xFF22D3EE.toInt()),
        entry(11, "mega-man-3", "Mega Man 3", 1990, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("mega man 3", "megaman 3", "rockman 3"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$00A2 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF2563EB.toInt(), 0xFFA78BFA.toInt()),
        entry(12, "mega-man-4", "Mega Man 4", 1991, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("mega man 4", "megaman 4", "rockman 4"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$00B0 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF0284C7.toInt(), 0xFF22D3EE.toInt()),
        entry(13, "mega-man-5", "Mega Man 5", 1992, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("mega man 5", "megaman 5", "rockman 5"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$00B0 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF1E40AF.toInt(), 0xFFF59E0B.toInt()),
        entry(14, "mega-man-6", "Mega Man 6", 1993, "Capcom", "Action Platformer", listOf("USA", "JPN"), "MMC3", listOf("mega man 6", "megaman 6", "rockman 6"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$03E5 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF1D4ED8.toInt(), 0xFF22D3EE.toInt()),
        entry(15, "blaster-master", "Blaster Master", 1988, "Sunsoft", "Action Adventure", listOf("USA", "JPN", "EUR"), "MMC1", listOf("blaster master"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF9333EA.toInt(), 0xFF22D3EE.toInt()),
        entry(16, "castlevania", "Castlevania", 1986, "Konami", "Action Platformer", listOf("USA", "JPN", "EUR"), "UxROM", listOf("castlevania", "akumajou dracula"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0028 Stage", "\$002A Lives", "\$0045 HP", "\$0071 Hearts"), "Native WRAM hooks verified.", 0xFF7F1D1D.toInt(), 0xFFF59E0B.toInt()),
        entry(17, "castlevania-ii", "Castlevania II: Simon's Quest", 1987, "Konami", "Action Adventure", listOf("USA", "EUR", "JPN"), "MMC1", listOf("castlevania ii", "castlevania 2", "simons quest"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0080 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF991B1B.toInt(), 0xFFA78BFA.toInt()),
        entry(18, "castlevania-iii", "Castlevania III: Dracula's Curse", 1989, "Konami", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC5", listOf("castlevania iii", "castlevania 3", "draculas curse"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$003C HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF6B21A8.toInt(), 0xFFF59E0B.toInt()),
        entry(19, "super-mario-bros", "Super Mario Bros.", 1985, "Nintendo", "Platformer", listOf("USA", "JPN", "EUR"), "NROM", listOf("super mario bros", "smb1"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$07DD-\$07E2 Score", "\$075E Coins", "\$075A Lives", "\$075F World", "\$075C Stage", "\$000E State"), "Full native WRAM hooks verified.", 0xFFDC2626.toInt(), 0xFFF59E0B.toInt()),
        entry(20, "super-mario-bros-2", "Super Mario Bros. 2", 1988, "Nintendo", "Platformer", listOf("USA", "EUR", "JPN"), "MMC3", listOf("super mario bros 2", "smb2"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$04ED Lives (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF2563EB.toInt(), 0xFFF59E0B.toInt()),
        entry(21, "super-mario-bros-3", "Super Mario Bros. 3", 1988, "Nintendo", "Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("super mario bros 3", "smb3"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0727 World", "\$0736 Lives", "\$0737 Coins"), "Native WRAM hooks verified.", 0xFFD97706.toInt(), 0xFF22D3EE.toInt()),
        entry(22, "metroid", "Metroid", 1986, "Nintendo", "Action Adventure", listOf("USA", "EUR", "JPN"), "MMC1", listOf("metroid"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0106-\$0107 Energy", "\$0685 Missiles", "\$0074 Area"), "Native WRAM hooks verified.", 0xFFB45309.toInt(), 0xFF22D3EE.toInt()),
        entry(23, "legend-of-zelda", "The Legend of Zelda", 1986, "Nintendo", "Action Adventure", listOf("USA", "EUR", "JPN"), "MMC1", listOf("legend of zelda", "zelda 1"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$066F Health", "\$066D Rupees", "\$0671 Triforce", "\$0010 Dungeon"), "Native WRAM hooks verified.", 0xFF15803D.toInt(), 0xFFF59E0B.toInt()),
        entry(24, "zelda-ii", "Zelda II: The Adventure of Link", 1987, "Nintendo", "Action Adventure", listOf("USA", "EUR", "JPN"), "MMC1", listOf("zelda ii", "zelda 2", "adventure of link"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0774 HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFFA16207.toInt(), 0xFF22D3EE.toInt()),
        entry(25, "kirbys-adventure", "Kirby's Adventure", 1993, "Nintendo", "Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("kirbys adventure", "kirby's adventure"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0597 HP", "\$0594 Lives", "\$05A1 Level"), "Native WRAM hooks verified.", 0xFFDB2777.toInt(), 0xFF22D3EE.toInt()),
        entry(26, "dr-mario", "Dr. Mario", 1990, "Nintendo", "Puzzle", listOf("USA", "JPN", "EUR"), "MMC1", listOf("dr mario", "dr. mario"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0316 Level (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF0284C7.toInt(), 0xFFF59E0B.toInt()),
        entry(27, "tetris", "Tetris", 1989, "Nintendo", "Puzzle", listOf("USA", "EUR", "JPN"), "MMC1", listOf("tetris"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$0050-\$0051 Lines", "\$0044 Level", "\$0053-\$0055 Score"), "Native WRAM hooks verified.", 0xFF7C3AED.toInt(), 0xFF22D3EE.toInt()),
        entry(28, "bionic-commando", "Bionic Commando", 1988, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC1", listOf("bionic commando"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$004C HP (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF15803D.toInt(), 0xFFF59E0B.toInt()),
        entry(29, "ducktales", "DuckTales", 1989, "Capcom", "Platformer", listOf("USA", "JPN", "EUR"), "UxROM", listOf("ducktales", "duck tales"), NesCompatibilityTier.VERIFIED_RAM_HOOKS, listOf("\$00C8 HP", "\$00C9 Lives", "\$00CE-\$00D0 Cash", "\$00B1 Stage"), "Native WRAM hooks verified.", 0xFFCA8A04.toInt(), 0xFF22D3EE.toInt()),
        entry(30, "rescue-embassy-mission", "Rescue: The Embassy Mission", 1989, "Kemco", "Action Adventure", listOf("USA", "EUR", "JPN"), "MMC1", listOf("rescue", "embassy mission"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF334155.toInt(), 0xFF22D3EE.toInt()),
        entry(31, "ducktales-2", "DuckTales 2", 1993, "Capcom", "Platformer", listOf("USA", "JPN", "EUR"), "UxROM", listOf("ducktales 2", "duck tales 2"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFB45309.toInt(), 0xFFF59E0B.toInt()),
        entry(32, "chip-n-dale", "Chip 'n Dale Rescue Rangers", 1990, "Capcom", "Platformer", listOf("USA", "JPN", "EUR"), "MMC1", listOf("chip n dale", "chip 'n dale", "rescue rangers"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFC2410C.toInt(), 0xFFF59E0B.toInt()),
        entry(33, "chip-n-dale-2", "Chip 'n Dale Rescue Rangers 2", 1993, "Capcom", "Platformer", listOf("USA", "JPN", "EUR"), "MMC1", listOf("chip n dale 2", "chip 'n dale 2", "rescue rangers 2"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFEA580C.toInt(), 0xFF22D3EE.toInt()),
        entry(34, "darkwing-duck", "Darkwing Duck", 1992, "Capcom", "Action Platformer", listOf("USA", "EUR"), "MMC1", listOf("darkwing duck"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF7E22CE.toInt(), 0xFFF59E0B.toInt()),
        entry(35, "batman", "Batman", 1989, "Sunsoft", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("batman"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF3730A3.toInt(), 0xFFF59E0B.toInt()),
        entry(36, "batman-return-of-the-joker", "Batman: Return of the Joker", 1991, "Sunsoft", "Action Platformer", listOf("USA", "JPN", "EUR"), "Sunsoft-FME7", listOf("return of the joker", "batman return"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF6D28D9.toInt(), 0xFF22D3EE.toInt()),
        entry(37, "tmnt", "Teenage Mutant Ninja Turtles", 1989, "Ultra Games", "Action Adventure", listOf("USA", "JPN", "EUR"), "MMC1", listOf("teenage mutant ninja turtles", "tmnt"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF16A34A.toInt(), 0xFFF59E0B.toInt()),
        entry(38, "tmnt-ii", "Teenage Mutant Ninja Turtles II: The Arcade Game", 1990, "Ultra Games", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "MMC3", listOf("tmnt ii", "tmnt 2", "arcade game"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF15803D.toInt(), 0xFF22D3EE.toInt()),
        entry(39, "tmnt-iii", "Teenage Mutant Ninja Turtles III: The Manhattan Project", 1991, "Konami", "Beat 'em Up", listOf("USA", "JPN"), "MMC3", listOf("tmnt iii", "tmnt 3", "manhattan project"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF047857.toInt(), 0xFFA78BFA.toInt()),
        entry(40, "double-dragon", "Double Dragon", 1988, "Tradewest", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "MMC1", listOf("double dragon"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0043 Mission (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFFB91C1C.toInt(), 0xFFF59E0B.toInt()),
        entry(41, "double-dragon-ii", "Double Dragon II: The Revenge", 1989, "Acclaim", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "MMC3", listOf("double dragon ii", "double dragon 2"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF9F1239.toInt(), 0xFF22D3EE.toInt()),
        entry(42, "double-dragon-iii", "Double Dragon III: The Sacred Stones", 1991, "Acclaim", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "MMC3", listOf("double dragon iii", "double dragon 3"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFB45309.toInt(), 0xFFF59E0B.toInt()),
        entry(43, "river-city-ransom", "River City Ransom", 1989, "Technos", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "MMC1", listOf("river city ransom", "street gangs"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFBE123C.toInt(), 0xFF22D3EE.toInt()),
        entry(44, "battletoads", "Battletoads", 1991, "Tradewest", "Beat 'em Up", listOf("USA", "JPN", "EUR"), "AxROM", listOf("battletoads"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0012 Level (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF15803D.toInt(), 0xFFA78BFA.toInt()),
        entry(45, "battletoads-double-dragon", "Battletoads & Double Dragon", 1993, "Tradewest", "Beat 'em Up", listOf("USA", "EUR"), "AxROM", listOf("battletoads & double dragon", "battletoads double dragon"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF4338CA.toInt(), 0xFFF59E0B.toInt()),
        entry(46, "excitebike", "Excitebike", 1984, "Nintendo", "Sports & Racing", listOf("USA", "JPN", "EUR"), "NROM", listOf("excitebike", "excite bike"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFDC2626.toInt(), 0xFFF59E0B.toInt()),
        entry(47, "adventure-island", "Adventure Island", 1986, "Hudson Soft", "Platformer", listOf("USA", "JPN", "EUR"), "CNROM", listOf("adventure island"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF059669.toInt(), 0xFFF59E0B.toInt()),
        entry(48, "adventure-island-ii", "Adventure Island II", 1991, "Hudson Soft", "Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("adventure island ii", "adventure island 2"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF0D9488.toInt(), 0xFF22D3EE.toInt()),
        entry(49, "adventure-island-iii", "Adventure Island III", 1992, "Hudson Soft", "Platformer", listOf("USA", "JPN"), "MMC3", listOf("adventure island iii", "adventure island 3"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF0284C7.toInt(), 0xFFF59E0B.toInt()),
        entry(50, "kid-icarus", "Kid Icarus", 1986, "Nintendo", "Action Platformer", listOf("USA", "EUR", "JPN"), "MMC1", listOf("kid icarus"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF4F46E5.toInt(), 0xFFF59E0B.toInt()),
        entry(51, "punch-out", "Punch-Out!!", 1987, "Nintendo", "Sports & Racing", listOf("USA", "EUR", "JPN"), "MMC2", listOf("punch-out", "punch out", "mike tyson"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0001 Opponent (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF16A34A.toInt(), 0xFFF59E0B.toInt()),
        entry(52, "gradius", "Gradius", 1986, "Konami", "Shoot 'em Up", listOf("USA", "JPN", "EUR"), "CNROM", listOf("gradius"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0040 Stage (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFF1D4ED8.toInt(), 0xFF22D3EE.toInt()),
        entry(53, "life-force", "Life Force", 1988, "Konami", "Shoot 'em Up", listOf("USA", "JPN", "EUR"), "UxROM", listOf("life force", "salamander"), NesCompatibilityTier.PARTIAL_HOOKS_REVIEW, listOf("\$0042 Stage (Candidate)"), "Frame-timed speedruns active; WRAM under review.", 0xFFBE123C.toInt(), 0xFF22D3EE.toInt()),
        entry(54, "probotector", "Probotector", 1990, "Konami", "Run & Gun", listOf("EUR"), "UxROM", listOf("probotector"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending PAL 50Hz WRAM verification.", 0xFF475569.toInt(), 0xFF22D3EE.toInt()),
        entry(55, "ghosts-n-goblins", "Ghosts 'n Goblins", 1986, "Capcom", "Action Platformer", listOf("USA", "JPN", "EUR"), "UxROM", listOf("ghosts n goblins", "ghosts 'n goblins"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF581C87.toInt(), 0xFFF59E0B.toInt()),
        entry(56, "gi-joe", "G.I. Joe", 1991, "Taxan", "Run & Gun", listOf("USA"), "MMC3", listOf("g.i. joe", "gi joe"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF1E3A8A.toInt(), 0xFFDC2626.toInt()),
        entry(57, "power-blade", "Power Blade", 1991, "Taito", "Action Platformer", listOf("USA", "EUR", "JPN"), "MMC3", listOf("power blade"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF0E7490.toInt(), 0xFFF59E0B.toInt()),
        entry(58, "power-blade-2", "Power Blade 2", 1992, "Taito", "Action Platformer", listOf("USA", "JPN"), "MMC3", listOf("power blade 2", "power blade ii"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF0369A1.toInt(), 0xFFA78BFA.toInt()),
        entry(59, "ninja-kid", "Ninja Kid", 1986, "Bandai", "Action Platformer", listOf("USA", "JPN"), "NROM", listOf("ninja kid"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFF9333EA.toInt(), 0xFFF59E0B.toInt()),
        entry(60, "little-samson", "Little Samson", 1992, "Taito", "Action Platformer", listOf("USA", "JPN", "EUR"), "MMC3", listOf("little samson"), NesCompatibilityTier.PENDING_COMMUNITY_REVIEW, emptyList(), "Pending WRAM verification.", 0xFFC2410C.toInt(), 0xFF22D3EE.toInt())
    )

    private fun entry(
        num: Int,
        id: String,
        title: String,
        year: Int,
        publisher: String,
        genre: String,
        regions: List<String>,
        mapper: String,
        patterns: List<String>,
        tier: NesCompatibilityTier,
        ramAddresses: List<String>,
        ramNotes: String,
        primaryColor: Int,
        accentColor: Int
    ) = NesCatalogEntry(
        catalogNumber = num,
        gameId = id,
        title = title,
        releaseYear = year,
        publisher = publisher,
        genre = genre,
        regions = regions,
        mapperName = mapper,
        filenamePatterns = patterns,
        compatibilityTier = tier,
        ramAddresses = ramAddresses,
        ramNotes = ramNotes,
        coverPrimaryColor = primaryColor,
        coverAccentColor = accentColor
    )

    fun normalizeToken(raw: String): String =
        raw.lowercase()
            .replace(Regex("\\.nes$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\([^)]*\\)"), " ")
            .replace(Regex("\\[[^]]*]"), " ")
            .replace(Regex("[^a-z0-9']+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    fun identifyRom(fileName: String): NesCatalogEntry? {
        val norm = normalizeToken(fileName)
        var best: Pair<NesCatalogEntry, Int>? = null
        for (game in allGames) {
            for (rawPat in game.filenamePatterns) {
                val pat = normalizeToken(rawPat)
                if (pat.isEmpty()) continue
                val matched = norm == pat || norm.startsWith("$pat ") || norm.contains(" $pat ") || norm.endsWith(" $pat")
                if (!matched) continue
                val idx = norm.indexOf(pat)
                val remainder = norm.substring(idx + pat.length).trim()
                val patNumbered = Regex("(\\bii|\\biii|\\b[2-6])$").containsMatchIn(pat)
                val remSequel = Regex("^(2|3|4|5|6|ii|iii|force|return|adventure|simon|dracula|manhattan|arcade|revenge|sacred)\\b").containsMatchIn(remainder)
                if (!patNumbered && remSequel) continue
                if (best == null || pat.length > best.second) {
                    best = game to pat.length
                }
            }
        }
        return best?.first
    }

    fun matchAgainstLibrary(localRoms: List<LocalRomRecord>): List<CatalogMatchEntry> {
        val byGameId = HashMap<String, LocalRomRecord>()
        for (rom in localRoms) {
            val found = identifyRom(rom.fileName)
            if (found != null && !byGameId.containsKey(found.gameId)) {
                byGameId[found.gameId] = rom
            }
        }
        return allGames.map { game ->
            val match = byGameId[game.gameId]
            CatalogMatchEntry(
                game = game,
                installed = match != null,
                matchedFileName = match?.fileName,
                matchedSha256 = match?.sha256Hex
            )
        }
    }
}

/**
 * Tracks ONLY actual locally loaded .nes ROM files chosen by the user via Android SAF.
 * Never fakes installed ROM entries.
 */
class LocalNesRomLibrary(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("tgk_local_nes_library", Context.MODE_PRIVATE)

    fun recordLoadedRom(fileName: String, sha256Hex: String, crc32Hex: String, sizeBytes: Int) {
        val list = listLocalRoms().filterNot { it.sha256Hex == sha256Hex }.toMutableList()
        list.add(0, LocalRomRecord(fileName, sha256Hex, crc32Hex, sizeBytes, System.currentTimeMillis()))
        val arr = JSONArray()
        for (r in list.take(64)) {
            arr.put(JSONObject().apply {
                put("fileName", r.fileName)
                put("sha256Hex", r.sha256Hex)
                put("crc32Hex", r.crc32Hex)
                put("sizeBytes", r.sizeBytes)
                put("lastLoadedAtMs", r.lastLoadedAtMs)
            })
        }
        prefs.edit().putString("roms_json", arr.toString()).apply()
    }

    fun listLocalRoms(): List<LocalRomRecord> {
        val raw = prefs.getString("roms_json", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                LocalRomRecord(
                    fileName = o.optString("fileName"),
                    sha256Hex = o.optString("sha256Hex"),
                    crc32Hex = o.optString("crc32Hex"),
                    sizeBytes = o.optInt("sizeBytes"),
                    lastLoadedAtMs = o.optLong("lastLoadedAtMs")
                )
            }
        }.getOrDefault(emptyList())
    }
}

import type { UserRomEntry } from '../roms/userRomLibraryStore';
import type {
  CompatibilityMatrixRow,
  CompatibilityTier,
  CoverArtworkTheme,
  LocalRomMatchResult,
  NesCatalogGame,
  NesGenre,
  NesRegion,
} from './types';

interface RawCatalogSeed {
  num: number;
  id: string;
  title: string;
  year: number;
  publisher: string;
  genre: NesGenre;
  regions: NesRegion[];
  mapper: string;
  prgKb: number;
  patterns: string[];
  tier: CompatibilityTier;
  ramAddresses: string[];
  ramNotes: string;
  theme: CoverArtworkTheme;
}

const RAW_NES_60_SEEDS: RawCatalogSeed[] = [
  {
    num: 1,
    id: 'contra',
    title: 'Contra',
    year: 1988,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['USA', 'JPN'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['contra', 'gryzor'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0030 Stage', '$0032 Lives', '$00AA Weapon', '$07E2-$07E3 Score'],
    ramNotes: 'Native WRAM hooks verified for stage progression, lives/death detection, weapon state, and score.',
    theme: { primaryHex: '#0F172A', secondaryHex: '#991B1B', accentHex: '#22D3EE', monogram: 'CT', motif: 'visor' },
  },
  {
    num: 2,
    id: 'super-c',
    title: 'Super C',
    year: 1990,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['super c', 'super contra'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0030 Stage', '$0032 Lives', '$00B8 Weapon', '$07E2-$07E3 Score'],
    ramNotes: 'Native WRAM hooks verified for stage counter, lives/death tracking, and score validation.',
    theme: { primaryHex: '#111827', secondaryHex: '#B91C1C', accentHex: '#F59E0B', monogram: 'SC', motif: 'visor' },
  },
  {
    num: 3,
    id: 'contra-force',
    title: 'Contra Force',
    year: 1992,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['USA'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['contra force'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending verified WRAM address mapping; video proof & manual review required for official records.',
    theme: { primaryHex: '#121826', secondaryHex: '#7C2D12', accentHex: '#F59E0B', monogram: 'CF', motif: 'bolt' },
  },
  {
    num: 4,
    id: 'jackal',
    title: 'Jackal',
    year: 1988,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['USA', 'JPN'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['jackal', 'top gunner'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for POW rescue counters and boss phase flags.',
    theme: { primaryHex: '#141B17', secondaryHex: '#3F6212', accentHex: '#22D3EE', monogram: 'JK', motif: 'shield' },
  },
  {
    num: 5,
    id: 'rushn-attack',
    title: "Rush'n Attack",
    year: 1987,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['rushn attack', "rush'n attack", 'green beret'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification across USA Rush\'n Attack & FDS Green Beret variants.',
    theme: { primaryHex: '#17191C', secondaryHex: '#4D7C0F', accentHex: '#F59E0B', monogram: 'RA', motif: 'blade' },
  },
  {
    num: 6,
    id: 'ninja-gaiden',
    title: 'Ninja Gaiden',
    year: 1988,
    publisher: 'Tecmo',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['ninja gaiden', 'shadow warriors', 'ninja ryukenden'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$006D Act/Stage', '$0076 Lives', '$0065 HP', '$0060-$0062 Score'],
    ramNotes: 'Native WRAM hooks verified for Act/Stage transitions, Ryu HP/no-hit checks, lives, and score.',
    theme: { primaryHex: '#0F1020', secondaryHex: '#4C1D95', accentHex: '#22D3EE', monogram: 'NG', motif: 'blade' },
  },
  {
    num: 7,
    id: 'ninja-gaiden-ii',
    title: 'Ninja Gaiden II',
    year: 1990,
    publisher: 'Tecmo',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['ninja gaiden ii', 'ninja gaiden 2', 'dark sword of chaos'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM hook verification for Act progression and shadow clone states.',
    theme: { primaryHex: '#121024', secondaryHex: '#5B21B6', accentHex: '#A78BFA', monogram: 'N2', motif: 'blade' },
  },
  {
    num: 8,
    id: 'ninja-gaiden-iii',
    title: 'Ninja Gaiden III',
    year: 1991,
    publisher: 'Tecmo',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['ninja gaiden iii', 'ninja gaiden 3', 'ancient ship of doom'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending regional offset audit between USA limited-continue and JPN password builds.',
    theme: { primaryHex: '#151022', secondaryHex: '#6D28D9', accentHex: '#F59E0B', monogram: 'N3', motif: 'blade' },
  },
  {
    num: 9,
    id: 'mega-man',
    title: 'Mega Man',
    year: 1987,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['mega man', 'megaman', 'rockman'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$006A Health (Candidate)', '$00A6 Lives (Candidate)'],
    ramNotes: 'Frame-timed speedrun & anti-cheat active; Robot Master pause-glitch RAM audit under review.',
    theme: { primaryHex: '#0C192C', secondaryHex: '#1D4ED8', accentHex: '#22D3EE', monogram: 'M1', motif: 'bolt' },
  },
  {
    num: 10,
    id: 'mega-man-2',
    title: 'Mega Man 2',
    year: 1988,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 256,
    patterns: ['mega man 2', 'megaman 2', 'mega man ii', 'rockman 2'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$06C0 Health', '$00A8 Lives', '$002A Stage', '$06C1 Boss HP', '$009A Defeated Masters'],
    ramNotes: 'Native WRAM hooks verified for Mega Man HP, Boss HP, lives, stage ID, and Robot Master bitmask.',
    theme: { primaryHex: '#0B162C', secondaryHex: '#0369A1', accentHex: '#22D3EE', monogram: 'M2', motif: 'bolt' },
  },
  {
    num: 11,
    id: 'mega-man-3',
    title: 'Mega Man 3',
    year: 1990,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 256,
    patterns: ['mega man 3', 'megaman 3', 'mega man iii', 'rockman 3'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$00A2 Health (Candidate)', '$00AE Lives (Candidate)'],
    ramNotes: 'Frame-timed official timing active; Doc Robot phase RAM flags under community review.',
    theme: { primaryHex: '#0D182C', secondaryHex: '#2563EB', accentHex: '#A78BFA', monogram: 'M3', motif: 'bolt' },
  },
  {
    num: 12,
    id: 'mega-man-4',
    title: 'Mega Man 4',
    year: 1991,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 512,
    patterns: ['mega man 4', 'megaman 4', 'mega man iv', 'rockman 4'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$00B0 Health (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Cossack/Wily fortress RAM hooks pending review.',
    theme: { primaryHex: '#0F1B2E', secondaryHex: '#0284C7', accentHex: '#22D3EE', monogram: 'M4', motif: 'bolt' },
  },
  {
    num: 13,
    id: 'mega-man-5',
    title: 'Mega Man 5',
    year: 1992,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 256,
    patterns: ['mega man 5', 'megaman 5', 'mega man v', 'rockman 5'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$00B0 Health (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Beat letter collectibles RAM map pending verification.',
    theme: { primaryHex: '#101B30', secondaryHex: '#1E40AF', accentHex: '#F59E0B', monogram: 'M5', motif: 'bolt' },
  },
  {
    num: 14,
    id: 'mega-man-6',
    title: 'Mega Man 6',
    year: 1993,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 512,
    patterns: ['mega man 6', 'megaman 6', 'mega man vi', 'rockman 6'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$03E5 Health (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Rush Adapter & alternate exit RAM hooks pending review.',
    theme: { primaryHex: '#111827', secondaryHex: '#1D4ED8', accentHex: '#22D3EE', monogram: 'M6', motif: 'bolt' },
  },
  {
    num: 15,
    id: 'blaster-master',
    title: 'Blaster Master',
    year: 1988,
    publisher: 'Sunsoft',
    genre: 'Action Adventure',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['blaster master', 'chou wakusei senki metalfight'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM hooks for SOPHIA III upgrades, Area 1–8 bosses, and pause-grenade anti-exploit checks.',
    theme: { primaryHex: '#18131E', secondaryHex: '#9333EA', accentHex: '#22D3EE', monogram: 'BM', motif: 'ship' },
  },
  {
    num: 16,
    id: 'castlevania',
    title: 'Castlevania',
    year: 1986,
    publisher: 'Konami',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['castlevania', 'akumajou dracula'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0028 Stage', '$002A Lives', '$0045 Player HP', '$0071 Hearts', '$07FC-$07FE Score'],
    ramNotes: 'Native WRAM hooks verified for Stage 1–18 progression, Simon HP, lives, hearts, and score.',
    theme: { primaryHex: '#160E18', secondaryHex: '#7F1D1D', accentHex: '#F59E0B', monogram: 'CV', motif: 'crown' },
  },
  {
    num: 17,
    id: 'castlevania-ii',
    title: "Castlevania II: Simon's Quest",
    year: 1987,
    publisher: 'Konami',
    genre: 'Action Adventure',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['castlevania ii', 'castlevania 2', 'simons quest', "simon's quest"],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0080 Player HP (Candidate)', '$0048 Hearts (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Dracula relic & ending-day RAM hooks pending verification.',
    theme: { primaryHex: '#1A1118', secondaryHex: '#991B1B', accentHex: '#A78BFA', monogram: 'C2', motif: 'crown' },
  },
  {
    num: 18,
    id: 'castlevania-iii',
    title: "Castlevania III: Dracula's Curse",
    year: 1989,
    publisher: 'Konami',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC5',
    prgKb: 256,
    patterns: ['castlevania iii', 'castlevania 3', 'draculas curse', "dracula's curse"],
    tier: 'partial-hooks-review',
    ramAddresses: ['$003C Player HP (Candidate)', '$0035 Lives (Candidate)'],
    ramNotes: 'Frame-timed official runs active; branching path & partner swap RAM hooks under review.',
    theme: { primaryHex: '#180E1E', secondaryHex: '#6B21A8', accentHex: '#F59E0B', monogram: 'C3', motif: 'crown' },
  },
  {
    num: 19,
    id: 'super-mario-bros',
    title: 'Super Mario Bros.',
    year: 1985,
    publisher: 'Nintendo',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'NROM',
    prgKb: 32,
    patterns: ['super mario bros', 'super mario brothers', 'smb1', 'smb_'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$07DD-$07E2 Score', '$075E Coins', '$075A Lives', '$075F World', '$075C Stage', '$000E Player State'],
    ramNotes: 'Full native WRAM hooks verified for World/Stage, Coins, 6-digit Score, Lives, and Death State ($000E == 0x0B).',
    theme: { primaryHex: '#1C1113', secondaryHex: '#DC2626', accentHex: '#F59E0B', monogram: 'M1', motif: 'star' },
  },
  {
    num: 20,
    id: 'super-mario-bros-2',
    title: 'Super Mario Bros. 2',
    year: 1988,
    publisher: 'Nintendo',
    genre: 'Platformer',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['super mario bros 2', 'super mario bros. 2', 'super mario usa', 'smb2'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$04ED Lives (Candidate)', '$04E7 World (Candidate)'],
    ramNotes: 'Frame-timed official runs active; character lock & Wart boss RAM rules under community verification.',
    theme: { primaryHex: '#141728', secondaryHex: '#2563EB', accentHex: '#F59E0B', monogram: 'M2', motif: 'star' },
  },
  {
    num: 21,
    id: 'super-mario-bros-3',
    title: 'Super Mario Bros. 3',
    year: 1988,
    publisher: 'Nintendo',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 256,
    patterns: ['super mario bros 3', 'super mario bros. 3', 'smb3'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0727 World', '$0736 Lives', '$0737 Coins', '$0715-$0717 Score'],
    ramNotes: 'Native WRAM hooks verified for World 1–8 progression, lives, coins, and score.',
    theme: { primaryHex: '#1B1710', secondaryHex: '#D97706', accentHex: '#22D3EE', monogram: 'M3', motif: 'star' },
  },
  {
    num: 22,
    id: 'metroid',
    title: 'Metroid',
    year: 1986,
    publisher: 'Nintendo',
    genre: 'Action Adventure',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['metroid'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0106-$0107 Energy', '$0685 Missiles', '$0074 Area', '$6878 Gear Bits'],
    ramNotes: 'Native WRAM hooks verified for Samus energy, missile inventory, area ID, and escape timer.',
    theme: { primaryHex: '#13101E', secondaryHex: '#B45309', accentHex: '#22D3EE', monogram: 'MT', motif: 'visor' },
  },
  {
    num: 23,
    id: 'legend-of-zelda',
    title: 'The Legend of Zelda',
    year: 1986,
    publisher: 'Nintendo',
    genre: 'Action Adventure',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['legend of zelda', 'zelda 1', 'hyrule fantasy'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$066F Health/Containers', '$066D Rupees', '$0671 Triforce Bits', '$0010 Level/Dungeon'],
    ramNotes: 'Native WRAM hooks verified for Heart Containers, Triforce shards, Rupees, and Dungeon ID.',
    theme: { primaryHex: '#141913', secondaryHex: '#15803D', accentHex: '#F59E0B', monogram: 'LZ', motif: 'shield' },
  },
  {
    num: 24,
    id: 'zelda-ii',
    title: 'Zelda II: The Adventure of Link',
    year: 1987,
    publisher: 'Nintendo',
    genre: 'Action Adventure',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['zelda ii', 'zelda 2', 'adventure of link'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0774 Health (Candidate)', '$0773 Magic (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Palace crystal & Dark Link WRAM hooks pending review.',
    theme: { primaryHex: '#191610', secondaryHex: '#A16207', accentHex: '#22D3EE', monogram: 'Z2', motif: 'shield' },
  },
  {
    num: 25,
    id: 'kirbys-adventure',
    title: "Kirby's Adventure",
    year: 1993,
    publisher: 'Nintendo',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 512,
    patterns: ['kirbys adventure', "kirby's adventure", 'hoshi no kirby'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0597 Health', '$0594 Lives', '$05A1 Level', '$0591-$0593 Score'],
    ramNotes: 'Native WRAM hooks verified for Kirby HP, lives, level counter, and score.',
    theme: { primaryHex: '#1D1220', secondaryHex: '#DB2777', accentHex: '#22D3EE', monogram: 'KA', motif: 'star' },
  },
  {
    num: 26,
    id: 'dr-mario',
    title: 'Dr. Mario',
    year: 1990,
    publisher: 'Nintendo',
    genre: 'Puzzle',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 32,
    patterns: ['dr mario', 'dr. mario', 'doctor mario'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0316 Virus Level (Candidate)', '$0324 Viruses Left (Candidate)'],
    ramNotes: 'Frame-timed official speedruns active; Level 20 Hi-Speed virus clear WRAM hooks under review.',
    theme: { primaryHex: '#0F1824', secondaryHex: '#0284C7', accentHex: '#F59E0B', monogram: 'DM', motif: 'star' },
  },
  {
    num: 27,
    id: 'tetris',
    title: 'Tetris',
    year: 1989,
    publisher: 'Nintendo',
    genre: 'Puzzle',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 32,
    patterns: ['tetris'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$0050-$0051 Lines BCD', '$0044 Level', '$0053-$0055 Score BCD'],
    ramNotes: 'Native WRAM hooks verified for NES Tetris BCD score, lines cleared, and level transitions (Lv 18/19/29).',
    theme: { primaryHex: '#0F1524', secondaryHex: '#7C3AED', accentHex: '#22D3EE', monogram: 'TT', motif: 'bolt' },
  },
  {
    num: 28,
    id: 'bionic-commando',
    title: 'Bionic Commando',
    year: 1988,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 256,
    patterns: ['bionic commando', 'hitler no fukkatsu'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$004C Health (Candidate)', '$0048 Area (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Albatross core & communicator WRAM hooks pending review.',
    theme: { primaryHex: '#121A17', secondaryHex: '#15803D', accentHex: '#F59E0B', monogram: 'BC', motif: 'visor' },
  },
  {
    num: 29,
    id: 'ducktales',
    title: 'DuckTales',
    year: 1989,
    publisher: 'Capcom',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['ducktales', 'duck tales', 'wanpaku duck'],
    tier: 'verified-ram-hooks',
    ramAddresses: ['$00C8 Health', '$00C9 Lives', '$00CE-$00D0 Cash', '$00B1 Stage'],
    ramNotes: 'Native WRAM hooks verified for Scrooge HP, lives, cash total ($10M best ending), and stage ID.',
    theme: { primaryHex: '#111827', secondaryHex: '#CA8A04', accentHex: '#22D3EE', monogram: 'DT', motif: 'crown' },
  },
  {
    num: 30,
    id: 'rescue-embassy-mission',
    title: 'Rescue: The Embassy Mission',
    year: 1989,
    publisher: 'Kemco',
    genre: 'Action Adventure',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['rescue', 'embassy mission', 'hostages'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for hostage count, sniper phase accuracy, and mission difficulty.',
    theme: { primaryHex: '#11151E', secondaryHex: '#334155', accentHex: '#22D3EE', monogram: 'RE', motif: 'visor' },
  },
  {
    num: 31,
    id: 'ducktales-2',
    title: 'DuckTales 2',
    year: 1993,
    publisher: 'Capcom',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['ducktales 2', 'duck tales 2'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for treasure map pieces and cane upgrade flags.',
    theme: { primaryHex: '#12192A', secondaryHex: '#B45309', accentHex: '#F59E0B', monogram: 'D2', motif: 'crown' },
  },
  {
    num: 32,
    id: 'chip-n-dale',
    title: "Chip 'n Dale Rescue Rangers",
    year: 1990,
    publisher: 'Capcom',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['chip n dale', "chip 'n dale", 'rescue rangers'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Zone map progression, flowers/stars, and Fat Cat defeat.',
    theme: { primaryHex: '#1B1410', secondaryHex: '#C2410C', accentHex: '#F59E0B', monogram: 'CD', motif: 'star' },
  },
  {
    num: 33,
    id: 'chip-n-dale-2',
    title: "Chip 'n Dale Rescue Rangers 2",
    year: 1993,
    publisher: 'Capcom',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['chip n dale 2', "chip 'n dale 2", 'rescue rangers 2'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for stage clears and bonus mini-game checks.',
    theme: { primaryHex: '#1C1414', secondaryHex: '#EA580C', accentHex: '#22D3EE', monogram: 'C2', motif: 'star' },
  },
  {
    num: 34,
    id: 'darkwing-duck',
    title: 'Darkwing Duck',
    year: 1992,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['darkwing duck'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for gas weapons, bonus rooms, and Steelbeak defeat.',
    theme: { primaryHex: '#140F22', secondaryHex: '#7E22CE', accentHex: '#F59E0B', monogram: 'DW', motif: 'visor' },
  },
  {
    num: 35,
    id: 'batman',
    title: 'Batman',
    year: 1989,
    publisher: 'Sunsoft',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['batman'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Stage 1–5 boss flags, ammo usage, and Joker fight.',
    theme: { primaryHex: '#0E0F18', secondaryHex: '#3730A3', accentHex: '#F59E0B', monogram: 'BT', motif: 'blade' },
  },
  {
    num: 36,
    id: 'batman-return-of-the-joker',
    title: 'Batman: Return of the Joker',
    year: 1991,
    publisher: 'Sunsoft',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'Sunsoft-FME7',
    prgKb: 128,
    patterns: ['return of the joker', 'batman return', 'dynamite batman'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for weapon charge levels and stage progression.',
    theme: { primaryHex: '#140E1D', secondaryHex: '#6D28D9', accentHex: '#22D3EE', monogram: 'BJ', motif: 'bolt' },
  },
  {
    num: 37,
    id: 'tmnt',
    title: 'Teenage Mutant Ninja Turtles',
    year: 1989,
    publisher: 'Ultra Games',
    genre: 'Action Adventure',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['teenage mutant ninja turtles', 'tmnt', 'hero turtles'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for 4-Turtle HP bars, Dam bombs, and Technodrome completion.',
    theme: { primaryHex: '#0F1B13', secondaryHex: '#16A34A', accentHex: '#F59E0B', monogram: 'T1', motif: 'shield' },
  },
  {
    num: 38,
    id: 'tmnt-ii',
    title: 'Teenage Mutant Ninja Turtles II: The Arcade Game',
    year: 1990,
    publisher: 'Ultra Games',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 256,
    patterns: ['tmnt ii', 'tmnt 2', 'arcade game', 'ninja turtles ii', 'ninja turtles 2'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Scene progression, lives, and Shredder defeat.',
    theme: { primaryHex: '#0E1C14', secondaryHex: '#15803D', accentHex: '#22D3EE', monogram: 'T2', motif: 'fist' },
  },
  {
    num: 39,
    id: 'tmnt-iii',
    title: 'Teenage Mutant Ninja Turtles III: The Manhattan Project',
    year: 1991,
    publisher: 'Konami',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 256,
    patterns: ['tmnt iii', 'tmnt 3', 'manhattan project', 'ninja turtles iii', 'ninja turtles 3'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Super Shredder defeat and score counters.',
    theme: { primaryHex: '#0F1B18', secondaryHex: '#047857', accentHex: '#A78BFA', monogram: 'T3', motif: 'fist' },
  },
  {
    num: 40,
    id: 'double-dragon',
    title: 'Double Dragon',
    year: 1988,
    publisher: 'Tradewest',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['double dragon'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$03B4 Hearts/XP (Candidate)', '$0043 Mission (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Mission 1–4 & Heart level WRAM rules under review.',
    theme: { primaryHex: '#1A1111', secondaryHex: '#B91C1C', accentHex: '#F59E0B', monogram: 'DD', motif: 'fist' },
  },
  {
    num: 41,
    id: 'double-dragon-ii',
    title: 'Double Dragon II: The Revenge',
    year: 1989,
    publisher: 'Acclaim',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['double dragon ii', 'double dragon 2', 'the revenge'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Supreme Master difficulty lock and Mission 9 completion.',
    theme: { primaryHex: '#1B1114', secondaryHex: '#9F1239', accentHex: '#22D3EE', monogram: 'D2', motif: 'fist' },
  },
  {
    num: 42,
    id: 'double-dragon-iii',
    title: 'Double Dragon III: The Sacred Stones',
    year: 1991,
    publisher: 'Acclaim',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['double dragon iii', 'double dragon 3', 'sacred stones'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for character roster survival and Egypt final boss clear.',
    theme: { primaryHex: '#191311', secondaryHex: '#B45309', accentHex: '#F59E0B', monogram: 'D3', motif: 'fist' },
  },
  {
    num: 43,
    id: 'river-city-ransom',
    title: 'River City Ransom',
    year: 1989,
    publisher: 'Technos',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['river city ransom', 'street gangs', 'downtown nekketsu'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for stat books, cash, and Slick defeat.',
    theme: { primaryHex: '#17121E', secondaryHex: '#BE123C', accentHex: '#22D3EE', monogram: 'RC', motif: 'fist' },
  },
  {
    num: 44,
    id: 'battletoads',
    title: 'Battletoads',
    year: 1991,
    publisher: 'Tradewest',
    genre: "Beat 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'AxROM',
    prgKb: 256,
    patterns: ['battletoads'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0012 Level (Candidate)', '$0010 Lives (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Turbo Tunnel / Rat Race / Dark Queen WRAM hooks under review.',
    theme: { primaryHex: '#101B14', secondaryHex: '#15803D', accentHex: '#A78BFA', monogram: 'BT', motif: 'fist' },
  },
  {
    num: 45,
    id: 'battletoads-double-dragon',
    title: 'Battletoads & Double Dragon',
    year: 1993,
    publisher: 'Tradewest',
    genre: "Beat 'em Up",
    regions: ['USA', 'EUR'],
    mapper: 'AxROM',
    prgKb: 256,
    patterns: ['battletoads & double dragon', 'battletoads and double dragon', 'battletoads double dragon'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Stage 1–7 clears and Shadow Boss defeat.',
    theme: { primaryHex: '#14191D', secondaryHex: '#4338CA', accentHex: '#F59E0B', monogram: 'BD', motif: 'fist' },
  },
  {
    num: 46,
    id: 'excitebike',
    title: 'Excitebike',
    year: 1984,
    publisher: 'Nintendo',
    genre: 'Sports & Racing',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'NROM',
    prgKb: 16,
    patterns: ['excitebike', 'excite bike'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Track 1–5 official lap timers and heat gauge tracking.',
    theme: { primaryHex: '#1C1410', secondaryHex: '#DC2626', accentHex: '#F59E0B', monogram: 'EB', motif: 'bolt' },
  },
  {
    num: 47,
    id: 'adventure-island',
    title: 'Adventure Island',
    year: 1986,
    publisher: 'Hudson Soft',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'CNROM',
    prgKb: 32,
    patterns: ['adventure island', 'takahashi meijin'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Area 1–8 rounds, Hudson Bee continues, and vitality timer.',
    theme: { primaryHex: '#101C18', secondaryHex: '#059669', accentHex: '#F59E0B', monogram: 'A1', motif: 'star' },
  },
  {
    num: 48,
    id: 'adventure-island-ii',
    title: 'Adventure Island II',
    year: 1991,
    publisher: 'Hudson Soft',
    genre: 'Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['adventure island ii', 'adventure island 2'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for 8-Island clears and dinosaur companion inventory.',
    theme: { primaryHex: '#0F1C1A', secondaryHex: '#0D9488', accentHex: '#22D3EE', monogram: 'A2', motif: 'star' },
  },
  {
    num: 49,
    id: 'adventure-island-iii',
    title: 'Adventure Island III',
    year: 1992,
    publisher: 'Hudson Soft',
    genre: 'Platformer',
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['adventure island iii', 'adventure island 3'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Island clears and secret crystal rooms.',
    theme: { primaryHex: '#101A1E', secondaryHex: '#0284C7', accentHex: '#F59E0B', monogram: 'A3', motif: 'star' },
  },
  {
    num: 50,
    id: 'kid-icarus',
    title: 'Kid Icarus',
    year: 1986,
    publisher: 'Nintendo',
    genre: 'Action Platformer',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC1',
    prgKb: 128,
    patterns: ['kid icarus', 'hikari shinwa'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Three Sacred Treasures, arrow strength, and best ending.',
    theme: { primaryHex: '#131624', secondaryHex: '#4F46E5', accentHex: '#F59E0B', monogram: 'KI', motif: 'crown' },
  },
  {
    num: 51,
    id: 'punch-out',
    title: 'Punch-Out!!',
    year: 1987,
    publisher: 'Nintendo',
    genre: 'Sports & Racing',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC2',
    prgKb: 128,
    patterns: ['punch-out', 'punch out', 'mike tyson'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0001 Opponent ID (Candidate)', '$0391 Mac HP (Candidate)', '$0398 Opponent HP (Candidate)'],
    ramNotes: 'Frame-timed speedruns active; Mike Tyson / Mr. Dream variant split & TKO clock WRAM under review.',
    theme: { primaryHex: '#121814', secondaryHex: '#16A34A', accentHex: '#F59E0B', monogram: 'PO', motif: 'fist' },
  },
  {
    num: 52,
    id: 'gradius',
    title: 'Gradius',
    year: 1986,
    publisher: 'Konami',
    genre: "Shoot 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'CNROM',
    prgKb: 32,
    patterns: ['gradius'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0040 Stage (Candidate)', '$0020 Lives (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Konami Code detection & Loop 1–2 WRAM flags under review.',
    theme: { primaryHex: '#0C1222', secondaryHex: '#1D4ED8', accentHex: '#22D3EE', monogram: 'GR', motif: 'ship' },
  },
  {
    num: 53,
    id: 'life-force',
    title: 'Life Force',
    year: 1988,
    publisher: 'Konami',
    genre: "Shoot 'em Up",
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['life force', 'salamander'],
    tier: 'partial-hooks-review',
    ramAddresses: ['$0042 Stage (Candidate)', '$0032 Lives (Candidate)'],
    ramNotes: 'Frame-timed official runs active; Zelos core clear & 30-life code flag under community review.',
    theme: { primaryHex: '#1B0E18', secondaryHex: '#BE123C', accentHex: '#22D3EE', monogram: 'LF', motif: 'ship' },
  },
  {
    num: 54,
    id: 'probotector',
    title: 'Probotector',
    year: 1990,
    publisher: 'Konami',
    genre: 'Run & Gun',
    regions: ['EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['probotector'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'PAL 50Hz regional Contra variant; pending PAL timing & WRAM verification before ranked activation.',
    theme: { primaryHex: '#121622', secondaryHex: '#475569', accentHex: '#22D3EE', monogram: 'PR', motif: 'visor' },
  },
  {
    num: 55,
    id: 'ghosts-n-goblins',
    title: "Ghosts 'n Goblins",
    year: 1986,
    publisher: 'Capcom',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'UxROM',
    prgKb: 128,
    patterns: ['ghosts n goblins', "ghosts 'n goblins", 'makaimura'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for True Ending Loop 2 (Cross/Shield requirement) and armor state.',
    theme: { primaryHex: '#15101F', secondaryHex: '#581C87', accentHex: '#F59E0B', monogram: 'GG', motif: 'shield' },
  },
  {
    num: 56,
    id: 'gi-joe',
    title: 'G.I. Joe',
    year: 1991,
    publisher: 'Taxan',
    genre: 'Run & Gun',
    regions: ['USA'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['g.i. joe', 'gi joe', 'real american hero'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Mission 1–6 bombs, team leader selection, and Cobra Commander defeat.',
    theme: { primaryHex: '#101624', secondaryHex: '#1E3A8A', accentHex: '#DC2626', monogram: 'GI', motif: 'visor' },
  },
  {
    num: 57,
    id: 'power-blade',
    title: 'Power Blade',
    year: 1991,
    publisher: 'Taito',
    genre: 'Action Platformer',
    regions: ['USA', 'EUR', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['power blade', 'power blazer'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Sector 1–6 clears, Power Suit, and Expert Mode.',
    theme: { primaryHex: '#0F1824', secondaryHex: '#0E7490', accentHex: '#F59E0B', monogram: 'PB', motif: 'blade' },
  },
  {
    num: 58,
    id: 'power-blade-2',
    title: 'Power Blade 2',
    year: 1992,
    publisher: 'Taito',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['power blade 2', 'power blade ii', 'captain saver'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for all 4 Power Suits and Building 1–5 boss clears.',
    theme: { primaryHex: '#121728', secondaryHex: '#0369A1', accentHex: '#A78BFA', monogram: 'P2', motif: 'blade' },
  },
  {
    num: 59,
    id: 'ninja-kid',
    title: 'Ninja Kid',
    year: 1986,
    publisher: 'Bandai',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN'],
    mapper: 'NROM',
    prgKb: 32,
    patterns: ['ninja kid', 'gegege no kitarou'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for Stage doors, magic feathers, and Demon Lord clear.',
    theme: { primaryHex: '#18141C', secondaryHex: '#9333EA', accentHex: '#F59E0B', monogram: 'NK', motif: 'blade' },
  },
  {
    num: 60,
    id: 'little-samson',
    title: 'Little Samson',
    year: 1992,
    publisher: 'Taito',
    genre: 'Action Platformer',
    regions: ['USA', 'JPN', 'EUR'],
    mapper: 'MMC3',
    prgKb: 128,
    patterns: ['little samson', 'seirei densetsu lickle'],
    tier: 'pending-community-review',
    ramAddresses: [],
    ramNotes: 'Pending WRAM verification for all 4 heroes (Samson/Kikira/Gamm/K.O.), Normal difficulty, and Ta-Keed.',
    theme: { primaryHex: '#171222', secondaryHex: '#C2410C', accentHex: '#22D3EE', monogram: 'LS', motif: 'crown' },
  },
];

function computeAchievementCounts(tier: CompatibilityTier): {
  active: number;
  manualReview: number;
  pending: number;
} {
  if (tier === 'verified-ram-hooks') {
    return { active: 14, manualReview: 18, pending: 18 };
  }
  if (tier === 'partial-hooks-review') {
    return { active: 4, manualReview: 20, pending: 26 };
  }
  return { active: 0, manualReview: 16, pending: 34 };
}

/**
 * Modular 60-Title NES Champions Catalog (NES ONLY — Contra #1 through Little Samson #60).
 * Contains strictly metadata, regional variant signatures, and compatibility hooks —
 * ZERO copyrighted ROM payloads.
 */
export const NES_CHAMPIONS_CATALOG_60: NesCatalogGame[] = RAW_NES_60_SEEDS.map((seed) => {
  const counts = computeAchievementCounts(seed.tier);
  return {
    catalogNumber: seed.num,
    gameId: seed.id,
    console: 'NES',
    title: seed.title,
    releaseYear: seed.year,
    publisher: seed.publisher,
    genre: seed.genre,
    regions: seed.regions,
    supportedVariants: seed.regions.map((region) => ({
      variantId: `${seed.id}-${region.toLowerCase()}`,
      label: `${seed.title} (${region})`,
      region,
      revision: region === 'USA' ? 'Rev A / PRG0' : region === 'JPN' ? 'Famicom Original' : 'PAL-A/B',
      mapperName: seed.mapper,
      expectedPrgKb: seed.prgKb,
      filenamePatterns: seed.patterns,
    })),
    coverTheme: seed.theme,
    compatibilityTier: seed.tier,
    ramHookSummary: {
      hasVerifiedRamMap: seed.tier === 'verified-ram-hooks',
      addresses: seed.ramAddresses,
      notes: seed.ramNotes,
    },
    targetAchievementCount: 50,
    activeVerifiedAchievements: counts.active,
    manualReviewAchievements: counts.manualReview,
    pendingHookAchievements: counts.pending,
  };
});

export function getCatalogGameById(gameId: string): NesCatalogGame | undefined {
  return NES_CHAMPIONS_CATALOG_60.find((g) => g.gameId === gameId);
}

function normalizeRomToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.nes$/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a single real user-provided .nes ROM against the 60-game NES Catalog.
 * Uses exact SHA-256 -> exact CRC32 -> canonical normalized filename + valid iNES header.
 * Never invents matches when no local ROM matches.
 */
export function identifyUserRomInCatalog(
  rom: Pick<UserRomEntry, 'id' | 'fileName' | 'name' | 'sha256' | 'hash' | 'prgSizeKb'>
): {
  game: NesCatalogGame;
  variantLabel: string;
  confidence: 'sha256-exact' | 'crc32-exact' | 'filename-ines-header';
} | null {
  const romSha = rom.sha256.toLowerCase();
  const romHash = rom.hash.toLowerCase();
  const normalizedName = normalizeRomToken(rom.fileName || rom.name);

  // Pass 1: Exact SHA-256 or CRC32 variant match
  for (const game of NES_CHAMPIONS_CATALOG_60) {
    for (const variant of game.supportedVariants) {
      if (variant.knownSha256?.some((h) => h.toLowerCase() === romSha)) {
        return { game, variantLabel: variant.label, confidence: 'sha256-exact' };
      }
      if (variant.knownCrc32?.some((h) => h.toLowerCase() === romHash)) {
        return { game, variantLabel: variant.label, confidence: 'crc32-exact' };
      }
    }
  }

  // Pass 2: Longest canonical filename pattern match (prevents "contra" stealing "contra force" or "mega man" stealing "mega man 2")
  let bestMatch: { game: NesCatalogGame; variantLabel: string; patternLen: number } | null = null;
  for (const game of NES_CHAMPIONS_CATALOG_60) {
    for (const variant of game.supportedVariants) {
      for (const rawPattern of variant.filenamePatterns) {
        const pattern = normalizeRomToken(rawPattern);
        if (!pattern) continue;
        const matches =
          normalizedName === pattern ||
          normalizedName.startsWith(`${pattern} `) ||
          normalizedName.includes(` ${pattern} `) ||
          normalizedName.endsWith(` ${pattern}`);
        if (matches) {
          // Guard sequel numbers so "mega man" never matches "mega man 2"
          const remainder = normalizedName.slice(normalizedName.indexOf(pattern) + pattern.length).trim();
          const patternEndsWithNumber = /(\bii|\biii|\biv|\b[2-6])$/.test(pattern);
          const remainderStartsWithSequel = /^(2|3|4|5|6|ii|iii|iv|v|vi|force|return|adventure|simon|dracula|manhattan|arcade|revenge|sacred)\b/.test(
            remainder
          );
          if (!patternEndsWithNumber && remainderStartsWithSequel) {
            continue;
          }
          if (!bestMatch || pattern.length > bestMatch.patternLen) {
            bestMatch = {
              game,
              variantLabel: variant.label,
              patternLen: pattern.length,
            };
          }
        }
      }
    }
  }

  if (!bestMatch) return null;
  return {
    game: bestMatch.game,
    variantLabel: bestMatch.variantLabel,
    confidence: 'filename-ines-header',
  };
}

/**
 * Matches all 60 NES catalog titles against the user's ACTUAL local .nes ROM library.
 * Strictly marks `installed: false` when no real local file matches.
 */
export function matchCatalogAgainstUserLibrary(
  userRoms: Pick<UserRomEntry, 'id' | 'fileName' | 'name' | 'sha256' | 'hash' | 'prgSizeKb'>[]
): LocalRomMatchResult[] {
  const byGameId = new Map<
    string,
    {
      romId: string;
      fileName: string;
      variantLabel: string;
      confidence: 'sha256-exact' | 'crc32-exact' | 'filename-ines-header';
    }
  >();

  for (const rom of userRoms) {
    const match = identifyUserRomInCatalog(rom);
    if (match && !byGameId.has(match.game.gameId)) {
      byGameId.set(match.game.gameId, {
        romId: rom.id,
        fileName: rom.fileName,
        variantLabel: match.variantLabel,
        confidence: match.confidence,
      });
    }
  }

  return NES_CHAMPIONS_CATALOG_60.map((game) => {
    const found = byGameId.get(game.gameId);
    if (!found) {
      return {
        game,
        installed: false,
        matchedUserRomId: null,
        matchedFileName: null,
        matchedVariantLabel: null,
        matchConfidence: 'none',
      };
    }
    return {
      game,
      installed: true,
      matchedUserRomId: found.romId,
      matchedFileName: found.fileName,
      matchedVariantLabel: found.variantLabel,
      matchConfidence: found.confidence,
    };
  });
}

export interface CatalogFilterOptions {
  searchQuery?: string;
  genre?: NesGenre | 'all';
  installedOnly?: 'all' | 'installed' | 'not-installed';
  compatibility?: CompatibilityTier | 'all';
  sortBy?: 'catalog-asc' | 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc' | 'verified-first';
}

export function filterAndSortCatalog(
  entries: LocalRomMatchResult[],
  options: CatalogFilterOptions
): LocalRomMatchResult[] {
  const query = (options.searchQuery ?? '').trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const g = entry.game;
    if (query) {
      const hay = `${g.title} ${g.publisher} ${g.genre} ${g.regions.join(' ')} ${g.gameId}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (options.genre && options.genre !== 'all' && g.genre !== options.genre) {
      return false;
    }
    if (options.installedOnly === 'installed' && !entry.installed) {
      return false;
    }
    if (options.installedOnly === 'not-installed' && entry.installed) {
      return false;
    }
    if (options.compatibility && options.compatibility !== 'all' && g.compatibilityTier !== options.compatibility) {
      return false;
    }
    return true;
  });

  const tierRank: Record<CompatibilityTier, number> = {
    'verified-ram-hooks': 0,
    'partial-hooks-review': 1,
    'pending-community-review': 2,
  };

  return [...filtered].sort((a, b) => {
    switch (options.sortBy) {
      case 'title-asc':
        return a.game.title.localeCompare(b.game.title);
      case 'title-desc':
        return b.game.title.localeCompare(a.game.title);
      case 'year-asc':
        return a.game.releaseYear - b.game.releaseYear || a.game.catalogNumber - b.game.catalogNumber;
      case 'year-desc':
        return b.game.releaseYear - a.game.releaseYear || a.game.catalogNumber - b.game.catalogNumber;
      case 'verified-first':
        return (
          tierRank[a.game.compatibilityTier] - tierRank[b.game.compatibilityTier] ||
          Number(b.installed) - Number(a.installed) ||
          a.game.catalogNumber - b.game.catalogNumber
        );
      case 'catalog-asc':
      default:
        return a.game.catalogNumber - b.game.catalogNumber;
    }
  });
}

/**
 * Generates the complete 60-game Compatibility Matrix summarizing native RAM hook
 * verification status vs. manual video review / pending community rules.
 */
export function buildCompatibilityMatrix(): CompatibilityMatrixRow[] {
  return NES_CHAMPIONS_CATALOG_60.map((game) => ({
    catalogNumber: game.catalogNumber,
    gameId: game.gameId,
    title: game.title,
    genre: game.genre,
    compatibilityTier: game.compatibilityTier,
    ramHooksVerified: game.ramHookSummary.hasVerifiedRamMap,
    activeAutoRules: game.activeVerifiedAchievements,
    manualReviewRules: game.manualReviewAchievements,
    pendingRules: game.pendingHookAchievements,
    totalTargetRules: game.targetAchievementCount,
    ramAddresses: game.ramHookSummary.addresses,
    notes: game.ramHookSummary.notes,
  }));
}

export const ALL_NES_GENRES: NesGenre[] = [
  'Run & Gun',
  'Action Platformer',
  'Platformer',
  'Action Adventure',
  "Beat 'em Up",
  "Shoot 'em Up",
  'Puzzle',
  'Sports & Racing',
];

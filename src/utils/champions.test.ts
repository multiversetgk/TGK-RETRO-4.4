import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ACHIEVEMENT_CATEGORIES,
  getAchievementsForGame,
  getCatalogAchievementTotals,
  getGameStagePlan,
  getStageClearAchievementsForGame,
  TROPHY_XP_TABLE,
} from '../emulator/champions/achievementCatalog';
import {
  calculateEloDelta,
  calculateLevelFromXp,
  ChampionsProfileStore,
  DEFAULT_VS_ELO,
  FOUNDER_BADGE_LABEL,
  getRankTierForXp,
  RANK_TIERS,
} from '../emulator/champions/championsStore';
import {
  buildCompatibilityMatrix,
  filterAndSortCatalog,
  identifyUserRomInCatalog,
  matchCatalogAgainstUserLibrary,
  NES_CHAMPIONS_CATALOG_60,
} from '../emulator/champions/nesCatalog60';
import {
  ChampionsVerificationEngine,
  formatNesFramesToSplitMs,
  formatNesFramesToTime,
  MAX_OFFICIAL_PAUSES_PER_RUN,
} from '../emulator/champions/verificationEngine';
import type { UserRomEntry } from '../emulator/roms/userRomLibraryStore';

function makeMockUserRom(fileName: string, sha256 = 'a'.repeat(64)): UserRomEntry {
  return {
    id: sha256,
    name: fileName.replace(/\.nes$/i, ''),
    fileName,
    sha256,
    hash: sha256.slice(0, 8),
    mapperId: 0,
    mapperName: 'NROM',
    prgSizeKb: 32,
    chrSizeKb: 8,
    sizeBytes: 40976,
    addedAt: Date.now(),
    bytes: new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 2, 1, 0, 0]),
  };
}

test('NES 60-game catalog contains exact 60 NES-only titles from #1 Contra to #60 Little Samson', () => {
  assert.equal(NES_CHAMPIONS_CATALOG_60.length, 60);
  assert.equal(NES_CHAMPIONS_CATALOG_60[0].catalogNumber, 1);
  assert.equal(NES_CHAMPIONS_CATALOG_60[0].title, 'Contra');
  assert.equal(NES_CHAMPIONS_CATALOG_60[59].catalogNumber, 60);
  assert.equal(NES_CHAMPIONS_CATALOG_60[59].title, 'Little Samson');

  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const game of NES_CHAMPIONS_CATALOG_60) {
    assert.equal(game.console, 'NES');
    assert.ok(!ids.has(game.gameId), `Duplicate gameId: ${game.gameId}`);
    assert.ok(!numbers.has(game.catalogNumber), `Duplicate catalogNumber: ${game.catalogNumber}`);
    assert.ok(game.supportedVariants.length >= 1);
    assert.ok(game.regions.length >= 1);
    ids.add(game.gameId);
    numbers.add(game.catalogNumber);
  }
});

test('Real local ROM library matching never fakes installed status and disambiguates sequels cleanly', () => {
  // Empty library -> 0 installed
  const emptyMatches = matchCatalogAgainstUserLibrary([]);
  assert.equal(emptyMatches.length, 60);
  assert.equal(emptyMatches.filter((m) => m.installed).length, 0);

  // Unrelated homebrew ROM -> 0 installed
  const unrelatedMatches = matchCatalogAgainstUserLibrary([
    makeMockUserRom('My Custom Homebrew Test (PD).nes', 'b'.repeat(64)),
  ]);
  assert.equal(unrelatedMatches.filter((m) => m.installed).length, 0);

  // Sequel disambiguation
  assert.equal(identifyUserRomInCatalog(makeMockUserRom('Contra (USA).nes'))?.game.gameId, 'contra');
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Contra Force (USA).nes'))?.game.gameId,
    'contra-force'
  );
  assert.equal(identifyUserRomInCatalog(makeMockUserRom('Super C (USA).nes'))?.game.gameId, 'super-c');
  assert.equal(identifyUserRomInCatalog(makeMockUserRom('Mega Man (USA).nes'))?.game.gameId, 'mega-man');
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Mega Man 2 (USA).nes'))?.game.gameId,
    'mega-man-2'
  );
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Mega Man 6 (USA).nes'))?.game.gameId,
    'mega-man-6'
  );
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Super Mario Bros. (World).nes'))?.game.gameId,
    'super-mario-bros'
  );
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Super Mario Bros. 3 (USA).nes'))?.game.gameId,
    'super-mario-bros-3'
  );
  assert.equal(
    identifyUserRomInCatalog(makeMockUserRom('Little Samson (USA).nes'))?.game.gameId,
    'little-samson'
  );

  // Matching a real 2-ROM local library flips ONLY those 2 titles to installed
  const twoMatches = matchCatalogAgainstUserLibrary([
    makeMockUserRom('Contra (USA).nes', 'c'.repeat(64)),
    makeMockUserRom('Little Samson (USA).nes', 'd'.repeat(64)),
  ]);
  const installed = twoMatches.filter((m) => m.installed);
  assert.equal(installed.length, 2);
  assert.deepEqual(
    installed.map((m) => m.game.gameId).sort(),
    ['contra', 'little-samson']
  );
});

test('Catalog search, filtering, sorting, and 60-game compatibility matrix work accurately', () => {
  const matches = matchCatalogAgainstUserLibrary([
    makeMockUserRom('Contra (USA).nes', 'e'.repeat(64)),
  ]);

  const installedOnly = filterAndSortCatalog(matches, {
    searchQuery: '',
    genre: 'all',
    installedOnly: 'installed',
    compatibility: 'all',
    sortBy: 'catalog-asc',
  });
  assert.equal(installedOnly.length, 1);
  assert.equal(installedOnly[0].game.gameId, 'contra');

  const searchSamson = filterAndSortCatalog(matches, {
    searchQuery: 'Samson',
    genre: 'all',
    installedOnly: 'all',
    compatibility: 'all',
    sortBy: 'title-asc',
  });
  assert.equal(searchSamson.length, 1);
  assert.equal(searchSamson[0].game.gameId, 'little-samson');

  const matrix = buildCompatibilityMatrix();
  assert.equal(matrix.length, 60);
  const verifiedCount = matrix.filter((r) => r.compatibilityTier === 'verified-ram-hooks').length;
  const partialCount = matrix.filter((r) => r.compatibilityTier === 'partial-hooks-review').length;
  const pendingCount = matrix.filter((r) => r.compatibilityTier === 'pending-community-review').length;
  assert.equal(verifiedCount + partialCount + pendingCount, 60);
  assert.ok(verifiedCount >= 12);
  assert.ok(pendingCount >= 20);
});

test('50-achievement blueprint per game spans all 19 categories, 4 trophy tiers, and blocks auto-unlock on pending games', () => {
  const totals = getCatalogAchievementTotals();
  assert.equal(totals.totalGames, 60);
  assert.equal(totals.totalDefinitions, 60 * 50);
  assert.ok(totals.activeAutoVerified > 0);
  assert.ok(totals.manualReviewOnly + totals.pendingHooks > 0);
  assert.equal(
    totals.activeAutoVerified + totals.manualReviewOnly + totals.pendingHooks,
    3000
  );

  assert.equal(TROPHY_XP_TABLE.bronze, 25);
  assert.equal(TROPHY_XP_TABLE.silver, 75);
  assert.equal(TROPHY_XP_TABLE.gold, 150);
  assert.equal(TROPHY_XP_TABLE.platinum, 300);

  // Verify SMB1 (verified native WRAM hooks) has exactly 50 achievements covering all 19 categories
  const smb1Defs = getAchievementsForGame('super-mario-bros');
  assert.equal(smb1Defs.length, 50);
  const smb1Cats = new Set(smb1Defs.map((a) => a.category));
  for (const cat of ALL_ACHIEVEMENT_CATEGORIES) {
    assert.ok(smb1Cats.has(cat), `Missing category ${cat} in SMB1 blueprint`);
  }
  assert.ok(smb1Defs.some((a) => a.autoUnlockEnabled && a.ramCondition));
  assert.ok(smb1Defs.some((a) => a.trophyTier === 'platinum'));

  // Verify pending game (Little Samson) has 50 achievements, ALL with autoUnlockEnabled = false
  const samsonDefs = getAchievementsForGame('little-samson');
  assert.equal(samsonDefs.length, 50);
  assert.equal(
    samsonDefs.filter((a) => a.autoUnlockEnabled).length,
    0,
    'Pending games must never activate automatic achievement unlocks without verified RAM hooks'
  );
});

test('ChampionsVerificationEngine evaluates verified WRAM hooks accurately and tracks deaths', () => {
  const engine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'super-mario-bros',
    romSha256: '1'.repeat(64),
    romName: 'Super Mario Bros. (World).nes',
    nowMs: 1_700_000_000_000,
  });

  assert.equal(engine.getSnapshot().officialEligible, true);
  assert.equal(formatNesFramesToTime(601), '00:10.00');

  // Craft real 2 KB SMB1 WRAM snapshot: World 1-2 (0x075F=0, 0x075C=1), 30 coins (0x075E=30), score 15,000, 3 lives
  const ram = new Uint8Array(2048);
  ram[0x075f] = 0; // World 1 (0-indexed)
  ram[0x075c] = 1; // Stage 2 -> linear stage 2
  ram[0x075e] = 30; // Coins
  ram[0x075a] = 3; // Lives
  ram[0x07dd] = 0;
  ram[0x07de] = 0;
  ram[0x07df] = 1;
  ram[0x07e0] = 5;
  ram[0x07e1] = 0;
  ram[0x07e2] = 0;

  engine.recordFrameStep(1200);
  const res1 = engine.evaluateRamSnapshot(ram);
  assert.ok(res1.newlyUnlocked.length >= 3, 'Expected SMB1 world/coins/score/no-death unlocks');
  assert.ok(res1.newlyUnlocked.every((u) => u.verifiedOfficial === true));

  // Observe a real Mario death ($000E == 0x0B), then advance to World 4-1 -> no-death W4 achievement must NOT unlock
  const deathRam = new Uint8Array(ram);
  deathRam[0x000e] = 0x0b;
  engine.evaluateRamSnapshot(deathRam);
  assert.equal(engine.getSnapshot().deathsObserved, 1);

  const w4Ram = new Uint8Array(ram);
  w4Ram[0x075f] = 3; // World 4
  w4Ram[0x075c] = 0; // Stage 1 -> linear 13
  const already = new Set(res1.newlyUnlocked.map((u) => u.achievementId));
  const res2 = engine.evaluateRamSnapshot(w4Ram, already);
  assert.ok(
    !res2.newlyUnlocked.some((u) => u.achievementId.includes('no-death')),
    'No-death achievements must not unlock after a WRAM death is observed'
  );
});

test('Anti-cheat flags disqualify Practice Mode, Save-State Loads, Rewind, Fast-Forward, Turbo, Excessive Pauses, and Unverified Cores', () => {
  const makeCleanEngine = () =>
    new ChampionsVerificationEngine({
      mode: 'official-ranked',
      coreId: 'libretro-fceumm',
      coreVersion: 'fceumm-libretro-1.0',
      gameId: 'contra',
      romSha256: '2'.repeat(64),
      romName: 'Contra (USA).nes',
    });

  // 1. Practice mode
  const practice = new ChampionsVerificationEngine({
    mode: 'practice',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'contra',
    romSha256: '2'.repeat(64),
    romName: 'Contra (USA).nes',
  });
  assert.equal(practice.getSnapshot().officialEligible, false);
  const contraRam = new Uint8Array(2048);
  contraRam[0x0030] = 2; // Stage 3
  contraRam[0x0032] = 3; // Lives
  const practiceEval = practice.evaluateRamSnapshot(contraRam);
  assert.equal(practiceEval.newlyUnlocked.length, 0);
  assert.ok(practiceEval.blockedByIntegrity.length >= 1);

  // 2. Save-state load
  const saveFlag = makeCleanEngine();
  saveFlag.recordSaveStateLoad();
  assert.equal(saveFlag.getSnapshot().officialEligible, false);
  assert.ok(saveFlag.getSnapshot().flags.some((f) => f.code === 'SAVE_STATE_USED'));

  // 3. Rewind
  const rewindFlag = makeCleanEngine();
  rewindFlag.recordRewind();
  assert.equal(rewindFlag.getSnapshot().officialEligible, false);
  assert.ok(rewindFlag.getSnapshot().flags.some((f) => f.code === 'REWIND_USED'));

  // 4. Fast-forward
  const ffFlag = makeCleanEngine();
  ffFlag.recordFastForward(10);
  assert.equal(ffFlag.getSnapshot().officialEligible, false);
  assert.ok(ffFlag.getSnapshot().flags.some((f) => f.code === 'FAST_FORWARD_USED'));

  // 5. Turbo/Cheat
  const turboFlag = makeCleanEngine();
  turboFlag.recordTurboOrCheat('Touch Turbo A');
  assert.equal(turboFlag.getSnapshot().officialEligible, false);
  assert.ok(turboFlag.getSnapshot().flags.some((f) => f.code === 'TURBO_OR_CHEAT_ACTIVE'));

  // 6. Excessive pause abuse (> MAX_OFFICIAL_PAUSES_PER_RUN)
  const pauseFlag = makeCleanEngine();
  for (let i = 0; i <= MAX_OFFICIAL_PAUSES_PER_RUN; i++) {
    pauseFlag.recordPause();
    pauseFlag.recordResume();
  }
  assert.equal(pauseFlag.getSnapshot().officialEligible, false);
  assert.ok(pauseFlag.getSnapshot().flags.some((f) => f.code === 'EXCESSIVE_PAUSE_ABUSE'));

  // 7. Unverified core
  const badCore = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'hacked-nes-core',
    coreVersion: '0.0.1-mod',
    gameId: 'contra',
    romSha256: '2'.repeat(64),
    romName: 'Contra (USA).nes',
  });
  assert.equal(badCore.getSnapshot().officialEligible, false);
  assert.ok(badCore.getSnapshot().flags.some((f) => f.code === 'UNVERIFIED_CORE'));

  // 8. Pending game never auto-unlocks even when Ranked & clean
  const pendingEngine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'little-samson',
    romSha256: '3'.repeat(64),
    romName: 'Little Samson (USA).nes',
  });
  assert.equal(pendingEngine.getSnapshot().officialEligible, true);
  const fullRam = new Uint8Array(2048).fill(0xff);
  const pendingEval = pendingEngine.evaluateRamSnapshot(fullRam);
  assert.equal(pendingEval.newlyUnlocked.length, 0);
});

test('ChampionsProfileStore keeps credentials private, has zero fake leaderboards, enforces anti-cheat & tie-breaking, and gates Hall of Fame', () => {
  const store = new ChampionsProfileStore(false);

  // Zero fake data initially
  assert.equal(store.getActiveProfile(), null);
  assert.equal(store.getOfficialLeaderboard({ scope: 'global' }).length, 0);
  assert.equal(store.getHallOfFame().length, 0);
  assert.equal(store.getGoogleSignInStatus().available, false);

  // Register local Username/Password account
  const reg = store.registerUsernameAccount({
    username: 'TGK_RetroKing',
    password: 'strongpassword123',
    countryCode: 'IN',
    nowMs: 1000,
  });
  assert.equal(reg.ok, true);
  if (!reg.ok) return;

  // Private credentials must NEVER leak onto PublicPlayerProfile
  const publicProfile = store.getActiveProfile();
  assert.ok(publicProfile);
  assert.equal('passwordHashHex' in (publicProfile as unknown as Record<string, unknown>), false);
  assert.equal('passwordSalt' in (publicProfile as unknown as Record<string, unknown>), false);

  // Wrong password rejected; right password signs in
  store.signOut();
  assert.equal(store.getActiveProfile(), null);
  const badSignIn = store.signInUsernameAccount('TGK_RetroKing', 'wrongpass');
  assert.equal(badSignIn.ok, false);
  const goodSignIn = store.signInUsernameAccount('TGK_RetroKing', 'strongpassword123');
  assert.equal(goodSignIn.ok, true);

  // Flagged run rejected from Official Leaderboard
  const flaggedEngine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'super-mario-bros',
    romSha256: '4'.repeat(64),
    romName: 'Super Mario Bros. (World).nes',
  });
  flaggedEngine.recordSaveStateLoad();
  const rejected = store.submitRunRecord({
    integrity: flaggedEngine.getSnapshot(),
    boardType: 'speedrun-any',
    categoryLabel: 'Any% WRAM',
    score: 50000,
    requiresManualVideoReview: false,
  });
  assert.equal(rejected.ok, false);
  assert.equal(store.getOfficialLeaderboard({ scope: 'global' }).length, 0);

  // Two tied clean official speedrun submissions -> earliest timestamp wins tie-breaker
  const cleanEngineA = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'super-mario-bros',
    romSha256: '4'.repeat(64),
    romName: 'Super Mario Bros. (World).nes',
  });
  cleanEngineA.recordFrameStep(18000);
  const subLate = store.submitRunRecord({
    integrity: cleanEngineA.getSnapshot(),
    boardType: 'speedrun-any',
    categoryLabel: 'Any% Late',
    score: 40000,
    requiresManualVideoReview: false,
    nowMs: 5000,
  });
  assert.equal(subLate.ok, true);

  const subEarly = store.submitRunRecord({
    integrity: cleanEngineA.getSnapshot(),
    boardType: 'speedrun-any',
    categoryLabel: 'Any% Early',
    score: 40000,
    requiresManualVideoReview: false,
    nowMs: 2000,
  });
  assert.equal(subEarly.ok, true);

  const speedBoard = store.getOfficialLeaderboard({ scope: 'speedrun' });
  assert.equal(speedBoard.length, 2);
  assert.equal(speedBoard[0].categoryLabel, 'Any% Early');
  assert.equal(speedBoard[1].categoryLabel, 'Any% Late');

  // Video proof required for manual-review submissions, kept in pending queue (not official board)
  const badVideo = store.submitRunRecord({
    integrity: cleanEngineA.getSnapshot(),
    boardType: 'challenge',
    categoryLabel: 'No-Hit Boss',
    score: 10000,
    requiresManualVideoReview: true,
    videoProofUrl: 'http://invalid-site.example/vid',
  });
  assert.equal(badVideo.ok, false);

  const goodVideo = store.submitRunRecord({
    integrity: cleanEngineA.getSnapshot(),
    boardType: 'challenge',
    categoryLabel: 'No-Hit Boss',
    score: 10000,
    requiresManualVideoReview: true,
    videoProofUrl: 'https://youtu.be/dQw4w9WgXcQ',
  });
  assert.equal(goodVideo.ok, true);
  assert.equal(store.listPendingVideoReviews().length, 1);
  assert.equal(store.getOfficialLeaderboard({ scope: 'challenge' }).length, 0);

  // Hall of Fame requires 1 Platinum or 3 Gold verified trophies
  assert.equal(store.getHallOfFame().length, 0);
  store.recordUnlockedAchievements([
    {
      achievementId: 'super-mario-bros:ach-50',
      gameId: 'super-mario-bros',
      trophyTier: 'platinum',
      xpAwarded: 300,
      unlockedAtMs: 9000,
      frameCount: 18000,
      mode: 'official-ranked',
      verifiedOfficial: true,
      verificationMethod: 'native-ram-hook',
      romSha256: '4'.repeat(64),
      coreVersion: 'fceumm-libretro-1.0',
    },
  ]);
  const updated = store.getActiveProfile()!;
  assert.equal(updated.xp, 300);
  assert.equal(updated.level, calculateLevelFromXp(300).level);
  assert.equal(updated.trophies.platinum, 1);
  assert.equal(store.getHallOfFame().length, 1);
  assert.equal(store.getHallOfFame()[0].username, 'TGK_RetroKing');
});

test('TGK RETRO 4.4 Strict 90s Arcade Rule & Stage-by-Stage MM:SS.mmm split timing from FCEUmm WRAM', () => {
  // Exact millisecond split formatter from 60.0988 FPS NES frame counter
  assert.equal(formatNesFramesToSplitMs(0), '00:00.000');
  assert.equal(formatNesFramesToSplitMs(601), '00:10.000');

  // Every game in the 60-game catalog has a Stage 1..Final Stage plan + Game Completion milestone
  for (const game of NES_CHAMPIONS_CATALOG_60) {
    const plan = getGameStagePlan(game.gameId);
    assert.ok(plan.length >= 2, `Missing stage plan for ${game.gameId}`);
    assert.equal(plan[plan.length - 1].isFinalStage, true);
    const stageAchs = getStageClearAchievementsForGame(game.gameId);
    assert.ok(stageAchs.some((a) => a.name.toLowerCase().includes('completion') || a.name.toLowerCase().includes('clear')));
  }

  // Clean Official Ranked Contra run records exact Stage 1..Stage 8 (Final) splits & unlocks
  const engine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'contra',
    romSha256: '5'.repeat(64),
    romName: 'Contra (USA).nes',
    nowMs: 1_710_000_000_000,
  });
  assert.equal(engine.getSnapshot().runValidityStatus, 'VALID_OFFICIAL');

  const ram = new Uint8Array(2048);
  ram[0x0032] = 3; // Lives
  ram[0x0030] = 1; // Stage 1 cleared -> now entering Stage 2
  engine.recordFrameStep(3606); // ~60.001s
  const eval1 = engine.evaluateRamSnapshot(ram, new Set(), 1_710_000_060_000);
  assert.equal(eval1.newStageSplits.length, 1);
  assert.equal(eval1.newStageSplits[0].stageNumber, 1);
  assert.equal(eval1.newStageSplits[0].cumulativeFrames, 3606);
  assert.equal(eval1.newStageSplits[0].completedAtMs, 1_710_000_060_000);
  assert.equal(eval1.newStageSplits[0].verifiedOfficial, true);
  assert.ok(
    eval1.newlyUnlocked.some((u) => u.achievementId === 'nes_contra_stage_1_clear'),
    'Stage 1 Clear achievement should unlock on clean WRAM transition'
  );

  // Cheats enabled immediately disqualifies the run under the Strict 90s Arcade Rule
  const cheatedEngine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'contra',
    romSha256: '5'.repeat(64),
    romName: 'Contra (USA).nes',
  });
  cheatedEngine.recordCheatsEnabled('Game Genie 30 Lives');
  const snap = cheatedEngine.getSnapshot();
  assert.equal(snap.officialEligible, false);
  assert.equal(snap.runValidityStatus, 'INVALID_DISQUALIFIED');
  assert.ok(snap.flags.some((f) => f.code === 'CHEATS_ENABLED'));
  const cheatedEval = cheatedEngine.evaluateRamSnapshot(ram);
  assert.equal(cheatedEval.newlyUnlocked.length, 0);
});

test('TGK RETRO 4.4 Rank Tiers, 2P VS ELO, Friends Leaderboard & TGK FOUNDER / CREATOR spotlight with zero fake data', () => {
  // Rank tier progression spans Rookie -> TGK Legend
  assert.equal(RANK_TIERS[0].name, 'Rookie');
  assert.equal(RANK_TIERS[RANK_TIERS.length - 1].name, 'TGK Legend');
  assert.equal(getRankTierForXp(0).name, 'Rookie');
  assert.equal(getRankTierForXp(12000).name, 'TGK Legend');
  assert.ok(calculateEloDelta(1200, 1200, 'win') > 0);
  assert.ok(calculateEloDelta(1200, 1200, 'loss') < 0);

  const store = new ChampionsProfileStore(false);
  // Register App Owner / Founder account
  const founderReg = store.registerUsernameAccount({
    username: 'TGK_Owner',
    password: 'ownerpassword123',
    countryCode: 'IN',
    isFounderCreator: true,
    nowMs: 1000,
  });
  assert.equal(founderReg.ok, true);
  const founderProfile = store.getActiveProfile()!;
  assert.equal(founderProfile.isFounderCreator, true);
  assert.equal(founderProfile.founderBadgeLabel, FOUNDER_BADGE_LABEL);
  assert.equal(founderProfile.eloRating, DEFAULT_VS_ELO);

  // Zero fake spotlight before real verified achievements or submissions exist
  assert.equal(store.getFounderSpotlight(), null);
  assert.equal(store.getHallOfFame().length, 0);

  // Record a real 2P VS ELO win and add a friend
  const eloRes = store.recordVsEloMatch({ outcome: 'win', opponentElo: 1200 });
  assert.ok(eloRes);
  assert.ok(eloRes.newElo > DEFAULT_VS_ELO);
  assert.equal(store.addFriend('Rival_Ace').ok, true);

  // Submit a genuine verified run for Founder + verify Friends Leaderboard & Founder Spotlight
  const cleanEngine = new ChampionsVerificationEngine({
    mode: 'official-ranked',
    coreId: 'libretro-fceumm',
    coreVersion: 'fceumm-libretro-1.0',
    gameId: 'contra',
    romSha256: '6'.repeat(64),
    romName: 'Contra (USA).nes',
  });
  cleanEngine.recordFrameStep(12000);
  const sub = store.submitRunRecord({
    integrity: cleanEngine.getSnapshot(),
    boardType: 'high-score',
    categoryLabel: 'Official 90s Clear',
    score: 95000,
    requiresManualVideoReview: false,
    nowMs: 3000,
  });
  assert.equal(sub.ok, true);

  const friendsBoard = store.getOfficialLeaderboard({ scope: 'friends' });
  assert.equal(friendsBoard.length, 1);
  assert.equal(friendsBoard[0].playerName, 'TGK_Owner');
  assert.equal(friendsBoard[0].isFounderCreator, true);

  // Unlock a genuine verified trophy -> Founder spotlights cleanly in Leaderboards & Hall of Fame
  store.recordUnlockedAchievements([
    {
      achievementId: 'contra:stage-1-clear',
      gameId: 'contra',
      trophyTier: 'bronze',
      xpAwarded: 25,
      unlockedAtMs: 3500,
      frameCount: 3606,
      mode: 'official-ranked',
      verifiedOfficial: true,
      verificationMethod: 'native-ram-hook',
      romSha256: '6'.repeat(64),
      coreVersion: 'fceumm-libretro-1.0',
    },
  ]);
  const spotlight = store.getFounderSpotlight();
  assert.ok(spotlight);
  assert.equal(spotlight.profile.founderBadgeLabel, FOUNDER_BADGE_LABEL);
  const hof = store.getHallOfFame();
  assert.equal(hof.length, 1);
  assert.equal(hof[0].username, 'TGK_Owner');
  assert.equal(hof[0].isFounderCreator, true);
});


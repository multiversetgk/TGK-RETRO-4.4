import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_GAMER_COMING_SOON_FEATURES,
  AI_GAMER_PREVIEW_META,
} from '../emulator/ai/aiGamerPreviewData';

test('TGK AI Gamer Coming Soon preview keeps dummy AI gameplay disabled', () => {
  assert.equal(AI_GAMER_PREVIEW_META.isActiveGameplay, false);
  assert.equal(AI_GAMER_PREVIEW_META.badgeTitle, 'TGK AI GAMER – COMING SOON');
  assert.equal(AI_GAMER_PREVIEW_META.panelHeading, 'Future Update Preview');
});

test('TGK AI Gamer Future Update Preview highlights all 4 requested features', () => {
  assert.equal(AI_GAMER_COMING_SOON_FEATURES.length, 4);

  const titles = AI_GAMER_COMING_SOON_FEATURES.map((f) => f.title);
  assert.deepEqual(titles, [
    '2-Player AI Partner (Co-op & Versus)',
    'Live Banter & Match Reactions',
    '1P & 2P Smart Game Guide',
    'Classic Underrated Retro Guide (India Edition)',
  ]);

  const indiaGuide = AI_GAMER_COMING_SOON_FEATURES[3];
  assert.match(indiaGuide.description, /Blaster Master/);
  assert.match(indiaGuide.description, /Metroid/);
  assert.match(indiaGuide.description, /Zelda/);
  assert.match(indiaGuide.description, /Castlevania II/);
  assert.ok(indiaGuide.featuredGames && indiaGuide.featuredGames.length === 4);
});

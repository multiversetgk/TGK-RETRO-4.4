import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreatorHubStore,
  extractYouTubeVideoId,
  validateYouTubeUrl,
} from '../emulator/creator/creatorHubStore';

test('validateYouTubeUrl allows safe YouTube links and rejects javascript/non-YouTube URLs', () => {
  const handleRes = validateYouTubeUrl('youtube.com/@TGKTestEmulators');
  assert.equal(handleRes.valid, true);
  assert.equal(handleRes.normalizedUrl, 'https://youtube.com/@TGKTestEmulators');

  const shortRes = validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(shortRes.valid, true);
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=9bZkp7q19f0&t=12s'),
    '9bZkp7q19f0'
  );

  assert.equal(validateYouTubeUrl('javascript:alert(1)').valid, false);
  assert.equal(validateYouTubeUrl('data:text/html,<script>alert(1)</script>').valid, false);
  assert.equal(validateYouTubeUrl('https://evil.example.com/@fake').valid, false);
  assert.equal(validateYouTubeUrl('   ').valid, false);
});

test('CreatorHubStore supports editing My YouTube Channel, Latest Video Cards, and Retro YouTubers', () => {
  const store = new CreatorHubStore();
  const initial = store.getSnapshot();
  assert.ok(initial.myVideos.length >= 3);
  assert.ok(initial.retroCreators.length >= 6);

  // Update My Channel
  const updateRes = store.updateMyChannel({
    channelName: 'TGK Arcade Live',
    handle: 'TGKArcade',
    channelUrl: 'https://www.youtube.com/@TGKArcade',
    ctaLabel: 'Subscribe to TGK',
  });
  assert.equal(updateRes.ok, true);
  if (updateRes.ok) {
    assert.equal(updateRes.profile.channelName, 'TGK Arcade Live');
    assert.equal(updateRes.profile.handle, '@TGKArcade');
  }

  // Reject unsafe channel URL
  const badChannel = store.updateMyChannel({
    channelName: 'Bad',
    channelUrl: 'javascript:void(0)',
  });
  assert.equal(badChannel.ok, false);

  // Add & edit video card
  const addedVideo = store.upsertMyVideo({
    title: 'Mario 1-1 Speedrun 4:55',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: '04:55',
  });
  assert.equal(addedVideo.ok, true);
  if (addedVideo.ok) {
    const edited = store.upsertMyVideo({
      id: addedVideo.video.id,
      title: 'Mario 1-1 World Record Race',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      duration: '05:10',
    });
    assert.equal(edited.ok, true);
    assert.equal(
      store.getSnapshot().myVideos.find((v) => v.id === addedVideo.video.id)?.title,
      'Mario 1-1 World Record Race'
    );
    store.deleteMyVideo(addedVideo.video.id);
    assert.equal(
      store.getSnapshot().myVideos.find((v) => v.id === addedVideo.video.id),
      undefined
    );
  }

  // Add, edit, delete & reset Retro YouTubers
  const addedCreator = store.upsertRetroCreator({
    name: 'MetalJesusRocks',
    handle: 'MetalJesusRocks',
    channelUrl: 'https://www.youtube.com/@MetalJesusRocks',
    category: 'Reviews & History',
    specialty: 'Hidden Gems',
    highlightLine: 'Retro game collecting and hidden gem spotlights.',
  });
  assert.equal(addedCreator.ok, true);
  if (addedCreator.ok) {
    assert.equal(addedCreator.creator.handle, '@MetalJesusRocks');
    store.deleteRetroCreator(addedCreator.creator.id);
  }

  const resetList = store.resetRetroCreators();
  assert.equal(resetList.length, 6);
});

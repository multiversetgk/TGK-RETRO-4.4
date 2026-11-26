import React from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Film,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Tv,
  Users,
  X,
} from 'lucide-react';
import {
  extractYouTubeVideoId,
  type CreatorHubState,
  type CreatorVideoItem,
  type MyChannelProfile,
  type RetroCreatorCategory,
  type RetroCreatorChannel,
} from '../emulator/creator/creatorHubStore';

interface YouTubeCreatorHubProps {
  state: CreatorHubState;
  onUpdateMyChannel: (
    patch: Partial<MyChannelProfile>
  ) => { ok: true; profile: MyChannelProfile } | { ok: false; error: string };
  onUpsertMyVideo: (input: {
    id?: string;
    title: string;
    videoUrl: string;
    duration?: string;
    publishedLabel?: string;
    category?: string;
    note?: string;
  }) => { ok: true; video: CreatorVideoItem } | { ok: false; error: string };
  onDeleteMyVideo: (id: string) => void;
  onUpsertRetroCreator: (input: {
    id?: string;
    name: string;
    handle: string;
    channelUrl: string;
    category: RetroCreatorCategory;
    specialty: string;
    highlightLine: string;
    accentColor?: string;
  }) => { ok: true; creator: RetroCreatorChannel } | { ok: false; error: string };
  onDeleteRetroCreator: (id: string) => void;
  onResetRetroCreators: () => void;
  onBackToEmulator: () => void;
}

type CreatorHubTab = 'my-channel' | 'retro-youtubers';
type CategoryFilter = 'All' | RetroCreatorCategory;

const BANNER_IMG = '/src/assets/images/yt_creator_banner_1795645609237.jpg';
const CARTRIDGES_IMG = '/src/assets/images/yt_retro_cartridges_1795645609457.jpg';

const RETRO_CATEGORIES: CategoryFilter[] = [
  'All',
  'NES & Speedruns',
  'Hardware & Emulation',
  'Reviews & History',
];

const CREATOR_CATEGORY_OPTIONS: RetroCreatorCategory[] = [
  'NES & Speedruns',
  'Hardware & Emulation',
  'Reviews & History',
];

export const YouTubeCreatorHub: React.FC<YouTubeCreatorHubProps> = ({
  state,
  onUpdateMyChannel,
  onUpsertMyVideo,
  onDeleteMyVideo,
  onUpsertRetroCreator,
  onDeleteRetroCreator,
  onResetRetroCreators,
  onBackToEmulator,
}) => {
  const [activeTab, setActiveTab] = React.useState<CreatorHubTab>('my-channel');
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>('All');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [bannerImgFailed, setBannerImgFailed] = React.useState(false);
  const [failedThumbIds, setFailedThumbIds] = React.useState<Record<string, boolean>>({});

  // My Channel edit state
  const [isEditingChannel, setIsEditingChannel] = React.useState(false);
  const [channelDraft, setChannelDraft] = React.useState<MyChannelProfile>(state.myChannel);
  const [channelError, setChannelError] = React.useState<string | null>(null);

  // Add/Edit Video state
  const [showVideoForm, setShowVideoForm] = React.useState(false);
  const [editingVideoId, setEditingVideoId] = React.useState<string | null>(null);
  const [videoTitle, setVideoTitle] = React.useState('');
  const [videoUrl, setVideoUrl] = React.useState('');
  const [videoDuration, setVideoDuration] = React.useState('10:00');
  const [videoCategory, setVideoCategory] = React.useState('Dual-Screen Race');
  const [videoNote, setVideoNote] = React.useState('');
  const [videoError, setVideoError] = React.useState<string | null>(null);

  // Add/Edit Retro YouTuber state
  const [showCreatorForm, setShowCreatorForm] = React.useState(false);
  const [editingCreatorId, setEditingCreatorId] = React.useState<string | null>(null);
  const [creatorName, setCreatorName] = React.useState('');
  const [creatorHandle, setCreatorHandle] = React.useState('');
  const [creatorUrl, setCreatorUrl] = React.useState('');
  const [creatorCategory, setCreatorCategory] =
    React.useState<RetroCreatorCategory>('NES & Speedruns');
  const [creatorSpecialty, setCreatorSpecialty] = React.useState('');
  const [creatorHighlight, setCreatorHighlight] = React.useState('');
  const [creatorError, setCreatorError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setChannelDraft(state.myChannel);
  }, [state.myChannel]);

  const handleCopyLink = (id: string, url: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 1800);
  };

  const handleSaveChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onUpdateMyChannel(channelDraft);
    if (!res.ok) {
      setChannelError(res.error);
      return;
    }
    setChannelError(null);
    setIsEditingChannel(false);
  };

  const openAddVideoForm = () => {
    setEditingVideoId(null);
    setVideoTitle('');
    setVideoUrl('');
    setVideoDuration('10:00');
    setVideoCategory('Dual-Screen Race');
    setVideoNote('');
    setVideoError(null);
    setShowVideoForm(true);
  };

  const openEditVideoForm = (video: CreatorVideoItem) => {
    setEditingVideoId(video.id);
    setVideoTitle(video.title);
    setVideoUrl(video.videoUrl);
    setVideoDuration(video.duration);
    setVideoCategory(video.category);
    setVideoNote(video.note);
    setVideoError(null);
    setShowVideoForm(true);
  };

  const handleSaveVideo = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onUpsertMyVideo({
      id: editingVideoId ?? undefined,
      title: videoTitle,
      videoUrl,
      duration: videoDuration,
      publishedLabel: editingVideoId ? 'Updated' : 'New Upload',
      category: videoCategory,
      note: videoNote,
    });
    if (!res.ok) {
      setVideoError(res.error);
      return;
    }
    setVideoError(null);
    setShowVideoForm(false);
    setEditingVideoId(null);
  };

  const openAddCreatorForm = () => {
    setEditingCreatorId(null);
    setCreatorName('');
    setCreatorHandle('');
    setCreatorUrl('');
    setCreatorCategory('NES & Speedruns');
    setCreatorSpecialty('');
    setCreatorHighlight('');
    setCreatorError(null);
    setShowCreatorForm(true);
  };

  const openEditCreatorForm = (creator: RetroCreatorChannel) => {
    setEditingCreatorId(creator.id);
    setCreatorName(creator.name);
    setCreatorHandle(creator.handle);
    setCreatorUrl(creator.channelUrl);
    setCreatorCategory(creator.category);
    setCreatorSpecialty(creator.specialty);
    setCreatorHighlight(creator.highlightLine);
    setCreatorError(null);
    setShowCreatorForm(true);
  };

  const handleSaveCreator = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onUpsertRetroCreator({
      id: editingCreatorId ?? undefined,
      name: creatorName,
      handle: creatorHandle,
      channelUrl: creatorUrl,
      category: creatorCategory,
      specialty: creatorSpecialty,
      highlightLine: creatorHighlight,
    });
    if (!res.ok) {
      setCreatorError(res.error);
      return;
    }
    setCreatorError(null);
    setShowCreatorForm(false);
    setEditingCreatorId(null);
  };

  const visibleCreators =
    categoryFilter === 'All'
      ? state.retroCreators
      : state.retroCreators.filter((c) => c.category === categoryFilter);

  return (
    <div
      data-testid="youtube-creator-hub"
      className="flex h-full w-full flex-col overflow-hidden bg-[#0E1014] text-[#ECEAE4]"
    >
      {/* Clean Responsive 3-Zone Top Bar (Single row on md+, 2 clean rows on mobile) */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-white/10 bg-[#14171F] px-4 py-3 sm:px-8 md:flex-nowrap">
        <span className="order-1 font-display text-sm font-extrabold tracking-tight text-[#F4F1EA] whitespace-nowrap shrink-0">
          TGK RETRO 4.4
        </span>

        <nav
          aria-label="YouTube Creator Hub Sections"
          className="order-3 flex w-full items-center gap-1 rounded-lg border border-white/10 bg-[#0E1014] p-1 md:order-2 md:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'my-channel'}
            onClick={() => setActiveTab('my-channel')}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 md:flex-none ${
              activeTab === 'my-channel'
                ? 'bg-[#C82333] text-white'
                : 'text-[#A09C94] hover:text-white'
            }`}
          >
            <Tv className="h-3.5 w-3.5" aria-hidden="true" />
            <span>My YouTube Channel</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'retro-youtubers'}
            onClick={() => setActiveTab('retro-youtubers')}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 md:flex-none ${
              activeTab === 'retro-youtubers'
                ? 'bg-[#C82333] text-white'
                : 'text-[#A09C94] hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retro YouTubers</span>
          </button>
        </nav>

        <button
          type="button"
          onClick={onBackToEmulator}
          className="tactile-press order-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#1B1F29] px-3 py-1.5 text-xs font-semibold text-[#F4F1EA] hover:border-white/30 hover:bg-[#242936] whitespace-nowrap shrink-0 md:order-3 md:px-3.5 md:py-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Emulator</span>
        </button>
      </header>

      {/* Main Scrollable Hub Content */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">
          {activeTab === 'my-channel' ? (
            <div className="space-y-8">
              {/* Split Hero Channel Showcase */}
              <section
                aria-label="My YouTube Channel Profile"
                className="grid grid-cols-1 items-stretch gap-6 overflow-hidden rounded-xl border border-white/10 bg-[#14171F] lg:grid-cols-12"
              >
                <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#9C978E]">
                      <span className="font-semibold text-[#F59E0B]">My YouTube Channel</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{state.myChannel.handle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {state.myVideos.length}{' '}
                        {state.myVideos.length === 1 ? 'Video Card' : 'Video Cards'}
                      </span>
                    </div>

                    <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-[#F4F1EA] sm:text-4xl">
                      {state.myChannel.channelName}
                    </h1>

                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#B8B3A8]">
                      {state.myChannel.tagline}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <a
                      href={state.myChannel.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tactile-press inline-flex h-11 items-center gap-2 rounded-lg bg-[#C82333] px-5 font-display text-sm font-bold text-white hover:bg-[#DC2C3D] whitespace-nowrap shrink-0"
                    >
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>{state.myChannel.ctaLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setChannelError(null);
                        setIsEditingChannel((prev) => !prev);
                      }}
                      className="tactile-press inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-[#1B1F29] px-4 text-xs font-semibold text-[#ECEAE4] hover:border-[#F59E0B]/60 hover:text-white whitespace-nowrap shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                      <span>{isEditingChannel ? 'Close Channel Settings' : 'Edit Channel Details'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyLink('my-channel', state.myChannel.channelUrl)}
                      className="tactile-press inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-[#12151C] px-3.5 text-xs font-medium text-[#B8B3A8] hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
                    >
                      {copiedId === 'my-channel' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
                          <span>Link Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right Studio Media Cover */}
                <div className="relative min-h-[220px] bg-[#0B0D11] lg:col-span-5">
                  {!bannerImgFailed ? (
                    <img
                      src={BANNER_IMG}
                      alt="Retro NES controller beside broadcast microphone and CRT monitor"
                      referrerPolicy="no-referrer"
                      onError={() => setBannerImgFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#231518] via-[#14171F] to-[#0E1014]">
                      <Tv className="h-12 w-12 text-[#C82333]/60" aria-hidden="true" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#14171F]/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#14171F] lg:via-transparent lg:to-transparent" />
                </div>
              </section>

              {/* Inline Channel Setup / Edit Panel */}
              {isEditingChannel && (
                <form
                  onSubmit={handleSaveChannel}
                  aria-label="Edit My YouTube Channel Form"
                  className="rounded-xl border border-[#F59E0B]/35 bg-[#161922] p-6"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#F4F1EA]">
                      Customize Your YouTube Channel
                    </h2>
                    <button
                      type="button"
                      onClick={() => setIsEditingChannel(false)}
                      aria-label="Close channel editor"
                      className="rounded p-1 text-[#9C978E] hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {channelError && (
                    <div
                      role="alert"
                      className="mb-4 rounded-md border border-[#E03131]/50 bg-[#2A1518] px-3 py-2 text-xs text-[#FCA5A5]"
                    >
                      {channelError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="my-channel-name"
                        className="mb-1.5 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Channel Name
                      </label>
                      <input
                        id="my-channel-name"
                        type="text"
                        required
                        value={channelDraft.channelName}
                        onChange={(e) =>
                          setChannelDraft((prev) => ({ ...prev, channelName: e.target.value }))
                        }
                        placeholder="e.g. TGK Retro Gaming"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="my-channel-handle"
                        className="mb-1.5 block text-xs font-medium text-[#B8B3A8]"
                      >
                        YouTube Handle
                      </label>
                      <input
                        id="my-channel-handle"
                        type="text"
                        value={channelDraft.handle}
                        onChange={(e) =>
                          setChannelDraft((prev) => ({ ...prev, handle: e.target.value }))
                        }
                        placeholder="@YourHandle"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="my-channel-url"
                        className="mb-1.5 block text-xs font-medium text-[#B8B3A8]"
                      >
                        YouTube Channel Link
                      </label>
                      <input
                        id="my-channel-url"
                        type="url"
                        required
                        value={channelDraft.channelUrl}
                        onChange={(e) =>
                          setChannelDraft((prev) => ({ ...prev, channelUrl: e.target.value }))
                        }
                        placeholder="https://www.youtube.com/@YourChannel"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="my-channel-cta"
                        className="mb-1.5 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Channel Button Label
                      </label>
                      <input
                        id="my-channel-cta"
                        type="text"
                        value={channelDraft.ctaLabel}
                        onChange={(e) =>
                          setChannelDraft((prev) => ({ ...prev, ctaLabel: e.target.value }))
                        }
                        placeholder="Open My YouTube Channel"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="my-channel-tagline"
                        className="mb-1.5 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Channel Description / Bio
                      </label>
                      <input
                        id="my-channel-tagline"
                        type="text"
                        value={channelDraft.tagline}
                        onChange={(e) =>
                          setChannelDraft((prev) => ({ ...prev, tagline: e.target.value }))
                        }
                        placeholder="Short description of your retro NES content"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingChannel(false)}
                      className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-[#B8B3A8] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#C82333] px-5 py-2 text-xs font-bold text-white hover:bg-[#DC2C3D]"
                    >
                      Save Channel
                    </button>
                  </div>
                </form>
              )}

              {/* Latest Video Cards Section */}
              <section aria-label="Latest Video Cards">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight text-[#F4F1EA]">
                      Latest Video Cards
                    </h2>
                    <p className="mt-0.5 text-xs text-[#9C978E]">
                      Pin your newest NES uploads, Dual-Screen races, or shorts for quick sharing with friends.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openAddVideoForm}
                    className="tactile-press inline-flex items-center gap-1.5 rounded-lg border border-[#F59E0B]/50 bg-[#261E13] px-4 py-2 text-xs font-bold text-[#FCD34D] hover:border-[#F59E0B] whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Video Card</span>
                  </button>
                </div>

                {/* Add / Edit Video Form */}
                {showVideoForm && (
                  <form
                    onSubmit={handleSaveVideo}
                    aria-label="Add or Edit Video Card Form"
                    className="mb-6 rounded-xl border border-white/15 bg-[#161922] p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-display text-sm font-bold text-[#F4F1EA]">
                        {editingVideoId ? 'Edit Video Card' : 'Add Latest Video Card'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowVideoForm(false)}
                        aria-label="Close video form"
                        className="rounded p-1 text-[#9C978E] hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {videoError && (
                      <div
                        role="alert"
                        className="mb-3 rounded-md border border-[#E03131]/50 bg-[#2A1518] px-3 py-2 text-xs text-[#FCA5A5]"
                      >
                        {videoError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="video-title-input"
                          className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                        >
                          Video Title
                        </label>
                        <input
                          id="video-title-input"
                          type="text"
                          required
                          value={videoTitle}
                          onChange={(e) => setVideoTitle(e.target.value)}
                          placeholder="e.g. Contra 2P VS Race — No Death Run"
                          className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="video-url-input"
                          className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                        >
                          YouTube Video Link
                        </label>
                        <input
                          id="video-url-input"
                          type="url"
                          required
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="video-duration-input"
                          className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                        >
                          Duration
                        </label>
                        <input
                          id="video-duration-input"
                          type="text"
                          value={videoDuration}
                          onChange={(e) => setVideoDuration(e.target.value)}
                          placeholder="12:45"
                          className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="video-category-input"
                          className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                        >
                          Series / Category
                        </label>
                        <input
                          id="video-category-input"
                          type="text"
                          value={videoCategory}
                          onChange={(e) => setVideoCategory(e.target.value)}
                          placeholder="Dual-Screen Race"
                          className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="video-note-input"
                          className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                        >
                          Short Note (Optional)
                        </label>
                        <input
                          id="video-note-input"
                          type="text"
                          value={videoNote}
                          onChange={(e) => setVideoNote(e.target.value)}
                          placeholder="Match summary or highlight timestamp"
                          className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowVideoForm(false)}
                        className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-[#B8B3A8] hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-[#C82333] px-5 py-2 text-xs font-bold text-white hover:bg-[#DC2C3D]"
                      >
                        {editingVideoId ? 'Save Changes' : 'Add Video'}
                      </button>
                    </div>
                  </form>
                )}

                {state.myVideos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 bg-[#14171F] p-10 text-center">
                    <Film className="mx-auto mb-3 h-8 w-8 text-[#7D7972]" aria-hidden="true" />
                    <p className="font-display text-sm font-bold text-[#F4F1EA]">
                      No video cards pinned yet
                    </p>
                    <p className="mt-1 text-xs text-[#9C978E]">
                      Add your latest YouTube uploads so your friends can launch them right from the emulator.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {state.myVideos.map((video, idx) => {
                      const ytId = extractYouTubeVideoId(video.videoUrl);
                      const fallbackArt = idx % 2 === 0 ? BANNER_IMG : CARTRIDGES_IMG;
                      const thumbSrc =
                        ytId && !failedThumbIds[video.id]
                          ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
                          : fallbackArt;

                      return (
                        <article
                          key={video.id}
                          className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#14171F] transition-colors hover:border-white/25"
                        >
                          {/* 16:9 Media Cover with Zero-Broken-Image Fallback */}
                          <div className="relative aspect-video w-full overflow-hidden bg-[#0B0D11]">
                            <img
                              src={thumbSrc}
                              alt={video.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedThumbIds((prev) => ({ ...prev, [video.id]: true }))
                              }
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="font-mono-tabular absolute right-2.5 bottom-2 rounded bg-black/85 px-2 py-0.5 text-[11px] font-semibold text-[#F4F1EA]">
                              {video.duration}
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="flex flex-1 flex-col justify-between p-4">
                            <div>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#9C978E]">
                                <span className="font-medium text-[#F59E0B]">{video.category}</span>
                                <span aria-hidden="true">·</span>
                                <span>{video.publishedLabel}</span>
                              </div>
                              <h3 className="font-display mt-1.5 text-sm font-bold leading-snug text-[#F4F1EA]">
                                {video.title}
                              </h3>
                              {video.note && (
                                <p className="mt-1.5 text-xs leading-relaxed text-[#9C978E]">
                                  {video.note}
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
                              <a
                                href={video.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F4F1EA] hover:text-[#F59E0B]"
                              >
                                <Play className="h-3.5 w-3.5 fill-current text-[#E03131]" aria-hidden="true" />
                                <span>Watch on YouTube</span>
                                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                              </a>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditVideoForm(video)}
                                  aria-label={`Edit video ${video.title}`}
                                  className="rounded p-1.5 text-[#9C978E] hover:bg-white/6 hover:text-white"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteMyVideo(video.id)}
                                  aria-label={`Delete video ${video.title}`}
                                  className="rounded p-1.5 text-[#9C978E] hover:bg-[#2A1518] hover:text-[#FCA5A5]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* TAB 2: RETRO YOUTUBERS DIRECTORY */
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#F4F1EA] sm:text-3xl">
                    Retro Gaming YouTubers
                  </h1>
                  <p className="mt-1 text-sm text-[#9C978E]">
                    Curated NES, speedrun, and retro hardware creators — add or edit your favorite channels anytime.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onResetRetroCreators}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#14171F] px-3 py-2 text-xs font-medium text-[#B8B3A8] hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reset Curated</span>
                  </button>
                  <button
                    type="button"
                    onClick={openAddCreatorForm}
                    className="tactile-press inline-flex items-center gap-1.5 rounded-lg bg-[#C82333] px-4 py-2 text-xs font-bold text-white hover:bg-[#DC2C3D] whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Channel</span>
                  </button>
                </div>
              </div>

              {/* Interactive Category Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Filter Retro YouTubers by Category"
                  className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#14171F] p-1"
                >
                  {RETRO_CATEGORIES.map((cat) => {
                    const active = categoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#262B38] text-[#F4F1EA]'
                            : 'text-[#8E8A82] hover:text-[#ECEAE4]'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <span className="font-mono-tabular text-xs text-[#8E8A82]">
                  {visibleCreators.length}{' '}
                  {visibleCreators.length === 1 ? 'channel' : 'channels'}
                </span>
              </div>

              {/* Add / Edit Retro Creator Form */}
              {showCreatorForm && (
                <form
                  onSubmit={handleSaveCreator}
                  aria-label="Add or Edit Retro YouTuber Form"
                  className="rounded-xl border border-[#F59E0B]/35 bg-[#161922] p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold text-[#F4F1EA]">
                      {editingCreatorId ? 'Edit Retro YouTuber' : 'Add Retro Gaming Channel'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowCreatorForm(false)}
                      aria-label="Close channel form"
                      className="rounded p-1 text-[#9C978E] hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {creatorError && (
                    <div
                      role="alert"
                      className="mb-3 rounded-md border border-[#E03131]/50 bg-[#2A1518] px-3 py-2 text-xs text-[#FCA5A5]"
                    >
                      {creatorError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="creator-name-input"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Channel Name
                      </label>
                      <input
                        id="creator-name-input"
                        type="text"
                        required
                        value={creatorName}
                        onChange={(e) => setCreatorName(e.target.value)}
                        placeholder="e.g. MetalJesusRocks"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="creator-handle-input"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        YouTube Handle
                      </label>
                      <input
                        id="creator-handle-input"
                        type="text"
                        value={creatorHandle}
                        onChange={(e) => setCreatorHandle(e.target.value)}
                        placeholder="@MetalJesusRocks"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="creator-url-input"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        YouTube Channel URL
                      </label>
                      <input
                        id="creator-url-input"
                        type="url"
                        required
                        value={creatorUrl}
                        onChange={(e) => setCreatorUrl(e.target.value)}
                        placeholder="https://www.youtube.com/@MetalJesusRocks"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="creator-category-select"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Category
                      </label>
                      <select
                        id="creator-category-select"
                        value={creatorCategory}
                        onChange={(e) =>
                          setCreatorCategory(e.target.value as RetroCreatorCategory)
                        }
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      >
                        {CREATOR_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="creator-specialty-input"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Focus / Specialty
                      </label>
                      <input
                        id="creator-specialty-input"
                        type="text"
                        value={creatorSpecialty}
                        onChange={(e) => setCreatorSpecialty(e.target.value)}
                        placeholder="Hidden Gems & Collecting"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="creator-highlight-input"
                        className="mb-1 block text-xs font-medium text-[#B8B3A8]"
                      >
                        Short Description
                      </label>
                      <input
                        id="creator-highlight-input"
                        type="text"
                        value={creatorHighlight}
                        onChange={(e) => setCreatorHighlight(e.target.value)}
                        placeholder="Why retro gamers love this channel"
                        className="h-10 w-full rounded-lg border border-white/15 bg-[#0E1014] px-3 text-sm text-white focus:border-[#F59E0B] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreatorForm(false)}
                      className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-[#B8B3A8] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#C82333] px-5 py-2 text-xs font-bold text-white hover:bg-[#DC2C3D]"
                    >
                      {editingCreatorId ? 'Update Channel' : 'Save Channel'}
                    </button>
                  </div>
                </form>
              )}

              {/* 3-in-a-Row Retro YouTubers Grid */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {visibleCreators.map((creator) => {
                  const initials = creator.name
                    .replace(/[^a-zA-Z0-9\s]/g, ' ')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('');

                  return (
                    <article
                      key={creator.id}
                      className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#14171F] p-5 transition-colors hover:border-white/25"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/12 font-display text-base font-extrabold text-white"
                              style={{ backgroundColor: `${creator.accentColor}26` }}
                            >
                              <span style={{ color: creator.accentColor }}>{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-display truncate text-base font-bold text-[#F4F1EA]">
                                {creator.name}
                              </h3>
                              <p className="font-mono-tabular truncate text-xs text-[#9C978E]">
                                {creator.handle}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditCreatorForm(creator)}
                              aria-label={`Edit ${creator.name}`}
                              className="rounded p-1.5 text-[#8E8A82] hover:bg-white/6 hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteRetroCreator(creator.id)}
                              aria-label={`Remove ${creator.name}`}
                              className="rounded p-1.5 text-[#8E8A82] hover:bg-[#2A1518] hover:text-[#FCA5A5]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Unboxed Metadata Line */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[#A09C94]">
                          <span className="font-medium text-[#F59E0B]">{creator.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{creator.specialty}</span>
                        </div>

                        <p className="mt-2.5 text-xs leading-relaxed text-[#B8B3A8]">
                          {creator.highlightLine}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-3.5">
                        <a
                          href={creator.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F4F1EA] hover:text-[#F59E0B]"
                        >
                          <Play className="h-3.5 w-3.5 fill-current text-[#E03131]" aria-hidden="true" />
                          <span>Visit Channel</span>
                          <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleCopyLink(creator.id, creator.channelUrl)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8E8A82] hover:text-white"
                        >
                          {copiedId === creator.id ? (
                            <>
                              <Check className="h-3 w-3 text-[#34D399]" aria-hidden="true" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              <span>Copy URL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

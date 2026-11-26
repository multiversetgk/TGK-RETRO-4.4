import React from 'react';
import {
  Flame,
  FolderOpen,
  Plus,
  Radio,
  Scale,
  Shield,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Users,
  X,
  Flag,
} from 'lucide-react';
import {
  resolveRamProfile,
  type RaceHandicapMode,
  type RaceMatchConfig,
  type RaceMatchMode,
} from '../emulator/race/ramJudge';
import type { FriendRival } from '../emulator/race/rivalryStore';

interface DualRaceSetupModalProps {
  romName: string | null;
  initialConfig: RaceMatchConfig;
  rivals: FriendRival[];
  onRequestLoadRomFile: () => void;
  onAddFriend: (name: string) => FriendRival;
  onRemoveFriend: (id: string) => void;
  onStartLocalRace: (config: RaceMatchConfig) => void;
  onHostOnlineRace: (config: RaceMatchConfig) => void;
  onClose: () => void;
}

const MATCH_MODES: {
  id: RaceMatchMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'score-attack',
    label: 'Score Attack',
    desc: 'Countdown timer · Highest score wins',
    icon: <Timer className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />,
  },
  {
    id: 'first-to-stage',
    label: 'First to Stage',
    desc: 'Race to target Stage / Flagpole first',
    icon: <Flag className="h-4 w-4 text-[#E03131]" aria-hidden="true" />,
  },
  {
    id: 'survival-1life',
    label: '1-Life Survival',
    desc: 'First player to lose a life gets KO’d',
    icon: <Shield className="h-4 w-4 text-[#34D399]" aria-hidden="true" />,
  },
];

const HANDICAP_OPTIONS: { id: RaceHandicapMode; label: string }[] = [
  { id: 'none', label: 'Fair 1v1 (No Handicap)' },
  { id: 'p1-minus-1-life', label: 'P1 Pro Handicap (-1 Life)' },
  { id: 'p2-minus-1-life', label: 'P2 Pro Handicap (-1 Life)' },
  { id: 'p1-plus-500', label: 'P1 Rookie Headstart (+500)' },
  { id: 'p2-plus-500', label: 'P2 Rookie Headstart (+500)' },
];

export const DualRaceSetupModal: React.FC<DualRaceSetupModalProps> = ({
  romName,
  initialConfig,
  rivals,
  onRequestLoadRomFile,
  onAddFriend,
  onRemoveFriend,
  onStartLocalRace,
  onHostOnlineRace,
  onClose,
}) => {
  const [config, setConfig] = React.useState<RaceMatchConfig>(() => {
    const selected =
      rivals.find((r) => r.id === initialConfig.rivalId) ?? rivals[0] ?? null;
    return {
      ...initialConfig,
      rivalId: selected?.id ?? null,
      p2Name: selected?.name ?? initialConfig.p2Name,
    };
  });
  const [newFriendName, setNewFriendName] = React.useState('');

  const ramProfile = React.useMemo(() => resolveRamProfile(romName ?? ''), [romName]);

  const handleSelectRival = (rival: FriendRival) => {
    setConfig((prev) => ({
      ...prev,
      rivalId: rival.id,
      p2Name: rival.name,
    }));
  };

  const handleAddFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFriendName.trim();
    if (!trimmed) return;
    const created = onAddFriend(trimmed);
    setNewFriendName('');
    handleSelectRival(created);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dual-race-setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/12 bg-[#14171F] shadow-2xl shadow-black/90">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-[#E03131]" aria-hidden="true" />
              <h2
                id="dual-race-setup-title"
                className="font-display text-lg font-extrabold tracking-tight text-[#F4F1EA]"
              >
                Dual-Screen 1P VS Race Setup
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#9C978E]">
              Online VS runs 1 local FCEUmm core + lightweight remote opponent stream for locked 60 FPS{' '}
              {romName ? (
                <>
                  on <strong className="text-[#F4F1EA]">{romName}</strong>
                </>
              ) : (
                <span className="text-[#FCD34D]">— select a .nes ROM file to begin</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close VS Race setup"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#1D2028] text-[#B8B3A8] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* NES RAM Judge Detection Banner */}
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs ${
              ramProfile.isRamMapped
                ? 'border-[#34D399]/35 bg-[#12221B] text-[#A7F3D0]'
                : 'border-[#F59E0B]/35 bg-[#241E13] text-[#FDE68A]'
            }`}
          >
            <div className="font-semibold">
              VS Judge Sensor: {ramProfile.label}
            </div>
            <div className="mt-0.5 text-[11px] opacity-85">{ramProfile.description}</div>
          </div>

          {/* 1. Match Mode */}
          <section aria-label="VS Match Mode">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#B8B3A8] uppercase">
              <Trophy className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>Match Mode</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {MATCH_MODES.map((m) => {
                const active = config.mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setConfig((prev) => ({ ...prev, mode: m.id }))}
                    className={`tactile-press flex flex-col items-start rounded-lg border p-3 text-left ${
                      active
                        ? 'border-[#C82333] bg-[#24161A] text-[#F4F1EA]'
                        : 'border-white/10 bg-[#1A1D26] text-[#B8B3A8] hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {m.icon}
                      <span className="font-display text-xs font-bold">{m.label}</span>
                    </div>
                    <span className="mt-1 text-[11px] text-[#8E8A82]">{m.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Mode-Specific Parameters */}
            {config.mode === 'score-attack' && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/8 bg-[#191C24] p-3">
                  <div className="mb-1.5 text-[11px] font-medium text-[#A09C94]">
                    Match Timer
                  </div>
                  <div className="flex gap-1.5">
                    {[60, 120, 180].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, durationSeconds: sec }))
                        }
                        className={`font-mono-tabular flex-1 rounded py-1.5 text-xs font-semibold ${
                          config.durationSeconds === sec
                            ? 'bg-[#C82333] text-white'
                            : 'bg-[#12141A] text-[#A09C94] hover:text-white'
                        }`}
                      >
                        {sec / 60}m
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/8 bg-[#191C24] p-3">
                  <div className="mb-1.5 text-[11px] font-medium text-[#A09C94]">
                    Score Target (Optional Early Win)
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 500, 1000, 2500].map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, targetScore: pts }))}
                        className={`font-mono-tabular flex-1 rounded py-1.5 text-xs font-semibold ${
                          config.targetScore === pts
                            ? 'bg-[#F59E0B] text-[#111215]'
                            : 'bg-[#12141A] text-[#A09C94] hover:text-white'
                        }`}
                      >
                        {pts === 0 ? 'Timer' : pts}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {config.mode === 'first-to-stage' && (
              <div className="mt-3 rounded-lg border border-white/8 bg-[#191C24] p-3">
                <div className="mb-1.5 text-[11px] font-medium text-[#A09C94]">
                  Target Stage / Flagpole Goal
                </div>
                <div className="flex gap-2">
                  {[2, 3, 4].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, targetStage: st }))}
                      className={`font-mono-tabular flex-1 rounded py-1.5 text-xs font-semibold ${
                        config.targetStage === st
                          ? 'bg-[#C82333] text-white'
                          : 'bg-[#12141A] text-[#A09C94] hover:text-white'
                      }`}
                    >
                      Stage {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 2. Friend Roster & Rival Stats */}
          <section aria-label="Friend Roster and Rival Stats">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#B8B3A8] uppercase">
                <Users className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                <span>Friend Roster &amp; Rival Record</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#8E8A82]">
                Auto-saves Win/Loss &amp; High Scores
              </span>
            </div>

            <div className="mb-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rivals.map((rival) => {
                const selected = config.rivalId === rival.id;
                return (
                  <div
                    key={rival.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                      selected
                        ? 'border-[#F59E0B]/75 bg-[#241E14]'
                        : 'border-white/10 bg-[#1A1D26] hover:border-white/20'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectRival(rival)}
                      className="flex flex-1 flex-col items-start text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold text-[#F4F1EA]">
                          {rival.name}
                        </span>
                        <span className="font-mono-tabular rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-[#F59E0B]">
                          {rival.wins}W-{rival.losses}L
                          {rival.draws > 0 ? `-${rival.draws}D` : ''}
                        </span>
                      </div>
                      <span className="font-mono-tabular mt-0.5 text-[10px] text-[#8E8A82]">
                        Best: {rival.highScore.toLocaleString()} pts
                        {rival.currentStreak >= 2 ? ` · ${rival.currentStreak}🔥` : ''}
                      </span>
                    </button>
                    {rivals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveFriend(rival.id)}
                        aria-label={`Remove friend ${rival.name}`}
                        className="ml-2 rounded p-1 text-[#7D7972] hover:bg-white/10 hover:text-[#FCA5A5]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleAddFriendSubmit} className="flex gap-2">
              <input
                type="text"
                maxLength={24}
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Add friend rival name (e.g. Vikram)..."
                aria-label="New friend name"
                className="h-9 flex-1 rounded-lg border border-white/12 bg-[#0E1014] px-3 text-xs text-[#F4F1EA] placeholder:text-[#66635C]"
              />
              <button
                type="submit"
                className="tactile-press inline-flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-[#232732] px-3 text-xs font-semibold text-[#F4F1EA] hover:bg-[#2D3240]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Friend</span>
              </button>
            </form>
          </section>

          {/* 3. Handicap / Fair Play + Mystery Chaos Modifier */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-[#191C24] p-3.5">
              <label
                htmlFor="race-handicap-select"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#F4F1EA]"
              >
                <Scale className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                <span>Handicap / Fair Play</span>
              </label>
              <select
                id="race-handicap-select"
                value={config.handicap}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    handicap: e.target.value as RaceHandicapMode,
                  }))
                }
                className="h-9 w-full rounded-md border border-white/12 bg-[#101217] px-2.5 text-xs text-[#ECEAE4]"
              >
                {HANDICAP_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#191C24] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F4F1EA]">
                    <Sparkles className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                    <span>Mystery / Chaos Modifier</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#8E8A82]">
                    Every 30-45s: random Screen Swap, Audio Flip, or Turbo Pulse!
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.chaosEnabled}
                  aria-label="Toggle Mystery Chaos Modifier"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, chaosEnabled: !prev.chaosEnabled }))
                  }
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    config.chaosEnabled
                      ? 'border-[#F59E0B] bg-[#D97706]'
                      : 'border-white/15 bg-[#101217]'
                  }`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                      config.chaosEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Launch Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 bg-[#11141B] px-5 py-3.5">
          {romName ? (
            <>
              <button
                type="button"
                onClick={() => onHostOnlineRace(config)}
                className="tactile-press inline-flex h-10 items-center gap-2 rounded-lg border border-[#F59E0B]/45 bg-[#241E14] px-4 text-xs font-bold text-[#FCD34D] hover:bg-[#312818]"
              >
                <Radio className="h-4 w-4" aria-hidden="true" />
                <span>Host Online Race Room</span>
              </button>

              <button
                type="button"
                data-testid="launch-dual-race-btn"
                onClick={() => onStartLocalRace(config)}
                className="tactile-press inline-flex h-10 items-center gap-2 rounded-lg bg-[#C82333] px-5 font-display text-xs font-extrabold tracking-wide text-white shadow-lg shadow-black/50 hover:bg-[#DC2C3D]"
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span>Start Dual-Screen Race</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="race-load-rom-btn"
              onClick={onRequestLoadRomFile}
              className="tactile-press inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#C82333] px-5 font-display text-xs font-extrabold tracking-wide text-white shadow-lg shadow-black/50 hover:bg-[#DC2C3D]"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <span>Select .nes ROM File to Race</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

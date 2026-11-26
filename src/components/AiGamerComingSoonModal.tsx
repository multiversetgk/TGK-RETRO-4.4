import React from 'react';
import {
  Bot,
  Compass,
  Map as MapIcon,
  MessageSquare,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AI_GAMER_COMING_SOON_FEATURES,
  AI_GAMER_PREVIEW_META,
  type AiGamerFeatureIconId,
} from '../emulator/ai/aiGamerPreviewData';

interface AiGamerComingSoonModalProps {
  open: boolean;
  onClose: () => void;
}

function renderFeatureIcon(icon: AiGamerFeatureIconId, color: string) {
  const props = {
    className: 'h-4 w-4 shrink-0',
    style: { color },
    'aria-hidden': true as const,
  };
  switch (icon) {
    case 'partner':
      return <Users {...props} />;
    case 'banter':
      return <MessageSquare {...props} />;
    case 'guide':
      return <Compass {...props} />;
    case 'india-retro':
      return <MapIcon {...props} />;
  }
}

export const AiGamerComingSoonModal: React.FC<AiGamerComingSoonModalProps> = ({
  open,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-gamer-coming-soon-title"
      data-testid="ai-gamer-coming-soon-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060B]/85 p-4 sm:p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#A78BFA]/30 bg-[#0B0F1A] text-[#F1F5F9] shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        {/* Neon Top Accent Strip */}
        <div className="h-1 w-full bg-gradient-to-r from-[#22D3EE] via-[#A78BFA] to-[#F59E0B]" />

        {/* Modal Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 font-mono-tabular text-[11px] font-bold tracking-wider text-[#A78BFA]">
              <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{AI_GAMER_PREVIEW_META.sectionLabel}</span>
            </div>
            <h2
              id="ai-gamer-coming-soon-title"
              className="font-display text-xl font-extrabold tracking-tight text-[#F8FAFC] sm:text-2xl"
            >
              {AI_GAMER_PREVIEW_META.badgeTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#94A3B8] sm:text-sm">
              {AI_GAMER_PREVIEW_META.panelHeading} — Upcoming NES AI companion roadmap for TGK
              RETRO 2.0.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close TGK AI Gamer Preview"
            className="tactile-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-[#111827] text-[#CBD5E1] hover:border-white/25 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Future Update Preview 4-Feature Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="font-display text-xs font-bold tracking-wider text-[#22D3EE] uppercase">
              {AI_GAMER_PREVIEW_META.panelHeading} · 4 Planned Features
            </h3>
            <span className="font-mono-tabular text-[11px] font-semibold text-[#FCD34D]">
              COMING SOON
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {AI_GAMER_COMING_SOON_FEATURES.map((feature) => (
              <article
                key={feature.id}
                data-testid={`ai-feature-card-${feature.id}`}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101625] p-4 transition-colors hover:border-[#A78BFA]/45"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#080C16]">
                      {renderFeatureIcon(feature.icon, feature.accentHex)}
                    </div>
                    <span
                      className="font-mono-tabular text-xs font-bold tracking-wider"
                      style={{ color: feature.accentHex }}
                    >
                      {feature.number}
                    </span>
                  </div>

                  <h4 className="font-display text-sm font-extrabold leading-snug text-[#F8FAFC]">
                    {feature.title}
                  </h4>

                  <p className="mt-2 text-xs leading-relaxed text-[#CBD5E1]">
                    {feature.description}
                  </p>
                </div>

                {feature.featuredGames && feature.featuredGames.length > 0 && (
                  <div className="mt-3.5 border-t border-white/10 pt-2.5 font-mono-tabular text-[11px] text-[#22D3EE]">
                    {feature.featuredGames.join(' · ')}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        {/* Honest Preview Status Footer */}
        <footer className="flex flex-col gap-3 border-t border-white/10 bg-[#080C16] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-xs text-[#94A3B8]">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]"
              aria-hidden="true"
            />
            <p className="leading-relaxed">{AI_GAMER_PREVIEW_META.statusNotice}</p>
          </div>
          <button
            type="button"
            data-testid="ai-coming-soon-close-btn"
            onClick={onClose}
            className="tactile-press inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#22D3EE] px-4 font-display text-xs font-extrabold text-[#070910] hover:bg-[#67E8F9]"
          >
            Close Preview
          </button>
        </footer>
      </div>
    </div>
  );
};

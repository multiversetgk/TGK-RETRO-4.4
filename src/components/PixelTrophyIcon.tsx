import React from 'react';
import type { CoverArtworkTheme, TrophyTier } from '../emulator/champions/types';

interface PixelTrophyIconProps {
  tier: TrophyTier;
  size?: number;
  className?: string;
}

const TROPHY_PALETTES: Record<
  TrophyTier,
  { main: string; highlight: string; shadow: string; gem: string; base: string }
> = {
  bronze: {
    main: '#CD7F32',
    highlight: '#F3B27A',
    shadow: '#7C4212',
    gem: '#FDE68A',
    base: '#3B2314',
  },
  silver: {
    main: '#CBD5E1',
    highlight: '#F8FAFC',
    shadow: '#64748B',
    gem: '#38BDF8',
    base: '#1E293B',
  },
  gold: {
    main: '#F59E0B',
    highlight: '#FEF08A',
    shadow: '#B45309',
    gem: '#22D3EE',
    base: '#451A03',
  },
  platinum: {
    main: '#22D3EE',
    highlight: '#ECFEFF',
    shadow: '#0E7490',
    gem: '#A78BFA',
    base: '#1E1B4B',
  },
};

/**
 * Crisp 16x16 pixel-art SVG trophy icon for Bronze, Silver, Gold, and Platinum tiers.
 */
export const PixelTrophyIcon: React.FC<PixelTrophyIconProps> = ({
  tier,
  size = 24,
  className = '',
}) => {
  const p = TROPHY_PALETTES[tier];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      {/* Cup Rim */}
      <rect x="4" y="2" width="8" height="1" fill={p.highlight} />
      {/* Handles */}
      <rect x="2" y="3" width="2" height="1" fill={p.main} />
      <rect x="1" y="4" width="1" height="3" fill={p.main} />
      <rect x="2" y="7" width="2" height="1" fill={p.shadow} />
      <rect x="12" y="3" width="2" height="1" fill={p.main} />
      <rect x="14" y="4" width="1" height="3" fill={p.main} />
      <rect x="12" y="7" width="2" height="1" fill={p.shadow} />
      {/* Cup Body */}
      <rect x="4" y="3" width="8" height="5" fill={p.main} />
      <rect x="5" y="3" width="2" height="4" fill={p.highlight} />
      <rect x="10" y="3" width="2" height="5" fill={p.shadow} />
      {/* Center Gem */}
      <rect x="7" y="4" width="2" height="2" fill={p.gem} />
      {/* Taper & Stem */}
      <rect x="5" y="8" width="6" height="2" fill={p.main} />
      <rect x="6" y="10" width="4" height="1" fill={p.shadow} />
      <rect x="7" y="11" width="2" height="2" fill={p.main} />
      {/* Pedestal Base */}
      <rect x="4" y="13" width="8" height="2" fill={p.base} />
      <rect x="5" y="13" width="6" height="1" fill={p.shadow} />
    </svg>
  );
};

interface CartridgeCoverArtProps {
  title: string;
  catalogNumber: number;
  theme: CoverArtworkTheme;
  installed: boolean;
}

/**
 * Bespoke retro 8-bit cartridge artwork placeholder (zero copyrighted artwork or external URLs).
 */
export const CartridgeCoverArt: React.FC<CartridgeCoverArtProps> = ({
  title,
  catalogNumber,
  theme,
  installed,
}) => {
  return (
    <div
      className="relative flex h-24 w-full flex-col justify-between overflow-hidden rounded-md border border-white/10 p-2.5"
      style={{
        background: `linear-gradient(135deg, ${theme.primaryHex} 0%, ${theme.secondaryHex} 100%)`,
      }}
    >
      {/* Subtle 8-bit scanline grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, transparent 1px, transparent 4px)',
        }}
      />
      <div className="relative z-10 flex items-center justify-between">
        <span className="font-mono-tabular text-[10px] font-bold tracking-wider text-white/80">
          NES #{String(catalogNumber).padStart(2, '0')}
        </span>
        <span
          className="font-mono-tabular text-[10px] font-bold tracking-wide"
          style={{ color: installed ? '#22D3EE' : 'rgba(255,255,255,0.55)' }}
        >
          {installed ? 'INSTALLED' : 'NO ROM'}
        </span>
      </div>

      <div className="relative z-10 flex items-end justify-between gap-2">
        <span
          className="font-display text-lg font-extrabold leading-none tracking-tight"
          style={{ color: theme.accentHex }}
        >
          {theme.monogram}
        </span>
        <span className="truncate text-right font-mono-tabular text-[10px] text-white/75" title={title}>
          8-BIT CART
        </span>
      </div>
    </div>
  );
};

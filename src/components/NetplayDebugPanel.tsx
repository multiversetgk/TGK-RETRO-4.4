import React from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  buildJitterSparklinePath,
  type NetplayDebugSnapshot,
  type NetplayEndpointDebugStats,
} from '../emulator/netplay/debugTelemetry';

interface NetplayDebugPanelProps {
  debugStats: NetplayDebugSnapshot;
  localLabel: string;
  peerLabel: string;
  peerConnected: boolean;
  onResetCounters: () => void;
}

function classifyLossStatus(lossPercent: number, packetsLost: number): {
  label: string;
  colorClass: string;
} {
  if (packetsLost === 0) {
    return { label: 'Nominal', colorClass: 'text-[#34D399]' };
  }
  if (lossPercent < 3) {
    return { label: 'Degraded', colorClass: 'text-[#FCD34D]' };
  }
  return { label: 'High loss', colorClass: 'text-[#FCA5A5]' };
}

function classifyJitterColor(jitterMs: number): string {
  if (jitterMs <= 12) return 'text-[#34D399]';
  if (jitterMs <= 30) return 'text-[#FCD34D]';
  return 'text-[#FCA5A5]';
}

const EndpointMetricsColumn: React.FC<{
  title: string;
  accentHex: string;
  stats: NetplayEndpointDebugStats | null;
  waitingMessage: string;
  testIdPrefix: string;
}> = ({ title, accentHex, stats, waitingMessage, testIdPrefix }) => {
  if (!stats) {
    return (
      <div data-testid={`${testIdPrefix}-column`} className="space-y-2.5 pt-2.5 sm:pt-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold" style={{ color: accentHex }}>
            {title}
          </span>
          <span className="text-[11px] text-[#94A3B8]">Awaiting peer</span>
        </div>
        <div className="py-5 text-xs text-[#94A3B8]">{waitingMessage}</div>
      </div>
    );
  }

  const lossStatus = classifyLossStatus(stats.packetLossPercent, stats.packetsLost);
  const jitterColor = classifyJitterColor(stats.packetJitterMs);
  const capacity = Math.max(1, stats.bufferCapacityFrames);
  const fillPct = Math.min(100, Math.round((stats.bufferSizeFrames / capacity) * 100));

  return (
    <div data-testid={`${testIdPrefix}-column`} className="space-y-2.5 pt-2.5 sm:pt-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold" style={{ color: accentHex }}>
          {title}
        </span>
        <span className="font-mono-tabular shrink-0 text-[11px] text-[#94A3B8]">
          {stats.packetsReceived} rx
        </span>
      </div>

      {/* Packet Arrival Jitter */}
      <div className="flex items-baseline justify-between gap-2 border-t border-white/5 pt-2">
        <span className="text-[11px] text-[#94A3B8]">Arrival Jitter</span>
        <div className="font-mono-tabular text-right">
          <span
            data-testid={`${testIdPrefix}-jitter`}
            className={`text-xs font-bold ${jitterColor}`}
          >
            {stats.packetJitterMs.toFixed(1)} ms
          </span>
          <span className="ml-1.5 text-[10px] text-[#64748B]">
            Peak {stats.peakJitterMs.toFixed(1)} ms
          </span>
        </div>
      </div>

      {/* Total Packets Lost */}
      <div className="flex items-baseline justify-between gap-2 border-t border-white/5 pt-2">
        <span className="text-[11px] text-[#94A3B8]">Packets Lost</span>
        <div className="font-mono-tabular text-right">
          <span
            data-testid={`${testIdPrefix}-lost`}
            className="text-xs font-bold text-[#F8FAFC]"
          >
            {stats.packetsLost}
          </span>
          <span className="mx-1 text-[10px] text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className={`text-[10px] font-semibold ${lossStatus.colorClass}`}>
            {stats.packetLossPercent.toFixed(1)}% {lossStatus.label}
          </span>
        </div>
      </div>

      {/* Current Buffer Size */}
      <div className="space-y-1.5 border-t border-white/5 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-[#94A3B8]">Buffer Size</span>
          <div className="font-mono-tabular text-right">
            <span
              data-testid={`${testIdPrefix}-buffer`}
              className="text-xs font-bold text-[#F8FAFC]"
            >
              {stats.bufferSizeFrames} / {capacity}F
            </span>
            <span className="ml-1.5 text-[10px] text-[#64748B]">
              {stats.inputDelayFrames}F delay + {stats.bufferedQueueFrames}F q
            </span>
          </div>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-sm bg-[#0A0F1B]"
          role="progressbar"
          aria-label={`${title} buffer utilization`}
          aria-valuenow={stats.bufferSizeFrames}
          aria-valuemin={0}
          aria-valuemax={capacity}
        >
          <div
            className="h-full"
            style={{
              width: `${fillPct}%`,
              backgroundColor: accentHex,
              opacity: 0.85,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const NetplayDebugPanel: React.FC<NetplayDebugPanelProps> = ({
  debugStats,
  localLabel,
  peerLabel,
  peerConnected,
  onResetCounters,
}) => {
  const [expanded, setExpanded] = React.useState(true);

  const localHistory = debugStats.local.jitterHistoryMs;
  const peerHistory = debugStats.peer?.jitterHistoryMs ?? [];

  const maxObserved = Math.max(
    16,
    ...localHistory,
    ...peerHistory,
    debugStats.local.packetJitterMs,
    debugStats.peer?.packetJitterMs ?? 0
  );
  // Snap chart ceiling cleanly to nearest 10ms step for legible axis ticks
  const chartScaleMaxMs = Math.ceil(maxObserved / 10) * 10;
  const chartScaleMidMs = Math.round(chartScaleMaxMs / 2);

  const svgWidth = 420;
  const svgHeight = 76;
  const localSeries = buildJitterSparklinePath(localHistory, svgWidth, svgHeight, chartScaleMaxMs);
  const peerSeries = buildJitterSparklinePath(peerHistory, svgWidth, svgHeight, chartScaleMaxMs);

  const transportLabel =
    debugStats.transportChannel === 'webrtc' ? 'WebRTC DataChannel' : 'WebSocket Relay';

  return (
    <section
      aria-label="Netplay Debug"
      data-testid="netplay-debug-section"
      className="rounded-xl border border-white/10 bg-[#101625] p-3.5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-[#F8FAFC]">Netplay Debug</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <span>{transportLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {Math.max(localHistory.length, peerHistory.length)}/24 samples
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {expanded && (
            <button
              type="button"
              data-testid="netplay-debug-reset-btn"
              onClick={onResetCounters}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-[#0A0F1B] px-2.5 text-[11px] font-semibold text-[#CBD5E1] whitespace-nowrap shrink-0 hover:border-white/25 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Reset Stats</span>
            </button>
          )}
          <button
            type="button"
            data-testid="netplay-debug-toggle-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-[#0A0F1B] px-2.5 text-[11px] font-semibold text-[#CBD5E1] whitespace-nowrap shrink-0 hover:border-white/25 hover:text-white"
          >
            <span>{expanded ? 'Hide' : 'Show'}</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          {/* Dual-Series Packet Arrival Jitter Visualizer */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-[#CBD5E1]">Packet Arrival Jitter (ms)</span>
              <div className="font-mono-tabular flex flex-wrap items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-[#67E8F9]">
                  <span
                    className="inline-block h-0.5 w-3 bg-[#22D3EE]"
                    aria-hidden="true"
                  />
                  <span>Local {debugStats.local.packetJitterMs.toFixed(1)} ms</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#FCD34D]">
                  <span
                    className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[#F59E0B]"
                    aria-hidden="true"
                  />
                  <span>
                    Peer{' '}
                    {debugStats.peer
                      ? `${debugStats.peer.packetJitterMs.toFixed(1)} ms`
                      : '-- ms'}
                  </span>
                </span>
              </div>
            </div>

            <div className="relative rounded-lg border border-white/5 bg-[#0A0F1B] px-2.5 py-2">
              <div className="flex items-stretch gap-2">
                {/* Y-axis scale ticks */}
                <div className="font-mono-tabular flex w-9 shrink-0 flex-col justify-between text-right text-[10px] text-[#64748B]">
                  <span>{chartScaleMaxMs}ms</span>
                  <span>{chartScaleMidMs}ms</span>
                  <span>0ms</span>
                </div>

                {/* SVG Sparkline Plot */}
                <div className="min-w-0 flex-1">
                  <svg
                    role="img"
                    aria-label={`Packet arrival jitter chart: Local ${debugStats.local.packetJitterMs.toFixed(
                      1
                    )} ms, Peer ${
                      debugStats.peer ? `${debugStats.peer.packetJitterMs.toFixed(1)} ms` : 'waiting'
                    }`}
                    data-testid="netplay-jitter-chart"
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    preserveAspectRatio="none"
                    className="h-[76px] w-full overflow-visible"
                  >
                    {/* Reference gridlines */}
                    <line
                      x1={0}
                      y1={6}
                      x2={svgWidth}
                      y2={6}
                      stroke="rgba(148,163,184,0.14)"
                      strokeWidth={1}
                    />
                    <line
                      x1={0}
                      y1={svgHeight / 2}
                      x2={svgWidth}
                      y2={svgHeight / 2}
                      stroke="rgba(148,163,184,0.14)"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <line
                      x1={0}
                      y1={svgHeight - 6}
                      x2={svgWidth}
                      y2={svgHeight - 6}
                      stroke="rgba(148,163,184,0.22)"
                      strokeWidth={1}
                    />

                    {/* Local Area & Line (Cyan) */}
                    {localSeries.areaPath && (
                      <path
                        d={localSeries.areaPath}
                        fill="rgba(34, 211, 238, 0.12)"
                      />
                    )}
                    {localSeries.linePath && (
                      <path
                        data-testid="netplay-jitter-local-path"
                        d={localSeries.linePath}
                        fill="none"
                        stroke="#22D3EE"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Peer Line (Amber dashed for color-blind & visual distinction) */}
                    {peerSeries.linePath && (
                      <path
                        data-testid="netplay-jitter-peer-path"
                        d={peerSeries.linePath}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Current endpoint markers */}
                    {localSeries.lastPoint && (
                      <circle
                        cx={localSeries.lastPoint.x}
                        cy={localSeries.lastPoint.y}
                        r={3}
                        fill="#22D3EE"
                      />
                    )}
                    {peerSeries.lastPoint && (
                      <circle
                        cx={peerSeries.lastPoint.x}
                        cy={peerSeries.lastPoint.y}
                        r={3}
                        fill="#F59E0B"
                      />
                    )}
                  </svg>
                </div>
              </div>

              {localHistory.length === 0 && peerHistory.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-[#64748B]">
                  Collecting live packet arrival samples...
                </div>
              )}
            </div>
          </div>

          {/* Local vs Peer Connection Breakdown */}
          <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 sm:divide-x sm:divide-white/10">
            <div className="sm:pr-3">
              <EndpointMetricsColumn
                title={localLabel}
                accentHex="#22D3EE"
                stats={debugStats.local}
                waitingMessage="Waiting for local network samples..."
                testIdPrefix="netplay-debug-local"
              />
            </div>
            <div className="border-t border-white/10 sm:border-t-0 sm:pl-3">
              <EndpointMetricsColumn
                title={peerLabel}
                accentHex="#F59E0B"
                stats={debugStats.peer}
                waitingMessage={
                  peerConnected
                    ? 'Waiting for peer telemetry report...'
                    : 'Connect Player 2 to compare peer jitter, loss, and buffer depth.'
                }
                testIdPrefix="netplay-debug-peer"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

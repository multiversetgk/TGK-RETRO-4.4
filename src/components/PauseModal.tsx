import React from 'react';
import { FolderOpen, Home, Play, RotateCcw, Save, Upload } from 'lucide-react';
import type { RomMetadata } from '../emulator/core/inesParser';
import type { SaveSlotId, SaveSlotSummary } from '../emulator/core/saveStateStore';

interface PauseModalProps {
  romMetadata: RomMetadata | null;
  frameCount: number;
  slots: Record<SaveSlotId, SaveSlotSummary | null>;
  onResume: () => void;
  onReset: () => void;
  onSaveSlot: (slot: SaveSlotId) => void;
  onLoadSlot: (slot: SaveSlotId) => void;
  onLoadRomFile: () => void;
  onReturnToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  romMetadata,
  frameCount,
  slots,
  onResume,
  onReset,
  onSaveSlot,
  onLoadSlot,
  onLoadRomFile,
  onReturnToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#17191F] p-6 shadow-2xl shadow-black/80">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="pause-modal-title"
              className="font-display text-xl font-bold text-[#F4F1EA]"
            >
              Emulation Paused
            </h2>
            <p className="mt-1 text-xs text-[#9C978E]">
              {romMetadata
                ? `${romMetadata.name} · ${romMetadata.mapperName} · Frame ${frameCount}`
                : 'No cartridge loaded'}
            </p>
          </div>
          <span className="font-mono-tabular text-xs text-[#8E8A82]">Esc</span>
        </div>

        {/* Save / Load State Slots */}
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium text-[#A09C94]">
            Save / Load States
          </div>
          <div className="space-y-2">
            {([1, 2, 3] as SaveSlotId[]).map((slot) => {
              const info = slots[slot];
              return (
                <div
                  key={slot}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-[#1E2129] px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-display text-xs font-bold text-[#ECEAE4]">
                      Slot {slot}
                    </div>
                    <div className="font-mono-tabular truncate text-[11px] text-[#8E8A82]">
                      {info
                        ? `Frame ${info.frameCount} · ${new Date(info.savedAt).toLocaleTimeString()}`
                        : 'Empty slot'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Save Slot ${slot}`}
                      onClick={() => onSaveSlot(slot)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-[#272B35] px-2.5 text-xs font-medium text-[#ECEAE4] hover:border-white/25 hover:bg-[#313643]"
                    >
                      <Save className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      disabled={!info}
                      aria-label={`Load Slot ${slot}`}
                      onClick={() => onLoadSlot(slot)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-[#272B35] px-2.5 text-xs font-medium text-[#ECEAE4] hover:border-white/25 hover:bg-[#313643] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Load</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Primary & Secondary Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#C82333] font-display text-sm font-bold text-white transition-colors hover:bg-[#DC2C3D]"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            <span>Resume Game</span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#1E2129] text-xs font-medium text-[#ECEAE4] hover:border-white/25 hover:bg-[#272B35] whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onLoadRomFile}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#1E2129] text-xs font-medium text-[#ECEAE4] hover:border-white/25 hover:bg-[#272B35] whitespace-nowrap"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Load .nes</span>
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#1E2129] text-xs font-medium text-[#ECEAE4] hover:border-white/25 hover:bg-[#272B35] whitespace-nowrap"
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Title</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

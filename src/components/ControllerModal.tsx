import React from 'react';
import { Gamepad2, RotateCcw, X } from 'lucide-react';
import {
  formatKeyCodeLabel,
  NES_BUTTON_ORDER,
  type ControllerBindings,
} from '../emulator/input/controllerMappings';
import type { ConnectedGamepadInfo } from '../emulator/input/InputManager';
import type { NesButtonName, PlayerPort } from '../emulator/netplay/protocol';

interface ControllerModalProps {
  bindings: ControllerBindings;
  gamepads: ConnectedGamepadInfo[];
  onUpdateBinding: (port: PlayerPort, button: NesButtonName, code: string) => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

export const ControllerModal: React.FC<ControllerModalProps> = ({
  bindings,
  gamepads,
  onUpdateBinding,
  onResetDefaults,
  onClose,
}) => {
  const [listening, setListening] = React.useState<{
    port: PlayerPort;
    button: NesButtonName;
  } | null>(null);

  React.useEffect(() => {
    if (!listening) return;

    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      onUpdateBinding(listening.port, listening.button, e.code);
      setListening(null);
    };

    window.addEventListener('keydown', handleCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleCapture, { capture: true });
    };
  }, [listening, onUpdateBinding]);

  const renderPortColumn = (port: PlayerPort, title: string, accent: string) => (
    <div className="rounded-lg border border-white/10 bg-[#1E2129] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className={`font-display text-sm font-bold ${accent}`}>{title}</h3>
        <span className="font-mono-tabular text-[11px] text-[#8E8A82]">
          {port === 1 ? 'Port 1' : 'Port 2'}
        </span>
      </div>
      <div className="space-y-1.5">
        {NES_BUTTON_ORDER.map((btn) => {
          const isCapturing =
            listening?.port === port && listening?.button === btn;
          const code = bindings[port][btn];
          return (
            <div
              key={btn}
              className="flex items-center justify-between rounded-md bg-[#16181E] px-3 py-1.5"
            >
              <span className="font-mono-tabular text-xs font-medium text-[#D4CFC4]">
                {btn}
              </span>
              <button
                type="button"
                onClick={() => setListening({ port, button: btn })}
                className={`font-mono-tabular min-w-[84px] rounded border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  isCapturing
                    ? 'border-[#E03131] bg-[#C82333] text-white'
                    : 'border-white/12 bg-[#232730] text-[#F4F1EA] hover:border-white/30'
                }`}
              >
                {isCapturing ? 'Press key...' : formatKeyCodeLabel(code)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="controller-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl border border-white/12 bg-[#17191F] p-6 shadow-2xl shadow-black/80">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="controller-modal-title"
              className="font-display text-xl font-bold text-[#F4F1EA]"
            >
              2-Player Controller Setup
            </h2>
            <p className="mt-1 text-xs text-[#9C978E]">
              Click any key binding to remap. USB &amp; Bluetooth gamepads are automatically assigned to Port 1 &amp; Port 2.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Controller Setup"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#1E2129] text-[#B8B3A8] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {renderPortColumn(1, 'Port 1 · Player 1', 'text-[#E03131]')}
          {renderPortColumn(2, 'Port 2 · Player 2', 'text-[#F59E0B]')}
        </div>

        {/* Gamepad Detection Strip */}
        <div className="mt-4 rounded-lg border border-white/8 bg-[#1E2129] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#ECEAE4]">
              <Gamepad2 className="h-4 w-4 text-[#D4CFC4]" aria-hidden="true" />
              <span>Detected Gamepads ({gamepads.length})</span>
            </div>
            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 text-xs text-[#B8B3A8] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Defaults</span>
            </button>
          </div>

          {gamepads.length === 0 ? (
            <p className="mt-1.5 text-xs text-[#8E8A82]">
              No gamepad detected yet. Connect a controller and press any button on it to auto-bind to Port 1 or Port 2.
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              {gamepads.map((pad) => (
                <div
                  key={pad.index}
                  className="font-mono-tabular flex items-center justify-between text-xs text-[#D4CFC4]"
                >
                  <span className="truncate pr-3">{pad.id}</span>
                  <span
                    className={
                      pad.assignedPort === 1 ? 'text-[#E03131]' : 'text-[#F59E0B]'
                    }
                  >
                    Port {pad.assignedPort}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

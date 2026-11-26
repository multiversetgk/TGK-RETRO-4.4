interface WakeLockLike {
  request: (type?: 'screen') => Promise<WakeLockSentinelLike>;
  __tgkWakeLockGuarded?: boolean;
}

export interface WakeLockSentinelLike {
  readonly released: boolean;
  readonly type: 'screen';
  onrelease: ((this: unknown, ev: Event) => unknown) | null;
  release: () => Promise<void>;
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
  dispatchEvent: (event: Event) => boolean;
}

function createNoopWakeLockSentinel(): WakeLockSentinelLike {
  return {
    released: true,
    type: 'screen',
    onrelease: null,
    release: () => Promise.resolve(),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}

function isPermissionsPolicyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string };
  const name = err.name ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    msg.includes('permissions policy') ||
    msg.includes('wake lock')
  );
}

/**
 * Guards `navigator.wakeLock.request` against Permissions-Policy `NotAllowedError`
 * rejections thrown inside sandboxed/embedded iframes when RetroArch/Emscripten
 * invokes `PlatformEmscriptenDoSetWakeLock`.
 *
 * When wake lock IS permitted (standalone browser/PWA), the real WakeLockSentinel
 * is returned unchanged. When disallowed by permissions policy, resolves cleanly
 * to a released no-op sentinel so Emscripten never emits unhandled NotAllowedErrors.
 */
export function installWakeLockPolicyGuard(
  nav: { wakeLock?: WakeLockLike } | undefined = typeof navigator !== 'undefined'
    ? (navigator as unknown as { wakeLock?: WakeLockLike })
    : undefined
): boolean {
  const wakeLock = nav?.wakeLock;
  if (!wakeLock || typeof wakeLock.request !== 'function') {
    return false;
  }
  if (wakeLock.__tgkWakeLockGuarded) {
    return true;
  }

  const originalRequest = wakeLock.request.bind(wakeLock);

  const safeRequest = (type: 'screen' = 'screen'): Promise<WakeLockSentinelLike> => {
    try {
      const pending = originalRequest(type);
      return Promise.resolve(pending).catch((err) => {
        if (isPermissionsPolicyError(err)) {
          return createNoopWakeLockSentinel();
        }
        throw err;
      });
    } catch (err) {
      if (isPermissionsPolicyError(err)) {
        return Promise.resolve(createNoopWakeLockSentinel());
      }
      return Promise.reject(err);
    }
  };

  try {
    Object.defineProperty(wakeLock, 'request', {
      value: safeRequest,
      configurable: true,
      writable: true,
    });
    wakeLock.__tgkWakeLockGuarded = true;
    return true;
  } catch {
    try {
      const proto = Object.getPrototypeOf(wakeLock) as WakeLockLike | null;
      if (proto && typeof proto.request === 'function') {
        Object.defineProperty(proto, 'request', {
          value: safeRequest,
          configurable: true,
          writable: true,
        });
        wakeLock.__tgkWakeLockGuarded = true;
        return true;
      }
    } catch {
      // Non-configurable environment; rely on retroarchConfig.suspend_screensaver_enable = false
    }
    return false;
  }
}

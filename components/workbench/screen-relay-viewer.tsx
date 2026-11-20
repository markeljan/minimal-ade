'use client';

import { AlertTriangle, Hand, Monitor, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  encodeAck,
  encodeInput,
  HID_KEYS,
  h264Codec,
  INPUT_TYPES,
  type InputEvent,
  MESSAGE_TYPES,
  parseMessage,
  SUBPROTOCOL,
} from 'screen-relay/protocol';
import { cn } from '@/lib/utils';

export interface ScreenRelayViewerProps {
  chatId: string;
  hasControl: boolean;
  onControlChange?: (hasControl: boolean) => void;
  onConnectionChange?: (connected: boolean, statusText: string) => void;
  onFallbackToSnapshot?: () => void;
  className?: string;
}

interface PendingFrameMeta {
  gen: number;
  seq: number;
  arrived: number;
}

interface RelayGrantResponse {
  ok: boolean;
  wsUrl?: string;
  grantToken?: string;
  role: 'watch' | 'control';
  expiresAt?: string;
  loopbackNoAuth?: boolean;
  error?: string;
  hint?: string;
}

const BUTTON_MAP: Record<number, 1 | 2 | 3> = { 0: 1, 1: 2, 2: 3 };
const SWAP_META_CONTROL: Record<number, number> = { 224: 227, 227: 224, 228: 231, 231: 228 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

function toBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export function ScreenRelayViewer({
  chatId,
  hasControl,
  onControlChange,
  onConnectionChange,
  onFallbackToSnapshot,
  className,
}: ScreenRelayViewerProps) {
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const generationRef = useRef<number>(0);
  const sequenceRef = useRef<number>(0);
  const pendingFramesRef = useRef<Map<number, PendingFrameMeta>>(new Map());
  const buttonsRef = useRef<number>(0);
  const modifiersRef = useRef<number>(0);
  const heldKeysRef = useRef<Set<number>>(new Set());
  const cursorMetaRef = useRef({ available: false, hotX: 0, hotY: 0, width: 1, height: 1 });
  const pointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const wheelRemainderRef = useRef<[number, number]>([0, 0]);
  const framesDrawnRef = useRef<number>(0);
  const hasControlRef = useRef<boolean>(hasControl);
  const swapMetaRef = useRef<boolean>(false);
  const wasLiveRef = useRef<boolean>(false);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onControlChangeRef = useRef(onControlChange);

  const [webCodecsSupported, setWebCodecsSupported] = useState<boolean>(true);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'live' | 'unavailable' | 'error'
  >('connecting');
  const [statusMessage, setStatusMessage] = useState<string>('Requesting scoped grant…');
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [swapMetaAsCtrl, setSwapMetaAsCtrl] = useState<boolean>(false);
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);

  useEffect(() => {
    hasControlRef.current = hasControl;
  }, [hasControl]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    onControlChangeRef.current = onControlChange;
  }, [onControlChange]);

  useEffect(() => {
    const mac = isMacPlatform();
    setSwapMetaAsCtrl(mac);
    swapMetaRef.current = mac;
  }, []);

  useEffect(() => {
    swapMetaRef.current = swapMetaAsCtrl;
  }, [swapMetaAsCtrl]);

  const updateCursorOverlay = useCallback(() => {
    const screen = screenCanvasRef.current;
    const cursor = cursorCanvasRef.current;
    if (!screen || !cursor) return;

    const meta = cursorMetaRef.current;
    const pointer = pointerPosRef.current;
    const rect = screen.getBoundingClientRect();

    const visible =
      meta.available &&
      Boolean(pointer) &&
      pointer !== null &&
      pointer.clientX >= rect.left &&
      pointer.clientX <= rect.right &&
      pointer.clientY >= rect.top &&
      pointer.clientY <= rect.bottom &&
      screen.width > 0 &&
      screen.height > 0;

    screen.style.cursor = visible ? 'none' : hasControlRef.current ? 'crosshair' : 'default';
    cursor.hidden = !visible;
    if (!visible || !pointer) return;

    const scaleX = rect.width / screen.width;
    const scaleY = rect.height / screen.height;
    cursor.style.width = `${meta.width * scaleX}px`;
    cursor.style.height = `${meta.height * scaleY}px`;
    cursor.style.left = `${pointer.clientX - rect.left - meta.hotX * scaleX}px`;
    cursor.style.top = `${pointer.clientY - rect.top - meta.hotY * scaleY}px`;
  }, []);

  const sendInput = useCallback((event: InputEvent): boolean => {
    const ws = wsRef.current;
    const gen = generationRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || gen <= 0) return false;
    if (!hasControlRef.current && event.type !== 'releaseAll') return false;

    try {
      // Protocol invariant: `releaseAll` and `text` require zero button/modifier masks.
      const payload: InputEvent =
        event.type === 'releaseAll' || event.type === 'text'
          ? event
          : {
              ...event,
              buttons: buttonsRef.current,
              modifiers: modifiersRef.current,
            };
      ws.send(toBufferView(encodeInput(payload, gen, 0)));
      return true;
    } catch {
      return false;
    }
  }, []);

  const releaseAllInputs = useCallback(() => {
    buttonsRef.current = 0;
    modifiersRef.current = 0;
    heldKeysRef.current.clear();
    if (wsRef.current?.readyState === WebSocket.OPEN && generationRef.current > 0) {
      try {
        wsRef.current.send(
          toBufferView(encodeInput({ type: 'releaseAll' }, generationRef.current, 0)),
        );
      } catch {
        // Ignore teardown send errors.
      }
    }
  }, []);

  const resetDecoder = useCallback(() => {
    wasLiveRef.current = false;
    generationRef.current = 0;
    sequenceRef.current = 0;
    pendingFramesRef.current.clear();
    cursorMetaRef.current = { available: false, hotX: 0, hotY: 0, width: 1, height: 1 };
    if (decoderRef.current && decoderRef.current.state !== 'closed') {
      try {
        decoderRef.current.close();
      } catch {
        // Ignore close errors.
      }
    }
    decoderRef.current = null;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFps(framesDrawnRef.current);
      framesDrawnRef.current = 0;
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Reconnect on `/stream?view=1` <-> `/stream?take=1` whenever `hasControl` or `chatId` changes.
  useEffect(() => {
    if (reconnectNonce < 0) return;
    if (
      typeof window === 'undefined' ||
      typeof VideoDecoder === 'undefined' ||
      typeof EncodedVideoChunk === 'undefined'
    ) {
      setWebCodecsSupported(false);
      setConnectionState('unavailable');
      setStatusMessage('WebCodecs H.264 unavailable in this browser');
      onConnectionChangeRef.current?.(false, 'WebCodecs unavailable');
      return;
    }

    setWebCodecsSupported(true);
    let cancelled = false;
    const abortController = new AbortController();

    async function connectRelay() {
      releaseAllInputs();
      resetDecoder();
      setConnectionState('connecting');
      setErrorHint(null);
      const role: 'watch' | 'control' = hasControl ? 'control' : 'watch';
      setStatusMessage(
        role === 'control'
          ? 'Minting control grant (/stream?take=1)…'
          : 'Minting view-only grant (/stream?view=1)…',
      );
      onConnectionChangeRef.current?.(false, 'Connecting…');

      let grant: RelayGrantResponse;
      try {
        const res = await fetch('/api/sandbox/relay-grant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chatId, role, ttlSec: 600 }),
          signal: abortController.signal,
        });
        grant = (await res.json()) as RelayGrantResponse;
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : 'Grant request failed';
        setConnectionState('error');
        setStatusMessage(msg);
        onConnectionChangeRef.current?.(false, msg);
        return;
      }

      if (cancelled) return;

      if (!grant.ok || !grant.wsUrl) {
        setConnectionState('unavailable');
        setStatusMessage(grant.error ?? 'screen-relay engine not active');
        setErrorHint(
          grant.hint ??
            'Run `npx screen-relay up -d` locally or boot a Cloud Sandbox with a pre-baked desktop snapshot.',
        );
        onConnectionChangeRef.current?.(false, 'Relay unavailable');
        return;
      }

      // Ensure explicit /stream?view=1 <-> /stream?take=1 query state.
      const streamUrl = new URL(grant.wsUrl);
      streamUrl.pathname = '/stream';
      streamUrl.search = hasControl ? '?take=1' : '?view=1';

      const protocols = grant.grantToken
        ? [SUBPROTOCOL, `bearer.${grant.grantToken}`]
        : [SUBPROTOCOL];

      const ws = new WebSocket(streamUrl.toString(), protocols);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || wsRef.current !== ws) return;
        setStatusMessage('Waiting for H.264 keyframe…');
      };

      ws.onmessage = (event) => {
        if (cancelled || wsRef.current !== ws || !(event.data instanceof ArrayBuffer)) return;

        try {
          const message = parseMessage(event.data);

          if (message.type === 'cursor') {
            if (generationRef.current > 0 && message.generation === generationRef.current) {
              cursorMetaRef.current = {
                available: message.width > 0 && message.height > 0,
                hotX: message.hotX,
                hotY: message.hotY,
                width: message.width || 1,
                height: message.height || 1,
              };
              const cursorCanvas = cursorCanvasRef.current;
              if (cursorCanvas && message.width > 0 && message.height > 0) {
                cursorCanvas.width = message.width;
                cursorCanvas.height = message.height;
                const cursorCtx = cursorCanvas.getContext('2d');
                if (cursorCtx) {
                  const rgba = new Uint8ClampedArray(message.pixels);
                  cursorCtx.putImageData(new ImageData(rgba, message.width, message.height), 0, 0);
                }
              }
              updateCursorOverlay();
            }
            return;
          }

          if (message.type !== 'frame') return;

          const {
            generation: gen,
            sequence: seq,
            keyframe,
            width,
            height,
            timestamp,
            data,
          } = message;

          if (generationRef.current && gen < generationRef.current) return;
          if (gen !== generationRef.current) {
            resetDecoder();
            generationRef.current = gen;
            if (!keyframe) return;
          }

          sequenceRef.current = seq;
          const arrived = performance.now();
          pendingFramesRef.current.set(timestamp, { gen, seq, arrived });

          const canvas = screenCanvasRef.current;
          if (canvas && (canvas.width !== width || canvas.height !== height)) {
            canvas.width = width;
            canvas.height = height;
            setResolution({ width, height });
          }

          if (!decoderRef.current) {
            const codec = h264Codec(data);
            const instance = new VideoDecoder({
              output(frame) {
                try {
                  const targetCanvas = screenCanvasRef.current;
                  const ctx = targetCanvas?.getContext('2d');
                  if (targetCanvas && ctx) {
                    ctx.drawImage(frame, 0, 0, targetCanvas.width, targetCanvas.height);
                  }
                  const meta = pendingFramesRef.current.get(frame.timestamp);
                  pendingFramesRef.current.delete(frame.timestamp);
                  framesDrawnRef.current += 1;

                  if (meta && ws.readyState === WebSocket.OPEN) {
                    ws.send(
                      toBufferView(encodeAck(meta.gen, meta.seq, performance.now() - meta.arrived)),
                    );
                  }

                  if (!wasLiveRef.current) {
                    wasLiveRef.current = true;
                    setConnectionState('live');
                    const liveText = hasControlRef.current
                      ? 'Live · You have control'
                      : 'Live · View only';
                    setStatusMessage(liveText);
                    onConnectionChangeRef.current?.(true, liveText);
                  }
                } finally {
                  frame.close();
                }
              },
              error(err) {
                wasLiveRef.current = false;
                setConnectionState('error');
                setStatusMessage(`Decoder error: ${err.message}`);
                onConnectionChangeRef.current?.(false, 'Decoder error');
              },
            });

            instance.configure({
              codec,
              codedWidth: width,
              codedHeight: height,
              optimizeForLatency: true,
            });
            decoderRef.current = instance;
          }

          if (decoderRef.current.state === 'configured') {
            decoderRef.current.decode(
              new EncodedVideoChunk({
                type: keyframe ? 'key' : 'delta',
                timestamp,
                data,
              }),
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Protocol parse error';
          wasLiveRef.current = false;
          setConnectionState('error');
          setStatusMessage(msg);
          onConnectionChangeRef.current?.(false, msg);
        }
      };

      ws.onerror = () => {
        if (cancelled || wsRef.current !== ws) return;
        wasLiveRef.current = false;
        setConnectionState('error');
        setStatusMessage('WebSocket connection error');
        onConnectionChangeRef.current?.(false, 'Connection error');
      };

      ws.onclose = (closeEvent) => {
        if (cancelled || wsRef.current !== ws) return;
        resetDecoder();
        if (closeEvent.code === 4001) {
          setStatusMessage('Control taken by another session');
          onControlChangeRef.current?.(false);
          onConnectionChangeRef.current?.(false, 'Control taken');
        } else {
          setConnectionState('unavailable');
          setStatusMessage('Stream disconnected');
          onConnectionChangeRef.current?.(false, 'Disconnected');
        }
      };
    }

    void connectRelay();

    return () => {
      cancelled = true;
      abortController.abort();
      releaseAllInputs();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState < WebSocket.CLOSING) {
        ws.close();
      }
      resetDecoder();
    };
  }, [chatId, hasControl, reconnectNonce, releaseAllInputs, resetDecoder, updateCursorOverlay]);

  // Normalized [0, 1] pointer coordinate computation
  const getNormalizedCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = screenCanvasRef.current;
      if (!canvas || canvas.width <= 1 || canvas.height <= 1) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const px = clamp(
        Math.floor(((clientX - rect.left) * canvas.width) / rect.width),
        0,
        canvas.width - 1,
      );
      const py = clamp(
        Math.floor(((clientY - rect.top) * canvas.height) / rect.height),
        0,
        canvas.height - 1,
      );
      return {
        x: px / (canvas.width - 1),
        y: py / (canvas.height - 1),
      };
    },
    [],
  );

  const mapHidKey = useCallback((code: string): number | undefined => {
    const raw = HID_KEYS[code];
    if (!raw) return undefined;
    return swapMetaRef.current ? (SWAP_META_CONTROL[raw] ?? raw) : raw;
  }, []);

  const updateModifierMask = useCallback((hidCode: number, down: boolean) => {
    if (hidCode < 224 || hidCode > 231) return;
    const bit = 1 << (hidCode - 224);
    modifiersRef.current = down ? modifiersRef.current | bit : modifiersRef.current & ~bit;
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      const hidCode = mapHidKey(event.code);
      if (!hidCode) return;
      event.preventDefault();
      if (event.repeat || heldKeysRef.current.has(hidCode)) return;
      updateModifierMask(hidCode, true);
      if (sendInput({ type: 'keyDown', key: hidCode })) {
        heldKeysRef.current.add(hidCode);
      } else {
        updateModifierMask(hidCode, false);
      }
    },
    [mapHidKey, sendInput, updateModifierMask],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      const hidCode = mapHidKey(event.code);
      if (!hidCode) return;
      event.preventDefault();
      if (!heldKeysRef.current.delete(hidCode)) return;
      updateModifierMask(hidCode, false);
      sendInput({ type: 'keyUp', key: hidCode });
    },
    [mapHidKey, sendInput, updateModifierMask],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      pointerPosRef.current = { clientX: event.clientX, clientY: event.clientY };
      updateCursorOverlay();
      if (!hasControlRef.current) return;
      const coords = getNormalizedCoords(event.clientX, event.clientY);
      if (coords) {
        sendInput({ type: 'pointerMove', x: coords.x, y: coords.y });
      }
    },
    [getNormalizedCoords, sendInput, updateCursorOverlay],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      const button = BUTTON_MAP[event.button];
      if (!button) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const coords = getNormalizedCoords(event.clientX, event.clientY);
      if (!coords) return;
      buttonsRef.current |= 1 << (button - 1);
      sendInput({ type: 'buttonDown', button, x: coords.x, y: coords.y });
    },
    [getNormalizedCoords, sendInput],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      const button = BUTTON_MAP[event.button];
      if (!button) return;
      event.preventDefault();
      const coords = getNormalizedCoords(event.clientX, event.clientY);
      buttonsRef.current &= ~(1 << (button - 1));
      if (coords) {
        sendInput({ type: 'buttonUp', button, x: coords.x, y: coords.y });
      }
      if (!buttonsRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [getNormalizedCoords, sendInput],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      event.preventDefault();
      const coords = getNormalizedCoords(event.clientX, event.clientY);
      if (!coords) return;

      for (const axisIdx of [0, 1] as const) {
        const rawDelta = axisIdx === 1 ? event.deltaX : event.deltaY;
        if (!rawDelta) continue;
        const notches =
          event.deltaMode === 1 ? rawDelta / 3 : event.deltaMode === 2 ? rawDelta : rawDelta / 100;
        if (Math.sign(notches) !== Math.sign(wheelRemainderRef.current[axisIdx])) {
          wheelRemainderRef.current[axisIdx] = 0;
        }
        wheelRemainderRef.current[axisIdx] += notches;
        const whole = Math.trunc(wheelRemainderRef.current[axisIdx]);
        if (!whole) continue;
        wheelRemainderRef.current[axisIdx] -= whole;
        const delta = clamp(whole * 120, -1200, 1200);
        sendInput({
          type: 'wheel',
          axis: axisIdx === 1 ? 'horizontal' : 'vertical',
          delta,
          x: coords.x,
          y: coords.y,
        });
      }
    },
    [getNormalizedCoords, sendInput],
  );

  // Reference protocol constants explicitly for runtime diagnostics & tree-shaking clarity.
  const protocolMeta = `${SUBPROTOCOL.toUpperCase()} · frame:${MESSAGE_TYPES.frame} · input:${INPUT_TYPES.pointerMove}`;

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-[#0c0d10] text-zinc-100',
        className,
      )}
    >
      {/* Main H.264 Canvas Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
        <div className="relative flex max-h-full max-w-full items-center justify-center">
          <canvas
            ref={screenCanvasRef}
            tabIndex={0}
            aria-label="Live screen-relay desktop stream"
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              pointerPosRef.current = null;
              updateCursorOverlay();
            }}
            onPointerCancel={releaseAllInputs}
            onBlur={releaseAllInputs}
            onContextMenu={(e) => {
              if (hasControlRef.current) e.preventDefault();
            }}
            onWheel={handleWheel}
            className={cn(
              'max-h-full max-w-full rounded-[var(--radius-inner)] bg-black object-contain outline-none transition-shadow',
              hasControl ? 'ring-2 ring-[var(--accent)]' : 'ring-1 ring-white/10',
              connectionState !== 'live' && 'opacity-30',
            )}
          />
          <canvas
            ref={cursorCanvasRef}
            hidden
            className="pointer-events-none absolute top-0 left-0 z-10"
          />
        </div>

        {/* WebCodecs unsupported or Relay unavailable overlay */}
        {(!webCodecsSupported || connectionState !== 'live') && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-[var(--radius-container)] border border-white/10 bg-[#17181c]/95 p-5 text-left shadow-xl backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-element)]',
                    !webCodecsSupported
                      ? 'bg-amber-500/15 text-amber-400'
                      : connectionState === 'connecting'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-zinc-500/15 text-zinc-300',
                  )}
                >
                  {!webCodecsSupported ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : connectionState === 'connecting' ? (
                    <Wifi className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {!webCodecsSupported
                      ? 'WebCodecs H.264 Not Supported'
                      : connectionState === 'connecting'
                        ? 'Connecting to screen-relay'
                        : 'Live Desktop Stream Offline'}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{statusMessage}</p>
                  {errorHint && (
                    <p className="mt-2 rounded-[var(--radius-inner)] border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">
                      {errorHint}
                    </p>
                  )}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {webCodecsSupported && (
                      <button
                        type="button"
                        onClick={() => setReconnectNonce((n) => n + 1)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inner)] bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Stream
                      </button>
                    )}
                    {onFallbackToSnapshot && (
                      <button
                        type="button"
                        onClick={onFallbackToSnapshot}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inner)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                      >
                        Use Snapshot Mode
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Telemetry & Scoped Grant HUD */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#141519] px-3 py-1.5 text-[11px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-2 w-2 rounded-full',
              connectionState === 'live'
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                : connectionState === 'connecting'
                  ? 'animate-pulse bg-amber-400'
                  : 'bg-zinc-500',
            )}
          />
          <span className="font-medium text-zinc-200">{statusMessage}</span>
          {resolution && (
            <span className="font-mono text-zinc-500">
              {resolution.width}×{resolution.height} · {fps} fps
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="hidden items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-flex"
            title="Scoped short-lived browser grant — raw session token never leaves the server"
          >
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            {hasControl ? 'grant:control' : 'grant:watch'}
          </span>
          {hasControl && (
            <button
              type="button"
              onClick={() => setSwapMetaAsCtrl((v) => !v)}
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] transition',
                swapMetaAsCtrl
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10',
              )}
              title="Swap Command/Meta and Control keys for Linux desktop shortcuts"
            >
              ⌘↔Ctrl
            </button>
          )}
          <span className="hidden font-mono text-[10px] text-zinc-500 lg:inline">
            {protocolMeta}
          </span>
          {connectionState === 'live' ? (
            <span className="inline-flex items-center gap-1 text-zinc-300">
              {hasControl ? (
                <Hand className="h-3 w-3 text-blue-400" />
              ) : (
                <Wifi className="h-3 w-3 text-emerald-400" />
              )}
            </span>
          ) : (
            <WifiOff className="h-3 w-3 text-zinc-500" />
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import {
  ChevronDown,
  ChevronUp,
  Globe,
  Hand,
  RefreshCw,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrowserViewport } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface AgentBrowserCanvasProps {
  streamUrl?: string | null;
  hasControl: boolean;
  viewport?: BrowserViewport;
  onUrlChange?: (url: string) => void;
  onConnectionChange?: (connected: boolean, statusText: string) => void;
  onFallbackToSnapshot?: () => void;
  className?: string;
}

interface TickerEvent {
  id: number;
  kind: 'command' | 'result' | 'console' | 'url' | 'error';
  text: string;
  time: string;
}

interface AgentBrowserWsMessage {
  type: string;
  seq?: number;
  data?: string;
  url?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  command?: string;
  args?: string[];
  result?: unknown;
  text?: string;
  message?: string;
  level?: string;
}

function buildPacedStreamUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has('pacing')) {
      parsed.searchParams.set('pacing', 'ack');
    }
    if (!parsed.searchParams.has('maxFps')) {
      parsed.searchParams.set('maxFps', '15');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function getModifierMask(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number {
  let mask = 0;
  if (event.altKey) mask |= 1;
  if (event.ctrlKey) mask |= 2;
  if (event.metaKey) mask |= 4;
  if (event.shiftKey) mask |= 8;
  return mask;
}

function mapMouseButton(button: number): 'left' | 'middle' | 'right' {
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return 'left';
}

export function AgentBrowserCanvas({
  streamUrl,
  hasControl,
  viewport = { width: 1280, height: 800 },
  onUrlChange,
  onConnectionChange,
  onFallbackToSnapshot,
  className,
}: AgentBrowserCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasControlRef = useRef<boolean>(hasControl);
  const frameCounterRef = useRef<number>(0);
  const tickerIdRef = useRef<number>(1);
  const remoteSizeRef = useRef<BrowserViewport>(viewport);
  const wasLiveRef = useRef<boolean>(false);
  const onUrlChangeRef = useRef(onUrlChange);
  const onConnectionChangeRef = useRef(onConnectionChange);

  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>(
    streamUrl ? 'connecting' : 'idle',
  );
  const [statusText, setStatusText] = useState<string>(
    streamUrl ? 'Connecting to agent-browser stream…' : 'No agent-browser stream port active',
  );
  const [fps, setFps] = useState<number>(0);
  const [resolution, setResolution] = useState<BrowserViewport>(viewport);
  const [tickerOpen, setTickerOpen] = useState<boolean>(false);
  const [tickerEvents, setTickerEvents] = useState<TickerEvent[]>([]);
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);

  useEffect(() => {
    onUrlChangeRef.current = onUrlChange;
  }, [onUrlChange]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    hasControlRef.current = hasControl;
    if (wasLiveRef.current) {
      const liveLabel = hasControl
        ? 'Live · Pair browsing (you have control)'
        : 'Live · Watching agent';
      setStatusText(liveLabel);
      onConnectionChangeRef.current?.(true, liveLabel);
    }
  }, [hasControl]);

  const appendTicker = useCallback((kind: TickerEvent['kind'], text: string) => {
    const entry: TickerEvent = {
      id: tickerIdRef.current++,
      kind,
      text: text.slice(0, 260),
      time: new Date().toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
    setTickerEvents((prev) => [...prev.slice(-49), entry]);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFps(frameCounterRef.current);
      frameCounterRef.current = 0;
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (reconnectNonce < 0) return;
    wasLiveRef.current = false;
    if (!streamUrl) {
      setStatus('idle');
      setStatusText('No agent-browser stream URL active');
      onConnectionChangeRef.current?.(false, 'Stream offline');
      return;
    }

    let cancelled = false;
    const pacedUrl = buildPacedStreamUrl(streamUrl);
    setStatus('connecting');
    setStatusText('Connecting to agent-browser WS…');
    onConnectionChangeRef.current?.(false, 'Connecting…');

    let ws: WebSocket;
    try {
      ws = new WebSocket(pacedUrl);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid WebSocket URL';
      setStatus('error');
      setStatusText(msg);
      onConnectionChangeRef.current?.(false, msg);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled || wsRef.current !== ws) return;
      ws.send(JSON.stringify({ type: 'config', pacing: 'ack', maxFps: 15 }));
      setStatus('live');
      setStatusText('Connected · waiting for JPEG frames');
      onConnectionChangeRef.current?.(true, 'Live · agent-browser');
      appendTicker('command', `Connected to ${pacedUrl}`);
    };

    ws.onmessage = async (event) => {
      if (cancelled || wsRef.current !== ws || typeof event.data !== 'string') return;

      let msg: AgentBrowserWsMessage;
      try {
        msg = JSON.parse(event.data) as AgentBrowserWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'frame' && typeof msg.data === 'string') {
        try {
          const binary = atob(msg.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);

          try {
            const canvas = canvasRef.current;
            if (canvas) {
              if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                remoteSizeRef.current = { width: bitmap.width, height: bitmap.height };
                setResolution({ width: bitmap.width, height: bitmap.height });
              }
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(bitmap, 0, 0);
            }
          } finally {
            bitmap.close();
          }

          frameCounterRef.current += 1;
          if (!wasLiveRef.current) {
            wasLiveRef.current = true;
            setStatus('live');
            const liveLabel = hasControlRef.current
              ? 'Live · Pair browsing (you have control)'
              : 'Live · Watching agent';
            setStatusText(liveLabel);
            onConnectionChangeRef.current?.(true, liveLabel);
          }

          if (typeof msg.seq === 'number' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ack', seq: msg.seq }));
          }
        } catch {
          // Skip malformed JPEG frame gracefully.
        }
        return;
      }

      if (msg.type === 'url' && typeof msg.url === 'string') {
        onUrlChangeRef.current?.(msg.url);
        appendTicker('url', msg.url);
        return;
      }

      if (
        msg.type === 'status' &&
        typeof msg.viewportWidth === 'number' &&
        typeof msg.viewportHeight === 'number'
      ) {
        remoteSizeRef.current = { width: msg.viewportWidth, height: msg.viewportHeight };
        setResolution({ width: msg.viewportWidth, height: msg.viewportHeight });
        return;
      }

      if (msg.type === 'command') {
        const label = [msg.command, ...(msg.args ?? [])].filter(Boolean).join(' ');
        if (label) appendTicker('command', label);
        return;
      }

      if (msg.type === 'result') {
        const text =
          typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result ?? 'ok');
        appendTicker('result', text);
        return;
      }

      if (msg.type === 'console') {
        const text = msg.text ?? msg.message ?? '';
        if (text) appendTicker(msg.level === 'error' ? 'error' : 'console', text);
      }
    };

    ws.onerror = () => {
      if (cancelled || wsRef.current !== ws) return;
      wasLiveRef.current = false;
      setStatus('error');
      setStatusText('Unable to reach agent-browser WebSocket stream');
      onConnectionChangeRef.current?.(false, 'Stream error');
    };

    ws.onclose = () => {
      if (cancelled || wsRef.current !== ws) return;
      wasLiveRef.current = false;
      setStatus('idle');
      setStatusText('agent-browser stream disconnected');
      onConnectionChangeRef.current?.(false, 'Disconnected');
    };

    return () => {
      cancelled = true;
      wasLiveRef.current = false;
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (ws.readyState < WebSocket.CLOSING) {
        ws.close();
      }
    };
  }, [streamUrl, reconnectNonce, appendTicker]);

  const getRemotePoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const { width, height } = remoteSizeRef.current;
    const x = Math.round(((clientX - rect.left) / rect.width) * width);
    const y = Math.round(((clientY - rect.top) / rect.height) * height);
    return {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    };
  }, []);

  const sendWsJson = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!hasControlRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  const handlePointerEvent = useCallback(
    (
      eventType: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      if (!hasControlRef.current) return;
      if (eventType === 'mousePressed') {
        event.preventDefault();
        event.currentTarget.focus();
      }
      const pt = getRemotePoint(event.clientX, event.clientY);
      if (!pt) return;
      sendWsJson({
        type: 'input_mouse',
        eventType,
        x: pt.x,
        y: pt.y,
        button: mapMouseButton(event.button),
        clickCount: eventType === 'mousePressed' ? 1 : 0,
        modifiers: getModifierMask(event),
      });
    },
    [getRemotePoint, sendWsJson],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      event.preventDefault();
      const pt = getRemotePoint(event.clientX, event.clientY);
      if (!pt) return;
      sendWsJson({
        type: 'input_mouse',
        eventType: 'mouseWheel',
        x: pt.x,
        y: pt.y,
        deltaX: Math.round(event.deltaX),
        deltaY: Math.round(event.deltaY),
        modifiers: getModifierMask(event),
      });
    },
    [getRemotePoint, sendWsJson],
  );

  const handleKeyEvent = useCallback(
    (eventType: 'keyDown' | 'keyUp', event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!hasControlRef.current) return;
      event.preventDefault();
      sendWsJson({
        type: 'input_keyboard',
        eventType,
        key: event.key,
        code: event.code,
        text: eventType === 'keyDown' && event.key.length === 1 ? event.key : undefined,
        modifiers: getModifierMask(event),
      });
    },
    [sendWsJson],
  );

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-[#0e1014] text-zinc-100',
        className,
      )}
    >
      {/* JPEG Stream Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Live agent-browser JPEG viewport"
          onPointerDown={(e) => handlePointerEvent('mousePressed', e)}
          onPointerUp={(e) => handlePointerEvent('mouseReleased', e)}
          onPointerMove={(e) => handlePointerEvent('mouseMoved', e)}
          onWheel={handleWheel}
          onKeyDown={(e) => handleKeyEvent('keyDown', e)}
          onKeyUp={(e) => handleKeyEvent('keyUp', e)}
          className={cn(
            'max-h-full max-w-full rounded-[var(--radius-inner)] bg-black object-contain outline-none',
            hasControl ? 'cursor-pointer ring-2 ring-[var(--accent)]' : 'ring-1 ring-white/10',
            status !== 'live' && 'opacity-30',
          )}
        />

        {status !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-[var(--radius-container)] border border-white/10 bg-[#171920]/95 p-5 shadow-xl backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-element)] bg-blue-500/15 text-blue-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {status === 'connecting'
                      ? 'Connecting to agent-browser'
                      : 'Pair-Browsing Stream Offline'}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{statusText}</p>
                  <p className="mt-2 rounded-[var(--radius-inner)] border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">
                    Start local `agent-browser` (`AGENT_BROWSER_STREAM_PORT=9223`) or upgrade to a
                    Cloud Sandbox exposing port 4848.
                  </p>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {streamUrl && (
                      <button
                        type="button"
                        onClick={() => setReconnectNonce((n) => n + 1)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inner)] bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reconnect
                      </button>
                    )}
                    {onFallbackToSnapshot && (
                      <button
                        type="button"
                        onClick={onFallbackToSnapshot}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inner)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                      >
                        Open Snapshot Mode
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Live Command & Console Ticker */}
      <div className="border-t border-white/10 bg-[#14161c]">
        <button
          type="button"
          onClick={() => setTickerOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] text-zinc-400 transition hover:bg-white/5"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-2 w-2 rounded-full',
                status === 'live'
                  ? 'bg-emerald-400'
                  : status === 'connecting'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-zinc-500',
              )}
            />
            <span className="font-medium text-zinc-200">{statusText}</span>
            <span className="font-mono text-zinc-500">
              {resolution.width}×{resolution.height} · {fps} fps
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              <TerminalIcon className="h-3 w-3" />
              Activity ({tickerEvents.length})
            </span>
            {hasControl ? (
              <Hand className="h-3 w-3 text-blue-400" />
            ) : status === 'live' ? (
              <Wifi className="h-3 w-3 text-emerald-400" />
            ) : (
              <WifiOff className="h-3 w-3 text-zinc-500" />
            )}
            {tickerOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </div>
        </button>

        {tickerOpen && (
          <div className="max-h-36 overflow-y-auto border-t border-white/10 bg-[#0b0d11] px-3 py-2 font-mono text-[11px]">
            {tickerEvents.length === 0 ? (
              <p className="text-zinc-500">No commands or console events received yet.</p>
            ) : (
              <ul className="space-y-1">
                {tickerEvents.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="shrink-0 text-zinc-600">{item.time}</span>
                    <span
                      className={cn(
                        'shrink-0 uppercase text-[10px]',
                        item.kind === 'command' && 'text-blue-400',
                        item.kind === 'result' && 'text-emerald-400',
                        item.kind === 'url' && 'text-purple-400',
                        item.kind === 'console' && 'text-zinc-400',
                        item.kind === 'error' && 'text-rose-400',
                      )}
                    >
                      {item.kind}
                    </span>
                    <span className="min-w-0 break-all text-zinc-200">{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseStreamingTextOptions {
  /** Whether the source text is currently streaming. When false, text snaps cleanly to target. */
  isStreaming?: boolean;
  /** Disable smoothing (e.g. for static renders or reduced-motion). */
  disabled?: boolean;
  /** Target words/boundaries per second floor when catching up. */
  minCharsPerFrame?: number;
  /** Max characters released per frame to keep motion calm and readable. */
  maxCharsPerFrame?: number;
}

/**
 * Find the next natural word or markdown syntax boundary near `targetIndex`,
 * avoiding mid-word jitter or splitting short inline markdown tokens (`**`, `` ` ``).
 */
function advanceToBoundary(text: string, from: number, step: number): number {
  const rawNext = Math.min(text.length, from + step);
  if (rawNext >= text.length) {
    return text.length;
  }

  // Prefer stopping right after whitespace or common punctuation/syntax boundaries
  // within a short lookahead window so tokens arrive smoothly without awkward mid-word splits.
  const maxLookahead = Math.min(text.length, rawNext + 8);
  for (let i = rawNext; i < maxLookahead; i += 1) {
    const ch = text[i];
    if (
      ch === ' ' ||
      ch === '\n' ||
      ch === '\t' ||
      ch === '.' ||
      ch === ',' ||
      ch === ';' ||
      ch === ')'
    ) {
      return i + 1;
    }
  }

  return rawNext;
}

/**
 * Astryx-inspired rAF word/syntax-boundary smoother hook.
 * Smoothly reveals incoming streamed characters at display refresh cadence,
 * automatically accelerating when backlog grows and honoring `prefers-reduced-motion`.
 */
export function useStreamingText(
  targetText: string,
  options: UseStreamingTextOptions = {},
): string {
  const {
    isStreaming = false,
    disabled = false,
    minCharsPerFrame = 3,
    maxCharsPerFrame = 28,
  } = options;

  const [displayedText, setDisplayedText] = useState<string>(() =>
    isStreaming && !disabled ? '' : targetText,
  );

  const displayedLengthRef = useRef<number>(isStreaming && !disabled ? 0 : targetText.length);
  const targetRef = useRef<string>(targetText);
  const rafIdRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef<boolean>(false);

  targetRef.current = targetText;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mq.matches;
    const onChange = (event: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = event.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Snap immediately when disabled, not streaming, reduced motion is active, or text shrank/reset.
    if (
      disabled ||
      !isStreaming ||
      prefersReducedMotionRef.current ||
      targetText.length < displayedLengthRef.current
    ) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      displayedLengthRef.current = targetText.length;
      setDisplayedText(targetText);
      return;
    }

    if (displayedLengthRef.current >= targetText.length) {
      return;
    }

    const tick = () => {
      const full = targetRef.current;
      const current = displayedLengthRef.current;
      const remaining = full.length - current;

      if (remaining <= 0) {
        rafIdRef.current = null;
        return;
      }

      // Adaptive velocity: gently catches up on bursty chunks while keeping single-token streams silky.
      const adaptiveStep = Math.min(
        maxCharsPerFrame,
        Math.max(minCharsPerFrame, Math.ceil(remaining * 0.22)),
      );
      const nextIndex = advanceToBoundary(full, current, adaptiveStep);
      displayedLengthRef.current = nextIndex;
      setDisplayedText(full.slice(0, nextIndex));

      if (nextIndex < full.length) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [targetText, isStreaming, disabled, minCharsPerFrame, maxCharsPerFrame]);

  return displayedText;
}

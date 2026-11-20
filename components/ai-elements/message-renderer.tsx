'use client';

import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';
import { useStreamingText } from '@/lib/theme/use-streaming-text';
import { cn } from '@/lib/utils';

const STREAMDOWN_PLUGINS = {
  code,
  math,
  mermaid,
};

const SHIKI_THEMES: [string, string] = ['github-light', 'github-dark'];

export interface MessageRendererProps {
  content: string;
  isStreaming?: boolean;
  /** Enable Astryx rAF word/syntax-boundary smoothing while streaming */
  smooth?: boolean;
  mode?: 'streaming' | 'static';
  className?: string;
}

export function MessageRenderer({
  content,
  isStreaming = false,
  smooth = false,
  mode,
  className,
}: MessageRendererProps) {
  const smoothed = useStreamingText(content, {
    isStreaming: smooth && isStreaming,
    disabled: !smooth,
  });

  const resolvedContent = smooth ? smoothed : content;
  const resolvedMode = mode ?? (isStreaming ? 'streaming' : 'static');

  if (!resolvedContent) {
    return null;
  }

  return (
    <div
      data-slot="message-renderer"
      className={cn('astryx-markdown min-w-0 break-words', className)}
    >
      <Streamdown
        mode={resolvedMode}
        isAnimating={isStreaming}
        parseIncompleteMarkdown={true}
        plugins={STREAMDOWN_PLUGINS}
        shikiTheme={SHIKI_THEMES}
        controls={{
          code: true,
          table: true,
          mermaid: true,
        }}
        caret={isStreaming ? 'circle' : undefined}
      >
        {resolvedContent}
      </Streamdown>
    </div>
  );
}

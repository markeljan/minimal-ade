'use client';

import {
  Check,
  ChevronDown,
  Layers,
  Monitor,
  Moon,
  Palette,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import { BillingBadge } from '@/components/ai-elements/billing-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { ASTRYX_PALETTES } from '@/lib/theme/astryx-tokens';
import type { AstryxPalette, BillingSourceInfo, HarnessMode, ThemeMode } from '@/lib/types';
import { UiBridgePopover } from '@/lib/ui-agent/bridge';

export interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  chatTitle: string;
  onRenameTitle?: (title: string) => void;
  harnessMode: HarnessMode;
  onChangeHarness: (harness: HarnessMode) => void;
  billingInfo: BillingSourceInfo;
  onOpenSettings: (tab?: 'providers' | 'harnesses' | 'appearance') => void;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
  palette: AstryxPalette;
  onChangePalette: (palette: AstryxPalette) => void;
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
  workbenchBadgeCount?: number;
  onOpenCommandPalette: () => void;
}

const HARNESS_META: Record<HarnessMode, { label: string; short: string; desc: string }> = {
  'ai-sdk': {
    label: 'AI SDK 7',
    short: 'AI SDK 7',
    desc: 'Universal ToolLoop + bash-tool + json-render',
  },
  fx: {
    label: 'fx (libfx)',
    short: 'fx',
    desc: 'Durable Fluid Compute coding agent',
  },
  workflow: {
    label: 'Workflow 5',
    short: 'Workflow 5',
    desc: 'Resumable @ai-sdk/workflow agent',
  },
};

export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  chatTitle,
  onRenameTitle,
  harnessMode,
  onChangeHarness,
  billingInfo,
  onOpenSettings,
  theme,
  onChangeTheme,
  palette,
  onChangePalette,
  workbenchOpen,
  onToggleWorkbench,
  workbenchBadgeCount = 0,
  onOpenCommandPalette,
}: TopBarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chatTitle);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== chatTitle) {
      onRenameTitle?.(trimmed);
    }
  };

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/85 px-3 backdrop-blur-md">
      {/* Left: Sidebar toggle + Editable Chat Title */}
      <div className="flex min-w-0 items-center gap-2">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        )}

        {editingTitle ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitTitle();
            }}
            className="min-w-0"
          >
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              ref={(el) => {
                if (el && document.activeElement !== el) el.focus();
              }}
              aria-label="Edit chat title"
              className="h-7 w-48 rounded-[var(--radius-inner)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--fg-primary)] outline-none sm:w-64"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftTitle(chatTitle);
              setEditingTitle(true);
            }}
            className="group flex min-w-0 max-w-[200px] items-center gap-1.5 rounded-[var(--radius-inner)] px-2 py-1 text-left hover:bg-[var(--overlay-hover)] sm:max-w-[280px] cursor-pointer"
            title="Click to rename conversation"
          >
            <span className="truncate text-sm font-semibold tracking-tight text-[var(--fg-primary)]">
              {chatTitle}
            </span>
          </button>
        )}

        {/* Harness Selector Pill */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Agent harness: ${HARNESS_META[harnessMode].label}`}
            className="hidden h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-[11px] font-medium text-[var(--fg-secondary)] shadow-[var(--shadow-low)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)] md:inline-flex"
          >
            <Layers className="size-3 text-[var(--accent)]" />
            <span>{HARNESS_META[harnessMode].short}</span>
            <ChevronDown className="size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Agent Harness</DropdownMenuLabel>
            {(['ai-sdk', 'fx', 'workflow'] as const).map((mode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => onChangeHarness(mode)}
                className="flex items-start justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--fg-primary)]">
                    {HARNESS_META[mode].label}
                  </div>
                  <div className="text-[10.5px] font-normal text-[var(--fg-muted)]">
                    {HARNESS_META[mode].desc}
                  </div>
                </div>
                {harnessMode === mode && (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right: Billing Badge, UI Agent Bridge Popover, Theme/Palette, ⌘K, Workbench Drawer */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden lg:block">
          <BillingBadge
            source={billingInfo.source}
            label={billingInfo.label}
            providerName={billingInfo.providerName}
            creditsRemaining={billingInfo.creditsRemaining}
            compact
            onClick={() => onOpenSettings('providers')}
          />
        </div>

        <UiBridgePopover />

        {/* Theme & Astryx Palette Quick Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Theme and Astryx palette"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--fg-secondary)] shadow-[var(--shadow-low)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]"
          >
            {theme === 'dark' ? (
              <Moon className="size-3.5" />
            ) : theme === 'light' ? (
              <Sun className="size-3.5" />
            ) : (
              <Palette className="size-3.5" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Color Scheme</DropdownMenuLabel>
            {(
              [
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
                ['system', 'System', Monitor],
              ] as const
            ).map(([mode, label, Icon]) => (
              <DropdownMenuItem key={mode} onClick={() => onChangeTheme(mode)}>
                <Icon className="size-3.5" />
                <span className="flex-1">{label}</span>
                {theme === mode && <Check className="size-3.5 text-[var(--accent)]" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Astryx Palette</DropdownMenuLabel>
            {ASTRYX_PALETTES.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => onChangePalette(p.id)}>
                <span
                  className="size-3 rounded-full border border-black/15 shrink-0"
                  style={{ background: p.swatches.lightAccent }}
                />
                <span className="flex-1">{p.name}</span>
                {palette === p.id && <Check className="size-3.5 text-[var(--accent)]" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpenSettings('providers')}>
              <Settings className="size-3.5" />
              <span>All Settings…</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ⌘K Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open Command Palette"
          className="hidden h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--fg-muted)] shadow-[var(--shadow-low)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)] sm:inline-flex"
        >
          <Search className="size-3.5" />
          <Kbd>⌘K</Kbd>
        </button>

        {/* Workbench Split Drawer Toggle */}
        <Button
          variant={workbenchOpen ? 'subtle' : 'secondary'}
          size="sm"
          onClick={onToggleWorkbench}
          aria-label={workbenchOpen ? 'Hide Workbench' : 'Open Workbench'}
          title="Toggle Workbench (⌘.)"
          className="gap-1.5"
        >
          {workbenchOpen ? (
            <PanelRightClose className="size-3.5" />
          ) : (
            <PanelRightOpen className="size-3.5" />
          )}
          <span className="hidden sm:inline">Workbench</span>
          {workbenchBadgeCount > 0 && !workbenchOpen && (
            <span className="flex size-4 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-[10px] font-semibold text-[var(--accent-foreground)]">
              {workbenchBadgeCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

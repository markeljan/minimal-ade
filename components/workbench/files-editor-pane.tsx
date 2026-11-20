'use client';

import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import {
  Tree,
  TreeGroup,
  TreeItem,
  type TreeItemData,
  TreeItemIndicator,
  TreeItemLabel,
  treeFromPaths,
} from '@ui-sdk/react/tree';
import { basicSetup } from 'codemirror';
import {
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileDiff,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  History,
  Layers,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  WrapText,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ArtifactRecord, WorkspaceFileEntry } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

export interface InlineAiEditRequest {
  filePath?: string;
  artifactId?: string;
  artifactTitle?: string;
  selectionText: string;
  fromLine: number;
  toLine: number;
  instruction: string;
  fullContent: string;
}

export interface FilesEditorPaneProps {
  chatId: string;
  artifacts: ArtifactRecord[];
  activeArtifactId?: string | null;
  onSelectArtifact?: (id: string) => void;
  onUpdateArtifact?: (artifact: ArtifactRecord) => void;
  workspaceFiles?: WorkspaceFileEntry[];
  selectedFilePath?: string | null;
  fileSelectionNonce?: number;
  onSelectFilePath?: (path: string | null) => void;
  onWorkspaceFilesChange?: (files: WorkspaceFileEntry[]) => void;
  onAskAiEdit?: (req: InlineAiEditRequest) => void;
  onOpenHtmlInPreview?: (html: string, title?: string) => void;
  themeMode?: 'light' | 'dark';
}

type PaneSection = 'files' | 'artifacts';
type ViewMode = 'code' | 'preview' | 'diff';

interface SelectionOverlayState {
  text: string;
  fromLine: number;
  toLine: number;
  top: number;
  left: number;
  expanded: boolean;
}

function getLanguageExtension(filenameOrLang?: string): Extension {
  const lower = (filenameOrLang ?? '').toLowerCase();
  if (lower.endsWith('.tsx') || lower === 'tsx') {
    return javascript({ jsx: true, typescript: true });
  }
  if (lower.endsWith('.ts') || lower === 'ts' || lower === 'typescript') {
    return javascript({ typescript: true });
  }
  if (
    lower.endsWith('.jsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.json') ||
    lower === 'javascript' ||
    lower === 'jsx' ||
    lower === 'json'
  ) {
    return javascript({ jsx: true });
  }
  if (lower.endsWith('.py') || lower === 'python') {
    return python();
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower === 'html') {
    return html();
  }
  if (lower.endsWith('.css') || lower === 'css') {
    return css();
  }
  return [];
}

function buildAstryxLightTheme(): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--foreground, #111827)',
        fontSize: '12.5px',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
        padding: '12px 0',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground, #6b7280)',
        borderRight: '1px solid var(--border, rgba(5,54,89,0.1))',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(0, 100, 224, 0.05)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(0, 100, 224, 0.08)',
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(0, 100, 224, 0.18)',
      },
    },
    { dark: false },
  );
}

function buildAstryxDarkExtension(): Extension {
  return [
    oneDark,
    EditorView.theme(
      {
        '&': {
          backgroundColor: '#141518',
          fontSize: '12.5px',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        },
        '.cm-gutters': {
          backgroundColor: '#141518',
          borderRight: '1px solid rgba(242, 244, 246, 0.08)',
        },
      },
      { dark: true },
    ),
  ];
}

function computeSimpleDiff(
  beforeText: string,
  afterText: string,
): Array<{ type: 'context' | 'add' | 'remove'; text: string; lineNo: number }> {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const lines: Array<{
    type: 'context' | 'add' | 'remove';
    text: string;
    lineNo: number;
  }> = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right && left !== undefined) {
      lines.push({ type: 'context', text: left, lineNo: i + 1 });
    } else {
      if (left !== undefined) {
        lines.push({ type: 'remove', text: left, lineNo: i + 1 });
      }
      if (right !== undefined) {
        lines.push({ type: 'add', text: right, lineNo: i + 1 });
      }
    }
  }
  return lines;
}

function flattenPaths(entries: WorkspaceFileEntry[]): string[] {
  const out: string[] = [];
  const walk = (list: WorkspaceFileEntry[]) => {
    for (const item of list) {
      if (item.type === 'directory') {
        if (item.children?.length) {
          walk(item.children);
        } else {
          out.push(item.path.endsWith('/') ? item.path : `${item.path}/`);
        }
      } else {
        out.push(item.path.replace(/^\/+/, ''));
      }
    }
  };
  walk(entries);
  return out;
}

function isBranchInTree(nodes: TreeItemData[], target: string): boolean {
  for (const node of nodes) {
    if (node.value === target) {
      return Boolean(node.children && node.children.length > 0);
    }
    if (node.children?.length && isBranchInTree(node.children, target)) {
      return true;
    }
  }
  return false;
}

function renderTreeNodes(
  nodes: TreeItemData[],
  activePath: string | null,
  onSelectFile: (path: string) => void,
  onDeleteFile?: (path: string) => void,
) {
  return nodes.map((node) => {
    const isBranch = Boolean(node.children && node.children.length > 0);
    const isSelected = activePath === node.value;

    return (
      <TreeItem
        key={node.value}
        value={node.value}
        branch={isBranch}
        label={node.label}
        onClick={isBranch ? undefined : () => onSelectFile(node.value)}
        className="outline-none"
      >
        <TreeItemLabel
          className={cn(
            'group flex w-full items-center gap-1.5 rounded-[var(--radius-inner,8px)] px-2 py-1 text-xs transition-colors cursor-pointer select-none',
            isSelected
              ? 'bg-[var(--accent)]/12 text-[var(--accent)] font-medium'
              : 'text-foreground/85 hover:bg-muted/70',
          )}
          style={{
            paddingLeft: 'calc(8px + (var(--tree-level, 1) - 1) * 14px)',
          }}
        >
          {isBranch ? (
            <>
              <TreeItemIndicator className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground transition-transform data-[expanded]:rotate-90">
                <ChevronRight className="h-3 w-3" />
              </TreeItemIndicator>
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/90 group-data-[expanded]:hidden" />
              <FolderOpen className="hidden h-3.5 w-3.5 shrink-0 text-amber-500/90 group-data-[expanded]:block" />
            </>
          ) : (
            <>
              <span className="inline-block w-3.5 shrink-0" />
              {node.label.endsWith('.md') || node.label.endsWith('.txt') ? (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-500/80" />
              )}
            </>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{node.label}</span>
          {!isBranch && onDeleteFile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(node.value);
              }}
              className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500 group-hover:inline-flex"
              title={`Delete ${node.value}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </TreeItemLabel>
        {isBranch && node.children && (
          <TreeGroup className="space-y-0.5">
            {renderTreeNodes(node.children, activePath, onSelectFile, onDeleteFile)}
          </TreeGroup>
        )}
      </TreeItem>
    );
  });
}

function collectParentFolders(filePath: string): string[] {
  const clean = filePath.replace(/^\/+/, '');
  const parts = clean.split('/');
  const folders: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    folders.push(parts.slice(0, i + 1).join('/'));
  }
  return folders;
}

function getArtifactDownloadFilename(artifact: ArtifactRecord | null): string {
  const baseTitle = (artifact?.title ?? 'artifact')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const safeBase = baseTitle || 'artifact';
  const lang = (artifact?.language ?? '').trim().toLowerCase();
  const extMap: Record<string, string> = {
    typescript: 'ts',
    ts: 'ts',
    tsx: 'tsx',
    javascript: 'js',
    js: 'js',
    jsx: 'jsx',
    python: 'py',
    py: 'py',
    html: 'html',
    css: 'css',
    json: 'json',
    markdown: 'md',
    md: 'md',
    diff: 'diff',
    bash: 'sh',
    shell: 'sh',
    sh: 'sh',
    sql: 'sql',
  };
  const inferredExt =
    artifact?.kind === 'html'
      ? 'html'
      : artifact?.kind === 'document'
        ? 'md'
        : artifact?.kind === 'diff'
          ? 'diff'
          : artifact?.kind === 'genui'
            ? 'json'
            : (extMap[lang] ?? (lang || 'txt'));
  if (safeBase.endsWith(`.${inferredExt}`)) return safeBase;
  return `${safeBase}.${inferredExt}`;
}

export function FilesEditorPane({
  chatId,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onUpdateArtifact,
  workspaceFiles: propWorkspaceFiles,
  selectedFilePath,
  fileSelectionNonce = 0,
  onSelectFilePath,
  onWorkspaceFilesChange,
  onAskAiEdit,
  onOpenHtmlInPreview,
  themeMode = 'light',
}: FilesEditorPaneProps) {
  const [section, setSection] = useState<PaneSection>(
    selectedFilePath ? 'files' : artifacts.length > 0 && activeArtifactId ? 'artifacts' : 'files',
  );
  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(propWorkspaceFiles ?? []);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | null>(selectedFilePath ?? null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['src', 'app', 'components']);
  const [treeOpen, setTreeOpen] = useState(true);
  const [lineWrap, setLineWrap] = useState(false);

  // Artifact versioning + local unsaved draft buffer
  const [artifactVersions, setArtifactVersions] = useState<ArtifactRecord[]>([]);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number>(0);
  const [artifactDrafts, setArtifactDrafts] = useState<Record<string, string>>({});

  // CodeMirror refs + inline AI edit popover
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayState | null>(null);
  const [aiEditInstruction, setAiEditInstruction] = useState('');

  // Sync external workspaceFiles prop
  useEffect(() => {
    if (propWorkspaceFiles && propWorkspaceFiles.length > 0) {
      setFiles(propWorkspaceFiles);
    }
  }, [propWorkspaceFiles]);

  // Auto-switch to Artifacts tab when a new activeArtifactId arrives
  useEffect(() => {
    if (activeArtifactId) {
      setSection('artifacts');
    }
  }, [activeArtifactId]);

  // Auto-switch to Workspace tab and select path when an external file path is targeted
  useEffect(() => {
    if (fileSelectionNonce < 0 || !selectedFilePath) return;
    const cleanPath = selectedFilePath.replace(/^\/+/, '').replace(/^workspace\//, '');
    if (!cleanPath) return;
    setSection('files');
    setActiveFilePath(cleanPath);
    const parents = collectParentFolders(cleanPath);
    if (parents.length > 0) {
      setExpandedFolders((prev) => Array.from(new Set([...prev, ...parents])));
    }
  }, [selectedFilePath, fileSelectionNonce]);

  const activeArtifact = useMemo(() => {
    if (artifacts.length === 0) return null;
    if (activeArtifactId) {
      return artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[0];
    }
    return artifacts[0];
  }, [artifacts, activeArtifactId]);

  const activeArtifactRef = useRef(activeArtifact);
  activeArtifactRef.current = activeArtifact;
  const activeArtifactKeyId = activeArtifact?.id ?? null;
  const activeArtifactKeyVersion = activeArtifact?.version ?? 0;

  // Fetch artifact version history only when active artifact ID or server version changes
  useEffect(() => {
    const initial = activeArtifactRef.current;
    if (!activeArtifactKeyId || activeArtifactKeyVersion < 0 || !initial) {
      setArtifactVersions([]);
      setSelectedVersionIdx(0);
      return;
    }
    let cancelled = false;
    setArtifactVersions((prev) => {
      if (prev.some((v) => v.id === initial.id && v.version === initial.version)) {
        return prev;
      }
      return [initial];
    });
    setSelectedVersionIdx(0);

    fetch(`/api/artifacts/${encodeURIComponent(activeArtifactKeyId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: ArtifactRecord[] = Array.isArray(data.versions)
          ? data.versions
          : Array.isArray(data)
            ? data
            : data.artifact
              ? [data.artifact]
              : [];
        if (list.length > 0) {
          setArtifactVersions(list);
          setSelectedVersionIdx(list.length - 1);
        }
      })
      .catch(() => {
        // Keep local single-version record gracefully
      });

    return () => {
      cancelled = true;
    };
  }, [activeArtifactKeyId, activeArtifactKeyVersion]);

  const currentArtifactVersion = artifactVersions[selectedVersionIdx] ?? activeArtifact;
  const previousArtifactVersion =
    selectedVersionIdx > 0 ? artifactVersions[selectedVersionIdx - 1] : null;
  const currentArtifactDraftKey = currentArtifactVersion
    ? `${currentArtifactVersion.id}:v${currentArtifactVersion.version}`
    : null;
  const isViewingOlderArtifactVersion =
    section === 'artifacts' &&
    artifactVersions.length > 1 &&
    selectedVersionIdx < artifactVersions.length - 1;

  const onWorkspaceFilesChangeRef = useRef(onWorkspaceFilesChange);
  onWorkspaceFilesChangeRef.current = onWorkspaceFilesChange;

  const loadWorkspaceFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/sandbox/files?chatId=${encodeURIComponent(chatId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const entries: WorkspaceFileEntry[] = Array.isArray(data.files) ? data.files : [];
      setFiles(entries);
      onWorkspaceFilesChangeRef.current?.(entries);

      const rawMap =
        data.fileMap && typeof data.fileMap === 'object'
          ? (data.fileMap as Record<string, string>)
          : data.contents && typeof data.contents === 'object'
            ? (data.contents as Record<string, string>)
            : null;
      if (rawMap) {
        setFileContents((prev) => ({ ...rawMap, ...prev }));
        setSavedContents((prev) => ({ ...rawMap, ...prev }));
      }

      setActiveFilePath((current) => {
        if (current) return current;
        const flat = flattenPaths(entries).filter((p) => !p.endsWith('/'));
        return flat[0] ?? null;
      });
    } catch {
      // Non-fatal in cold-start environments
    } finally {
      setLoadingFiles(false);
    }
  }, [chatId]);

  useEffect(() => {
    void loadWorkspaceFiles();
  }, [loadWorkspaceFiles]);

  const loadSingleFile = useCallback(
    async (filePath: string) => {
      if (fileContents[filePath] !== undefined) return;
      try {
        const res = await fetch(
          `/api/sandbox/files?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(filePath)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const content =
          typeof data.file?.content === 'string'
            ? data.file.content
            : typeof data.content === 'string'
              ? data.content
              : '';
        setFileContents((prev) => ({ ...prev, [filePath]: content }));
        setSavedContents((prev) => ({ ...prev, [filePath]: content }));
      } catch {
        // Ignore transient read error
      }
    },
    [chatId, fileContents],
  );

  useEffect(() => {
    if (section === 'files' && activeFilePath) {
      void loadSingleFile(activeFilePath);
    }
  }, [section, activeFilePath, loadSingleFile]);

  const activeContent =
    section === 'artifacts'
      ? currentArtifactDraftKey && artifactDrafts[currentArtifactDraftKey] !== undefined
        ? artifactDrafts[currentArtifactDraftKey]
        : (currentArtifactVersion?.content ?? '')
      : activeFilePath
        ? (fileContents[activeFilePath] ?? '')
        : '';

  const activeLanguageHint =
    section === 'artifacts'
      ? (currentArtifactVersion?.language ??
        (currentArtifactVersion?.kind === 'html' ? 'html' : 'typescript'))
      : (activeFilePath ?? 'typescript');

  const isDirty =
    section === 'files'
      ? activeFilePath !== null &&
        fileContents[activeFilePath] !== undefined &&
        fileContents[activeFilePath] !== (savedContents[activeFilePath] ?? '')
      : currentArtifactVersion !== null &&
        currentArtifactDraftKey !== null &&
        artifactDrafts[currentArtifactDraftKey] !== undefined &&
        artifactDrafts[currentArtifactDraftKey] !== currentArtifactVersion.content;

  const isHtmlPreviewable =
    (section === 'artifacts' && currentArtifactVersion?.kind === 'html') ||
    (section === 'files' && Boolean(activeFilePath && /\.(html|htm)$/i.test(activeFilePath)));

  const isMarkdownPreviewable =
    (section === 'artifacts' && currentArtifactVersion?.kind === 'document') ||
    (section === 'files' && Boolean(activeFilePath && /\.(md|mdx)$/i.test(activeFilePath)));

  const persistArtifactVersion = useCallback(
    async (baseArtifact: ArtifactRecord, contentToSave: string, toastMessage?: string) => {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: baseArtifact.id,
          chatId,
          title: baseArtifact.title,
          kind: baseArtifact.kind,
          language: baseArtifact.language ?? null,
          content: contentToSave,
          ...(baseArtifact.spec !== undefined ? { spec: baseArtifact.spec } : {}),
        }),
      });
      if (!res.ok) throw new Error('Failed to save artifact');
      const data = (await res.json().catch(() => ({}))) as { artifact?: ArtifactRecord };
      const saved: ArtifactRecord = data.artifact ?? {
        ...baseArtifact,
        content: contentToSave,
        version: baseArtifact.version + 1,
        updatedAt: new Date().toISOString(),
      };

      setArtifactVersions((prev) => {
        const filtered = prev.filter((v) => v.version !== saved.version);
        const next = [...filtered, saved].sort((a, b) => a.version - b.version);
        setSelectedVersionIdx(next.length - 1);
        return next;
      });
      setArtifactDrafts((prev) => {
        const next = { ...prev };
        delete next[`${baseArtifact.id}:v${baseArtifact.version}`];
        delete next[`${saved.id}:v${saved.version}`];
        return next;
      });
      onUpdateArtifactRef.current?.(saved);
      toast.success(toastMessage ?? `Saved v${saved.version} of ${saved.title}`);
      return saved;
    },
    [chatId],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const liveContent =
        viewMode === 'code' && editorViewRef.current
          ? editorViewRef.current.state.doc.toString()
          : activeContent;

      if (section === 'files' && activeFilePath) {
        const res = await fetch('/api/sandbox/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, path: activeFilePath, content: liveContent }),
        });
        if (!res.ok) throw new Error('Failed to save file');
        setFileContents((prev) => ({ ...prev, [activeFilePath]: liveContent }));
        setSavedContents((prev) => ({ ...prev, [activeFilePath]: liveContent }));
        toast.success(`Saved ${activeFilePath}`);
      } else if (section === 'artifacts' && currentArtifactVersion) {
        await persistArtifactVersion(currentArtifactVersion, liveContent);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [
    viewMode,
    activeContent,
    section,
    activeFilePath,
    chatId,
    currentArtifactVersion,
    persistArtifactVersion,
  ]);

  const handleRestoreArtifactVersion = useCallback(async () => {
    if (!currentArtifactVersion) return;
    setSaving(true);
    try {
      const contentToRestore =
        viewMode === 'code' && editorViewRef.current
          ? editorViewRef.current.state.doc.toString()
          : activeContent;
      await persistArtifactVersion(
        currentArtifactVersion,
        contentToRestore,
        `Restored v${currentArtifactVersion.version} of ${currentArtifactVersion.title}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restore version');
    } finally {
      setSaving(false);
    }
  }, [currentArtifactVersion, viewMode, activeContent, persistArtifactVersion]);

  const handleCreateFile = useCallback(async () => {
    const trimmed = newFileName.trim().replace(/^\/+/, '');
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch('/api/sandbox/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, path: trimmed, content: '' }),
      });
      if (!res.ok) throw new Error('Failed to create file');
      setFileContents((prev) => ({ ...prev, [trimmed]: '' }));
      setSavedContents((prev) => ({ ...prev, [trimmed]: '' }));
      const parents = collectParentFolders(trimmed);
      if (parents.length > 0) {
        setExpandedFolders((prev) => Array.from(new Set([...prev, ...parents])));
      }
      setSection('files');
      setViewMode('code');
      setActiveFilePath(trimmed);
      onSelectFilePath?.(trimmed);
      setNewFileName('');
      setCreatingFile(false);
      await loadWorkspaceFiles();
      window.requestAnimationFrame(() => {
        editorViewRef.current?.focus();
      });
      toast.success(`Created ${trimmed}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create file');
    } finally {
      setSaving(false);
    }
  }, [newFileName, chatId, loadWorkspaceFiles, onSelectFilePath]);

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      try {
        const res = await fetch(
          `/api/sandbox/files?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(filePath)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error('Delete failed');
        setFileContents((prev) => {
          const next = { ...prev };
          delete next[filePath];
          return next;
        });
        if (activeFilePath === filePath) {
          setActiveFilePath(null);
        }
        await loadWorkspaceFiles();
        toast.success(`Deleted ${filePath}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not delete file');
      }
    },
    [chatId, activeFilePath, loadWorkspaceFiles],
  );

  // Mount & update CodeMirror 6 instance
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const activeFilePathRef = useRef(activeFilePath);
  activeFilePathRef.current = activeFilePath;
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const currentArtifactRef = useRef(currentArtifactVersion);
  currentArtifactRef.current = currentArtifactVersion;
  const currentArtifactDraftKeyRef = useRef(currentArtifactDraftKey);
  currentArtifactDraftKeyRef.current = currentArtifactDraftKey;
  const onUpdateArtifactRef = useRef(onUpdateArtifact);
  onUpdateArtifactRef.current = onUpdateArtifact;

  const activeEditorKey =
    section === 'artifacts'
      ? `artifact:${currentArtifactVersion?.id ?? 'none'}:v${currentArtifactVersion?.version ?? selectedVersionIdx}:${themeMode}:${activeLanguageHint}:wrap${lineWrap ? 1 : 0}`
      : `file:${activeFilePath ?? 'none'}:${themeMode}:${activeLanguageHint}:wrap${lineWrap ? 1 : 0}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: editor rebuilds cleanly on key/mode changes
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || viewMode !== 'code') return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const nextDoc = update.state.doc.toString();
        if (sectionRef.current === 'files' && activeFilePathRef.current) {
          const pathKey = activeFilePathRef.current;
          setFileContents((prev) =>
            prev[pathKey] === nextDoc ? prev : { ...prev, [pathKey]: nextDoc },
          );
        } else if (sectionRef.current === 'artifacts' && currentArtifactDraftKeyRef.current) {
          const draftKey = currentArtifactDraftKeyRef.current;
          setArtifactDrafts((prev) =>
            prev[draftKey] === nextDoc ? prev : { ...prev, [draftKey]: nextDoc },
          );
        }
      }

      if (update.selectionSet || update.docChanged) {
        const range = update.state.selection.main;
        if (!range.empty && range.to - range.from >= 2) {
          const selectedText = update.state.sliceDoc(range.from, range.to);
          const fromLine = update.state.doc.lineAt(range.from).number;
          const toLine = update.state.doc.lineAt(range.to).number;
          const coords = update.view.coordsAtPos(range.from);
          const hostRect = container.getBoundingClientRect();
          if (coords) {
            setSelectionOverlay((prev) => ({
              text: selectedText,
              fromLine,
              toLine,
              top: Math.max(8, coords.top - hostRect.top - 40),
              left: Math.min(
                Math.max(12, coords.left - hostRect.left),
                Math.max(12, hostRect.width - 260),
              ),
              expanded: prev?.expanded ?? false,
            }));
          }
        } else {
          setSelectionOverlay((prev) => (prev?.expanded ? prev : null));
        }
      }
    });

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          void handleSaveRef.current();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: activeContent,
      extensions: [
        basicSetup,
        saveKeymap,
        getLanguageExtension(activeLanguageHint),
        themeMode === 'dark' ? buildAstryxDarkExtension() : buildAstryxLightTheme(),
        ...(lineWrap ? [EditorView.lineWrapping] : []),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: container });
    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [activeEditorKey, viewMode]);

  // Sync external content updates (e.g. agent wrote file) into active CodeMirror doc without cursor jump
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || viewMode !== 'code') return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== activeContent) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: activeContent },
      });
    }
  }, [activeContent, viewMode]);

  const filePaths = useMemo(() => flattenPaths(files), [files]);
  const treeItems = useMemo(() => treeFromPaths(filePaths), [filePaths]);

  const diffLines = useMemo(() => {
    if (section === 'artifacts') {
      if (currentArtifactVersion?.kind === 'diff') {
        return currentArtifactVersion.content.split('\n').map((line, i) => ({
          type: line.startsWith('+')
            ? ('add' as const)
            : line.startsWith('-')
              ? ('remove' as const)
              : ('context' as const),
          text: line,
          lineNo: i + 1,
        }));
      }
      return computeSimpleDiff(
        previousArtifactVersion?.content ?? '',
        currentArtifactVersion?.content ?? '',
      );
    }
    const base = activeFilePath ? (savedContents[activeFilePath] ?? '') : '';
    return computeSimpleDiff(base, activeContent);
  }, [
    section,
    currentArtifactVersion,
    previousArtifactVersion,
    activeFilePath,
    savedContents,
    activeContent,
  ]);

  const handleCopy = async () => {
    const buffer =
      viewMode === 'code' && editorViewRef.current
        ? editorViewRef.current.state.doc.toString()
        : activeContent;
    await navigator.clipboard.writeText(buffer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    const buffer =
      viewMode === 'code' && editorViewRef.current
        ? editorViewRef.current.state.doc.toString()
        : activeContent;
    if (section === 'files' && !activeFilePath) {
      toast.info('Select a workspace file to download.');
      return;
    }
    if (section === 'artifacts' && !currentArtifactVersion) {
      toast.info('Select an artifact to download.');
      return;
    }
    const name =
      section === 'artifacts'
        ? getArtifactDownloadFilename(currentArtifactVersion)
        : (activeFilePath?.split('/').pop() ?? 'file.txt');
    const mimeType = name.endsWith('.html')
      ? 'text/html;charset=utf-8'
      : name.endsWith('.json')
        ? 'application/json;charset=utf-8'
        : 'text/plain;charset=utf-8';
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submitAiSelectionEdit = () => {
    if (!selectionOverlay || !aiEditInstruction.trim() || !onAskAiEdit) return;
    onAskAiEdit({
      filePath: section === 'files' ? (activeFilePath ?? undefined) : undefined,
      artifactId: section === 'artifacts' ? currentArtifactVersion?.id : undefined,
      artifactTitle: section === 'artifacts' ? currentArtifactVersion?.title : undefined,
      selectionText: selectionOverlay.text,
      fromLine: selectionOverlay.fromLine,
      toLine: selectionOverlay.toLine,
      instruction: aiEditInstruction.trim(),
      fullContent: activeContent,
    });
    setAiEditInstruction('');
    setSelectionOverlay(null);
    toast.success('Sent targeted edit request to assistant');
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--bg-surface)] text-foreground">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setTreeOpen((v) => !v)}
            aria-pressed={treeOpen}
            aria-label={treeOpen ? 'Hide file tree' : 'Show file tree'}
            title={treeOpen ? 'Hide file tree' : 'Show file tree'}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-inner,8px)] border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {treeOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
          </button>

          <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-inner,8px)] bg-muted/70 p-0.5">
            <button
              type="button"
              onClick={() => setSection('files')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 py-1 text-xs font-medium transition-colors',
                section === 'files'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span>Workspace</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {filePaths.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSection('artifacts')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 py-1 text-xs font-medium transition-colors',
                section === 'artifacts'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span>Artifacts</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {artifacts.length}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Code / Preview / Diff toggles */}
          <div className="flex shrink-0 items-center rounded-[var(--radius-inner,8px)] border border-border/70 bg-background/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11px] font-medium',
                viewMode === 'code'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Code2 className="h-3 w-3 shrink-0" />
              Code
            </button>
            {(isHtmlPreviewable || isMarkdownPreviewable) && (
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11px] font-medium',
                  viewMode === 'preview'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Eye className="h-3 w-3 shrink-0" />
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11px] font-medium',
                viewMode === 'diff'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileDiff className="h-3 w-3 shrink-0" />
              Diff
            </button>
          </div>

          {viewMode === 'code' && (
            <button
              type="button"
              onClick={() => setLineWrap((v) => !v)}
              aria-pressed={lineWrap}
              aria-label={lineWrap ? 'Disable line wrap' : 'Enable line wrap'}
              title={lineWrap ? 'Disable line wrap (horizontal scroll)' : 'Enable line wrap'}
              className={cn(
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-inner,8px)] border transition-colors',
                lineWrap
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]'
                  : 'border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <WrapText className="h-3.5 w-3.5" />
            </button>
          )}

          {isHtmlPreviewable && onOpenHtmlInPreview && (
            <button
              type="button"
              onClick={() =>
                onOpenHtmlInPreview(
                  activeContent,
                  section === 'artifacts'
                    ? currentArtifactVersion?.title
                    : (activeFilePath ?? 'Preview'),
                )
              }
              className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-inner,8px)] border border-border/70 px-2 text-[11px] text-foreground hover:bg-muted"
              title="Launch live HTML preview in Preview tab"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Preview</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-inner,8px)] px-2 text-[11px] font-medium transition-colors',
              isDirty
                ? 'bg-[var(--accent)] text-white hover:opacity-90'
                : 'border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            title="Save (⌘S)"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <Save className="h-3 w-3 shrink-0" />
            )}
            <span>{isDirty ? 'Save*' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy contents"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-inner,8px)] border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Copy contents"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download file"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-inner,8px)] border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split: Collapsible Tree / Artifact List + Editor/Preview */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Collapsible Left Navigation Column */}
        {treeOpen && (
          <div className="flex w-44 shrink-0 flex-col border-r border-border/70 bg-muted/20">
            {section === 'files' ? (
              <>
                <div className="flex items-center justify-between border-b border-border/60 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Files
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCreatingFile((v) => !v)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="New file"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadWorkspaceFiles()}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Refresh workspace files"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', loadingFiles && 'animate-spin')} />
                    </button>
                  </div>
                </div>

                {creatingFile && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleCreateFile();
                    }}
                    className="flex items-center gap-1 border-b border-border/60 bg-background/80 p-1.5"
                  >
                    <input
                      type="text"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="src/app.ts"
                      ref={(el) => {
                        if (el && document.activeElement !== el) el.focus();
                      }}
                      className="min-w-0 flex-1 rounded bg-muted/60 px-1.5 py-1 font-mono text-[11px] outline-none ring-1 ring-border focus:ring-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setCreatingFile(false)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                )}

                <div className="min-h-0 flex-1 overflow-auto p-1.5">
                  {treeItems.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                      {loadingFiles ? 'Loading files…' : 'No workspace files yet.'}
                    </div>
                  ) : (
                    <Tree
                      items={treeItems}
                      value={activeFilePath}
                      expanded={expandedFolders}
                      onExpandedChange={(next) => setExpandedFolders(next)}
                      onValueChange={(val) => {
                        if (
                          typeof val === 'string' &&
                          !val.endsWith('/') &&
                          !isBranchInTree(treeItems, val)
                        ) {
                          setActiveFilePath(val);
                        }
                      }}
                      onAction={(val) => {
                        if (!val.endsWith('/') && !isBranchInTree(treeItems, val)) {
                          setActiveFilePath(val);
                        }
                      }}
                      className="space-y-0.5"
                    >
                      {renderTreeNodes(
                        treeItems,
                        activeFilePath,
                        (path) => setActiveFilePath(path),
                        handleDeleteFile,
                      )}
                    </Tree>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border/60 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Artifacts
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {artifacts.length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-auto p-1.5">
                  {artifacts.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                      Ask the assistant to build an HTML app, code snippet, or document.
                    </div>
                  ) : (
                    artifacts.map((art) => {
                      const selected = currentArtifactVersion?.id === art.id;
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => onSelectArtifact?.(art.id)}
                          className={cn(
                            'flex w-full flex-col items-start rounded-[var(--radius-inner,8px)] px-2.5 py-2 text-left transition-colors',
                            selected
                              ? 'bg-[var(--accent)]/12 text-foreground ring-1 ring-[var(--accent)]/30'
                              : 'hover:bg-muted/70 text-foreground/85',
                          )}
                        >
                          <div className="flex w-full items-center justify-between gap-1">
                            <span className="truncate text-xs font-medium">{art.title}</span>
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                              {art.kind}
                            </span>
                          </div>
                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                            v{art.version} · {formatRelativeTime(art.updatedAt)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Right Editor / Preview Surface */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sub-header: Active File/Artifact Path + Version Slider */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/60 px-3 py-1.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-[11.5px] font-medium text-foreground">
                {section === 'artifacts'
                  ? (currentArtifactVersion?.title ?? 'No artifact selected')
                  : (activeFilePath ?? 'Select a file')}
              </span>
              {section === 'artifacts' && currentArtifactVersion && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {currentArtifactVersion.language ?? currentArtifactVersion.kind}
                </span>
              )}
            </div>

            {section === 'artifacts' && artifactVersions.length > 1 && (
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="range"
                  min={0}
                  max={artifactVersions.length - 1}
                  value={selectedVersionIdx}
                  onChange={(e) => setSelectedVersionIdx(Number(e.target.value))}
                  aria-label="Artifact version history"
                  className="h-1.5 w-24 accent-[var(--accent)]"
                />
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  v{currentArtifactVersion?.version ?? selectedVersionIdx + 1}/
                  {artifactVersions[artifactVersions.length - 1]?.version ??
                    artifactVersions.length}
                </span>
                {isViewingOlderArtifactVersion && (
                  <button
                    type="button"
                    onClick={() => void handleRestoreArtifactVersion()}
                    disabled={saving}
                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-inner,8px)] border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
                    title="Persist this older version as the new latest artifact version"
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    Restore v{currentArtifactVersion?.version ?? selectedVersionIdx + 1}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Code / Preview / Diff Body */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {viewMode === 'code' && (
              <>
                <div
                  ref={editorContainerRef}
                  className="h-full min-h-[260px] w-full overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:w-full [&_.cm-scroller]:overflow-auto"
                />

                {/* ChatGPT Canvas-style Floating "Ask AI to edit selection" Popover */}
                {selectionOverlay && onAskAiEdit && (
                  <div
                    style={{
                      top: selectionOverlay.top,
                      left: selectionOverlay.left,
                    }}
                    className="absolute z-20 max-w-[320px] rounded-[var(--radius-element,12px)] border border-border bg-popover/95 p-1.5 shadow-lg backdrop-blur-md"
                  >
                    {!selectionOverlay.expanded ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectionOverlay((prev) =>
                              prev ? { ...prev, expanded: true } : null,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-inner,8px)] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>
                            Ask AI to edit (L{selectionOverlay.fromLine}
                            {selectionOverlay.toLine !== selectionOverlay.fromLine
                              ? `–${selectionOverlay.toLine}`
                              : ''}
                            )
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectionOverlay(null)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitAiSelectionEdit();
                        }}
                        className="w-72 space-y-2 p-1"
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                            Edit lines {selectionOverlay.fromLine}–{selectionOverlay.toLine}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectionOverlay(null)}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            'Refactor cleanly',
                            'Add TypeScript types',
                            'Fix edge cases',
                            'Optimize performance',
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setAiEditInstruction(preset)}
                              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={aiEditInstruction}
                            onChange={(e) => setAiEditInstruction(e.target.value)}
                            placeholder="Describe how to transform selection…"
                            ref={(el) => {
                              if (el && document.activeElement !== el) el.focus();
                            }}
                            className="min-w-0 flex-1 rounded-[var(--radius-inner,8px)] border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                          />
                          <button
                            type="submit"
                            disabled={!aiEditInstruction.trim()}
                            className="rounded-[var(--radius-inner,8px)] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                          >
                            Edit
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}

            {viewMode === 'preview' && isHtmlPreviewable && (
              <iframe
                title="HTML Live Preview"
                srcDoc={activeContent}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="h-full w-full border-0 bg-white"
              />
            )}

            {viewMode === 'preview' && !isHtmlPreviewable && isMarkdownPreviewable && (
              <div className="prose prose-sm dark:prose-invert h-full max-w-none overflow-auto p-5">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {activeContent}
                </pre>
              </div>
            )}

            {viewMode === 'diff' && (
              <div className="h-full overflow-auto font-mono text-xs leading-5">
                {diffLines.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No differences to display.
                  </div>
                ) : (
                  diffLines.map((line, idx) => (
                    <div
                      key={`${line.lineNo}-${line.type}-${idx}`}
                      className={cn(
                        'flex gap-3 px-3 py-0.5',
                        line.type === 'add' &&
                          'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
                        line.type === 'remove' && 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
                        line.type === 'context' && 'text-muted-foreground',
                      )}
                    >
                      <span className="w-8 shrink-0 select-none text-right opacity-50">
                        {line.lineNo}
                      </span>
                      <span className="w-3 shrink-0 select-none font-bold">
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                        {line.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

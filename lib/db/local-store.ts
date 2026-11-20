import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArtifactKind,
  AttachmentItem,
  ChatVisibility,
  HarnessMode,
  MessageMetadata,
} from '@/lib/types';

export interface LocalChatEntry {
  id: string;
  userId: string;
  title: string;
  visibility: ChatVisibility;
  harnessMode: HarnessMode;
  modelId: string;
  sandboxName: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalMessageEntry {
  id: string;
  chatId: string;
  parentId: string | null;
  role: string;
  parts: unknown[];
  attachments: AttachmentItem[];
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface LocalArtifactEntry {
  id: string;
  createdAt: string;
  chatId: string;
  userId: string;
  title: string;
  kind: ArtifactKind;
  language: string | null;
  content: string;
}

export interface LocalWorkspaceFileEntry {
  chatId: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface LocalStoreData {
  chats: Record<string, LocalChatEntry>;
  messages: Record<string, LocalMessageEntry[]>;
  votes: Record<string, Record<string, boolean>>;
  artifacts: Record<string, LocalArtifactEntry[]>;
  workspaceFiles: Record<string, Record<string, LocalWorkspaceFileEntry>>;
}

function createEmptyStore(): LocalStoreData {
  return {
    chats: {},
    messages: {},
    votes: {},
    artifacts: {},
    workspaceFiles: {},
  };
}

interface GlobalLocalStoreState {
  __minimalAdeLocalStore?: LocalStoreData;
  __minimalAdeLocalStoreLoaded?: boolean;
  __minimalAdeLocalStorePath?: string;
  __minimalAdeLocalStoreReadOnly?: boolean;
  __minimalAdeLocalStoreQueue?: Promise<unknown>;
}

const globalState = globalThis as unknown as GlobalLocalStoreState;

function getDefaultStorePath(): string {
  return path.join(process.cwd(), '.minimal-ade-data', 'store.json');
}

function getFallbackStorePath(): string {
  return path.join('/tmp', '.minimal-ade-data', 'store.json');
}

function normalizeStore(raw: unknown): LocalStoreData {
  if (!raw || typeof raw !== 'object') {
    return createEmptyStore();
  }
  const obj = raw as Partial<LocalStoreData>;
  return {
    chats: obj.chats && typeof obj.chats === 'object' ? obj.chats : {},
    messages: obj.messages && typeof obj.messages === 'object' ? obj.messages : {},
    votes: obj.votes && typeof obj.votes === 'object' ? obj.votes : {},
    artifacts: obj.artifacts && typeof obj.artifacts === 'object' ? obj.artifacts : {},
    workspaceFiles:
      obj.workspaceFiles && typeof obj.workspaceFiles === 'object' ? obj.workspaceFiles : {},
  };
}

async function loadFromDisk(): Promise<LocalStoreData> {
  if (globalState.__minimalAdeLocalStoreLoaded && globalState.__minimalAdeLocalStore) {
    return globalState.__minimalAdeLocalStore;
  }

  const candidatePaths = [getDefaultStorePath(), getFallbackStorePath()];
  for (const candidate of candidatePaths) {
    try {
      const content = await readFile(/*turbopackIgnore: true*/ candidate, 'utf8');
      const parsed = normalizeStore(JSON.parse(content));
      globalState.__minimalAdeLocalStore = parsed;
      globalState.__minimalAdeLocalStoreLoaded = true;
      globalState.__minimalAdeLocalStorePath = candidate;
      return parsed;
    } catch {
      // Try next candidate or initialize empty store below.
    }
  }

  const empty = createEmptyStore();
  globalState.__minimalAdeLocalStore = empty;
  globalState.__minimalAdeLocalStoreLoaded = true;
  globalState.__minimalAdeLocalStorePath = getDefaultStorePath();
  return empty;
}

async function persistToDisk(data: LocalStoreData): Promise<void> {
  if (globalState.__minimalAdeLocalStoreReadOnly) {
    return;
  }

  const serialized = JSON.stringify(data, null, 2);
  const targets = globalState.__minimalAdeLocalStorePath
    ? [globalState.__minimalAdeLocalStorePath, getFallbackStorePath()]
    : [getDefaultStorePath(), getFallbackStorePath()];

  for (const targetPath of new Set(targets)) {
    try {
      await mkdir(/*turbopackIgnore: true*/ path.dirname(targetPath), { recursive: true });
      const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(/*turbopackIgnore: true*/ tempPath, serialized, 'utf8');
      await rename(/*turbopackIgnore: true*/ tempPath, /*turbopackIgnore: true*/ targetPath);
      globalState.__minimalAdeLocalStorePath = targetPath;
      return;
    } catch {
      // Try fallback path; if all fail, remain in memory without crashing.
    }
  }

  globalState.__minimalAdeLocalStoreReadOnly = true;
}

/** Reads the local JSON store (used only when DATABASE_URL is absent). */
export async function readLocalStore(): Promise<LocalStoreData> {
  const previous = globalState.__minimalAdeLocalStoreQueue ?? Promise.resolve();
  await previous.catch(() => undefined);
  return loadFromDisk();
}

/** Serializes mutations to the local JSON store with atomic disk flushes. */
export async function mutateLocalStore<T>(
  mutator: (store: LocalStoreData) => T | Promise<T>,
): Promise<T> {
  const previous = globalState.__minimalAdeLocalStoreQueue ?? Promise.resolve();
  const nextOperation = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await loadFromDisk();
      const result = await mutator(store);
      await persistToDisk(store);
      return result;
    });

  globalState.__minimalAdeLocalStoreQueue = nextOperation;
  return nextOperation;
}

import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeSandboxChatAccess,
  deleteFile,
  getAllFilesRecord,
  getSandboxStatus,
  listFiles,
  normalizeChatId,
  readFile,
  writeFile,
} from '@/lib/sandbox/manager';
import type { SandboxTier } from '@/lib/types';

export const runtime = 'nodejs';

const tierSchema = z.enum(['just-bash', 'vercel-sandbox', 'remote-agent-browser']).optional();

const writeFileSchema = z.object({
  chatId: z.string().optional(),
  path: z.string().min(1).optional(),
  content: z.string().optional(),
  files: z.record(z.string(), z.string()).optional(),
  tier: tierSchema,
});

const deleteFileSchema = z.object({
  chatId: z.string().optional(),
  path: z.string().min(1, 'File path is required'),
  tier: tierSchema,
});

function parseTierParam(value: string | null): SandboxTier | undefined {
  if (value === 'just-bash' || value === 'vercel-sandbox' || value === 'remote-agent-browser') {
    return value;
  }
  return undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const requestedChatId = normalizeChatId(searchParams.get('chatId'));
    const filePath = searchParams.get('path');
    const tier = parseTierParam(searchParams.get('tier'));

    const access = await authorizeSandboxChatAccess(request, requestedChatId, 'read');
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status ?? 403 },
      );
    }
    const chatId = access.effectiveChatId ?? requestedChatId;

    if (filePath) {
      try {
        const file = await readFile(chatId, filePath, tier);
        return NextResponse.json({ ok: true, file });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'File not found';
        return NextResponse.json({ ok: false, error: message }, { status: 404 });
      }
    }

    const [files, fileMap, status] = await Promise.all([
      listFiles(chatId, tier),
      getAllFilesRecord(chatId, tier),
      getSandboxStatus(chatId),
    ]);

    return NextResponse.json({
      ok: true,
      chatId,
      tier: status.tier,
      files,
      paths: files.map((f) => f.path),
      fileMap,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workspace files';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => null);
    const parsed = writeFileSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid file write payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const requestedChatId = normalizeChatId(parsed.data.chatId);
    const tier = parsed.data.tier;

    const access = await authorizeSandboxChatAccess(request, requestedChatId, 'write');
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status ?? 403 },
      );
    }
    const chatId = access.effectiveChatId ?? requestedChatId;

    if (parsed.data.files) {
      for (const [relPath, fileContent] of Object.entries(parsed.data.files)) {
        await writeFile(chatId, relPath, fileContent, tier);
      }
      const [files, fileMap] = await Promise.all([
        listFiles(chatId, tier),
        getAllFilesRecord(chatId, tier),
      ]);
      try {
        metric('ade.sandbox.actions', 1, { action: 'sync_files', tier: tier ?? 'auto' });
      } catch {
        // No-op outside Vercel telemetry runtime.
      }
      return NextResponse.json({ ok: true, files, fileMap });
    }

    if (!parsed.data.path || typeof parsed.data.content !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Either `path` + `content` or `files` map must be provided.' },
        { status: 400 },
      );
    }

    const written = await writeFile(chatId, parsed.data.path, parsed.data.content, tier);
    const fileMap = await getAllFilesRecord(chatId, tier);

    try {
      metric('ade.sandbox.actions', 1, { action: 'write_file', tier: written.tier });
    } catch {
      // No-op outside Vercel telemetry runtime.
    }

    return NextResponse.json({
      ok: true,
      ...written,
      fileMap,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write file';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const queryPath = searchParams.get('path');
    const queryChatId = searchParams.get('chatId');
    const queryTier = parseTierParam(searchParams.get('tier'));

    let chatId = normalizeChatId(queryChatId);
    let filePath = queryPath ?? '';
    let tier = queryTier;

    if (!filePath) {
      const raw = await request.json().catch(() => null);
      const parsed = deleteFileSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: 'File `path` is required to delete.' },
          { status: 400 },
        );
      }
      chatId = normalizeChatId(parsed.data.chatId);
      filePath = parsed.data.path;
      tier = parsed.data.tier;
    }

    const access = await authorizeSandboxChatAccess(request, chatId, 'write');
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status ?? 403 },
      );
    }
    const scopedChatId = access.effectiveChatId ?? chatId;

    const result = await deleteFile(scopedChatId, filePath, tier);
    const fileMap = await getAllFilesRecord(scopedChatId, tier);

    try {
      metric('ade.sandbox.actions', 1, { action: 'delete_file', tier: result.tier });
    } catch {
      // No-op outside Vercel telemetry runtime.
    }

    return NextResponse.json({
      ok: true,
      ...result,
      fileMap,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

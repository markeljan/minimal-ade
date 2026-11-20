import { put } from '@vercel/blob';
import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import type { AttachmentItem } from '@/lib/types';
import { generateId, sanitizeFilename } from '@/lib/utils';

/** Vercel Functions request body upload limit (4.5 MB). */
const MAX_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);

function recordUploadMetric(outcome: 'blob' | 'data-url' | 'too-large' | 'invalid' | 'error') {
  try {
    metric('ade.upload.requests', 1, { outcome });
  } catch {
    // Metrics are non-fatal outside Vercel runtime.
  }
}

function inferMediaType(filename: string, rawType?: string | null): string {
  const clean = rawType?.split(';')[0]?.trim();
  if (clean && clean !== 'application/octet-stream') {
    return clean;
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    py: 'text/x-python',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    m4a: 'audio/mp4',
  };

  return (ext && byExt[ext]) || clean || 'application/octet-stream';
}

interface UploadPayload extends AttachmentItem {
  storage: 'vercel-blob' | 'data-url';
  pathname?: string;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(request.headers);
    const contentTypeHeader = request.headers.get('content-type') ?? '';

    let fileBytes: Buffer;
    let rawFilename = 'upload.bin';
    let rawMediaType: string | null = null;

    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      const entry = formData.get('file');

      if (!(entry instanceof File)) {
        recordUploadMetric('invalid');
        return NextResponse.json(
          { error: 'Expected a "file" field in multipart/form-data payload' },
          { status: 400 },
        );
      }

      if (entry.size === 0) {
        recordUploadMetric('invalid');
        return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
      }

      if (entry.size > MAX_UPLOAD_BYTES) {
        recordUploadMetric('too-large');
        return NextResponse.json(
          { error: 'File exceeds the 4.5 MB server upload limit' },
          { status: 413 },
        );
      }

      rawFilename = entry.name || rawFilename;
      rawMediaType = entry.type || null;
      fileBytes = Buffer.from(await entry.arrayBuffer());
    } else {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        recordUploadMetric('invalid');
        return NextResponse.json({ error: 'Request body is empty' }, { status: 400 });
      }
      if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
        recordUploadMetric('too-large');
        return NextResponse.json(
          { error: 'File exceeds the 4.5 MB server upload limit' },
          { status: 413 },
        );
      }
      rawFilename = request.headers.get('x-filename') ?? rawFilename;
      rawMediaType = contentTypeHeader || null;
      fileBytes = Buffer.from(arrayBuffer);
    }

    const safeName = sanitizeFilename(rawFilename);
    const mediaType = inferMediaType(safeName, rawMediaType);
    const id = generateId('att');
    const isPreviewable = mediaType.startsWith('image/');

    if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      const pathname = `uploads/${sanitizeFilename(session.userId, 48)}/${Date.now()}-${safeName}`;
      const blob = await put(pathname, fileBytes, {
        access: 'public',
        addRandomSuffix: true,
        contentType: mediaType,
      });

      recordUploadMetric('blob');

      const responsePayload: UploadPayload = {
        id,
        name: safeName,
        mediaType,
        size: fileBytes.byteLength,
        url: blob.url,
        ...(isPreviewable ? { previewUrl: blob.url } : {}),
        storage: 'vercel-blob',
        pathname: blob.pathname,
      };

      return NextResponse.json(responsePayload, { status: 201 });
    }

    const dataUrl = `data:${mediaType};base64,${fileBytes.toString('base64')}`;
    recordUploadMetric('data-url');

    const responsePayload: UploadPayload = {
      id,
      name: safeName,
      mediaType,
      size: fileBytes.byteLength,
      url: dataUrl,
      ...(isPreviewable ? { previewUrl: dataUrl } : {}),
      storage: 'data-url',
    };

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    recordUploadMetric('error');
    const message = error instanceof Error ? error.message : 'File upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

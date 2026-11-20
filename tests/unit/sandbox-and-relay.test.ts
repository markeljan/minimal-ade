import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { POST as postRelayGrant } from '@/app/api/sandbox/relay-grant/route';
import { browserOpen, mintRelayGrant, validateExternalUrl } from '@/lib/sandbox/browser-service';
import {
  createWorkspaceBashTool,
  deleteFile,
  execCommand,
  getAllFilesRecord,
  listFiles,
  normalizeWorkspacePath,
  readFile,
  registerWorkspacePersistence,
  STARTER_WORKSPACE_FILES,
  writeFile,
} from '@/lib/sandbox/manager';

const ENV_KEYS = ['SCREEN_RELAY_URL', 'SCREEN_RELAY_TOKEN', 'VERCEL'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const originalFetch = globalThis.fetch;
let savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

function setMockFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = impl as typeof fetch;
}

describe('dual-tier sandbox, SSRF protection, and screen-relay grant security', () => {
  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    registerWorkspacePersistence(null);
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>).__minimalAdeDbAdapter;

    for (const key of ENV_KEYS) {
      const prev = savedEnv[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  });

  it('seeds starter workspace files cleanly on first access', async () => {
    const chatId = `sandbox-seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const files = await listFiles(chatId, 'just-bash');
    const paths = files.map((f) => f.path).sort();
    const expectedPaths = Object.keys(STARTER_WORKSPACE_FILES).sort();

    expect(paths).toEqual(expectedPaths);

    const readme = await readFile(chatId, 'README.md', 'just-bash');
    expect(readme.tier).toBe('just-bash');
    expect(readme.language).toBe('markdown');
    expect(readme.content).toContain('Minimal ADE Workspace');

    const indexHtml = await readFile(chatId, 'index.html', 'just-bash');
    expect(indexHtml.language).toBe('html');
    expect(indexHtml.content).toContain('Minimal ADE Sandbox Ready');
  });

  it('executes Tier 1 just-bash commands and syncs created/modified/deleted file diffs', async () => {
    const chatId = `sandbox-exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Create new file via shell command
    const createRes = await execCommand(
      chatId,
      'mkdir -p out && echo "hello from just-bash" > out/result.txt && cat out/result.txt',
      { tier: 'just-bash' },
    );
    expect(createRes.exitCode).toBe(0);
    expect(createRes.tier).toBe('just-bash');
    expect(createRes.stdout.trim()).toBe('hello from just-bash');
    expect(createRes.changedFiles).toContain('out/result.txt');
    expect(createRes.deletedFiles).toEqual([]);

    // Persisted file is readable via readFile and appears in getAllFilesRecord
    const persisted = await readFile(chatId, 'out/result.txt', 'just-bash');
    expect(persisted.content.trim()).toBe('hello from just-bash');
    const allFiles = await getAllFilesRecord(chatId, 'just-bash');
    expect(allFiles['out/result.txt']?.trim()).toBe('hello from just-bash');

    // Modify existing file via shell
    const modRes = await execCommand(chatId, 'echo "v2" > out/result.txt', { tier: 'just-bash' });
    expect(modRes.exitCode).toBe(0);
    expect(modRes.changedFiles).toEqual(['out/result.txt']);

    // Delete file via shell
    const rmRes = await execCommand(chatId, 'rm out/result.txt', { tier: 'just-bash' });
    expect(rmRes.exitCode).toBe(0);
    expect(rmRes.deletedFiles).toEqual(['out/result.txt']);
    await expect(readFile(chatId, 'out/result.txt', 'just-bash')).rejects.toThrow();

    // Direct writeFile / deleteFile + path traversal protection
    const written = await writeFile(
      chatId,
      'src/calc.ts',
      'export const add = (a: number, b: number) => a + b;',
    );
    expect(written.language).toBe('typescript');
    const removed = await deleteFile(chatId, 'src/calc.ts');
    expect(removed.deleted).toBe(true);
    expect(() => normalizeWorkspacePath('../etc/passwd')).toThrow();
    expect(() => normalizeWorkspacePath('/workspace/../secret')).toThrow();

    // AI SDK 7 bash-tool factory executes and persists writes
    const toolkit = await createWorkspaceBashTool(chatId, 'just-bash');
    expect(toolkit.tier).toBe('just-bash');
    const toolExec = await toolkit.sandbox.executeCommand('echo "toolkit-ok" > toolkit.txt');
    expect(toolExec.exitCode).toBe(0);
    const readViaToolkit = await toolkit.sandbox.readFile('toolkit.txt');
    expect(readViaToolkit.trim()).toBe('toolkit-ok');
  });

  it('blocks SSRF URLs (169.254.169.254, private networks, file://, javascript:, and loopback in prod)', async () => {
    const chatId = `ssrf-test-${Date.now()}`;

    // Always-blocked schemes and private/metadata hosts
    const alwaysBlocked = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://10.0.0.1/secret',
      'http://192.168.1.1/router',
      'http://172.16.0.5/internal',
      'http://100.64.0.1/cgnat',
      'http://[::ffff:169.254.169.254]/latest/meta-data/',
      'http://0.0.0.0:8080/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ftp://example.com/file',
    ];

    for (const dangerousUrl of alwaysBlocked) {
      expect(() => validateExternalUrl(dangerousUrl)).toThrow();
      const openRes = await browserOpen(chatId, dangerousUrl);
      expect(openRes.ok).toBe(false);
      expect(openRes.error).toBeDefined();
    }

    // Loopback (127.0.0.1, localhost, ::1) MUST be blocked in production / Vercel deployments
    process.env.VERCEL = '1';
    for (const loopbackUrl of [
      'http://127.0.0.1:8080/grants/control',
      'http://127.0.0.1/admin',
      'http://localhost:3000/api/provider/status',
      'http://[::1]:8080/',
    ]) {
      expect(() => validateExternalUrl(loopbackUrl)).toThrow();
      const openRes = await browserOpen(chatId, loopbackUrl);
      expect(openRes.ok).toBe(false);
      expect(openRes.error).toContain('restricted');
    }

    // Public HTTPS URLs (including fc*/fd* domains) validate cleanly without false positives
    expect(validateExternalUrl('https://vercel.com/docs').hostname).toBe('vercel.com');
    expect(validateExternalUrl('https://fcdn.com/assets').hostname).toBe('fcdn.com');
    expect(validateExternalUrl('https://fdic.gov/').hostname).toBe('fdic.gov');

    // Workspace preview URL opens cleanly in Mode A without network calls
    const preview = await browserOpen(chatId, 'workspace://index.html');
    expect(preview.ok).toBe(true);
    expect(preview.mode).toBe('preview');
    expect(preview.backend).toBe('workspace-preview');
    expect(preview.htmlPreview).toContain('Minimal ADE Sandbox Ready');
  });

  it('STRICT SECURITY: mintRelayGrant and /api/sandbox/relay-grant NEVER expose raw SCREEN_RELAY_TOKEN', async () => {
    const rawSessionToken = 'deadbeef'.repeat(8); // 64-hex raw session secret
    const scopedWatchGrant = 'scoped_watch_grant_token_safe_12345';
    const scopedControlGrant = 'scoped_control_grant_token_safe_67890';

    process.env.SCREEN_RELAY_URL = 'https://relay.sandbox.test';
    process.env.SCREEN_RELAY_TOKEN = rawSessionToken;

    let capturedAuth = '';
    let capturedUrl = '';

    // 1. Happy path: watch role mints scoped token and sends Bearer auth server-side only
    setMockFetch(async (input, init) => {
      capturedUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      capturedAuth = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(
        JSON.stringify({
          token: capturedUrl.includes('/grants/control') ? scopedControlGrant : scopedWatchGrant,
          ttl: 300,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const watchGrant = await mintRelayGrant('relay-sec-chat', 'watch', 300);
    expect(capturedUrl).toBe('https://relay.sandbox.test/grants/watch?ttl=300');
    expect(capturedAuth).toBe(`Bearer ${rawSessionToken}`);
    expect(watchGrant.ok).toBe(true);
    expect(watchGrant.grantToken).toBe(scopedWatchGrant);
    expect(watchGrant.wsUrl).toBe('wss://relay.sandbox.test/stream?view=1');
    expect(JSON.stringify(watchGrant)).not.toContain(rawSessionToken);

    // 2. Control role via HTTP route /api/sandbox/relay-grant
    const routeRes = await postRelayGrant(
      new Request('http://localhost:3000/api/sandbox/relay-grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: 'relay-sec-chat', role: 'control', ttlSec: 120 }),
      }),
    );
    expect(routeRes.status).toBe(200);
    const routeBodyText = await routeRes.text();
    expect(routeBodyText).not.toContain(rawSessionToken);
    const routeJson = JSON.parse(routeBodyText) as {
      ok: boolean;
      grantToken: string;
      wsUrl: string;
      role: string;
    };
    expect(routeJson.ok).toBe(true);
    expect(routeJson.role).toBe('control');
    expect(routeJson.grantToken).toBe(scopedControlGrant);
    expect(routeJson.wsUrl).toBe('wss://relay.sandbox.test/stream?take=1');

    // 3. Adversarial case: if upstream relay mistakenly echoes raw session token, mintRelayGrant MUST reject it!
    setMockFetch(async () => {
      return new Response(JSON.stringify({ token: rawSessionToken, ttl: 300 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const echoedGrant = await mintRelayGrant('relay-sec-chat', 'watch', 300);
    expect(echoedGrant.ok).toBe(false);
    expect(echoedGrant.grantToken).toBeUndefined();
    expect(JSON.stringify(echoedGrant)).not.toContain(rawSessionToken);

    const echoedRouteRes = await postRelayGrant(
      new Request('http://localhost:3000/api/sandbox/relay-grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: 'relay-sec-chat', role: 'watch' }),
      }),
    );
    const echoedRouteText = await echoedRouteRes.text();
    expect(echoedRouteText).not.toContain(rawSessionToken);
    expect((JSON.parse(echoedRouteText) as { ok: boolean }).ok).toBe(false);

    // 4. Failure path: relay HTTP 500 error never leaks raw session token
    setMockFetch(async () => new Response('Internal error', { status: 500 }));
    const errRes = await postRelayGrant(
      new Request('http://localhost:3000/api/sandbox/relay-grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: 'relay-sec-chat', role: 'watch' }),
      }),
    );
    const errText = await errRes.text();
    expect(errText).not.toContain(rawSessionToken);
    expect((JSON.parse(errText) as { ok: boolean }).ok).toBe(false);
  });
});

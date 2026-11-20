import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  fluid: true,
  // Optional: enable Vercel's Bun runtime (Beta).
  // Valid values are '1.4.x' or '1.x'. If enabled, update package.json scripts
  // to run Next.js with `--bun` (`bun run --bun next build`) and ensure
  // middleware/proxy uses Node.js runtime. Node 22+ Fluid Compute is the default.
  // bunVersion: '1.4.x',
  functions: {
    'app/api/libfx/route.ts': {
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: '__libfx_wkf_workflow_session',
          retryAfterSeconds: 5,
        },
      ],
    },
  },
};

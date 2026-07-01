import { describe, expect, it } from 'vitest';

import { copiesManifest, copiesSource, findUncopiedDeps } from './deploy-readiness-check.mjs';

const GOOD = `FROM node:20-alpine
COPY package.json pnpm-lock.yaml ./
COPY services/orchestrator/package.json services/orchestrator/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/sandbox/package.json packages/sandbox/package.json
RUN pnpm install --frozen-lockfile --filter @praxis/orchestrator...
COPY services/orchestrator ./services/orchestrator
COPY packages/db ./packages/db
COPY packages/sandbox ./packages/sandbox
CMD ["bun","run","src/index.ts"]
`;

// The exact bug STORY-07 shipped: dep added, Dockerfile not updated.
const MISSING_SANDBOX = GOOD.replace(
  'COPY packages/sandbox/package.json packages/sandbox/package.json\n',
  '',
).replace('COPY packages/sandbox ./packages/sandbox\n', '');

describe('copiesManifest / copiesSource', () => {
  it('detects a copied manifest and source', () => {
    expect(copiesManifest(GOOD, 'packages/sandbox')).toBe(true);
    expect(copiesSource(GOOD, 'packages/sandbox')).toBe(true);
  });

  it('does not mistake the manifest line for a source copy', () => {
    const manifestOnly = 'COPY packages/sandbox/package.json packages/sandbox/package.json\n';
    expect(copiesManifest(manifestOnly, 'packages/sandbox')).toBe(true);
    expect(copiesSource(manifestOnly, 'packages/sandbox')).toBe(false);
  });
});

describe('findUncopiedDeps', () => {
  const deps = [
    { name: '@praxis/db', path: 'packages/db' },
    { name: '@praxis/sandbox', path: 'packages/sandbox' },
  ];

  it('returns nothing when all deps are fully copied', () => {
    expect(findUncopiedDeps(GOOD, deps)).toEqual([]);
  });

  it('flags a workspace dep the Dockerfile never copies (the STORY-07 bug)', () => {
    const missing = findUncopiedDeps(MISSING_SANDBOX, deps);
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe('@praxis/sandbox');
    expect(missing[0].manifest).toBe(false);
    expect(missing[0].source).toBe(false);
  });

  it('flags a dep whose manifest is copied but source is missing', () => {
    const sourceMissing = GOOD.replace('COPY packages/sandbox ./packages/sandbox\n', '');
    const missing = findUncopiedDeps(sourceMissing, deps);
    expect(missing).toHaveLength(1);
    expect(missing[0].manifest).toBe(true);
    expect(missing[0].source).toBe(false);
  });
});

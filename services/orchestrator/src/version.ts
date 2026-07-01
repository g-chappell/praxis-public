// Version metadata surfaced by /health. `version` is the workspace's
// semver pin from package.json (static, baked into the image).
// `gitSha` is set by the Dockerfile at build time via a build arg, and
// passed in by the deploy workflow as ${{ github.sha }}.

import pkg from '../package.json' with { type: 'json' };

export const VERSION: string = pkg.version;
export const GIT_SHA: string = process.env.GIT_SHA ?? 'dev';

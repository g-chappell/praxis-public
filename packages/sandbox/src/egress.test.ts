import { describe, expect, it } from 'vitest';

import { buildEgressEnv } from './docker-sandbox.js';

describe('buildEgressEnv', () => {
  it('sets upper- and lower-case proxy vars with loopback always bypassed', () => {
    const env = buildEgressEnv({ proxyUrl: 'http://praxis-egress:3128' });
    expect(env).toContain('HTTP_PROXY=http://praxis-egress:3128');
    expect(env).toContain('HTTPS_PROXY=http://praxis-egress:3128');
    expect(env).toContain('http_proxy=http://praxis-egress:3128');
    expect(env).toContain('https_proxy=http://praxis-egress:3128');
    expect(env).toContain('NO_PROXY=localhost,127.0.0.1,::1');
    expect(env).toContain('no_proxy=localhost,127.0.0.1,::1');
  });

  it('appends extra noProxy hosts after the loopback defaults', () => {
    const env = buildEgressEnv({
      proxyUrl: 'http://p:3128',
      noProxy: 'praxis-orchestrator,10.0.0.0/8',
    });
    expect(env).toContain('NO_PROXY=localhost,127.0.0.1,::1,praxis-orchestrator,10.0.0.0/8');
  });
});

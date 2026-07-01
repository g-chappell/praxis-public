// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type LearningLink,
  LearningLinksList,
  LearningPanel,
  groupByTopic,
} from './learning-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const links: LearningLink[] = [
  {
    id: 'l1',
    title: 'Agent Client Protocol',
    url: 'https://acp.example/intro',
    topic: 'ACP',
    source: 'ACP',
  },
  {
    id: 'l2',
    title: 'MCP introduction',
    url: 'https://mcp.example/intro',
    topic: 'MCP',
    source: 'Anthropic',
  },
  {
    id: 'l3',
    title: 'MCP servers',
    url: 'https://mcp.example/servers',
    topic: 'MCP',
    source: null,
  },
  {
    id: 'l4',
    title: 'three.js docs',
    url: 'https://threejs.example/docs',
    topic: 'Three.js',
    source: 'three.js',
  },
];

describe('groupByTopic', () => {
  it('groups links under their topic, preserving order', () => {
    const groups = groupByTopic(links);
    expect(groups.map(([topic]) => topic)).toEqual(['ACP', 'MCP', 'Three.js']);
    expect(groups.find(([t]) => t === 'MCP')?.[1]).toHaveLength(2);
  });
});

describe('LearningLinksList', () => {
  it('renders links grouped by topic, each opening in a new tab', () => {
    const { asFragment, getByText, getAllByRole } = render(<LearningLinksList links={links} />);

    // Topic headers present.
    expect(getByText('ACP')).toBeTruthy();
    expect(getByText('MCP')).toBeTruthy();
    expect(getByText('Three.js')).toBeTruthy();

    // Every card is an external link opening in a new tab safely.
    const anchors = getAllByRole('link') as HTMLAnchorElement[];
    expect(anchors).toHaveLength(links.length);
    for (const a of anchors) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
    }

    expect(asFragment()).toMatchSnapshot();
  });

  it('shows an empty state when there are no links', () => {
    const { getByText } = render(<LearningLinksList links={[]} />);
    expect(getByText('No learning links yet.')).toBeTruthy();
  });
});

describe('LearningPanel', () => {
  it('fetches and renders grouped links when expanded', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ links }), { status: 200 }));

    const { getByRole, getByText, queryByText } = render(<LearningPanel />);

    // Collapsed by default — no fetch, no content yet.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryByText('three.js docs')).toBeNull();

    fireEvent.click(getByRole('button', { name: /learn/i }));

    await waitFor(() => expect(getByText('three.js docs')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/learning-links');
    expect(getByText('ACP')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type ChatMessage, ChatTranscript, initials } from './chat-message';

const graham = { name: 'Graham Chappell', image: null };
const ada = { name: 'Ada Lovelace', image: 'https://example.com/ada.png' };

// One message of each kind (TASK-032 acceptance #1), attributed to the prompting
// user — including an author with an avatar image and one with initials.
const messages: ChatMessage[] = [
  { id: 'm1', kind: 'user', author: graham, text: 'build me a rotating cube' },
  { id: 'm2', kind: 'text', author: graham, text: 'Sure — creating the scene.' },
  { id: 'm3', kind: 'tool_call', author: graham, title: 'Write(src/scene.tsx)' },
  { id: 'm4', kind: 'file_change', author: graham, change: 'create', path: 'src/scene.tsx' },
  { id: 'm5', kind: 'error', author: ada, text: 'Tool failed: timeout' },
];

describe('initials', () => {
  it('derives up to two uppercase initials, falling back to the email local-part', () => {
    expect(initials('Graham Chappell')).toBe('GC');
    expect(initials('ada@example.com')).toBe('AD');
    expect(initials('mononym')).toBe('MO');
  });
});

describe('ChatTranscript', () => {
  it('renders each message kind with per-user attribution', () => {
    const { asFragment, getByText, getAllByText } = render(<ChatTranscript messages={messages} />);

    // User prompts name the prompting user; agent kinds read as "Assistant" while
    // still naming who prompted ("· for <name>").
    expect(getByText('Graham Chappell')).toBeTruthy();
    expect(getAllByText('Assistant').length).toBe(4);
    expect(getByText('· for Ada Lovelace')).toBeTruthy();

    // Each kind's body rendered.
    expect(getByText('build me a rotating cube')).toBeTruthy();
    expect(getByText('Sure — creating the scene.')).toBeTruthy();
    expect(getByText('Write(src/scene.tsx)')).toBeTruthy();
    expect(getByText('src/scene.tsx')).toBeTruthy();
    expect(getByText('Tool failed: timeout')).toBeTruthy();

    // file_change renders the friendly verb for a 'create'.
    expect(getByText(/wrote/)).toBeTruthy();

    expect(asFragment()).toMatchSnapshot();
  });
});

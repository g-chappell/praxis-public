import Link from 'next/link';

import { Button } from '@/components/ui/button';

const STEPS = [
  {
    n: 'I',
    title: 'Pick a template',
    body: 'Start from a React + Three.js scene — or a blank page and build up from nothing.',
  },
  {
    n: 'II',
    title: 'Prompt the agent',
    body: 'Describe what you want in plain language. The agent writes the code for you.',
  },
  {
    n: 'III',
    title: 'Watch it build',
    body: 'Files, a live preview, and a git history appear turn by turn as it works.',
  },
  {
    n: 'IV',
    title: 'Keep what you made',
    body: 'End with a working app and a full record — every change committed — of how it was built.',
  },
];

const CAPABILITIES = [
  {
    title: 'Chat-driven coding',
    body: 'Describe features and fixes in plain English; the agent edits the code, runs commands, and installs packages inside the sandbox.',
  },
  {
    title: 'Live preview',
    body: 'See the running app the whole time. Edits hot-reload instantly — no build step to babysit.',
  },
  {
    title: 'Real git history',
    body: 'Every agent turn is a commit. Browse the diff, understand how it was built, and revert anything from the git panel.',
  },
  {
    title: 'Edit alongside it',
    body: 'A full Monaco editor and file tree sit next to the chat — jump in and change a line yourself whenever you want.',
  },
  {
    title: 'Sandboxed & local',
    body: 'Each project runs in its own Docker container on your machine. Nothing to install per-project; your projects never leave your laptop.',
  },
  {
    title: 'Your key, your data',
    body: 'Runs on your own Anthropic API key. No accounts, no sign-up, no cloud — the only thing that leaves your machine is the model call.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b-2 px-6 py-4">
        <span className="text-2xl font-semibold tracking-tight">Praxis</span>
        <nav className="flex items-center gap-6">
          <span className="hidden gap-6 sm:flex">
            <Link
              href="#capabilities"
              className="label-mono transition-colors hover:text-foreground"
            >
              What you can build
            </Link>
            <Link href="#how" className="label-mono transition-colors hover:text-foreground">
              How it works
            </Link>
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Open the workspace</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="paper-ruled max-w-3xl">
          <span className="label-mono text-stamp">Local · single-user · your API key</span>
          <h1 className="mt-4 text-6xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
            Build web apps by talking to an AI agent.
          </h1>
          <p className="mt-6 max-w-xl text-xl italic leading-relaxed text-muted-foreground">
            Pick a template, describe what you want, and watch it come to life in a live preview —
            every change committed to git. It runs entirely on your machine.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild variant="stamp" size="lg">
              <Link href="/dashboard">Open the workspace</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-t-2 bg-muted">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="label-mono mb-8">What you can build with</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="border-2 bg-card p-5 shadow-hard-sm">
                <h3 className="text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-t-2">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="label-mono mb-8">How it works</h2>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="font-mono text-3xl font-bold text-stamp">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t-2 bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Ready to make something?</h2>
            <p className="mt-2 italic text-background/80">
              Your projects live on this machine. Jump in and start building.
            </p>
          </div>
          <Button asChild variant="stamp" size="lg">
            <Link href="/dashboard">Open the workspace</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

import Link from 'next/link';

import { Button } from '@/components/ui/button';

const STEPS = [
  {
    n: 'I',
    title: 'Pick a template',
    body: 'Start from a web game, a dashboard, a 3D scene, or a blank page.',
  },
  {
    n: 'II',
    title: 'Prompt together',
    body: 'You and a partner talk to the assistant in one shared room.',
  },
  {
    n: 'III',
    title: 'Watch it build',
    body: 'Files, a live preview, and a git history appear as you go.',
  },
  {
    n: 'IV',
    title: 'Keep what you made',
    body: 'End with a working app at a live URL and a record of how you built it.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b-2 px-6 py-4">
        <span className="text-2xl font-semibold tracking-tight">Praxis</span>
        <nav className="flex items-center gap-6">
          <span className="hidden gap-6 sm:flex">
            <span className="label-mono">How it works</span>
            <span className="label-mono">Templates</span>
            <span className="label-mono">Pricing</span>
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </nav>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <section className="paper-ruled flex flex-col justify-center">
          <h1 className="text-7xl font-semibold leading-[0.95] tracking-tight sm:text-8xl">
            Praxis
          </h1>
          <p className="mt-6 max-w-md text-xl italic leading-relaxed text-muted-foreground">
            A place where two people build, deploy, and learn together — with an AI assistant doing
            the typing.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild variant="stamp" size="lg">
              <Link href="/signin">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#how">How it works</Link>
            </Button>
          </div>
        </section>

        <section id="how" className="flex flex-col justify-center">
          <h2 className="label-mono mb-6">How it works</h2>
          <ol className="space-y-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="font-mono text-2xl font-bold text-stamp">{s.n}</span>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

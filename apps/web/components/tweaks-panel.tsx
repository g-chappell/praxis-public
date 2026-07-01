'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  applyTweaks,
  DEFAULT_TWEAKS,
  loadTweaks,
  saveTweaks,
  TYPEFACES,
  type Tweaks,
} from '@/lib/tweaks';
import { cn } from '@/lib/utils';

// Live theme knobs (accent / border / shadow / typeface / density). Writes CSS
// custom properties on <html> and persists to localStorage; TWEAKS_INIT_SCRIPT
// re-applies them before paint on the next load. Defaults match the design tokens
// so an untouched panel changes nothing.
export function TweaksPanel() {
  const [open, setOpen] = React.useState(false);
  const [tweaks, setTweaks] = React.useState<Tweaks>(DEFAULT_TWEAKS);
  const ref = React.useRef<HTMLDivElement>(null);

  // Hydrate from storage after mount (SSR can't read localStorage).
  React.useEffect(() => setTweaks(loadTweaks()), []);

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function update(patch: Partial<Tweaks>) {
    setTweaks((prev) => {
      const next = { ...prev, ...patch };
      applyTweaks(document.documentElement, next);
      saveTweaks(next);
      return next;
    });
  }

  function reset() {
    applyTweaks(document.documentElement, DEFAULT_TWEAKS);
    saveTweaks(DEFAULT_TWEAKS);
    setTweaks(DEFAULT_TWEAKS);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Theme tweaks"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center border-2 bg-background text-foreground shadow-hard-sm transition-transform hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      </button>

      {open && (
        <Card className="absolute right-0 top-full z-50 mt-2 w-72 p-4 text-left">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-mono">Tweaks</span>
            <button type="button" onClick={reset} className="label-mono hover:text-foreground">
              Reset
            </button>
          </div>

          <div className="space-y-4">
            <Row label="Accent">
              <input
                type="color"
                aria-label="Accent colour"
                value={tweaks.accent}
                onChange={(e) => update({ accent: e.target.value })}
                className="h-7 w-12 cursor-pointer border-2 bg-transparent p-0"
              />
            </Row>

            <Slider
              label="Border"
              value={tweaks.borderWeight}
              min={0}
              max={5}
              suffix="px"
              onChange={(v) => update({ borderWeight: v })}
            />

            <Slider
              label="Shadow"
              value={tweaks.shadowDepth}
              min={0}
              max={10}
              suffix="px"
              onChange={(v) => update({ shadowDepth: v })}
            />

            <Row label="Typeface">
              <select
                aria-label="Typeface"
                value={tweaks.typeface}
                onChange={(e) => update({ typeface: e.target.value })}
                className="border-2 bg-field px-2 py-1 text-xs"
              >
                {TYPEFACES.map((t) => (
                  <option key={t.label} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Density">
              <div className="flex gap-1">
                {(['cozy', 'compact'] as const).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={tweaks.density === d ? 'default' : 'secondary'}
                    onClick={() => update({ density: d })}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </Row>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-mono">{label}</span>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className={cn('font-mono text-xs')}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--stamp))]"
      />
    </div>
  );
}

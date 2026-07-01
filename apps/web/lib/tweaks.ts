// App-native "tweaks" — live theme knobs the user can adjust (accent colour,
// border weight, shadow depth, typeface, density). Each maps onto a CSS custom
// property (or the data-density attribute) on <html>, so the whole brutalist
// system re-skins live. Persisted in localStorage and re-applied before paint by
// TWEAKS_INIT_SCRIPT (see app/layout.tsx) to avoid a flash of default theme.

export const TWEAKS_STORAGE_KEY = 'praxis-tweaks';

export type Density = 'cozy' | 'compact';

export interface Tweaks {
  /** oxblood accent as #rrggbb */
  accent: string;
  /** border weight in px */
  borderWeight: number;
  /** hard-shadow offset in px */
  shadowDepth: number;
  /** body/display font-family stack */
  typeface: string;
  density: Density;
}

export const TYPEFACES: { label: string; value: string }[] = [
  { label: 'Newsreader', value: 'var(--font-newsreader), Georgia, serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'System sans', value: 'ui-sans-serif, system-ui, sans-serif' },
];

export const DEFAULT_TWEAKS: Tweaks = {
  accent: '#97331f',
  borderWeight: 2,
  shadowDepth: 4,
  typeface: 'var(--font-newsreader), Georgia, serif',
  density: 'cozy',
};

/** Convert #rrggbb → an HSL triplet string "H S% L%" for use in hsl(var(...)). */
export function hexToHslTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return '10 66% 36%';
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTweaks(root: HTMLElement, t: Tweaks): void {
  const accent = hexToHslTriplet(t.accent);
  root.style.setProperty('--stamp', accent);
  root.style.setProperty('--destructive', accent);
  root.style.setProperty('--ring', accent);
  root.style.setProperty('--bw', `${t.borderWeight}px`);
  root.style.setProperty('--sh', `${t.shadowDepth}px`);
  root.style.setProperty('--font-serif', t.typeface);
  root.setAttribute('data-density', t.density);
}

export function loadTweaks(): Tweaks {
  if (typeof window === 'undefined') return DEFAULT_TWEAKS;
  try {
    const raw = window.localStorage.getItem(TWEAKS_STORAGE_KEY);
    if (!raw) return DEFAULT_TWEAKS;
    return { ...DEFAULT_TWEAKS, ...(JSON.parse(raw) as Partial<Tweaks>) };
  } catch {
    return DEFAULT_TWEAKS;
  }
}

export function saveTweaks(t: Tweaks): void {
  try {
    window.localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(t));
  } catch {
    /* ignore quota / disabled storage */
  }
}

// Runs before first paint (inlined in <head>) so saved tweaks apply with no flash.
export const TWEAKS_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${TWEAKS_STORAGE_KEY}');if(!raw)return;var t=JSON.parse(raw);var r=document.documentElement;function hsl(hex){var m=/^#?([0-9a-f]{6})$/i.exec((hex||'').trim());if(!m)return null;var i=parseInt(m[1],16),R=((i>>16)&255)/255,G=((i>>8)&255)/255,B=(i&255)/255,mx=Math.max(R,G,B),mn=Math.min(R,G,B),l=(mx+mn)/2,h=0,s=0;if(mx!==mn){var d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===R)h=(G-B)/d+(G<B?6:0);else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h/=6;}return Math.round(h*360)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';}if(t.accent){var a=hsl(t.accent);if(a){r.style.setProperty('--stamp',a);r.style.setProperty('--destructive',a);r.style.setProperty('--ring',a);}}if(t.borderWeight!=null)r.style.setProperty('--bw',t.borderWeight+'px');if(t.shadowDepth!=null)r.style.setProperty('--sh',t.shadowDepth+'px');if(t.typeface)r.style.setProperty('--font-serif',t.typeface);if(t.density)r.setAttribute('data-density',t.density);}catch(e){}})();`;

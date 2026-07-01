/* AUTO-GENERATED bundle */

/* ===== pxs-kit.jsx ===== */
/* pxs-kit.jsx — shared Neo-Brutalist × Academia primitives.
   Exports to window so each section script can use them as globals.
   Loaded AFTER design-canvas.jsx, BEFORE the section files. */

// ---- tiny geometric icon set (only squares / lines / chevrons / dots) ----
function Ico({ d, size = 14, sw = 2, fill = 'none', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={fill}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter"
      style={{ flex: '0 0 auto', ...style }}>{d}</svg>
  );
}
const I = {
  chevR: <Ico d={<path d="M6 3l5 5-5 5" />} />,
  chevD: <Ico d={<path d="M3 6l5 5 5-5" />} />,
  plus: <Ico d={<g><path d="M8 3v10M3 8h10" /></g>} />,
  file: <Ico d={<path d="M4 2h5l3 3v9H4z" />} />,
  folder: <Ico d={<path d="M2 4h4l1.5 2H14v8H2z" />} />,
  dot: <Ico size={10} d={<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />} />,
  play: <Ico d={<path d="M4 3l9 5-9 5z" />} fill="currentColor" />,
  pen: <Ico d={<g><path d="M3 13l1-3 7-7 2 2-7 7z" /><path d="M10 3l3 3" /></g>} />,
  book: <Ico d={<g><path d="M8 3C6 2 3 2 2 3v10c1-1 4-1 6 0 2-1 5-1 6 0V3c-1-1-4-1-6 0z" /><path d="M8 3v10" /></g>} />,
  arrowR: <Ico d={<path d="M2 8h11M9 4l4 4-4 4" />} />,
  x: <Ico d={<path d="M4 4l8 8M12 4l-8 8" />} />,
  check: <Ico d={<path d="M3 8l3 3 7-8" />} />,
  bolt: <Ico d={<path d="M9 2L4 9h3l-1 5 6-8H9z" />} fill="currentColor" />,
};

function Label({ children, style }) {
  return <div className="pxs-label" style={style}>{children}</div>;
}
function Mono({ children, style, className = '' }) {
  return <span className={'pxs-mono ' + className} style={style}>{children}</span>;
}
function CallNo({ children, style }) {
  return <span className="pxs-callno" style={style}>{children}</span>;
}
function Stamp({ children, solid, rot, style }) {
  return (
    <span className={'pxs-stamp' + (solid ? ' pxs-stamp--solid' : '') + (rot ? ' pxs-stamp--rot' : '')} style={style}>
      {children}
    </span>
  );
}
function Chip({ children, ink, style }) {
  return <span className={'pxs-chip' + (ink ? ' pxs-chip--ink' : '')} style={style}>{children}</span>;
}
function Btn({ children, variant, sm, icon, style }) {
  const v = variant ? ' pxs-btn--' + variant : '';
  return (
    <span className={'pxs-btn' + v + (sm ? ' pxs-btn--sm' : '')} style={style}>
      {icon}{children}
    </span>
  );
}
function Av({ initials, kind, style }) {
  const k = kind ? ' pxs-mono-av--' + kind : '';
  return <span className={'pxs-mono-av' + k} style={style}>{initials}</span>;
}
function Ph({ label, style }) {
  return <div className="pxs-ph" style={style}>{label && <span>{label}</span>}</div>;
}
function Fn({ n }) {
  return <sup className="pxs-fn">{n}</sup>;
}
function Margin({ children, style }) {
  return <div className="pxs-margin" style={style}>{children}</div>;
}

Object.assign(window, { Ico, I, Label, Mono, CallNo, Stamp, Chip, Btn, Av, Ph, Fn, Margin });


/* ===== sections/foundations.jsx ===== */
/* sections/foundations.jsx — colophon + design foundations */

window.FoundationsSections = function FoundationsSections() {
  const sw = (name, val, hex) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 30, height: 30, background: val, border: '2px solid var(--rule)', flex: '0 0 auto' }} />
      <div style={{ minWidth: 0 }}>
        <div className="pxs-mono" style={{ fontSize: 11, fontWeight: 700 }}>{name}</div>
        <div className="pxs-callno" style={{ fontSize: 10 }}>{hex}</div>
      </div>
    </div>
  );

  return (
    <>
      {/* ─────────────── COLOPHON ─────────────── */}
      <DCSection id="colophon" title="00 · Overview" subtitle="The idea, and the pieces every screen is built from.">
        <DCArtboard id="masthead" label="Overview" width={1180} height={600}>
          <div className="pxs pxs-ruled" style={{ height: '100%', padding: '0', display: 'flex' }}>
            {/* left ledger column */}
            <div style={{ flex: '0 0 460px', borderRight: '2px solid var(--rule)', padding: '40px 38px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Label>Praxis · Redesign</Label>
                <Stamp rot solid>2026</Stamp>
              </div>
              <div className="pxs-display" style={{ fontSize: 116, marginTop: 26, letterSpacing: '-0.04em' }}>Praxis</div>
              <div style={{ fontStyle: 'italic', fontSize: 21, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.25 }}>
                build something together — no code required.
              </div>
              <div style={{ height: 2, background: 'var(--rule)', margin: '24px 0' }} />
              <p style={{ fontSize: 16.5, lineHeight: 1.55, margin: 0 }}>
                A shared workspace where <strong>two people</strong> and an AI
                assistant build working software together. You see everything
                that's asked and everything that changes — no need to be a developer.
              </p>
              <div style={{ flex: 1 }} />
              <div style={{ borderTop: '1px solid color-mix(in oklab,var(--ink) 28%,transparent)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <Margin style={{ maxWidth: 280 }}>
                  Made for pairs — two people building side by side.
                </Margin>
                <CallNo>Praxis · 2026</CallNo>
              </div>
            </div>

            {/* right — the system rules as numbered proceedings */}
            <div style={{ flex: 1, padding: '40px 40px', display: 'flex', flexDirection: 'column' }}>
              <Label style={{ marginBottom: 18 }}>Design principles</Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                {[
                  ['1', 'Clear and structured', 'A calm serif on a bold frame: thick rules, square corners, hard drop-shadows.'],
                  ['2', 'Ink on paper', 'Warm paper, near-black ink. A dark mode flips it. Kept to one color family on purpose.'],
                  ['3', 'One accent color', 'A single deep red, used only to highlight what matters — never just for decoration.'],
                  ['4', 'Two typefaces', 'Newsreader for reading and headlines; Space Mono for labels and code.'],
                  ['5', 'Plain language', 'Simple, familiar words everywhere — so it\u2019s obvious what everything does.'],
                ].map(([s, t, d], i) => (
                  <div key={s} style={{
                    padding: '16px 18px',
                    borderTop: '2px solid var(--rule)',
                    borderLeft: i % 2 === 1 ? '2px solid var(--rule)' : 'none',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>
                      <span className="pxs-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--stamp)', marginRight: 7 }}>{s}</span>
                      {t}
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)', margin: '7px 0 0' }}>{d}</p>
                  </div>
                ))}
                <div style={{ padding: '16px 18px', borderTop: '2px solid var(--rule)', borderLeft: '2px solid var(--rule)', display: 'flex', alignItems: 'center' }}>
                  <Margin>Drag any frame to reorder · click ⤢ to open it full-screen · everything here is a toggle in the build.</Margin>
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <Btn variant="primary" icon={I.pen}>Open a project</Btn>
                <Btn icon={I.book}>See all projects</Btn>
              </div>
            </div>
          </div>
        </DCArtboard>
      </DCSection>

      {/* ─────────────── FOUNDATIONS ─────────────── */}
      <DCSection id="foundations" title="01 · Foundations" subtitle="Type, color, structure, and controls — the parts every screen is built from.">
        {/* TYPE */}
        <DCArtboard id="type" label="Typography" width={440} height={510}>
          <div className="pxs" style={{ height: '100%', padding: '30px 30px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>Two typefaces</Label>
              <CallNo>A a</CallNo>
            </div>
            <div className="pxs-display" style={{ fontSize: 64, marginTop: 14 }}>Newsreader</div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 2 }} className="pxs-mono">SERIF · DISPLAY + READING</div>
            <div style={{ fontStyle: 'italic', fontSize: 22, marginTop: 16 }}>Build something together,</div>
            <div style={{ fontSize: 22, lineHeight: 1.4 }}>set in a clear, readable serif.</div>
            <div style={{ height: 2, background: 'var(--rule)', margin: '20px 0' }} />
            <div className="pxs-mono" style={{ fontSize: 30, fontWeight: 700 }}>Space Mono</div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 4 }} className="pxs-mono">MONO · LABELS · CODE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <Label>Section Label</Label>
            </div>
            <div style={{ marginTop: 8 }}><CallNo>PROJECT #4 · v0.3 · 14:22</CallNo></div>
            <Margin style={{ marginTop: 14 }}>The serif italic is a quiet second voice — for notes and asides.</Margin>
          </div>
        </DCArtboard>

        {/* PALETTE LIGHT */}
        <DCArtboard id="pal-light" label="Palette · Parchment" width={300} height={470}>
          <div className="pxs" style={{ height: '100%', padding: '30px 26px', boxSizing: 'border-box' }}>
            <Label>Light · Parchment</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              {sw('Paper', '#f1e8d2', 'F1E8D2')}
              {sw('Leaf', '#e8dcc0', 'E8DCC0')}
              {sw('Ink', '#1d1810', '1D1810')}
              {sw('Ink 2', '#4a4234', '4A4234')}
              {sw('Muted', '#7c715b', '7C715B')}
              {sw('Oxblood', '#97331f', '97331F')}
            </div>
            <div style={{ height: 2, background: 'var(--rule)', margin: '20px 0 16px' }} />
            <Margin>One accent only — a deep red, used to highlight, never to fill.</Margin>
          </div>
        </DCArtboard>

        {/* PALETTE DARK */}
        <DCArtboard id="pal-dark" label="Palette · Chalkboard" width={300} height={470}>
          <div className="pxs dark" style={{ height: '100%', padding: '30px 26px', boxSizing: 'border-box' }}>
            <Label>Dark · Chalkboard</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              {sw('Board', '#181b16', '181B16')}
              {sw('Slate', '#20241d', '20241D')}
              {sw('Chalk', '#ece2cb', 'ECE2CB')}
              {sw('Chalk 2', '#b9b09a', 'B9B09A')}
              {sw('Muted', '#8c8470', '8C8470')}
              {sw('Chalk-red', '#d4694f', 'D4694F')}
            </div>
            <div style={{ height: 2, background: 'var(--rule)', margin: '20px 0 16px' }} />
            <Margin>The same colors, flipped for dark mode. A toggle, not a separate design.</Margin>
          </div>
        </DCArtboard>

        {/* STRUCTURE */}
        <DCArtboard id="structure" label="Structure & shadow" width={360} height={510}>
          <div className="pxs" style={{ height: '100%', padding: '30px 28px', boxSizing: 'border-box' }}>
            <Label>Structure</Label>
            <div className="pxs-card" style={{ padding: 16, marginTop: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Bordered card</div>
              <Margin style={{ marginTop: 4 }}>2px ink rule + 4px hard offset block. No blur.</Margin>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
              <Stamp rot>New</Stamp>
              <Stamp solid>Approved</Stamp>
              <Chip ink>Web Game</Chip>
            </div>
            <div style={{ marginTop: 22 }}>
              <div className="pxs-label">Ledger rule</div>
              <div className="pxs-hr" style={{ marginTop: 8 }} />
              <div className="pxs-hr pxs-hr--hair" style={{ marginTop: 10 }} />
            </div>
            <div className="pxs-ph" style={{ height: 92, marginTop: 22 }}>
              <span>Live preview · image</span>
            </div>
            <Margin style={{ marginTop: 14 }}>Images and live previews sit in placeholders until the real thing arrives.</Margin>
          </div>
        </DCArtboard>

        {/* CONTROLS */}
        <DCArtboard id="controls" label="Controls" width={360} height={470}>
          <div className="pxs" style={{ height: '100%', padding: '30px 28px', boxSizing: 'border-box' }}>
            <Label>Controls</Label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <Btn variant="primary" icon={I.pen}>Primary</Btn>
              <Btn>Default</Btn>
              <Btn variant="stamp" icon={I.check}>Stamp</Btn>
            </div>
            <div style={{ marginTop: 14 }}>
              <input className="pxs-field" placeholder="Message the assistant…" readOnly />
            </div>
            <div style={{ display: 'flex', marginTop: 22 }}>
              <span className="pxs-tab pxs-tab--active">Editor</span>
              <span className="pxs-tab">Preview</span>
              <span className="pxs-tab">Git</span>
              <span className="pxs-tab">Usage</span>
            </div>
            <div className="pxs-card pxs-card--flat" style={{ borderTop: 'none', padding: 14 }}>
              <Margin>Tabs hang from the panel's edge — pick one.</Margin>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 22, alignItems: 'center' }}>
              <Av initials="GC" kind="ink" />
              <Av initials="MR" />
              <Av initials="AI" kind="stamp" />
              <Margin style={{ margin: 0 }}>People show up as initials — no avatars.</Margin>
            </div>
          </div>
        </DCArtboard>
      </DCSection>
    </>
  );
};


/* ===== sections/workspace.jsx ===== */
/* sections/workspace.jsx — THE WORKSPACE, reimagined as a bound lab-notebook.
   Contents (file tree/index) · Workbench (editor/proof) · Proceedings (transcript).
   Rendered in both parchment (light) and chalkboard (dark). */

window.WorkspaceSections = function WorkspaceSections() {

  // ---- file index row ----
  const FileRow = ({ name, no, depth = 0, active, peer, dir }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 14px 5px ' + (14 + depth * 16) + 'px',
      background: active ? 'var(--paper-3)' : 'transparent',
      borderLeft: active ? '3px solid var(--stamp)' : '3px solid transparent',
      fontSize: 13.5,
    }}>
      <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{dir ? I.folder : I.file}</span>
      <span style={{ fontWeight: dir ? 600 : 400, fontStyle: dir ? 'normal' : 'normal' }}>{name}</span>
      {peer && <span className="pxs-mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--stamp)', marginLeft: 'auto', border: '1.5px solid var(--stamp)', padding: '0 4px' }}>{peer}</span>}
      {no && !peer && <CallNo style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>{no}</CallNo>}
    </div>
  );

  // ---- a proceedings (transcript) entry ----
  const Entry = ({ n, who, kind, time, children, ann, foot }) => {
    const isAgent = kind === 'agent';
    return (
      <div style={{ display: 'flex', gap: 10, padding: '13px 16px', borderTop: '1px solid color-mix(in oklab,var(--ink) 16%,transparent)' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Av initials={who.in} kind={who.kind} />
          <span className="pxs-mono" style={{ fontSize: 8.5, color: 'var(--gray)' }}>{String(n).padStart(2, '0')}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>{who.name}</span>
            {isAgent && <span className="pxs-mono" style={{ fontSize: 8.5, letterSpacing: '0.12em', color: 'var(--stamp)', textTransform: 'uppercase' }}>Assistant</span>}
            <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>{time}</span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: isAgent ? 'var(--ink)' : 'var(--ink-2)', fontStyle: isAgent ? 'normal' : 'italic' }}>
            {children}{foot && <Fn n={foot} />}
          </div>
          {ann && ann.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
              <span style={{ color: 'var(--stamp)', display: 'flex' }}>{a[0] === 'edit' ? I.pen : I.bolt}</span>
              <span className="pxs-mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{a[1]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Frame = ({ dark, proof }) => (
    <div className={'pxs' + (dark ? ' dark' : '')} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── MASTHEAD ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', height: 60, borderBottom: '2px solid var(--rule)', flex: '0 0 auto' }}>
        <CallNo style={{ fontWeight: 700, fontSize: 12 }}>#4</CallNo>
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic', lineHeight: 1, whiteSpace: 'nowrap' }}>Tide — a tide-pool field guide</div>
        </div>
        <Chip>Version 0.3</Chip>
        <div style={{ flex: 1 }} />
        {/* who's in control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '2px solid var(--rule)', padding: '4px 10px 4px 6px', background: 'var(--paper-2)' }}>
          <span className="pxs-label" style={{ fontSize: 9 }}>In control</span>
          <Av initials="MR" />
          <span style={{ color: 'var(--stamp)', display: 'flex' }}>{I.pen}</span>
        </div>
        <div style={{ display: 'flex' }}>
          <span className="pxs-tab pxs-tab--active" style={{ borderBottom: '2px solid var(--rule)', top: 0 }}>Take turns</span>
          <span className="pxs-tab" style={{ borderBottom: '2px solid var(--rule)', top: 0 }}>Anyone</span>
        </div>
        <Stamp solid style={{ background: 'var(--stamp)' }}>● Live</Stamp>
      </div>

      {/* ── BODY: three columns ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* CONTENTS */}
        <div style={{ flex: '0 0 268px', borderRight: '2px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '2px solid var(--rule)' }}>
            <Label>Files</Label>
            <Btn sm icon={I.plus}>Invite</Btn>
          </div>
          {/* in the room */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid color-mix(in oklab,var(--ink) 20%,transparent)' }}>
            <Label style={{ fontSize: 9, marginBottom: 7 }}>Who's here</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Av initials="GC" kind="ink" /><span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Grace</span>
                <Margin style={{ margin: 0, marginLeft: 'auto', fontSize: 11 }}>App.tsx</Margin>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Av initials="MR" /><span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Milo</span>
                <span style={{ color: 'var(--stamp)', display: 'flex', marginLeft: 'auto' }}>{I.pen}</span>
                <Margin style={{ margin: 0, fontSize: 11 }}>tide.ts</Margin>
              </div>
            </div>
          </div>
          {/* index */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 6 }}>
            <FileRow name="src" dir depth={0} />
            <FileRow name="App.tsx" depth={1} active />
            <FileRow name="tide.ts" depth={1} peer="MR" />
            <FileRow name="chart.tsx" depth={1} />
            <FileRow name="theme.css" depth={1} />
            <FileRow name="public" dir depth={0} />
            <FileRow name="index.html" depth={1} />
            <FileRow name="data" dir depth={0} />
            <FileRow name="noaa.json" depth={1} />
            <FileRow name="README.md" depth={0} />
          </div>
          <div style={{ borderTop: '1px solid color-mix(in oklab,var(--ink) 20%,transparent)', padding: '8px 14px' }}>
            <Margin>Files someone else is viewing show their initials.</Margin>
          </div>
        </div>

        {/* WORKBENCH */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, padding: '8px 16px 0', borderBottom: '2px solid var(--rule)' }}>
            <span className={'pxs-tab' + (!proof ? ' pxs-tab--active' : '')}>Code</span>
            <span className={'pxs-tab' + (proof ? ' pxs-tab--active' : '')}>Preview</span>
            <span className="pxs-tab">Git</span>
            <span className="pxs-tab">Usage</span>
            <div style={{ flex: 1 }} />
            <CallNo style={{ paddingBottom: 8, fontSize: 10 }}>{proof ? 'preview · :4173' : 'src/App.tsx · 142 lines'}</CallNo>
          </div>

          {proof ? (
            /* PROOF — live preview */
            <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Stamp>Live preview</Stamp>
                <CallNo>tide.preview.praxis.dev</CallNo>
                <div style={{ flex: 1 }} />
                <Btn sm>Open ▸</Btn>
              </div>
              <Ph label="Live preview · your running app" style={{ flex: 1 }} />
            </div>
          ) : (
            /* MANUSCRIPT — code as ruled manuscript */
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', fontFamily: '"Space Mono", monospace', fontSize: 12.5, lineHeight: '22px' }}>
                {[
                  ['1', <span><span style={{color:'var(--gray)'}}>import</span> {'{ useTides }'} <span style={{color:'var(--gray)'}}>from</span> <span style={{color:'var(--stamp)'}}>'./tide'</span></span>],
                  ['2', ''],
                  ['3', <span><span style={{color:'var(--gray)'}}>export default function</span> App() {'{'}</span>],
                  ['4', <span style={{paddingLeft:18}}><span style={{color:'var(--gray)'}}>const</span> tides = useTides(<span style={{color:'var(--stamp)'}}>'monterey'</span>)</span>, 'MR'],
                  ['5', <span style={{paddingLeft:18}}><span style={{color:'var(--gray)'}}>return</span> (</span>],
                  ['6', <span style={{paddingLeft:36}}>{'<main className="guide">'}</span>],
                  ['7', <span style={{paddingLeft:54}}>{'<TideChart data={tides} />'}</span>],
                  ['8', <span style={{paddingLeft:54}}>{'<PoolList />'}</span>],
                  ['9', <span style={{paddingLeft:36}}>{'</main>'}</span>],
                  ['10', <span style={{paddingLeft:18}}>)</span>],
                  ['11', <span>{'}'}</span>],
                ].map(([ln, code, peer], i) => (
                  <div key={i} style={{ display: 'flex', position: 'relative' }}>
                    <span style={{ flex: '0 0 46px', textAlign: 'right', paddingRight: 12, color: 'var(--gray)', borderRight: '1px solid color-mix(in oklab,var(--ink) 16%,transparent)', userSelect: 'none' }}>{ln}</span>
                    <span style={{ paddingLeft: 14, whiteSpace: 'pre' }}>{code}
                      {peer && <span style={{ display: 'inline-block', width: 2, height: 15, background: 'var(--stamp)', verticalAlign: 'middle', marginLeft: 2 }} />}
                      {peer && <span className="pxs-mono" style={{ fontSize: 8.5, fontWeight: 700, background: 'var(--stamp)', color: 'var(--stamp-ink)', padding: '0 3px', marginLeft: 2 }}>{peer}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '2px solid var(--rule)', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Margin style={{ margin: 0 }}>Milo is editing line 4 — you can see his cursor.</Margin>
                <div style={{ flex: 1 }} />
                <CallNo style={{ fontSize: 10 }}>TSX · UTF-8</CallNo>
              </div>
            </div>
          )}
        </div>

        {/* PROCEEDINGS */}
        <div style={{ flex: '0 0 372px', borderLeft: '2px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '2px solid var(--rule)' }}>
            <Label>Chat</Label>
            <CallNo style={{ fontSize: 10 }}>14:02–14:09</CallNo>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Entry n={11} who={{ in: 'MR', name: 'Milo', kind: '' }} time="14:02">
              Add a 24-hour tide chart above the pool list.
            </Entry>
            <Entry n={12} who={{ in: 'AI', name: 'Assistant', kind: 'stamp' }} kind="agent" time="14:03"
              ann={[['bolt', 'read  noaa.json'], ['edit', 'wrote chart.tsx · +48']]} foot="3">
              Charted the next 24 hours from the NOAA feed and slotted it above the list. The y-axis is in metres.
            </Entry>
            <Entry n={13} who={{ in: 'GC', name: 'Grace', kind: 'ink' }} time="14:07">
              Lovely. Can the low-tide windows be shaded?
            </Entry>
            <Entry n={14} who={{ in: 'AI', name: 'Assistant', kind: 'stamp' }} kind="agent" time="14:08"
              ann={[['edit', 'wrote chart.tsx · +12']]}>
              Shaded every window below 0.3 m in deep red.
            </Entry>
          </div>
          {/* input — dictate */}
          <div style={{ borderTop: '2px solid var(--rule)', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Av initials="MR" />
              <input className="pxs-field" style={{ fontSize: 13, padding: '7px 10px' }} placeholder="Message the assistant…" readOnly />
              <Btn variant="primary" sm icon={I.arrowR}>Send</Btn>
            </div>
            <Margin>You're in control — Grace can ask for a turn anytime.</Margin>
          </div>
          {/* syllabus / reading list */}
          <div style={{ borderTop: '2px solid var(--rule)', background: 'var(--paper-2)', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.book}</span>
              <Label style={{ fontSize: 9 }}>Learn · Suggested reading</Label>
              <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>2 / 5 read</span>
              <span style={{ display: 'flex', color: 'var(--gray)' }}>{I.chevD}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
              <Fn n="3" />
              <span style={{ fontSize: 12.5 }}>Fetching & charting time-series data <span className="pxs-mono" style={{ fontSize: 10, color: 'var(--gray)' }}>· react.dev</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DCSection id="workspace" title="02 · The Workspace" subtitle="The build session in three panels: files, the workbench, and the chat. Light & dark.">
      <DCArtboard id="ws-light" label="Light · Code open" width={1340} height={840}>
        <Frame />
      </DCArtboard>
      <DCArtboard id="ws-dark" label="Dark · Preview open" width={1340} height={840}>
        <Frame dark proof />
      </DCArtboard>
    </DCSection>
  );
};


/* ===== sections/library.jsx ===== */
/* sections/library.jsx — THE READING ROOM (dashboard / project list)
   Projects become "volumes": ledger view + shelf-of-spines view. */

window.LibrarySections = function LibrarySections() {

  const TopBar = ({ dark }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 26px', height: 56, borderBottom: '2px solid var(--rule)', flex: '0 0 auto' }}>
      <span className="pxs-display" style={{ fontSize: 22 }}>Praxis</span>
      <div style={{ display: 'flex', gap: 18, marginLeft: 12 }}>
        <span className="pxs-label" style={{ color: 'var(--ink)', borderBottom: '2px solid var(--stamp)', paddingBottom: 3 }}>Projects</span>
        <span className="pxs-label">Profile</span>
        <span className="pxs-label">Settings</span>
      </div>
      <div style={{ flex: 1 }} />
      <CallNo style={{ fontSize: 10 }}>2 people · 7 projects</CallNo>
      <Av initials="GC" kind="ink" />
    </div>
  );

  const STATUS = {
    live: <Stamp solid>● Live</Stamp>,
    proofed: <Stamp>Ready</Stamp>,
    progress: <Chip>In progress</Chip>,
    draft: <Chip>Draft</Chip>,
  };

  const Volume = ({ no, title, sub, authors, status, date, alone }) => (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid color-mix(in oklab,var(--ink) 22%,transparent)' }}>
      <div style={{ flex: '0 0 70px', borderRight: '1px solid color-mix(in oklab,var(--ink) 22%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CallNo style={{ fontSize: 11, fontWeight: 700 }}>{no}</CallNo>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 18px' }}>
        <div style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ flex: '0 0 86px', display: 'flex', alignItems: 'center', gap: -6 }}>
        {authors.map((a, i) => <Av key={i} initials={a.in} kind={a.kind} style={{ marginLeft: i ? -6 : 0 }} />)}
      </div>
      <div style={{ flex: '0 0 130px', display: 'flex', alignItems: 'center' }}>{STATUS[status]}</div>
      <div style={{ flex: '0 0 110px', display: 'flex', alignItems: 'center' }}><CallNo style={{ fontSize: 10 }}>{date}</CallNo></div>
      <div style={{ flex: '0 0 150px', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 18 }}>
        <Btn sm variant="primary" icon={I.arrowR}>Open</Btn>
        <span className="pxs-mono" style={{ fontSize: 14, color: 'var(--gray)' }}>⋯</span>
      </div>
    </div>
  );

  // ── A spine for the shelf view ──
  const Spine = ({ no, title, h, status, fill }) => (
    <div style={{
      width: 58, height: h, background: fill, border: '2px solid var(--rule)',
      boxShadow: '3px 3px 0 var(--shadow)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', flex: '0 0 auto',
    }}>
      <CallNo style={{ fontSize: 9, color: fill === 'var(--ink)' ? 'var(--paper)' : 'var(--ink)' }}>{no}</CallNo>
      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: fill === 'var(--ink)' ? 'var(--paper)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{title}</div>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: status === 'live' ? 'var(--stamp)' : 'transparent', border: status === 'live' ? 'none' : '2px solid ' + (fill === 'var(--ink)' ? 'var(--paper)' : 'var(--ink)') }} />
    </div>
  );

  return (
    <DCSection id="library" title="03 · Your Projects" subtitle="The dashboard: a list of your projects, plus a bookshelf view.">

      {/* LEDGER LIST */}
      <DCArtboard id="lib-ledger" label="Ledger list" width={1180} height={720}>
        <div className="pxs" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopBar />
          <div style={{ flex: 1, minHeight: 0, padding: '28px 40px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <div className="pxs-display" style={{ fontSize: 42, whiteSpace: 'nowrap' }}>Your projects</div>
                <Margin style={{ fontSize: 14, marginTop: 4 }}>Open one to pick up where you left off, or start a new one.</Margin>
              </div>
              <Btn variant="stamp" icon={I.plus}>New project</Btn>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
              <span className="pxs-tab pxs-tab--active" style={{ borderBottom: '2px solid var(--rule)', top: 0 }}>Active · 5</span>
              <span className="pxs-tab" style={{ borderBottom: '2px solid var(--rule)', top: 0 }}>Archived · 2</span>
              <div style={{ flex: 1 }} />
              <input className="pxs-field" style={{ width: 200, fontSize: 13, padding: '6px 10px' }} placeholder="Search projects…" readOnly />
              <span className="pxs-btn pxs-btn--sm" style={{ marginLeft: 8 }}>Recent ▾</span>
            </div>

            <div className="pxs-card" style={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden', borderBottom: '2px solid var(--rule)' }}>
              {/* header row */}
              <div style={{ display: 'flex', background: 'var(--ink)', color: 'var(--paper)' }}>
                <div style={{ flex: '0 0 70px', textAlign: 'center', padding: '8px 0' }} className="pxs-label">#</div>
                <div style={{ flex: 1, padding: '8px 18px' }} className="pxs-label">Project</div>
                <div style={{ flex: '0 0 86px', padding: '8px 0' }} className="pxs-label">People</div>
                <div style={{ flex: '0 0 130px', padding: '8px 0' }} className="pxs-label">Status</div>
                <div style={{ flex: '0 0 110px', padding: '8px 0' }} className="pxs-label">Opened</div>
                <div style={{ flex: '0 0 150px' }} />
              </div>
              <Volume no="#004" title="Tide" sub="A tide-pool field guide" authors={[{in:'GC',kind:'ink'},{in:'MR'}]} status="progress" date="today" />
              <Volume no="#003" title="Ledger" sub="Split-the-bill for housemates" authors={[{in:'GC',kind:'ink'},{in:'AP'}]} status="live" date="2 days" />
              <Volume no="#002" title="Orrery" sub="A 3D model of the inner planets" authors={[{in:'GC',kind:'ink'},{in:'MR'}]} status="proofed" date="last wk" />
              <Volume no="#001" title="Fokus" sub="A pomodoro timer with a twist" authors={[{in:'GC',kind:'ink'},{in:'JD'}]} status="draft" date="last wk" />
              <Volume no="#000" title="Hello, world" sub="The first project" authors={[{in:'GC',kind:'ink'}]} status="proofed" date="Mar" />
            </div>
          </div>
        </div>
      </DCArtboard>

      {/* SHELF / SPINES */}
      <DCArtboard id="lib-shelf" label="Shelf view" width={620} height={720}>
        <div className="pxs" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopBar />
          <div style={{ flex: 1, minHeight: 0, padding: '28px 34px', display: 'flex', flexDirection: 'column' }}>
            <div className="pxs-display" style={{ fontSize: 32 }}>Bookshelf</div>
            <Margin style={{ marginTop: 4 }}>Five active projects. A red dot means it's live.</Margin>
            {/* the shelf */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 0 }}>
                <Spine no="004" title="Tide" h={300} status="" fill="var(--paper)" />
                <Spine no="003" title="Ledger" h={340} status="live" fill="var(--ink)" />
                <Spine no="002" title="Orrery" h={280} status="" fill="var(--paper)" />
                <Spine no="001" title="Fokus" h={320} status="" fill="var(--paper-3)" />
                <Spine no="000" title="Hello, world" h={300} status="" fill="var(--paper)" />
                {/* the gap on the shelf — commission */}
                <div style={{ width: 58, height: 300, border: '2px dashed color-mix(in oklab,var(--ink) 45%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="pxs-label">+ New</span>
                </div>
              </div>
              <div style={{ height: 10, background: 'var(--ink)', boxShadow: '4px 4px 0 var(--shadow)' }} />
            </div>
            <Margin style={{ marginTop: 18 }}>Drag to reorder · pull one out to archive it.</Margin>
          </div>
        </div>
      </DCArtboard>
    </DCSection>
  );
};


/* ===== sections/create.jsx ===== */
/* sections/create.jsx — COMMISSIONING A VOLUME (create project / template picker)
   Templates become "editions" on catalog index-cards. */

window.CreateSections = function CreateSections() {

  const Edition = ({ no, name, desc, includes, selected }) => (
    <div style={{
      flex: '1 1 0', minWidth: 0, border: '2px solid var(--rule)',
      boxShadow: selected ? '5px 5px 0 var(--stamp)' : '4px 4px 0 var(--shadow)',
      background: selected ? 'var(--paper)' : 'var(--paper-2)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* catalog card head */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '2px solid var(--rule)', background: selected ? 'var(--ink)' : 'transparent', color: selected ? 'var(--paper)' : 'var(--ink)' }}>
        <CallNo style={{ fontSize: 10, color: 'inherit' }}>{no}</CallNo>
        {selected ? <Stamp solid style={{ background: 'var(--stamp)' }}>✓ Selected</Stamp> : <span className="pxs-mono" style={{ fontSize: 10, color: 'var(--gray)' }}>○</span>}
      </div>
      <Ph label="cover plate" style={{ height: 92, margin: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }} />
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{name}</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4, margin: '5px 0 12px' }}>{desc}</p>
        <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {includes.map((t) => <span key={t} className="pxs-callno" style={{ fontSize: 9.5, border: '1px solid color-mix(in oklab,var(--ink) 30%,transparent)', padding: '1px 5px' }}>{t}</span>)}
        </div>
      </div>
    </div>
  );

  return (
    <DCSection id="create" title="04 · New Project" subtitle="Starting a project: name it, pick a template, invite a partner.">
      <DCArtboard id="commission" label="New project" width={1040} height={680}>
        <div className="pxs pxs-grid-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 34px', height: 64, borderBottom: '2px solid var(--rule)', background: 'var(--paper)', flex: '0 0 auto' }}>
            <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.book}</span>
            <span className="pxs-display" style={{ fontSize: 24, whiteSpace: 'nowrap' }}>New project</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--gray)', display: 'flex' }}>{I.x}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: '26px 34px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* step 1 — title */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>1</span>
                <Label style={{ fontSize: 10 }}>Project name</Label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid var(--rule)', paddingBottom: 6 }}>
                <span className="pxs-display" style={{ fontSize: 34, fontStyle: 'italic' }}>Almanac</span>
                <span style={{ width: 2, height: 32, background: 'var(--stamp)' }} />
                <div style={{ flex: 1 }} />
                <CallNo>saved as #5</CallNo>
              </div>
            </div>

            {/* step 2 — edition */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>2</span>
                <Label style={{ fontSize: 10 }}>Choose a template</Label>
                <Margin style={{ margin: 0, marginLeft: 6 }}>each one comes set up with the right tools to start.</Margin>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 16, alignItems: 'stretch' }}>
                <Edition no="01" name="Web game" desc="A canvas game loop, sprite helpers, and a score store — ready to play." includes={['Canvas', 'Vite', 'TS']} />
                <Edition no="02" name="SaaS dashboard" desc="Auth, a data table, charts and a settings page on a tidy grid." includes={['Next', 'Charts', 'DB']} selected />
                <Edition no="03" name="3D scene" desc="A lit three.js stage with orbit controls and a model loader." includes={['three', 'R3F', 'TS']} />
                <Edition no="04" name="Blank" desc="An empty project. Bring your own structure." includes={['Vite', 'TS']} />
              </div>
            </div>

            {/* step 3 — co-author + commit */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                  <span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>3</span>
                  <Label style={{ fontSize: 10 }}>Invite a partner</Label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Av initials="GC" kind="ink" />
                  <span className="pxs-mono" style={{ color: 'var(--gray)' }}>＋</span>
                  <input className="pxs-field" style={{ maxWidth: 280, fontSize: 13, padding: '8px 11px' }} placeholder="partner's email…" readOnly />
                  <Margin style={{ margin: 0 }}>they'll get an email invite.</Margin>
                </div>
              </div>
              <Btn variant="primary" icon={I.pen} style={{ padding: '12px 22px', fontSize: 12.5 }}>Create project</Btn>
            </div>
          </div>
        </div>
      </DCArtboard>
    </DCSection>
  );
};


/* ===== sections/landing.jsx ===== */
/* sections/landing.jsx — THE THRESHOLD (landing + magic-link sign-in) */

window.LandingSections = function LandingSections() {
  return (
    <DCSection id="landing" title="05 · Landing & Sign-in" subtitle="The landing page and signing in.">

      {/* LANDING */}
      <DCArtboard id="landing-page" label="Landing page" width={1040} height={760}>
        <div className="pxs pxs-ruled" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 36px', height: 58, borderBottom: '2px solid var(--rule)', flex: '0 0 auto' }}>
            <span className="pxs-display" style={{ fontSize: 22 }}>Praxis</span>
            <div style={{ flex: 1 }} />
            <span className="pxs-label">How it works</span>
            <span className="pxs-label">Templates</span>
            <span className="pxs-label">Pricing</span>
            <Btn sm>Sign in</Btn>
          </div>

          {/* hero */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: '1 1 0', padding: '52px 44px', display: 'flex', flexDirection: 'column', borderRight: '2px solid var(--rule)' }}>
              <Stamp rot style={{ alignSelf: 'flex-start' }}>Build together · 2026</Stamp>
              <div className="pxs-display" style={{ fontSize: 92, marginTop: 22, letterSpacing: '-0.04em' }}>Praxis</div>
              <div style={{ fontStyle: 'italic', fontSize: 25, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.3, maxWidth: 440 }}>
                Two people, one AI assistant, and an afternoon — enough to turn an idea into a working app.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
                <Btn variant="stamp" icon={I.pen} style={{ padding: '13px 22px', fontSize: 13 }}>Get started</Btn>
                <Btn icon={I.book} style={{ padding: '13px 22px', fontSize: 13 }}>How it works</Btn>
              </div>
              <div style={{ flex: 1 }} />
              <Margin>No code required. Bring a partner and an idea.</Margin>
            </div>

            {/* right — the method as numbered marginal notes */}
            <div style={{ flex: '0 0 360px', padding: '44px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
              <Label style={{ marginBottom: 16 }}>How it works</Label>
              {[
                ['I', 'Start a project', 'Name it and pick a template.'],
                ['II', 'Invite a partner', 'They join with an email link.'],
                ['III', 'Describe it', 'Take turns telling the assistant what to build.'],
                ['IV', 'See it run', 'Watch it work live, and learn as you go.'],
              ].map(([r, t, d], i) => (
                <div key={r} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 22%,transparent)' : '2px solid var(--rule)' }}>
                  <span className="pxs-display" style={{ fontSize: 26, color: 'var(--stamp)', flex: '0 0 34px' }}>{r}</span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{t}</div>
                    <Margin style={{ marginTop: 2, fontSize: 12.5 }}>{d}</Margin>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DCArtboard>

      {/* SIGN IN */}
      <DCArtboard id="signin" label="Sign in" width={480} height={760}>
        <div className="pxs" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div className="pxs-card" style={{ width: '100%', maxWidth: 360, padding: 0 }}>
            {/* envelope flap */}
            <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="pxs-display" style={{ fontSize: 20 }}>Praxis</span>
              <span className="pxs-label" style={{ color: 'var(--paper)' }}>Sign in</span>
            </div>
            <div style={{ padding: '28px 26px' }}>
              <div className="pxs-display" style={{ fontSize: 27 }}>Sign in</div>
              <Margin style={{ marginTop: 6, marginBottom: 22 }}>
                No password needed. Enter your email and we'll send you a sign-in link.
              </Margin>
              <Label style={{ fontSize: 9, marginBottom: 7 }}>Email</Label>
              <input className="pxs-field" placeholder="you@example.com" readOnly />
              <Btn variant="primary" icon={I.arrowR} style={{ width: '100%', marginTop: 16, padding: '12px' }}>Email me a link</Btn>
              <div className="pxs-hr pxs-hr--hair" style={{ margin: '22px 0 14px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 22, border: '2px solid var(--rule)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid var(--ink-2)' }} />
                </span>
                <Margin style={{ margin: 0 }}>The link works for 10 minutes.</Margin>
              </div>
            </div>
          </div>
          <Stamp rot style={{ marginTop: 26 }}>No password needed</Stamp>
        </div>
      </DCArtboard>
    </DCSection>
  );
};


/* ===== sections/concepts.jsx ===== */
/* sections/concepts.jsx — WORKFLOW STUDIES
   Annotated deep-dives on the four reimagined workflows:
   the pen (control), the proceedings entry, footnotes→syllabus (learning), presence. */

window.ConceptsSections = function ConceptsSections() {

  const Head = ({ k, title, note }) => (
    <div style={{ padding: '18px 22px 16px', borderBottom: '2px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>{k}</span>
        <span className="pxs-display" style={{ fontSize: 23, whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <Margin style={{ marginTop: 5 }}>{note}</Margin>
    </div>
  );

  const Note = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <span className="pxs-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--stamp)', border: '1.5px solid var(--stamp)', width: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{n}</span>
      <Margin style={{ margin: 0 }}>{children}</Margin>
    </div>
  );

  return (
    <DCSection id="concepts" title="06 · How It Works" subtitle="A closer look at four key parts: taking turns, the chat, learning, and presence.">

      {/* ── A · THE PEN ── */}
      <DCArtboard id="study-pen" label="Taking turns" width={460} height={520}>
        <div className="pxs" style={{ height: '100%', overflow: 'hidden' }}>
          <Head k="A" title="Taking turns" note="Only one person prompts the assistant at a time — so the build stays one clear direction." />
          <div style={{ padding: '18px 22px' }}>
            <Label style={{ fontSize: 9, marginBottom: 10 }}>Two ways to share it</Label>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="pxs-card pxs-card--inset" style={{ flex: 1, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Anyone</div>
                <Margin style={{ marginTop: 3 }}>Anyone can prompt; messages line up in order.</Margin>
              </div>
              <div className="pxs-card" style={{ flex: 1, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}><span style={{ whiteSpace: 'nowrap' }}>Take turns</span> <span style={{ color: 'var(--stamp)', display: 'flex' }}>{I.pen}</span></div>
                <Margin style={{ marginTop: 3 }}>One person at a time; others ask for a turn.</Margin>
              </div>
            </div>

            <Label style={{ fontSize: 9, margin: '20px 0 10px' }}>Passing control</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '2px solid var(--rule)' }}>
              {[
                [<span>Milo is in control <span style={{color:'var(--stamp)'}}>✎</span></span>, 'MR', 'stamp-hold'],
                ['Grace asks for a turn', 'GC', 'req'],
                ['Milo says yes — Grace takes over', 'GC', 'pass'],
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 20%,transparent)' : 'none', background: i === 2 ? 'var(--paper-3)' : 'transparent' }}>
                  <Av initials={row[1]} kind={row[1] === 'MR' ? '' : 'ink'} />
                  <span style={{ fontSize: 13.5, flex: 1 }}>{row[0]}</span>
                  {i === 1 && <><Btn sm variant="stamp">Approve</Btn><Btn sm>Decline</Btn></>}
                  {i === 0 && <Stamp>active</Stamp>}
                  {i === 2 && <span style={{ color: 'var(--stamp)', display: 'flex' }}>{I.arrowR}</span>}
                </div>
              ))}
            </div>
            <Note n="1">Only the person in control can type; everyone else sees “Milo is prompting.”</Note>
            <Note n="2">The owner can switch modes anytime — the toggle's in the top bar.</Note>
          </div>
        </div>
      </DCArtboard>

      {/* ── B · THE PROCEEDINGS ENTRY ── */}
      <DCArtboard id="study-entry" label="The chat" width={460} height={520}>
        <div className="pxs" style={{ height: '100%', overflow: 'hidden' }}>
          <Head k="B" title="Each message" note="Every message is numbered, labelled with who sent it, and time-stamped — a history you can scroll back through." />
          <div style={{ padding: '20px 22px' }}>
            {/* the specimen entry */}
            <div className="pxs-card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', gap: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Av initials="AI" kind="stamp" />
                  <span className="pxs-mono" style={{ fontSize: 9, color: 'var(--gray)' }}>12</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>Assistant</span>
                    <span className="pxs-mono" style={{ fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--stamp)' }}>ASSISTANT</span>
                    <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>14:03</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>Charted the next 24 hours from the NOAA feed.<Fn n="3" /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
                    <span style={{ color: 'var(--stamp)', display: 'flex' }}>{I.pen}</span>
                    <span className="pxs-mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>wrote chart.tsx · +48</span>
                  </div>
                </div>
              </div>
            </div>

            <Note n="1">The <strong>initials</strong> show who sent it; the assistant's replies are marked in red.</Note>
            <Note n="2">A <strong>message number</strong> + time make it easy to refer back: “see message 12.”</Note>
            <Note n="3">What the assistant did — the <strong>files it changed</strong> — shows as small notes, not clutter.</Note>
            <Note n="4">A small <strong>link</strong><Fn n="3" /> connects a message to something to read — see next.</Note>
          </div>
        </div>
      </DCArtboard>

      {/* ── C · FOOTNOTES → SYLLABUS ── */}
      <DCArtboard id="study-learn" label="Learn as you go" width={460} height={520}>
        <div className="pxs" style={{ height: '100%', overflow: 'hidden' }}>
          <Head k="C" title="Learn as you go" note="Learning isn't a separate section — helpful links appear in the chat, then collect in one place." />
          <div style={{ padding: '20px 22px' }}>
            {/* footnote in context */}
            <div className="pxs-card pxs-card--inset" style={{ padding: '12px 14px' }}>
              <span style={{ fontSize: 13.5 }}>…charted from the NOAA feed.<Fn n="3" /></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0', color: 'var(--stamp)' }}>{I.chevD}</div>
            {/* the syllabus */}
            <div className="pxs-card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '2px solid var(--rule)', background: 'var(--paper-2)' }}>
                <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.book}</span>
                <Label style={{ fontSize: 9 }}>Learn</Label>
                <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>2 / 5 read</span>
              </div>
              {[
                ['Fetching & charting time-series', 'react.dev', true, '3'],
                ['Reading a tide table', 'noaa.gov', true],
                ['Shading SVG regions', 'mdn', false],
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 18%,transparent)' : 'none' }}>
                  <span style={{ width: 16, height: 16, border: '1.5px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: r[2] ? 'var(--ink)' : 'transparent', color: 'var(--paper)' }}>{r[2] && I.check}</span>
                  {r[3] ? <Fn n={r[3]} /> : <span style={{ width: 9 }} />}
                  <span style={{ fontSize: 13, flex: 1, textDecoration: r[2] ? 'line-through' : 'none', color: r[2] ? 'var(--gray)' : 'var(--ink)' }}>{r[0]}</span>
                  <span className="pxs-mono" style={{ fontSize: 10, color: 'var(--gray)' }}>{r[1]}</span>
                </div>
              ))}
            </div>
            <Note n="1">Links are gathered automatically — the list grows from what you actually built.</Note>
            <Note n="2">Finish the list and it's added to your <strong>profile</strong> as proof of what you learned.</Note>
          </div>
        </div>
      </DCArtboard>

      {/* ── D · PRESENCE ── */}
      <DCArtboard id="study-room" label="Who's here" width={460} height={520}>
        <div className="pxs" style={{ height: '100%', overflow: 'hidden' }}>
          <Head k="D" title="Who's here" note="Two people, side by side — you always see who's here and what they're looking at." />
          <div style={{ padding: '20px 22px' }}>
            <Label style={{ fontSize: 9, marginBottom: 10 }}>Who's here</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '2px solid var(--rule)', padding: '8px 11px' }}>
                <Av initials="GC" kind="ink" /><span style={{ fontSize: 14, fontWeight: 600 }}>Grace</span>
                <span className="pxs-chip" style={{ marginLeft: 8 }}>you</span>
                <Margin style={{ margin: 0, marginLeft: 'auto' }}>reading App.tsx</Margin>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '2px solid var(--rule)', padding: '8px 11px' }}>
                <Av initials="MR" /><span style={{ fontSize: 14, fontWeight: 600 }}>Milo</span>
                <span style={{ color: 'var(--stamp)', display: 'flex', marginLeft: 8 }}>{I.pen}</span>
                <Margin style={{ margin: 0, marginLeft: 'auto' }}>editing tide.ts</Margin>
              </div>
            </div>

            <Label style={{ fontSize: 9, margin: '20px 0 10px' }}>See where they're typing</Label>
            <div className="pxs-card" style={{ padding: '12px 14px', fontFamily: '"Space Mono", monospace', fontSize: 12 }}>
              <div style={{ color: 'var(--gray)' }}>const tides =</div>
              <div>useTides(<span style={{ color: 'var(--stamp)' }}>'monterey'</span>)<span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--stamp)', verticalAlign: 'middle', margin: '0 1px' }} /><span className="pxs-mono" style={{ fontSize: 8.5, fontWeight: 700, background: 'var(--stamp)', color: 'var(--stamp-ink)', padding: '0 3px' }}>Milo</span></div>
            </div>
            <Note n="1">A colored cursor and name show where your partner is typing, live.</Note>
            <Note n="2">Invite a partner by email. Built for pairs — just two people.</Note>
          </div>
        </div>
      </DCArtboard>
    </DCSection>
  );
};


/* ===== app.jsx ===== */
/* app.jsx — assembles all sections into one DesignCanvas */

function PraxisCanvas() {
  return (
    <DesignCanvas>
      {FoundationsSections()}
      {WorkspaceSections()}
      {LibrarySections()}
      {CreateSections()}
      {LandingSections()}
      {ConceptsSections()}
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PraxisCanvas />);


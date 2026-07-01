/* AUTO-GENERATED prototype bundle */

/* ===== proto-kit.jsx ===== */
/* proto-kit.jsx — interactive primitives, icons, app context + sample data.
   Exports to window; loaded first in the prototype bundle. */

window.PraxisCtx = React.createContext(null);
window.useApp = () => React.useContext(window.PraxisCtx);

// ---- geometric icons (squares / lines / chevrons only) ----
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
  chevL: <Ico d={<path d="M10 3l-5 5 5 5" />} />,
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
  search: <Ico d={<g><circle cx="7" cy="7" r="4" /><path d="M10 10l4 4" /></g>} />,
  sliders: <Ico d={<g><path d="M2 5h12M2 11h12" /><rect x="5" y="3" width="4" height="4" fill="var(--paper)" /><rect x="9" y="9" width="4" height="4" fill="var(--paper)" /></g>} />,
  sun: <Ico d={<g><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" /></g>} />,
  moon: <Ico d={<path d="M13 9A5 5 0 117 3a4 4 0 006 6z" />} fill="currentColor" />,
  back: <Ico d={<path d="M14 8H3M7 4L3 8l4 4" />} />,
  gauge: <Ico d={<g><path d="M2 12a6 6 0 1112 0" /><path d="M8 12l3-3" /></g>} />,
  branch: <Ico d={<g><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><path d="M4 6v4M4 8h4a2 2 0 002-2" /></g>} />,
};

function Label({ children, style }) { return <div className="pxs-label" style={style}>{children}</div>; }
function Mono({ children, style, className = '' }) { return <span className={'pxs-mono ' + className} style={style}>{children}</span>; }
function CallNo({ children, style }) { return <span className="pxs-callno" style={style}>{children}</span>; }
function Margin({ children, style }) { return <div className="pxs-margin" style={style}>{children}</div>; }
function Fn({ n }) { return <sup className="pxs-fn">{n}</sup>; }

function Stamp({ children, solid, rot, style }) {
  return <span className={'pxs-stamp' + (solid ? ' pxs-stamp--solid' : '') + (rot ? ' pxs-stamp--rot' : '')} style={style}>{children}</span>;
}
function Chip({ children, ink, style }) { return <span className={'pxs-chip' + (ink ? ' pxs-chip--ink' : '')} style={style}>{children}</span>; }
function Av({ initials, kind, style }) { return <span className={'pxs-mono-av' + (kind ? ' pxs-mono-av--' + kind : '')} style={style}>{initials}</span>; }
function Ph({ label, style, children }) { return <div className="pxs-ph" style={style}>{label && <span>{label}</span>}{children}</div>; }

function Btn({ children, variant, sm, icon, onClick, disabled, type = 'button', style, title }) {
  const v = variant ? ' pxs-btn--' + variant : '';
  return (
    <button type={type} className={'pxs-btn' + v + (sm ? ' pxs-btn--sm' : '')} onClick={onClick} disabled={disabled} title={title}
      style={{ opacity: disabled ? 0.45 : 1, ...style }}>
      {icon}{children}
    </button>
  );
}

// icon-only square button
function IconBtn({ icon, onClick, active, title, style }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        width: 34, height: 34, border: 'var(--bw) solid var(--rule)', background: active ? 'var(--ink)' : 'var(--paper)',
        color: active ? 'var(--paper)' : 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', borderRadius: 0, flex: '0 0 auto', ...style,
      }}>{icon}</button>
  );
}

function Tabs({ items, active, onChange, style }) {
  return (
    <div style={{ display: 'flex', ...style }}>
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onChange(it.id)}
          className={'pxs-tab' + (active === it.id ? ' pxs-tab--active' : '')}
          style={{ borderBottom: 'var(--bw) solid var(--rule)', top: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  );
}

// ---- sample data ----
const PROJECTS = [
  { id: 'tide', no: '#004', title: 'Tide', sub: 'A tide-pool field guide', authors: [{ in: 'GC', kind: 'ink' }, { in: 'MR' }], status: 'progress', date: 'today', archived: false },
  { id: 'ledger', no: '#003', title: 'Ledger', sub: 'Split-the-bill for housemates', authors: [{ in: 'GC', kind: 'ink' }, { in: 'AP' }], status: 'live', date: '2 days', archived: false },
  { id: 'orrery', no: '#002', title: 'Orrery', sub: 'A 3D model of the inner planets', authors: [{ in: 'GC', kind: 'ink' }, { in: 'MR' }], status: 'ready', date: 'last wk', archived: false },
  { id: 'fokus', no: '#001', title: 'Fokus', sub: 'A pomodoro timer with a twist', authors: [{ in: 'GC', kind: 'ink' }, { in: 'JD' }], status: 'draft', date: 'last wk', archived: false },
  { id: 'hello', no: '#000', title: 'Hello, world', sub: 'The first project', authors: [{ in: 'GC', kind: 'ink' }], status: 'ready', date: 'Mar', archived: true },
  { id: 'notes', no: '#-01', title: 'Marginal', sub: 'A markdown note-taker', authors: [{ in: 'GC', kind: 'ink' }, { in: 'MR' }], status: 'ready', date: 'Feb', archived: true },
];

const STATUS_LABEL = { live: '● Live', ready: 'Ready', progress: 'In progress', draft: 'Draft' };

const TEMPLATES = [
  { id: 'game', no: '01', name: 'Web game', desc: 'A canvas game loop, sprite helpers, and a score store — ready to play.', includes: ['Canvas', 'Vite', 'TS'] },
  { id: 'saas', no: '02', name: 'SaaS dashboard', desc: 'Auth, a data table, charts and a settings page on a tidy grid.', includes: ['Next', 'Charts', 'DB'] },
  { id: 'three', no: '03', name: '3D scene', desc: 'A lit three.js stage with orbit controls and a model loader.', includes: ['three', 'R3F', 'TS'] },
  { id: 'blank', no: '04', name: 'Blank', desc: 'An empty project. Bring your own structure.', includes: ['Vite', 'TS'] },
];

Object.assign(window, {
  Ico, I, Label, Mono, CallNo, Margin, Fn, Stamp, Chip, Av, Ph, Btn, IconBtn, Tabs,
  PROJECTS, STATUS_LABEL, TEMPLATES,
});


/* ===== proto-flow.jsx ===== */
/* proto-flow.jsx — Landing · Sign-in · Projects · New project */

// ── shared top bar ──
function TopBar({ active }) {
  const app = useApp();
  const item = (id, label) => (
    <button type="button" onClick={() => id === 'projects' && app.go('projects')}
      className="pxs-label"
      style={{ background: 'none', border: 'none', cursor: id === 'projects' ? 'pointer' : 'default',
        color: active === id ? 'var(--ink)' : undefined, borderBottom: active === id ? '2px solid var(--stamp)' : '2px solid transparent', paddingBottom: 3 }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 26px', height: 56, borderBottom: 'var(--bw) solid var(--rule)', flex: '0 0 auto' }}>
      <button type="button" onClick={() => app.go('projects')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span className="pxs-display" style={{ fontSize: 22, color: 'var(--ink)' }}>Praxis</span>
      </button>
      <div style={{ display: 'flex', gap: 18, marginLeft: 12 }}>{item('projects', 'Projects')}{item('profile', 'Profile')}{item('settings', 'Settings')}</div>
      <div style={{ flex: 1 }} />
      <IconBtn icon={app.theme === 'dark' ? I.sun : I.moon} onClick={app.toggleTheme} title="Toggle light / dark" />
      <Av initials="GC" kind="ink" />
    </div>
  );
}

// ════════════ LANDING ════════════
function Landing() {
  const app = useApp();
  return (
    <div className="pxs-ruled" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 36px', height: 58, borderBottom: 'var(--bw) solid var(--rule)', flex: '0 0 auto' }}>
        <span className="pxs-display" style={{ fontSize: 22 }}>Praxis</span>
        <div style={{ flex: 1 }} />
        <span className="pxs-label">How it works</span>
        <span className="pxs-label">Templates</span>
        <span className="pxs-label">Pricing</span>
        <Btn sm onClick={() => app.go('signin')}>Sign in</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: '1 1 0', padding: '64px 56px', display: 'flex', flexDirection: 'column', borderRight: 'var(--bw) solid var(--rule)', minWidth: 0 }}>
          <Stamp rot style={{ alignSelf: 'flex-start' }}>Build together · 2026</Stamp>
          <div className="pxs-display" style={{ fontSize: 'clamp(64px, 11vw, 118px)', marginTop: 22, letterSpacing: '-0.04em' }}>Praxis</div>
          <div style={{ fontStyle: 'italic', fontSize: 25, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.3, maxWidth: 460 }}>
            Two people, one AI assistant, and an afternoon — enough to turn an idea into a working app.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
            <Btn variant="stamp" icon={I.pen} onClick={() => app.go('signin')} style={{ padding: '13px 22px', fontSize: 13 }}>Get started</Btn>
            <Btn icon={I.book} style={{ padding: '13px 22px', fontSize: 13 }}>How it works</Btn>
          </div>
          <div style={{ flex: 1 }} />
          <Margin style={{ marginTop: 28 }}>No code required. Bring a partner and an idea.</Margin>
        </div>
        <div style={{ flex: '0 0 380px', padding: '64px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Label style={{ marginBottom: 16 }}>How it works</Label>
          {[['I', 'Start a project', 'Name it and pick a template.'],
            ['II', 'Invite a partner', 'They join with an email link.'],
            ['III', 'Describe it', 'Take turns telling the assistant what to build.'],
            ['IV', 'See it run', 'Watch it work live, and learn as you go.']].map(([r, t, d], i) => (
            <div key={r} style={{ display: 'flex', gap: 14, padding: '15px 0', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 22%,transparent)' : 'var(--bw) solid var(--rule)' }}>
              <span className="pxs-display" style={{ fontSize: 26, color: 'var(--stamp)', flex: '0 0 36px' }}>{r}</span>
              <div><div style={{ fontSize: 17, fontWeight: 600 }}>{t}</div><Margin style={{ marginTop: 2, fontSize: 12.5 }}>{d}</Margin></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════ SIGN IN ════════════
function SignIn() {
  const app = useApp();
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--paper)', padding: 40 }}>
      <button type="button" onClick={() => app.go('landing')} style={{ position: 'absolute', top: 24, left: 26, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }} className="pxs-label">{I.back} Back</button>
      <div className="pxs-card" style={{ width: '100%', maxWidth: 380, padding: 0 }}>
        <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="pxs-display" style={{ fontSize: 20 }}>Praxis</span>
          <span className="pxs-label" style={{ color: 'var(--paper)' }}>Sign in</span>
        </div>
        <div style={{ padding: '30px 28px' }}>
          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) setSent(true); }}>
              <div className="pxs-display" style={{ fontSize: 28 }}>Sign in</div>
              <Margin style={{ marginTop: 6, marginBottom: 22 }}>No password needed. Enter your email and we’ll send you a sign-in link.</Margin>
              <Label style={{ fontSize: 9, marginBottom: 7 }}>Email</Label>
              <input className="pxs-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
              <Btn type="submit" variant="primary" icon={I.arrowR} disabled={!email.trim()} style={{ width: '100%', marginTop: 16, padding: '12px' }}>Email me a link</Btn>
            </form>
          ) : (
            <div>
              <div className="pxs-display" style={{ fontSize: 26 }}>Check your inbox</div>
              <Margin style={{ marginTop: 8, marginBottom: 4 }}>We sent a sign-in link to</Margin>
              <div style={{ fontWeight: 600, marginBottom: 20, wordBreak: 'break-all' }}>{email}</div>
              <Btn variant="stamp" icon={I.check} onClick={() => app.signIn()} style={{ width: '100%', padding: '12px' }}>I clicked the link</Btn>
              <button type="button" onClick={() => setSent(false)} className="pxs-label" style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: 14, width: '100%' }}>Use a different email</button>
            </div>
          )}
          <div className="pxs-hr pxs-hr--hair" style={{ margin: '22px 0 14px' }} />
          <Margin style={{ margin: 0 }}>The link works for 10 minutes.</Margin>
        </div>
      </div>
      <Stamp rot style={{ marginTop: 26 }}>No password needed</Stamp>
    </div>
  );
}

// ════════════ PROJECTS ════════════
function Projects() {
  const app = useApp();
  const [tab, setTab] = React.useState('active');
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState('recent');
  const [view, setView] = React.useState('list');

  const list = PROJECTS
    .filter((p) => (tab === 'active' ? !p.archived : p.archived))
    .filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()));
  const counts = { active: PROJECTS.filter((p) => !p.archived).length, archived: PROJECTS.filter((p) => p.archived).length };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)' }}>
      <TopBar active="projects" />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '30px 40px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, gap: 16 }}>
            <div>
              <div className="pxs-display" style={{ fontSize: 42 }}>Your projects</div>
              <Margin style={{ fontSize: 14, marginTop: 4 }}>Open one to pick up where you left off, or start a new one.</Margin>
            </div>
            <Btn variant="stamp" icon={I.plus} onClick={() => app.go('newproject')}>New project</Btn>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
            <Tabs items={[{ id: 'active', label: 'Active · ' + counts.active }, { id: 'archived', label: 'Archived · ' + counts.archived }]} active={tab} onChange={setTab} />
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 10, color: 'var(--gray)', display: 'flex' }}>{I.search}</span>
              <input className="pxs-field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" style={{ width: 210, fontSize: 13, padding: '6px 10px 6px 30px' }} />
            </div>
            <div style={{ display: 'flex', marginLeft: 8 }}>
              <IconBtn icon={I.file} active={view === 'list'} onClick={() => setView('list')} title="List view" style={{ borderRight: 'none' }} />
              <IconBtn icon={I.book} active={view === 'shelf'} onClick={() => setView('shelf')} title="Shelf view" />
            </div>
          </div>

          {view === 'list' ? (
            <div className="pxs-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', background: 'var(--ink)', color: 'var(--paper)' }}>
                <div style={{ flex: '0 0 64px', textAlign: 'center', padding: '8px 0' }} className="pxs-label">#</div>
                <div style={{ flex: 1, padding: '8px 18px' }} className="pxs-label">Project</div>
                <div style={{ flex: '0 0 80px', padding: '8px 0' }} className="pxs-label">People</div>
                <div style={{ flex: '0 0 120px', padding: '8px 0' }} className="pxs-label">Status</div>
                <div style={{ flex: '0 0 90px', padding: '8px 0' }} className="pxs-label">Opened</div>
                <div style={{ flex: '0 0 120px' }} />
              </div>
              {list.length === 0 && <div style={{ padding: '40px', textAlign: 'center' }}><Margin>No projects match “{q.trim()}”.</Margin></div>}
              {list.map((p) => <ProjectRow key={p.id} p={p} onOpen={() => app.openProject(p.id)} />)}
            </div>
          ) : (
            <ShelfView list={list} onOpen={app.openProject} onNew={() => app.go('newproject')} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ p, onOpen }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid color-mix(in oklab,var(--ink) 22%,transparent)', background: hover ? 'var(--paper-3)' : 'transparent', cursor: p.archived ? 'default' : 'pointer' }}
      onClick={() => !p.archived && onOpen()}>
      <div style={{ flex: '0 0 64px', borderRight: '1px solid color-mix(in oklab,var(--ink) 22%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CallNo style={{ fontSize: 11, fontWeight: 700 }}>{p.no}</CallNo></div>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 18px' }}>
        <div style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic' }}>{p.title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{p.sub}</div>
      </div>
      <div style={{ flex: '0 0 80px', display: 'flex', alignItems: 'center' }}>{p.authors.map((a, i) => <Av key={i} initials={a.in} kind={a.kind} style={{ marginLeft: i ? -6 : 0 }} />)}</div>
      <div style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center' }}>
        {p.status === 'live' ? <Stamp solid>{STATUS_LABEL[p.status]}</Stamp> : p.status === 'ready' ? <Stamp>{STATUS_LABEL[p.status]}</Stamp> : <Chip>{STATUS_LABEL[p.status]}</Chip>}
      </div>
      <div style={{ flex: '0 0 90px', display: 'flex', alignItems: 'center' }}><CallNo style={{ fontSize: 10 }}>{p.date}</CallNo></div>
      <div style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingRight: 16 }}>
        {p.archived ? <Btn sm>Restore</Btn> : <Btn sm variant={hover ? 'primary' : undefined} icon={I.arrowR}>Open</Btn>}
      </div>
    </div>
  );
}

function ShelfView({ list, onOpen, onNew }) {
  const fills = ['var(--paper)', 'var(--ink)', 'var(--paper-3)', 'var(--paper)', 'var(--paper-2)', 'var(--paper)'];
  const heights = [300, 340, 280, 320, 300, 290];
  return (
    <div className="pxs-card" style={{ padding: '34px 34px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        {list.map((p, i) => {
          const fill = fills[i % fills.length]; const onInk = fill === 'var(--ink)';
          return (
            <button key={p.id} type="button" onClick={() => !p.archived && onOpen(p.id)}
              style={{ width: 60, height: heights[i % heights.length], background: fill, border: 'var(--bw) solid var(--rule)', boxShadow: 'var(--sh) var(--sh) 0 var(--shadow)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', flex: '0 0 auto' }}>
              <CallNo style={{ fontSize: 9, color: onInk ? 'var(--paper)' : 'var(--ink)' }}>{p.no}</CallNo>
              <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: onInk ? 'var(--paper)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{p.title}</div>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.status === 'live' ? 'var(--stamp)' : 'transparent', border: p.status === 'live' ? 'none' : '2px solid ' + (onInk ? 'var(--paper)' : 'var(--ink)') }} />
            </button>
          );
        })}
        <button type="button" onClick={onNew} style={{ width: 60, height: 300, border: '2px dashed color-mix(in oklab,var(--ink) 45%,transparent)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="pxs-label">+ New</span>
        </button>
      </div>
      <div style={{ height: 10, background: 'var(--ink)', boxShadow: 'var(--sh) var(--sh) 0 var(--shadow)', marginTop: 0 }} />
      <Margin style={{ padding: '14px 0 16px' }}>Click a spine to open it. A red dot means it’s live.</Margin>
    </div>
  );
}

// ════════════ NEW PROJECT ════════════
function NewProject() {
  const app = useApp();
  const [name, setName] = React.useState('');
  const [tpl, setTpl] = React.useState('saas');
  const [partner, setPartner] = React.useState('');
  return (
    <div className="pxs-grid-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 34px', height: 64, borderBottom: 'var(--bw) solid var(--rule)', background: 'var(--paper)', flex: '0 0 auto' }}>
        <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.book}</span>
        <span className="pxs-display" style={{ fontSize: 24, whiteSpace: 'nowrap' }}>New project</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => app.go('projects')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', display: 'flex' }}>{I.x}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '26px 34px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1020, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}><span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>1</span><Label style={{ fontSize: 10 }}>Project name</Label></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: 'var(--bw) solid var(--rule)', paddingBottom: 6 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled" autoFocus
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 34, fontWeight: 600, color: 'var(--ink)' }} />
            <CallNo style={{ whiteSpace: 'nowrap' }}>saved as #5</CallNo>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}><span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>2</span><Label style={{ fontSize: 10 }}>Choose a template</Label><Margin style={{ margin: 0, marginLeft: 6 }}>each one comes set up with the right tools to start.</Margin></div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            {TEMPLATES.map((t) => <TemplateCard key={t.id} t={t} selected={tpl === t.id} onSelect={() => setTpl(t.id)} />)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}><span className="pxs-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--stamp)' }}>3</span><Label style={{ fontSize: 10 }}>Invite a partner</Label></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Av initials="GC" kind="ink" /><span className="pxs-mono" style={{ color: 'var(--gray)' }}>＋</span>
              <input className="pxs-field" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="partner’s email…" style={{ maxWidth: 280, fontSize: 13, padding: '8px 11px' }} />
              <Margin style={{ margin: 0 }}>they’ll get an email invite.</Margin>
            </div>
          </div>
          <Btn variant="primary" icon={I.pen} onClick={() => app.newProject(name.trim() || 'Untitled', tpl)} style={{ padding: '12px 22px', fontSize: 12.5 }}>Create project</Btn>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ t, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      style={{ flex: '1 1 0', minWidth: 0, textAlign: 'left', cursor: 'pointer', border: 'var(--bw) solid var(--rule)',
        boxShadow: selected ? 'var(--sh) var(--sh) 0 var(--stamp)' : 'var(--sh) var(--sh) 0 var(--shadow)',
        background: selected ? 'var(--paper)' : 'var(--paper-2)', display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: 'var(--bw) solid var(--rule)', background: selected ? 'var(--ink)' : 'transparent', color: selected ? 'var(--paper)' : 'var(--ink)' }}>
        <CallNo style={{ fontSize: 10, color: 'inherit' }}>{t.no}</CallNo>
        {selected ? <Stamp solid>✓ Selected</Stamp> : <span className="pxs-mono" style={{ fontSize: 10, color: 'var(--gray)' }}>○</span>}
      </div>
      <Ph label="cover" style={{ height: 80, border: 'none' }} />
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{t.name}</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4, margin: '5px 0 12px' }}>{t.desc}</p>
        <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {t.includes.map((x) => <span key={x} className="pxs-callno" style={{ fontSize: 9.5, border: '1px solid color-mix(in oklab,var(--ink) 30%,transparent)', padding: '1px 5px' }}>{x}</span>)}
        </div>
      </div>
    </button>
  );
}

Object.assign(window, { TopBar, Landing, SignIn, Projects, NewProject });


/* ===== proto-workspace.jsx ===== */
/* proto-workspace.jsx — the interactive Workspace.
   Files · Code/Preview/Git/Usage · Chat with a scripted assistant + turn-taking. */

// tiny syntax tint — strings in accent, keywords/comments muted
function hl(line) {
  const re = /('[^']*'|"[^"]*"|`[^`]*`|\/\/.*$|\b(?:import|export|default|function|const|let|return|from|new|await|async|if|for)\b)/g;
  const out = []; let m, last = 0, k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0]; const isStr = /^['"`]/.test(tok); const isCom = tok.startsWith('//');
    out.push(<span key={k++} style={{ color: 'var(--stamp)', ...(isStr ? {} : { color: 'var(--gray)' }), ...(isCom ? { color: 'var(--gray)', fontStyle: 'italic' } : {}) }}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const FILES = {
  'App.tsx': { dir: 'src', peer: null, lines: [
    "import { useTides } from './tide'", "import { TideChart } from './chart'", '',
    'export default function App() {', "  const tides = useTides('monterey')", '  return (',
    '    <main className="guide">', '      <h1>Monterey tide pools</h1>', '      <TideChart data={tides} />',
    '      <PoolList />', '    </main>', '  )', '}'] },
  'tide.ts': { dir: 'src', peer: 'MR', lines: [
    "import { useState, useEffect } from 'react'", '', 'export function useTides(station: string) {',
    '  const [data, setData] = useState([])', '  useEffect(() => {', "    fetch(`/data/noaa.json`)",
    '      .then((r) => r.json())', '      .then(setData)', '  }, [station])', '  return data', '}'] },
  'chart.tsx': { dir: 'src', peer: null, lines: [
    "import { scaleLow } from './tide'", '', 'export function TideChart({ data }) {', '  return (',
    '    <div className="chart">', '      {data.map((t) => (', '        <Bar key={t.h} height={t.m}',
    '          low={t.m < 0.3} />', '      ))}', '    </div>', '  )', '}'] },
  'theme.css': { dir: 'src', peer: null, lines: [
    ':root {', '  --sea: #1d3a4a;', '  --low: #97331f;', '  --sand: #f1e8d2;', '}',
    '.guide { background: var(--sand); }', '.chart { display: flex; gap: 4px; }',
    '.bar.low { background: var(--low); }'] },
  'index.html': { dir: 'public', peer: null, lines: ['<!doctype html>', '<html>', '  <head>', '    <title>Tide</title>', '  </head>', '  <body>', '    <div id="root"></div>', '  </body>', '</html>'] },
  'noaa.json': { dir: 'data', peer: null, lines: ['[', '  { "h": "00:00", "m": 1.8 },', '  { "h": "06:00", "m": 0.2 },', '  { "h": "12:00", "m": 1.6 },', '  { "h": "18:00", "m": 0.1 }', ']'] },
  'README.md': { dir: '', peer: null, lines: ['# Tide', '', 'A tide-pool field guide for the', 'Monterey coast. Built with Praxis.', '', '- 24-hour tide chart', '- low-tide windows shaded', '- a guide to common pools'] },
};
const FILE_ORDER = ['App.tsx', 'tide.ts', 'chart.tsx', 'theme.css', 'index.html', 'noaa.json', 'README.md'];

const REPLIES = [
  { k: ['chart', 'graph', 'tide', 'bar'], text: 'Updated the chart — the bars now scale to the daily range, and the axis is in metres.', ann: [['edit', 'wrote chart.tsx · +18']], file: 'chart.tsx' },
  { k: ['color', 'colour', 'dark', 'theme', 'red', 'shade'], text: 'Adjusted the palette in theme.css. Low-tide windows now read in the accent colour.', ann: [['edit', 'wrote theme.css · +6']], file: 'theme.css' },
  { k: ['list', 'pool', 'card'], text: 'Reworked the pool list into cards, each with a depth badge.', ann: [['edit', 'wrote App.tsx · +24']], file: 'App.tsx' },
  { k: ['mobile', 'responsive', 'phone', 'small'], text: 'Made the layout stack on narrow screens; the chart scrolls sideways.', ann: [['edit', 'wrote theme.css · +12']], file: 'theme.css' },
  { k: ['search', 'filter', 'find'], text: 'Added a search box above the list that filters pools as you type.', ann: [['edit', 'wrote App.tsx · +31']], file: 'App.tsx' },
];
const GENERIC = [
  { text: 'Done — pushed that change and the preview just reloaded.', ann: [['edit', 'wrote App.tsx · +9']], file: 'App.tsx' },
  { text: 'Got it. I’ve made the change — take a look at the Preview tab.', ann: [['bolt', 'reloaded preview']] },
  { text: 'That’s in. I kept it consistent with the rest of the guide.', ann: [['edit', 'wrote chart.tsx · +7']], file: 'chart.tsx' },
];

function Workspace() {
  const app = useApp();
  const proj = app.project || PROJECTS[0];
  const [tab, setTab] = React.useState('code');
  const [file, setFile] = React.useState('App.tsx');
  const [mode, setMode] = React.useState('turns');     // 'turns' | 'anyone'
  const [holder, setHolder] = React.useState('GC');     // who's in control (turns mode)
  const [input, setInput] = React.useState('');
  const [thinking, setThinking] = React.useState(false);
  const [learnOpen, setLearnOpen] = React.useState(false);
  const [learnRead, setLearnRead] = React.useState(2);
  const [flash, setFlash] = React.useState(null);
  const genIdx = React.useRef(0);
  const idRef = React.useRef(100);
  const scrollRef = React.useRef(null);
  const [msgs, setMsgs] = React.useState([
    { id: 1, who: 'MR', name: 'Milo', time: '14:02', text: 'Add a 24-hour tide chart above the pool list.' },
    { id: 2, who: 'AI', name: 'Assistant', time: '14:03', agent: true, text: 'Charted the next 24 hours from the NOAA feed and slotted it above the list. The y-axis is in metres.', ann: [['bolt', 'read noaa.json'], ['edit', 'wrote chart.tsx · +48']], foot: '3' },
    { id: 3, who: 'GC', name: 'Grace', time: '14:07', text: 'Lovely. Can the low-tide windows be shaded?' },
    { id: 4, who: 'AI', name: 'Assistant', time: '14:08', agent: true, text: 'Shaded every window below 0.3 m in the accent colour.', ann: [['edit', 'wrote chart.tsx · +12']] },
  ]);

  const canPrompt = mode === 'anyone' || holder === 'GC';
  const nid = () => ++idRef.current;
  const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  React.useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, thinking]);

  function assistantReply(promptText) {
    const lc = promptText.toLowerCase();
    const hit = REPLIES.find((r) => r.k.some((w) => lc.includes(w)));
    const reply = hit || GENERIC[genIdx.current++ % GENERIC.length];
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMsgs((m) => [...m, { id: nid(), who: 'AI', name: 'Assistant', time: now(), agent: true, text: reply.text, ann: reply.ann }]);
      if (reply.file) { setFlash(reply.file); setTimeout(() => setFlash(null), 1600); }
    }, 1100);
  }

  function send(e) {
    e && e.preventDefault();
    const text = input.trim(); if (!text || !canPrompt) return;
    setMsgs((m) => [...m, { id: nid(), who: 'GC', name: 'Grace', time: now(), text }]);
    setInput('');
    assistantReply(text);
  }

  function passToMilo() {
    setHolder('MR');
    setTimeout(() => {
      setMsgs((m) => [...m, { id: nid(), who: 'MR', name: 'Milo', time: now(), text: 'Can you add a search box above the pool list?' }]);
      assistantReply('add a search box');
    }, 1600);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper)' }}>
      {/* MASTHEAD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 58, borderBottom: 'var(--bw) solid var(--rule)', flex: '0 0 auto' }}>
        <button type="button" onClick={() => app.go('projects')} title="Back to projects" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)', display: 'flex' }}>{I.back}</button>
        <CallNo style={{ fontWeight: 700, fontSize: 12 }}>{proj.no}</CallNo>
        <div style={{ minWidth: 0, flex: '0 1 auto' }}><div style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.title} — {proj.sub.toLowerCase()}</div></div>
        <Chip>v0.3</Chip>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'var(--bw) solid var(--rule)', padding: '4px 10px 4px 6px', background: 'var(--paper-2)' }}>
          <span className="pxs-label" style={{ fontSize: 9 }}>In control</span>
          <Av initials={mode === 'anyone' ? 'GC' : holder} kind={holder === 'GC' ? 'ink' : ''} />
          <span style={{ color: 'var(--stamp)', display: 'flex' }}>{I.pen}</span>
        </div>
        <Tabs items={[{ id: 'turns', label: 'Take turns' }, { id: 'anyone', label: 'Anyone' }]} active={mode} onChange={(v) => { setMode(v); if (v === 'anyone') setHolder('GC'); }}
          style={{ ['--bw']: '2px' }} />
        <Stamp solid>● Live</Stamp>
        <IconBtn icon={app.theme === 'dark' ? I.sun : I.moon} onClick={app.toggleTheme} title="Light / dark" />
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* FILES */}
        <div style={{ flex: '0 0 256px', borderRight: 'var(--bw) solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: 'var(--bw) solid var(--rule)' }}>
            <Label>Files</Label><Btn sm icon={I.plus}>Invite</Btn>
          </div>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid color-mix(in oklab,var(--ink) 20%,transparent)' }}>
            <Label style={{ fontSize: 9, marginBottom: 7 }}>Who’s here</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av initials="GC" kind="ink" /><span style={{ fontSize: 13, fontWeight: 600 }}>Grace</span><span className="pxs-chip" style={{ marginLeft: 4, fontSize: 8.5, padding: '1px 5px' }}>you</span><Margin style={{ margin: 0, marginLeft: 'auto', fontSize: 11 }}>{file}</Margin></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av initials="MR" /><span style={{ fontSize: 13, fontWeight: 600 }}>Milo</span>{holder === 'MR' && <span style={{ color: 'var(--stamp)', display: 'flex', marginLeft: 4 }}>{I.pen}</span>}<Margin style={{ margin: 0, marginLeft: 'auto', fontSize: 11 }}>tide.ts</Margin></div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingTop: 6 }}>
            <FileRow name="src" dir />
            {FILE_ORDER.filter((f) => FILES[f].dir === 'src').map((f) => <FileRow key={f} name={f} depth={1} active={file === f} peer={FILES[f].peer} flash={flash === f} onClick={() => { setFile(f); setTab('code'); }} />)}
            <FileRow name="public" dir />
            {FILE_ORDER.filter((f) => FILES[f].dir === 'public').map((f) => <FileRow key={f} name={f} depth={1} active={file === f} flash={flash === f} onClick={() => { setFile(f); setTab('code'); }} />)}
            <FileRow name="data" dir />
            {FILE_ORDER.filter((f) => FILES[f].dir === 'data').map((f) => <FileRow key={f} name={f} depth={1} active={file === f} flash={flash === f} onClick={() => { setFile(f); setTab('code'); }} />)}
            {FILE_ORDER.filter((f) => FILES[f].dir === '').map((f) => <FileRow key={f} name={f} active={file === f} flash={flash === f} onClick={() => { setFile(f); setTab('code'); }} />)}
          </div>
          <div style={{ borderTop: '1px solid color-mix(in oklab,var(--ink) 20%,transparent)', padding: '8px 14px' }}>
            <Margin>Files someone else is viewing show their initials.</Margin>
          </div>
        </div>

        {/* WORKBENCH */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 16px 0', borderBottom: 'var(--bw) solid var(--rule)' }}>
            <Tabs items={[{ id: 'code', label: 'Code' }, { id: 'preview', label: 'Preview' }, { id: 'git', label: 'Git' }, { id: 'usage', label: 'Usage' }]} active={tab} onChange={setTab} />
            <div style={{ flex: 1 }} />
            <CallNo style={{ paddingBottom: 8, fontSize: 10 }}>{tab === 'code' ? 'src/' + file + ' · ' + FILES[file].lines.length + ' lines' : tab === 'preview' ? 'preview · :4173' : tab}</CallNo>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: tab === 'code' ? 'flex' : 'none', flexDirection: 'column' }}><Editor file={file} /></div>
          {tab === 'preview' && <div style={{ flex: 1, minHeight: 0 }}><PreviewApp /></div>}
          {tab === 'git' && <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}><GitPanel /></div>}
          {tab === 'usage' && <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}><UsagePanel /></div>}
        </div>

        {/* CHAT */}
        <div style={{ flex: '0 0 360px', borderLeft: 'var(--bw) solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: 'var(--bw) solid var(--rule)' }}>
            <Label>Chat</Label>
            {mode === 'turns' && (holder === 'GC'
              ? <Btn sm onClick={passToMilo}>Pass to Milo</Btn>
              : <Btn sm variant="stamp" onClick={() => setHolder('GC')}>Take control back</Btn>)}
          </div>
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {msgs.map((m, i) => <Entry key={m.id} m={m} n={i + 1} />)}
            {thinking && <div style={{ display: 'flex', gap: 10, padding: '13px 16px', borderTop: '1px solid color-mix(in oklab,var(--ink) 16%,transparent)' }}><Av initials="AI" kind="stamp" /><span className="pxs-margin" style={{ margin: 0 }}>the assistant is writing<Dots /></span></div>}
          </div>
          <form onSubmit={send} style={{ borderTop: 'var(--bw) solid var(--rule)', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Av initials="GC" kind="ink" />
              <input className="pxs-field" value={input} onChange={(e) => setInput(e.target.value)} disabled={!canPrompt}
                placeholder={canPrompt ? 'Message the assistant…' : 'Milo is prompting…'} style={{ fontSize: 13, padding: '7px 10px' }} />
              <Btn type="submit" variant="primary" sm icon={I.arrowR} disabled={!canPrompt || !input.trim()}>Send</Btn>
            </div>
            <Margin>{canPrompt ? (mode === 'turns' ? 'You’re in control — Grace can ask for a turn anytime.' : 'Anyone can prompt; messages line up in order.') : 'Milo has the turn — take control back when you’re ready.'}</Margin>
          </form>
          {/* learn */}
          <div style={{ borderTop: 'var(--bw) solid var(--rule)', background: 'var(--paper-2)' }}>
            <button type="button" onClick={() => setLearnOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.book}</span>
              <Label style={{ fontSize: 9 }}>Learn · Suggested reading</Label>
              <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>{learnRead} / 5 read</span>
              <span style={{ display: 'flex', color: 'var(--gray)' }}>{learnOpen ? I.chevD : I.chevR}</span>
            </button>
            {learnOpen && (
              <div style={{ padding: '0 16px 12px' }}>
                {[['Fetching & charting time-series', 'react.dev', '3'], ['Reading a tide table', 'noaa.gov', null], ['Shading SVG regions', 'mdn', null]].map((r, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer' }}>
                    <span onClick={() => setLearnRead((n) => Math.min(5, n + (i < 2 ? 0 : 1)))} style={{ width: 16, height: 16, border: '1.5px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: i < 2 ? 'var(--ink)' : 'transparent', color: 'var(--paper)' }}>{i < 2 && I.check}</span>
                    {r[2] ? <Fn n={r[2]} /> : <span style={{ width: 9 }} />}
                    <span style={{ fontSize: 13, flex: 1, textDecoration: i < 2 ? 'line-through' : 'none', color: i < 2 ? 'var(--gray)' : 'var(--ink)' }}>{r[0]}</span>
                    <span className="pxs-mono" style={{ fontSize: 10, color: 'var(--gray)' }}>{r[1]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dots() {
  const [n, setN] = React.useState(1);
  React.useEffect(() => { const t = setInterval(() => setN((x) => (x % 3) + 1), 400); return () => clearInterval(t); }, []);
  return <span>{'.'.repeat(n)}</span>;
}

function FileRow({ name, depth = 0, active, peer, dir, flash, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, cursor: onClick ? 'pointer' : 'default',
      padding: '5px 14px 5px ' + (14 + depth * 16) + 'px',
      background: flash ? 'color-mix(in oklab,var(--stamp) 22%,transparent)' : active ? 'var(--paper-3)' : 'transparent',
      borderLeft: active ? '3px solid var(--stamp)' : '3px solid transparent', fontSize: 13.5, transition: 'background .3s',
    }}>
      <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{dir ? I.folder : I.file}</span>
      <span style={{ fontWeight: dir ? 600 : 400 }}>{name}</span>
      {peer && <span className="pxs-mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--stamp)', marginLeft: 'auto', border: '1.5px solid var(--stamp)', padding: '0 4px' }}>{peer}</span>}
    </div>
  );
}

function Entry({ m, n }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '13px 16px', borderTop: '1px solid color-mix(in oklab,var(--ink) 16%,transparent)' }}>
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Av initials={m.who} kind={m.who === 'AI' ? 'stamp' : m.who === 'GC' ? 'ink' : ''} />
        <span className="pxs-mono" style={{ fontSize: 8.5, color: 'var(--gray)' }}>{String(n).padStart(2, '0')}</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</span>
          {m.agent && <span className="pxs-mono" style={{ fontSize: 8.5, letterSpacing: '0.12em', color: 'var(--stamp)', textTransform: 'uppercase' }}>Assistant</span>}
          <span className="pxs-mono" style={{ fontSize: 9.5, color: 'var(--gray)', marginLeft: 'auto' }}>{m.time}</span>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: m.agent ? 'var(--ink)' : 'var(--ink-2)', fontStyle: m.agent ? 'normal' : 'italic' }}>{m.text}{m.foot && <Fn n={m.foot} />}</div>
        {m.ann && m.ann.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
            <span style={{ color: 'var(--stamp)', display: 'flex' }}>{a[0] === 'edit' ? I.pen : I.bolt}</span>
            <span className="pxs-mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{a[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor({ file }) {
  const f = FILES[file];
  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', fontFamily: '"Space Mono", monospace', fontSize: 12.5, lineHeight: '22px', padding: '6px 0' }}>
        {f.lines.map((ln, i) => (
          <div key={i} style={{ display: 'flex' }}>
            <span style={{ flex: '0 0 46px', textAlign: 'right', paddingRight: 12, color: 'var(--gray)', borderRight: '1px solid color-mix(in oklab,var(--ink) 16%,transparent)', userSelect: 'none' }}>{i + 1}</span>
            <span style={{ paddingLeft: 14, whiteSpace: 'pre-wrap' }}>{hl(ln)}
              {f.peer === 'MR' && i === 3 && <><span style={{ display: 'inline-block', width: 2, height: 15, background: 'var(--stamp)', verticalAlign: 'middle', marginLeft: 2 }} /><span className="pxs-mono" style={{ fontSize: 8.5, fontWeight: 700, background: 'var(--stamp)', color: 'var(--stamp-ink)', padding: '0 3px', marginLeft: 2 }}>Milo</span></>}
            </span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: 'var(--bw) solid var(--rule)', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {f.peer === 'MR' ? <Margin style={{ margin: 0 }}>Milo is editing this file — you can see his cursor.</Margin> : <Margin style={{ margin: 0 }}>Saved automatically.</Margin>}
        <div style={{ flex: 1 }} /><CallNo style={{ fontSize: 10 }}>{file.endsWith('.css') ? 'CSS' : file.endsWith('.json') ? 'JSON' : file.endsWith('.md') ? 'MD' : file.endsWith('.html') ? 'HTML' : 'TSX'} · UTF-8</CallNo>
      </div>
    </>
  );
}

// faux running app — built from simple rects (a tide chart) + a list
function PreviewApp() {
  const bars = [1.8, 1.2, 0.6, 0.2, 0.5, 1.1, 1.6, 1.4, 0.9, 0.3, 0.1, 0.7];
  const max = 2;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Stamp>Live preview</Stamp><CallNo>tide.preview.praxis.dev</CallNo><div style={{ flex: 1 }} /><Btn sm>Open ▸</Btn>
      </div>
      <div style={{ flex: 1, border: 'var(--bw) solid var(--rule)', background: 'var(--field)', overflow: 'auto', padding: '22px 24px' }}>
        <div className="pxs-display" style={{ fontSize: 26 }}>Monterey tide pools</div>
        <Margin style={{ marginTop: 2 }}>Next 24 hours · heights in metres</Margin>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, marginTop: 18, borderBottom: '2px solid var(--rule)', paddingBottom: 0 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ flex: 1, height: (b / max * 100) + '%', background: b < 0.3 ? 'var(--stamp)' : 'var(--ink)', border: '1px solid var(--rule)' }} title={b + ' m'} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><CallNo style={{ fontSize: 9 }}>00:00</CallNo><CallNo style={{ fontSize: 9 }}>12:00</CallNo><CallNo style={{ fontSize: 9 }}>24:00</CallNo></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {[['Sea star pool', '0.1 m'], ['Anemone shelf', '0.2 m'], ['Urchin crack', '0.3 m']].map((p) => (
            <div key={p[0]} className="pxs-card pxs-card--flat" style={{ flex: 1, padding: 12, boxShadow: 'none' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p[0]}</div>
              <Chip style={{ marginTop: 6 }}>best at {p[1]}</Chip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GitPanel() {
  const changed = [['chart.tsx', '+18', '−2'], ['theme.css', '+6', '−1'], ['App.tsx', '+24', '−0']];
  const history = [['Shade low-tide windows', 'Assistant · for Grace', '14:08'], ['Add 24-hour tide chart', 'Assistant · for Milo', '14:03'], ['Initial commit from template', 'Praxis', '13:40']];
  return (
    <div style={{ padding: '18px 20px' }}>
      <Label style={{ marginBottom: 10 }}>Uncommitted changes · 3 files</Label>
      <div className="pxs-card" style={{ padding: 0, marginBottom: 18 }}>
        {changed.map((c, i) => (
          <div key={c[0]} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 18%,transparent)' : 'none' }}>
            <span style={{ color: 'var(--ink-2)', display: 'flex' }}>{I.file}</span>
            <span className="pxs-mono" style={{ fontSize: 12.5 }}>{c[0]}</span>
            <div style={{ flex: 1 }} />
            <span className="pxs-mono" style={{ fontSize: 11, color: 'var(--stamp)' }}>{c[1]}</span>
            <span className="pxs-mono" style={{ fontSize: 11, color: 'var(--gray)' }}>{c[2]}</span>
          </div>
        ))}
      </div>
      <input className="pxs-field" placeholder="Describe this change…" style={{ marginBottom: 10 }} />
      <Btn variant="primary" icon={I.branch}>Commit & push</Btn>
      <Label style={{ margin: '24px 0 10px' }}>History</Label>
      <div style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 16 }}>
        {history.map((h, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: 16 }}>
            <span style={{ position: 'absolute', left: -22, top: 3, width: 9, height: 9, background: 'var(--paper)', border: '2px solid var(--rule)', borderRadius: '50%' }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{h[0]}</div>
            <div style={{ display: 'flex', gap: 8 }}><Margin style={{ margin: 0 }}>{h[1]}</Margin><CallNo style={{ fontSize: 10, marginLeft: 'auto' }}>{h[2]}</CallNo></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsagePanel() {
  const pct = 24;
  return (
    <div style={{ padding: '18px 20px', maxWidth: 560 }}>
      <Label style={{ marginBottom: 10 }}>This project · budget</Label>
      <div className="pxs-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="pxs-display" style={{ fontSize: 34 }}>$2.40</span>
          <span className="pxs-mono" style={{ color: 'var(--gray)' }}>of $10.00</span>
          <div style={{ flex: 1 }} /><Stamp>{pct}% used</Stamp>
        </div>
        <div style={{ height: 16, border: 'var(--bw) solid var(--rule)', marginTop: 14, background: 'var(--field)', position: 'relative' }}>
          <div style={{ width: pct + '%', height: '100%', background: 'var(--stamp)' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Btn sm>Raise budget</Btn><Btn sm>Set alert</Btn></div>
      </div>
      <Label style={{ margin: '24px 0 10px' }}>By session</Label>
      <div className="pxs-card" style={{ padding: 0 }}>
        {[['Session 7 · today', '$0.92', 'Grace + Milo'], ['Session 6 · yesterday', '$0.64', 'Grace'], ['Session 5 · Mon', '$0.84', 'Milo']].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: i ? '1px solid color-mix(in oklab,var(--ink) 18%,transparent)' : 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{s[0].split(' · ')[0]}</span>
            <CallNo style={{ fontSize: 10 }}>{s[0].split(' · ')[1]}</CallNo>
            <div style={{ flex: 1 }} />
            <Margin style={{ margin: 0, whiteSpace: 'nowrap' }}>{s[2]}</Margin>
            <span className="pxs-mono" style={{ fontSize: 13, fontWeight: 700 }}>{s[1]}</span>
          </div>
        ))}
      </div>
      <Margin style={{ marginTop: 14 }}>You bring your own AI subscription; Praxis meters each project so a runaway build can’t surprise you.</Margin>
    </div>
  );
}

Object.assign(window, { Workspace });


/* ===== proto-app.jsx ===== */
/* proto-app.jsx — root: routing, theme, Tweaks, persistence */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "#97331f",
  "borderWeight": 2,
  "shadow": 4,
  "font": "Newsreader",
  "density": "cozy"
}/*EDITMODE-END*/;

const FONT_STACK = {
  Newsreader: '"Newsreader", Georgia, serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  System: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const NAV_KEY = 'praxis.proto.nav.v1';

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [nav, setNav] = React.useState(() => {
    try { const s = JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); if (s && s.screen) return s; } catch (e) {}
    return { screen: 'landing', projectId: null };
  });
  const [newProj, setNewProj] = React.useState(null);

  React.useEffect(() => {
    try { localStorage.setItem(NAV_KEY, JSON.stringify(nav)); } catch (e) {}
  }, [nav]);

  const project = nav.projectId === '__new' ? newProj : PROJECTS.find((p) => p.id === nav.projectId);

  const api = React.useMemo(() => ({
    screen: nav.screen,
    theme: t.dark ? 'dark' : 'light',
    toggleTheme: () => setTweak('dark', !t.dark),
    project,
    go: (screen) => setNav((n) => ({ ...n, screen })),
    openProject: (id) => setNav({ screen: 'workspace', projectId: id }),
    signIn: () => setNav({ screen: 'projects', projectId: null }),
    newProject: (name, tplId) => {
      const tpl = TEMPLATES.find((x) => x.id === tplId);
      setNewProj({ id: '__new', no: '#005', title: name, sub: tpl ? tpl.name.toLowerCase() : 'new project', authors: [{ in: 'GC', kind: 'ink' }, { in: 'MR' }], status: 'draft', date: 'now' });
      setNav({ screen: 'workspace', projectId: '__new' });
    },
  }), [nav, t.dark, project]);

  const rootStyle = {
    width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    '--stamp': t.accent,
    '--bw': t.borderWeight + 'px',
    '--sh': t.shadow + 'px',
    '--font-serif': FONT_STACK[t.font] || FONT_STACK.Newsreader,
  };

  const Screen = { landing: Landing, signin: SignIn, projects: Projects, newproject: NewProject, workspace: Workspace }[nav.screen] || Landing;

  return (
    <PraxisCtx.Provider value={api}>
      <div className={'pxs' + (t.dark ? ' dark' : '')} data-density={t.density} style={rootStyle}>
        <Screen />
      </div>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakColor label="Accent" value={t.accent} options={['#97331f', '#3a4f86', '#3a6b46', '#1d1810']} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Structure" />
        <TweakSlider label="Border weight" value={t.borderWeight} min={1} max={3} step={0.5} unit="px" onChange={(v) => setTweak('borderWeight', v)} />
        <TweakSlider label="Shadow depth" value={t.shadow} min={0} max={7} unit="px" onChange={(v) => setTweak('shadow', v)} />
        <TweakSection label="Type & density" />
        <TweakRadio label="Typeface" value={t.font} options={['Newsreader', 'Georgia', 'System']} onChange={(v) => setTweak('font', v)} />
        <TweakRadio label="Density" value={t.density} options={['cozy', 'compact']} onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </PraxisCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);


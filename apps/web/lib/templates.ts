// Project template registry (STORY-27). Drives the create-form picker and POST
// validation. Each id must have a matching templates/<id>/ directory shipped to
// the orchestrator (it seeds the sandbox from there). Keep the two in sync.

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
}

export const TEMPLATES: readonly TemplateOption[] = [
  {
    id: 'react-threejs-scene',
    name: 'React + Three.js',
    description: 'A 3D scene starter — Vite + React + react-three-fiber.',
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty workspace — start from scratch with the agent.',
  },
];

export const DEFAULT_TEMPLATE_ID = 'react-threejs-scene';

export function isTemplateId(value: unknown): value is string {
  return typeof value === 'string' && TEMPLATES.some((t) => t.id === value);
}

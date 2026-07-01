// Image generation for the `generate_image` MCP tool (STORY-15). The OpenAI
// client is injected so the pure path/size/slug logic and the write flow are
// unit-testable without a real API call.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** The minimal slice of the OpenAI Images API we depend on (so tests can fake it). */
export interface ImagesClient {
  images: {
    generate(params: {
      model: string;
      prompt: string;
      size: string;
      n: number;
    }): Promise<{ data?: Array<{ b64_json?: string; url?: string }> }>;
  };
}

export interface GenerateDeps {
  client: ImagesClient;
  /** Texture output dir for the default save path + the write-confinement root. */
  texturesDir: string;
  /** Files may only be written under this root (path-traversal guard). */
  workspaceRoot: string;
  model: string;
  /** Fetch used to download a URL-form image response (DALL·E). Injected for tests. */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
}

export interface GenerateArgs {
  prompt: string;
  width?: number;
  height?: number;
  save_path?: string;
}

/** A filesystem-safe slug from the prompt for the default filename. */
export function slugify(prompt: string): string {
  const s = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return s || 'texture';
}

/** Map requested pixels to a size the image model accepts (gpt-image-1 set). */
export function sizeFor(width?: number, height?: number): string {
  if (!width || !height || width === height) return '1024x1024';
  return width > height ? '1536x1024' : '1024x1536';
}

/** Resolve the write path, defaulting to <texturesDir>/<slug>.png, and refuse any
 *  path that escapes the workspace root (the tool is agent-driven — guard it). */
export function resolveSavePath(
  savePath: string | undefined,
  prompt: string,
  texturesDir: string,
  workspaceRoot: string,
): string {
  const target = savePath
    ? isAbsolute(savePath)
      ? savePath
      : resolve(workspaceRoot, savePath)
    : resolve(texturesDir, `${slugify(prompt)}.png`);
  const rel = relative(workspaceRoot, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`save_path escapes the workspace: ${savePath}`);
  }
  return target;
}

/** Generate an image and write it to disk; returns the absolute path written. */
export async function generateImage(args: GenerateArgs, deps: GenerateDeps): Promise<string> {
  if (!args.prompt || !args.prompt.trim()) throw new Error('prompt is required');
  const target = resolveSavePath(args.save_path, args.prompt, deps.texturesDir, deps.workspaceRoot);

  const res = await deps.client.images.generate({
    model: deps.model,
    prompt: args.prompt,
    size: sizeFor(args.width, args.height),
    n: 1,
  });
  const first = res.data?.[0];
  if (!first) throw new Error('image API returned no data');

  let bytes: Buffer;
  if (first.b64_json) {
    bytes = Buffer.from(first.b64_json, 'base64');
  } else if (first.url) {
    const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as GenerateDeps['fetchImpl']);
    if (!fetchImpl) throw new Error('no fetch available to download image url');
    const dl = await fetchImpl(first.url);
    if (!dl.ok) throw new Error(`failed to download image: ${first.url}`);
    bytes = Buffer.from(await dl.arrayBuffer());
  } else {
    throw new Error('image API response had neither b64_json nor url');
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return target;
}

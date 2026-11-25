import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { GALFUS_SKILLS } from './skills';

export interface ApiDocEntry {
  id: string;
  skill: string;
  module: string;
  title: string;
  tags: string[];
  summary: string;
  snippet: string;
}

export interface SearchResult {
  entry: ApiDocEntry;
  score: number;
}

export interface ApiSearchOptions {
  limit?: number;
  update?: boolean;
  json?: boolean;
  cachePath?: string;
  remoteUrl?: string;
}

const DEFAULT_REMOTE_URL =
  'https://raw.githubusercontent.com/galfus-multiverse/galfus-engine/main/docs/api-search-index.json';

const STOP_WORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'fazer',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'por',
  'que',
  'se',
  'um',
  'uma',
  'uns',
  'umas',
  'usar',
  'uso',
  'crio',
  'criar',
  'adiciono',
  'adicionar',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'use',
  'using',
  'with'
]);

const SYNONYM_GROUPS: string[][] = [
  ['load', 'loading', 'loader', 'carregar', 'carregamento', 'importar', 'abrir', 'fetch', 'asset'],
  ['gltf', 'glb', 'zip', 'modelo', 'modelos', 'model', 'models', 'malha', 'mesh', 'loadgltfasset'],
  [
    'light',
    'lights',
    'lighting',
    'luz',
    'luzes',
    'iluminacao',
    'sol',
    'directional',
    'point',
    'spot',
    'createlight'
  ],
  ['shadow', 'shadows', 'sombra', 'sombras', 'castshadow'],
  ['camera', 'cameras', 'visao', 'fovy', 'zoom', 'ortho', 'orthographic', 'createcamera', 'lookat'],
  [
    'material',
    'materials',
    'materiais',
    'cor',
    'color',
    'basecolor',
    'pbr',
    'metallic',
    'roughness',
    'textura',
    'texture'
  ],
  [
    'cube',
    'cubo',
    'box',
    'caixa',
    'sphere',
    'esfera',
    'plane',
    'plano',
    'cylinder',
    'cilindro',
    'primitive',
    'primitiva'
  ],
  ['physics', 'fisica', 'rapier', 'gravity', 'gravidade', 'attachphysics3d', 'attachphysics2d'],
  [
    'collider',
    'colliders',
    'colisor',
    'colisores',
    'colisao',
    'collision',
    'sensor',
    'addcollider'
  ],
  [
    'rigidbody',
    'corpo',
    'rigido',
    'dynamic',
    'dinamico',
    'fixed',
    'estatico',
    'kinematic',
    'addrigidbody',
    'mass',
    'massa'
  ],
  [
    'impulse',
    'impulso',
    'force',
    'forca',
    'jump',
    'pular',
    'pulo',
    'velocity',
    'velocidade',
    'applyimpulse',
    'applyforce'
  ],
  ['raycast', 'raycasting', 'raio', 'querypoint', 'intersecao', 'hit'],
  ['ecs', 'world', 'mundo', 'pipeline'],
  ['entity', 'entities', 'entidade', 'entidades', 'createentity', 'destroyentity'],
  ['component', 'components', 'componente', 'componentes', 'attachcomponent', 'getcomponent'],
  ['system', 'systems', 'sistema', 'sistemas', 'addsystem', 'systemcontext'],
  ['audio', 'som', 'sons', 'sound', 'musica', 'music', 'sfx', 'loadsound', 'playsound', 'spatial'],
  [
    'input',
    'keyboard',
    'teclado',
    'tecla',
    'key',
    'pointer',
    'mouse',
    'click',
    'clique',
    'evento',
    'event'
  ],
  ['window', 'janela', 'tela', 'canvas', 'target', 'multiverse', 'invocation', 'runtime', 'tick'],
  [
    'ui',
    'interface',
    'hud',
    'button',
    'buttons',
    'botao',
    'botoes',
    'uibutton',
    'panel',
    'panels',
    'painel',
    'dialog',
    'modal',
    'text',
    'texto',
    'uitext',
    'anchor',
    'layout',
    'createui'
  ],
  [
    'animation',
    'animations',
    'animacao',
    'animacoes',
    'clip',
    'clips',
    'keyframe',
    'skeletal',
    'esqueleto',
    'skinning',
    'crossfade',
    'crossfading',
    'loop',
    'playanimation',
    'animationplayer3d'
  ],
  ['sprite', 'sprites', '2d', 'spritesheet', 'uv', 'atlas', 'tilemap', 'realm2d'],
  [
    '3d',
    'realm3d',
    'transform',
    'transforms',
    'position',
    'posicao',
    'rotation',
    'rotacao',
    'scale',
    'escala'
  ]
];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, ' ')
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const rawTokens = normalizeText(query).split(/\s+/).filter(Boolean);
  const filtered = rawTokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1);
  return filtered.length > 0 ? filtered : rawTokens;
}

export function getTokenEquivalents(token: string): string[] {
  const equivalents = new Set<string>([token]);
  for (const group of SYNONYM_GROUPS) {
    if (group.some((g) => g === token || (token.length >= 4 && g.startsWith(token)))) {
      for (const syn of group) equivalents.add(syn);
    }
  }
  return Array.from(equivalents);
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function buildIndexFromSkillsMap(
  skillsMap: Readonly<Record<string, string>> = GALFUS_SKILLS
): ApiDocEntry[] {
  const entries: ApiDocEntry[] = [];

  for (const [skillName, markdown] of Object.entries(skillsMap)) {
    const defaultModule =
      skillName === 'galfus-realm-3d-helpers'
        ? '@galfus/gltf-loader'
        : skillName === 'galfus-realm-2d-helpers'
          ? '@galfus/ui'
          : '@galfus/engine';

    const body = markdown.replace(/^---[\s\S]*?---\s*/, '');
    const sections = body.split(/\n(?=##+ )/);
    let currentH2Title = '';

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const headingLine = lines[0] ?? '';
      if (!headingLine.startsWith('##')) continue;

      const isH2 = headingLine.startsWith('## ');
      const cleanHeading = headingLine
        .replace(/^#+\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim();
      if (isH2) {
        currentH2Title = cleanHeading;
      }

      if (!cleanHeading || cleanHeading.toLowerCase() === 'installation') continue;

      const rawTitle =
        !isH2 && currentH2Title ? `${currentH2Title} - ${cleanHeading}` : cleanHeading;

      const codeMatch = section.match(/```(?:typescript|ts)\n([\s\S]*?)```/);
      const snippet = codeMatch ? codeMatch[1]!.trim() : '';
      if (!snippet) continue;

      const textWithoutCode = section
        .replace(/^#+\s*.*$/m, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

      const summary = textWithoutCode
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, 3)
        .join(' ');

      const slug = normalizeText(rawTitle).replace(/\s+/g, '-');
      const id = `${skillName}#${slug}`;

      const rawWords = normalizeText(`${skillName} ${rawTitle} ${summary} ${snippet}`).split(/\s+/);
      const tagSet = new Set<string>(rawWords.filter((w) => w.length > 1 && !STOP_WORDS.has(w)));

      for (const group of SYNONYM_GROUPS) {
        if (group.some((term) => tagSet.has(term))) {
          for (const syn of group) tagSet.add(syn);
        }
      }

      entries.push({
        id,
        skill: skillName,
        module: defaultModule,
        title: rawTitle,
        tags: Array.from(tagSet),
        summary,
        snippet
      });
    }
  }

  return entries;
}

export function searchApiDocs(entries: ApiDocEntry[], query: string, limit = 3): SearchResult[] {
  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const entry of entries) {
    const titleTokens = normalizeText(entry.title).split(/\s+/);
    const summaryTokens = normalizeText(entry.summary).split(/\s+/);
    const snippetNorm = normalizeText(entry.snippet);
    const tagSet = new Set(entry.tags);

    let score = 0;
    let matchedPrimaryTokens = 0;

    for (const primary of queryTokens) {
      const equivalents = getTokenEquivalents(primary);
      let tokenHit = false;

      if (titleTokens.some((t) => equivalents.some((eq) => t === eq || t.startsWith(eq)))) {
        score += 15;
        tokenHit = true;
      }
      if (equivalents.some((eq) => tagSet.has(eq))) {
        score += 8;
        tokenHit = true;
      }
      if (equivalents.some((eq) => snippetNorm.includes(eq))) {
        score += 6;
        tokenHit = true;
      }
      if (summaryTokens.some((t) => equivalents.some((eq) => t === eq || t.startsWith(eq)))) {
        score += 4;
        tokenHit = true;
      }
      if (!tokenHit && primary.length >= 4) {
        const fuzzyMatch =
          titleTokens.some((t) => editDistanceAtMostOne(primary, t)) ||
          entry.tags.some((t) => editDistanceAtMostOne(primary, t));
        if (fuzzyMatch) {
          score += 5;
          tokenHit = true;
        }
      }

      if (tokenHit) matchedPrimaryTokens++;
    }

    if (matchedPrimaryTokens > 1) {
      score *= 1 + matchedPrimaryTokens * 0.35;
    }

    if (score > 0) {
      results.push({ entry, score: Math.round(score * 10) / 10 });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getDefaultCachePath(): string {
  const baseCache = process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache');
  return resolve(baseCache, 'galfus', 'api-search-index.json');
}

export async function resolveSearchIndex(options: ApiSearchOptions = {}): Promise<ApiDocEntry[]> {
  const cachePath = options.cachePath ?? getDefaultCachePath();
  const remoteUrl = options.remoteUrl ?? process.env.GALFUS_DOCS_INDEX_URL ?? DEFAULT_REMOTE_URL;

  if (!options.update && existsSync(cachePath)) {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf-8')) as ApiDocEntry[];
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Corrupted cache; regenerate or re-fetch below
    }
  }

  let entries: ApiDocEntry[] | null = null;
  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = (await res.json()) as ApiDocEntry[];
      if (Array.isArray(data) && data.length > 0) {
        entries = data;
      }
    }
  } catch {
    // Offline or remote index not yet published; fall back to embedded skills
  }

  if (!entries) {
    entries = buildIndexFromSkillsMap(GALFUS_SKILLS);
  }

  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  } catch {
    // Ignore cache write errors on read-only filesystems
  }

  return entries;
}

export async function runApiSearchCommand(
  queryParts: string[],
  options: ApiSearchOptions = {}
): Promise<void> {
  const query = queryParts.join(' ').trim();
  const limit = Number(options.limit ?? 3) || 3;
  const entries = await resolveSearchIndex(options);
  const results = searchApiDocs(entries, query, limit);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`\nNo API documentation matches found for "${query}".`);
    console.log(
      `Try keywords like: "gltf", "camera 3d", "light shadow", "ecs system", "physics", "ui button".\n`
    );
    return;
  }

  console.log(
    `\n\x1b[36m╭─ Galfus API Search (${results.length} match${results.length > 1 ? 'es' : ''} for "${query}")\x1b[0m\n`
  );

  for (let i = 0; i < results.length; i++) {
    const { entry } = results[i]!;
    console.log(
      `\x1b[1m${i + 1}. ${entry.title}\x1b[0m  \x1b[33m[${entry.module}]\x1b[0m \x1b[90m(${entry.skill})\x1b[0m`
    );
    if (entry.summary) {
      console.log(`   ${entry.summary}`);
    }
    if (entry.snippet) {
      console.log(`\n   \x1b[32mExample:\x1b[0m`);
      for (const line of entry.snippet.split('\n')) {
        console.log(`   \x1b[36m│\x1b[0m ${line}`);
      }
    }
    console.log('');
  }
}

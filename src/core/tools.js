import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Tool registry with keyword retrieval (v0: no embeddings needed - descriptions are small).
// v1 upgrades this to semantic search via nomic-embed-text.
const TOOLS = [
  {
    name: 'read_file',
    description: 'Read a file from disk and return its contents. Results files live in the task directory, e.g. results/step-0.json.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run: async ({ path }) => readFileSync(path.startsWith('results/') ? join(process.env.HALIE_TASK_DIR || '.', path) : path, 'utf8').slice(0, 8000)
  },
  {
    name: 'run_shell',
    description: 'Run a shell command and return stdout. Use for checking system state, disk, processes, git.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    run: async ({ command }) => {
      const { execSync } = await import('node:child_process');
      try { return execSync(command, { encoding: 'utf8', timeout: 30000 }).slice(0, 5000); }
      catch (e) { return 'ERROR: ' + String(e.message).slice(0, 500); }
    }
  },
  {
    name: 'write_file',
    description: 'Write text to a file on disk. Use for saving results, notes, JSON artifacts.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    run: async ({ path, content }) => { const { writeFileSync } = await import('node:fs'); writeFileSync(path, content); return 'wrote ' + content.length + ' chars'; }
  }
];

// Retrieve top-k tools by keyword overlap with the step text. Small, fast, no API needed.
export function retrieveTools(stepText, k = 2) {
  const words = new Set(stepText.toLowerCase().match(/[a-z_]+/g) || []);
  return TOOLS
    .map(t => {
      const dWords = (t.description + ' ' + t.name).toLowerCase().match(/[a-z_]+/g) || [];
      let score = 0; for (const w of dWords) if (words.has(w)) score++;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ t }) => t);
}

export function toolSchemas(tools) {
  return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

export async function executeTool(name, args) {
  const t = TOOLS.find(x => x.name === name);
  if (!t) return 'ERROR: unknown tool ' + name;
  return t.run(args);
}

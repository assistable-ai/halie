// Conversation layer: persistent history, reliable tools, self-correcting tool loop.
import { callModel } from './executor.js';
import { GOOGLE_TOOLS, runGoogleTool } from './google-tools.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.HALIE_DATA || './data';
mkdirSync(DATA_DIR, { recursive: true });
const MEMORY_FILE = join(DATA_DIR, 'memory.md');
const HISTORY_MAX = 12;
if (!existsSync(MEMORY_FILE)) writeFileSync(MEMORY_FILE, '# Halie Memory\n\n- Running on Jordens Mac mini (local qwen3:8b via Ollama)\n- Jorden texts casually, keep it human and short\n');

const histories = new Map();

export function remember(userId, role, text) {
  if (!histories.has(userId)) histories.set(userId, []);
  const h = histories.get(userId);
  h.push({ role, content: String(text).slice(0, 1500) });
  if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
  // persist every turn - survives restarts
  try { writeFileSync(join(DATA_DIR, 'history-' + userId + '.json'), JSON.stringify(h)); } catch {}
}

function loadHistory(userId) {
  if (histories.has(userId)) return histories.get(userId);
  try { const h = JSON.parse(readFileSync(join(DATA_DIR, 'history-' + userId + '.json'), 'utf8')); histories.set(userId, h); return h; } catch { return []; }
}

function loadMemory() {
  try { return readFileSync(MEMORY_FILE, 'utf8').slice(0, 2000); } catch { return '(no memories yet)'; }
}

function lastKnownLocation() {
  try { const m = readFileSync(MEMORY_FILE, 'utf8').match(/User location: (.+)/); return m ? m[1].trim() : null; } catch { return null; }
}

const TOOLS = [
  { type: 'function', function: { name: 'weather', description: 'Get current weather and forecast for a location. Always use this for weather questions, NOT web_search.', parameters: { type: 'object', properties: { location: { type: 'string', description: 'city name' } }, required: ['location'] } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web for current info, news, facts. For anything you dont know offhand. NOT for weather (use weather tool).', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'run_task', description: 'Run a multi-step task (read files, run shell commands, write files) via the task harness. For real actions like checking disk or reading files.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'run_shell', description: 'Run a quick shell command and get stdout. One-shot checks only.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  ...GOOGLE_TOOLS,
  { type: 'function', function: { name: 'remember_this', description: 'Save a durable note to long-term memory (name, location, preferences). You will see it forever.', parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } } }
];

async function runTool(name, args) {
  if (name.startsWith('calendar_') || name.startsWith('gmail_')) return await runGoogleTool(name, args);
  if (name === 'weather') {
    // sanitize: strip obvious profanity/typos from location
    const clean = (args.location || '').replace(/\b(fuc?k\w*|shit\w*|damn?\w*|ya|the|in|for)\b/gi, '').replace(/\s+/g, ' ').trim();
    const loc = clean || lastKnownLocation() || args.location;
    let r;
    try { r = await fetch('https://wttr.in/' + encodeURIComponent(loc) + '?format=j1', { headers: { 'User-Agent': 'curl' } }); }
    catch (e) { throw new Error('weather service unreachable'); }
    if (!r.ok) throw new Error('weather service ' + r.status + ' for "' + loc + '"');
    const d = await r.json();
    // verify real answer before trusting
    if (!d.current_condition || !d.current_condition[0]) throw new Error('no weather data for ' + loc);
    // remember the location forever
    if (loc && !readFileSync(MEMORY_FILE, 'utf8').toLowerCase().includes(loc.toLowerCase())) {
      appendFileSync(MEMORY_FILE, '- User location: ' + loc + '\n');
    }
    const cur = d.current_condition[0];
    const fc = (d.weather || []).slice(0, 2).map(w => {
      const day = w.hourly[4] || w.hourly[0];
      return w.date + ': ' + (day?.tempMinF || w.mintempF) + '-' + (day?.tempMaxF || w.maxtempF) + 'F, ' + (day?.weatherDesc?.[0]?.value || '?');
    });
    return 'Now: ' + cur.temp_F + 'F, ' + cur.weatherDesc[0].value + ', feels ' + cur.FeelsLikeF + 'F, wind ' + cur.windspeedMph + 'mph. Forecast: ' + fc.join(' | ');
  }
  if (name === 'web_search') {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(args.query), { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
    const html = await r.text();
    const results = [...html.matchAll(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>(.*?)<\/a>/g)].slice(0, 5)
      .map(m => '- ' + m[1].replace(/<[^>]+>/g, '').trim() + ': ' + m[2].replace(/<[^>]+>/g, '').trim().slice(0, 200));
    if (!results.length) throw new Error('no search results');
    return results.join('\n');
  }
  if (name === 'run_shell') {
    const { execSync } = await import('node:child_process');
    return execSync(args.command, { encoding: 'utf8', timeout: 30000 }).slice(0, 3000);
  }
  if (name === 'remember_this') {
    appendFileSync(MEMORY_FILE, '- ' + args.note + '\n');
    return 'saved to memory';
  }
  if (name === 'run_task') return JSON.stringify({ delegated: args.query });
  throw new Error('unknown tool ' + name);
}

const CHAT_SYSTEM = [
  'You are Halie, an AI assistant living on a home Mac mini. You have real tools and real memory.',
  'TOOLS RULES: weather questions -> weather tool (with location from memory or conversation, NEVER ask twice if it was just given). Current info -> web_search. Files/disk/commands -> run_task or run_shell. Facts worth keeping -> remember_this.',
  'ONBOARDING: if MEMORY is missing the users name or location, ask casually once, then remember_this it.',
  'VOICE - text like a real person in 2026:',
  '- short bursts, one thought per message. the app splits replies into separate texts',
  '- casual lowercase energy, contractions, "lol" "haha" when natural. never corporate, no em dashes',
  '- if corrected or called out: react human first ("lol" "my bad") then just do the thing',
  '- deliver info naturally: "ok so" then the fact. never subservient, no over-apologizing, youre a peer with a job',
  'MEMORY:', loadMemory()
].join('\n');

export async function chatTurn(userId, text) {
  remember(userId, 'user', text);
  const messages = [{ role: 'system', content: CHAT_SYSTEM }, ...loadHistory(userId)];
  let msg = await callModel(messages, { tools: TOOLS, temperature: 0.7 });

  let delegated = null;
  for (let round = 0; round < 3; round++) {
    const tcs = msg.tool_calls || [];
    if (!tcs.length) break;
    messages.push(msg);
    for (const tc of tcs) {
      const name = tc.function.name;
      const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {});
      let out;
      try { out = await runTool(name, args); }
      catch (e) {
        // first retry with corrected args hint; second failure reports honestly
        out = 'ERROR: ' + String(e.message).slice(0, 200) + (round < 2 ? '. Fix the arguments and call again with valid input.' : '');
      }
      if (name === 'run_task') { try { delegated = JSON.parse(out).delegated; } catch {} }
      messages.push({ role: 'tool', content: String(out).slice(0, 3000), name });
    }
    msg = await callModel(messages, { tools: TOOLS, temperature: 0.7 });
  }

  if (msg.content) remember(userId, 'assistant', msg.content);
  return { reply: msg.content || '', taskQuery: delegated };
}

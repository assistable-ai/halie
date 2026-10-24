import { callModel } from './executor.js';

// Planner: one call that turns a query into steps. Runs on the same local model.
export async function plan(query) {
  const system = [
    'You are a task planner. Turn the user query into a short numbered list of concrete steps.',
    'Maximum 5 steps. Each step is one simple action (read a file, run a command, write a file, or answer).',
    'Respond with ONLY the numbered list, nothing else. No thinking, no preamble.'
  ].join(' ');

  const msg = await callModel('QUERY: ' + query, { system, temperature: 0.2 });
  const text = msg.content || '';
  // parse numbered lines
  const steps = text.split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+[.)]/.test(l))
    .map(l => l.replace(/^\d+[.)]\s*/, ''))
    .slice(0, 5);
  if (!steps.length) {
    // fallback: single step = just answer it
    return [query];
  }
  return steps;
}

// Summarizer: one call that rewrites (not appends) the rolling summary.
export async function summarize(task, lastResult) {
  const system = 'You write short progress summaries. Rewrite the whole summary in under 80 words. Output only the summary text.';
  const prompt = [
    'TASK: ' + task.goal,
    'PREVIOUS SUMMARY: ' + (task.summary || 'none'),
    'JUST COMPLETED: ' + task.steps[task.current],
    'RESULT: ' + String(lastResult).slice(0, 600),
    'Write the updated summary.'
  ].join('\n');
  const msg = await callModel(prompt, { system, temperature: 0.2 });
  return (msg.content || '').trim().slice(0, 500);
}

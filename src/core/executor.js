// Stateless single-shot executor. Every model call is fresh and small.
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function callModel(promptOrMessages, { model = process.env.HALIE_MODEL || 'qwen3:8b', system, tools = [], temperature = 0.3 } = {}) {
  const messages = Array.isArray(promptOrMessages)
    ? promptOrMessages
    : [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: promptOrMessages }
      ];
  const body = {
    model,
    stream: false,
    think: false,
    options: { temperature },
    messages,
    ...(tools.length ? { tools } : {})
  };
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('ollama ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const d = await res.json();
  return d.message; // { content, tool_calls? }
}

// One step: build the small prompt, call, return tool call or text answer.
export async function runStep(task, tools) {
  const system = [
    'You are a task executor. You complete ONE step of a task, nothing more.',
    'Respond with a single tool call if a tool is needed, otherwise a direct short answer.',
    'Be precise. If information you need is referenced in a results file, say which one.'
  ].join(' ');

  const isLast = task.current === task.steps.length - 1;
  const prompt = [
    'TASK GOAL: ' + task.goal,
    '',
    'PROGRESS SUMMARY: ' + (task.summary || 'nothing done yet'),
    '',
    'CURRENT STEP (' + (task.current + 1) + '/' + task.steps.length + '): ' + task.steps[task.current],
    '',
    'Previous step results are saved in results/ files in the task directory. Read them with read_file if you need the data.',
    isLast ? 'This is the FINAL step. State the actual answer with concrete data from the results. Never say "see the results file".' : ''
  ].join('\n');

  return callModel(prompt, { system, tools });
}

import { Task } from './task.js';
import { plan, summarize } from './planner.js';
import { runStep } from './executor.js';
import { retrieveTools, toolSchemas, executeTool } from './tools.js';

// The harness owns the loop. The model is a stateless single-shot function.
export async function runTask(query, { tasksDir = './tasks', onProgress } = {}) {
  const task = new Task(tasksDir, query);
  process.env.HALIE_TASK_DIR = task.dir;
  onProgress?.('planning', task);

  task.setSteps(await plan(query));
  onProgress?.('steps', task);

  const MAX_TURNS_PER_STEP = 3; // tool calls per step before forcing an answer
  let finalAnswer = null;

  while (task.current < task.steps.length) {
    const stepText = task.steps[task.current];
    const tools = retrieveTools(stepText + ' ' + task.goal);

    let turns = 0;
    let stepDone = false;
    while (turns < MAX_TURNS_PER_STEP && !stepDone) {
      turns++;
      const msg = await runStep(task, toolSchemas(tools));
      const tc = msg.tool_calls && msg.tool_calls[0];

      if (tc) {
        // execute tool, save result to task object (referenced, not inlined)
        let output;
        try { output = await executeTool(tc.function.name, tc.function.arguments); }
        catch (e) { output = 'ERROR: ' + String(e.message); }
        const ref = task.saveResult(task.current, tc.function.name, tc.function.arguments, String(output).slice(0, 4000));
        // feed compact confirmation back — the full output lives on disk
        const confirm = await runStep({ ...task, summary: task.summary + ' [tool done: ' + tc.function.name + ', saved ' + ref + ' — re-read it if needed]', current: task.current }, toolSchemas(tools));
        if (!confirm.tool_calls) { finalAnswer = confirm.content; stepDone = true; }
      } else {
        finalAnswer = msg.content;
        stepDone = true;
      }
    }

    task.summary = await summarize(task, finalAnswer || '(tool work)');
    task.current++;
    task.save();
    onProgress?.('step-done', task);
  }

  task.status = 'complete';
  task.save();
  return { task, answer: finalAnswer };
}

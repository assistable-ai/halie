#!/usr/bin/env node
// CLI entry: node src/cli.mjs "your task here"
import { runTask } from './core/loop.js';

const query = process.argv.slice(2).join(' ');
if (!query) { console.log('usage: node src/cli.mjs "task"'); process.exit(1); }

const { task, answer } = await runTask(query, {
  tasksDir: './tasks',
  onProgress: (phase, t) => console.error('[' + phase + '] step ' + (t.current + 1) + '/' + (t.steps?.length || '?'))
});
console.log('\nANSWER:\n' + (answer || '(none)'));
console.log('\ntask object: tasks/' + task.id + '/');

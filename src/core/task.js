import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Task object: goal + steps + results live on disk. The model never carries state.
export class Task {
  constructor(dir, goal) {
    this.id = randomUUID().slice(0, 8);
    this.dir = join(dir, this.id);
    mkdirSync(join(this.dir, 'results'), { recursive: true });
    this.goal = goal;
    this.steps = [];
    this.current = 0;
    this.summary = '';
    this.status = 'planning';
    this.save();
  }

  static load(dir) { /* future: resume from disk */ }

  setSteps(steps) { this.steps = steps; this.status = 'running'; this.save(); }

  saveResult(stepIdx, tool, input, output) {
    const file = join(this.dir, 'results', 'step-' + stepIdx + '.json');
    writeFileSync(file, JSON.stringify({ tool, input, output }, null, 2));
    return 'results/step-' + stepIdx + '.json';
  }

  setSummary(s) { this.summary = s; this.save(); }

  done() { this.status = this.current >= this.steps.length ? 'complete' : 'failed'; this.save(); }

  save() {
    writeFileSync(join(this.dir, 'task.json'), JSON.stringify({
      id: this.id, goal: this.goal, steps: this.steps, current: this.current,
      summary: this.summary, status: this.status
    }, null, 2));
    writeFileSync(join(this.dir, 'task.md'), [
      '# Task ' + this.id,
      'goal: ' + this.goal,
      'status: ' + this.status,
      '',
      '## Summary',
      this.summary || '(none yet)',
      '',
      '## Steps',
      ...this.steps.map((s, i) => (i === this.current ? '-> ' : '   ') + (i+1) + '. ' + s)
    ].join('\n'));
  }
}

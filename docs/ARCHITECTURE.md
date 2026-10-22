# Architecture

## The problem, precisely

A frontier model handles agentic loops because it can carry a growing context
(system prompt + all tool schemas + every file read + every command output)
through every turn. A small model on consumer hardware cannot: effective
working context shrinks, prompt processing slows, and by step 3-4 the model
stalls or forgets the task.

Benchmark evidence (Mac mini, 8GB, Ollama, qwen3 8B/4B):
- Single-shot tool call: correct tool, correct args, clean JSON — PASS
- 4-step agentic loop (read file → count → run command → write artifact):
  8B lost the task and asked for context; 4B timed out — BOTH FAIL

Conclusion: don't ask the model to loop. Make every model call single-shot.

## Core objects

### Task object (task.md + task.json)
```
task.md    — goal, steps, acceptance criteria (human + model readable)
task.json  — machine state: step index, status, references
results/   — step-N.json: every tool call's input + output, verbatim
summary.md — rolling summary, rewritten (not appended) between steps
```

### Tool registry
Tools are declared once with name, description, JSON schema, and an embedding
of their description. At step time the harness embeds the step description and
retrieves the top-k tools (default k=3). Only those schemas enter the prompt.

### Executor
One call per step. Prompt shape (always small):
```
<task goal + acceptance criteria>        (~100 tokens)
<rolling summary, hard-capped>           (~200 tokens)
<current step + pointers to results/*>   (~150 tokens)
<k tool schemas>                         (~200-400 tokens)
```
Target: under 1,500 tokens per call, every call, regardless of task depth.

The model returns either a tool call or a step result. The harness executes,
appends to results/, rewrites summary.md, advances task.json.

### Delegation
A step may emit `spawn: <subtask description>`. The harness creates a child
task object with the same machinery. Sub-tasks run independently (they are
single-shot, so parallelism is trivial) and write their result back as a
reference the parent can retrieve.

### Memory of past work
Old task objects are embedded and searchable. "What did I do about X last
week" is a retrieval over tasks, not a conversation.

## Design rules

1. The harness owns the loop; the model is a stateless function
2. Never inline what can be referenced
3. Never load a schema that isn't needed this step
4. Rewrite summaries; never append context
5. Quality over speed — output correctness is the only target metric
6. Everything on disk — inspectable, debuggable, private by default

## Roadmap

- [x] v0 spike: task object + tool retrieval + single-shot executor
- [ ] Acceptance: pass the 4-step benchmark both raw models failed
- [ ] Example pack: email triage butler (classify → summarize → draft → queue)
- [ ] Heartbeat scheduler (cron-shaped, contextual)
- [ ] Multi-model: planner on larger/remote model, executor on local 8B
- [ ] Provider abstraction: Ollama today, llama.cpp server, LM Studio

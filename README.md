# little-harness

**Make an 8B local model genuinely agentic. The loop lives in the harness, not the model.**

Most people can run an 8-billion-parameter model (Qwen3, Llama, Gemma) on the hardware they already own. What they can't run is GPT-5-class *context* — thousands of tokens of tool schemas, file contents, and conversation history dragged through every step until the small model drowns.

little-harness is built on one observation, proven by benchmark: **small models fail loops, not tasks.** Asked single-shot, an 8B model classifies, extracts, drafts, and calls tools cleanly. Asked to hold a growing conversation while chaining four steps together, it stalls or loses the plot.

So we inverted the architecture. The harness owns the loop. The model stays stateless.

## How it works

1. **Plan once** — a query becomes a task object: goal, steps, acceptance criteria (`task.md`)
2. **Tool retrieval, not tool loading** — each step retrieves only the 2-3 tool schemas it needs (semantic search over a tool registry). The model never sees the full toolbox
3. **Single-shot execution** — each step is one fresh call: task goal + current step + retrieved tools. Small context, always
4. **Results are referenced, not inlined** — every tool input/output is saved to the task object and indexed. Later steps get "result saved: check `results/step-2.json`" pointers, retrieving only what they need
5. **Rolling summary** — lives in the task object, updated between steps, never inside the model's window
6. **Delegate freely** — steps can spawn sub-tasks with their own task objects. Parallel one-shot calls are cheap when context is small

The result: an 8B model that completes multi-step agentic work it fails at natively — on a Mac mini with 8GB of RAM.

## Target hardware

- Apple Silicon Macs, 8-16GB RAM
- Any PC with a mid-range GPU (or CPU + patience — we optimize for quality over speed)
- Runs on [Ollama](https://ollama.com) out of the box; LM Studio / llama.cpp compatible

## Status

Pre-alpha. Architecture in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Building in the open.

## Why this matters

The frontier is getting more expensive on purpose. Efficiency has no investor — it has to be built by the people who need it. If a free, downloadable 8B model can run a personal agent (email triage, drafting, scheduling, delegation) on hardware you own, agentic AI stops being a rental.

## License

MIT

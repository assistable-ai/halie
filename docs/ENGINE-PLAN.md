# Halie Engine v1 — Pipeline Plan & Strategy

## Goal
A reliable personal local agent. Not a demo: tool calls that work, tasks that complete,
errors that self-heal, communication that feels human. Reliability > cleverness at every stage.

## The Pipeline (v1)

    message in
      |
    [1] PRE-PROCESSOR (NLP pass, one cheap call)
      |  - intent: chat | task | correction | question
      |  - tone: casual | serious | frustrated | excited
      |  - entities + slots: location, dates, names
      |  - contradiction check vs memory ("you said X before")
      |  - hyperbole/sarcasm flag (dont take literally)
      |  - missing-info flag (needs location? context from last turns?)
      |
    [2] ROUTER
      |  direct answer -> [5]
      |  tool needed -> [3]
      |  multi-step task -> task harness (existing loop)
      |
    [3] TOOL EXECUTOR (hardened)
      |  - schema validation BEFORE run (fail fast, fix args in-loop)
      |  - retry with error feedback (already shipped v0)
      |  - per-tool timeout + circuit breaker (3 fails = tool marked down, tell user honestly)
      |  - tool results: verbatim to task object, compact to model context
      |
    [4] POST-PROCESSOR (NLP pass on draft answer)
      |  - sycophancy filter (strip "great question", eager-to-please endings)
      |  - tone match (reply energy should mirror user energy)
      |  - contradiction check vs the facts it just retrieved
      |  - confidence framing (state facts flat, hedge honestly, never perform certainty)
      |  - brevity enforcement (one thought per burst)
      |
    [5] HUMANIZER (exists)
      |  chunk -> delays -> typo engine -> trailing punctuation strip
      |
    [6] MEMORY WRITE-BACK
      - new facts -> memory.md (name, location, preferences, corrections)
      - contradictions resolved -> update stale memory entries, not append

## Error Protocol (user-visible states)

| state | indicator | behavior |
|---|---|---|
| received, working | 👀 | instant |
| in progress | typing loop | continuous |
| transient failure | ⚠️ | auto-retry x2 (args fix, then re-plan), tell user "retrying, sec" |
| recovered | ⚠️ -> clears | normal answer, no mention of the failure unless asked |
| hard failure | ❌ | honest message: what failed, why, what would fix it |

Engine-level watchdogs (the "doctor"):
- Ollama down -> healthcheck, auto model reload, status message if >30s
- gateway crash -> launchd restarts (shipped); on boot, replay queued undelivered answers
- tool circuit breakers reset hourly
- disk/memory pressure check before heavy tasks (8GB box, be real)

## Tool Call Reliability (the hard problem)

1. Deterministic slot filling: weather NEEDS location. If memory + history lack it,
   pre-processor flags it and the router asks ONCE, then fills it forward forever.
2. Anti-loop: same tool + same args twice = force escalate to different strategy or honest fail.
3. Result verification: post-processor checks the answer actually contains tool output
   (weather answer must contain a temperature, else re-run).
4. Few-shot tool cards: each tool gets a 1-line worked example in its description
   ("weather(location='Port Charlotte') -> 'Now: 78F clear...'"). Small models imitate examples.
5. Small model rule: never give it 5 tools when 2 will do — router pre-filters the tool list
   per intent (already have retrieveTools in the task harness; bring it into chat).

## Task Understanding Reliability

- Planner output validation: steps must be actions, not commentary (reject "Open a terminal" style fluff at parse time).
- Acceptance criteria per task: planner also emits "done when: X". Final step checked against it.
- Stuck detection: no progress in 2 turns = summarize state, re-plan remaining steps only.

## Voice & Standing (anti-sycophancy architecture)

- Persona: peer with a job, not a butler. Helpful, capable, has opinions, not attached.
- Hard rules: no "great question", no over-apologizing, no ending every message offering more help.
- React-then-do on corrections (human), but never grovel.
- Memory includes agent-standing notes it writes itself ("Jorden likes when im direct").

## Build Order

1. [x] persistent history + memory (done today)
2. [x] weather tool + retry protocol + error emojis (done today)
3. [ ] pre-processor NLP pass (intent/tone/entities/missing-info) — THE next build
4. [ ] post-processor pass (sycophancy filter, verification, tone match)
5. [ ] router with per-intent tool pre-filtering
6. [ ] watchdog/doctor service + boot replay
7. [ ] task harness: planner validation + acceptance criteria + stuck detection
8. [ ] memory write-back automation + contradiction resolution

Each stage: single-shot calls, task-objected, testable alone. Benchmark = the failed-weather
conversation replayed end to end until it passes clean 5/5 times.

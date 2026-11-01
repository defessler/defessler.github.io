---
title: The Big Picture
order: 1
kicker: ":: THE FOUNDRY"
power_word: FOUNDRY
description: One machine, one GPU, one resident model. What runs where, and the budget that shapes all of it.
---

DokiDex is a **Claude-Code-class AI stack that runs entirely on one machine**: an RTX 5090
(32 GB VRAM), 64 GB DDR5, Windows 11 native, with no Docker, no WSL, and no cloud AI at runtime. It does
agentic coding, editor autocomplete, codebase search over local embeddings, and web search.
Prompts and outputs never leave the box.

If you've spent your career inside Unreal, here's the frame that makes the rest of this handbook
land: DokiDex is **an engine, an editor, and a build farm for intelligence instead of rendering**.
There's a runtime that executes the expensive core work (the inference engine), a set of
authored assets it loads (the models), tooling surfaces that drive it (a CLI, the stock Claude Code
and Copilot clients, your IDE), and a budget that dictates the entire architecture (VRAM, the way
frame time dictates yours).

## The one rule that shapes everything

32 GB of VRAM holds one seat at a time. Every GPU-resident service belongs to the `llm` group, and
llama-swap evicts whatever is resident the moment a request names a different model. The CPU-only
embedder costs the card nothing and runs throughout. A small GPU sidecar used to fit in the margin
beside the seat too, and since 2026-08-26 it does not: the seat's 256k window and its draft head
take the margin.

Until 2026-09-02 there was a second group. The image and video models lived in a `media` group that
was mutually exclusive with `llm`, and switching between them was a hard mode switch, like
exclusive fullscreen. That half of the stack is gone (see `archive.md`), which removed the switch
but not the budget underneath it.

That budget is what every architectural choice downstream is playing out. Which models are in the
roster, why model swaps are a first-class operation, why a 256k window is a decision rather than a
setting.
Treat it the way you treat the frame budget: not a limitation to grumble about, but the design
constraint that makes the system honest.

## The stack, top to bottom

```
  you ──► Claude Code CLI · Copilot CLI · crush / opencode · your editor (llama.vscode)
           │
           │  OpenAI-compatible HTTP (chat completions + tools)
           ▼
  llama-swap :8080 ── one endpoint, hot-swaps llama.cpp server processes per model id
           │
           ├── the roster: Qwen3-Coder-30B · gpt-oss-120b · Qwen3-Coder-30B(32k) · Qwen3-VL-8B ·
           │   Qwen3-VL-32B · Autocomplete · Embeddings
           │   (each a GGUF model + a tuned llama-server command line)
           ▼
  llama.cpp llama-server ── the inference engine (native Windows CUDA build)
           ▼
  RTX 5090 32 GB · 64 GB DDR5
```

Alongside the seat: **FIM autocomplete** (`:8012`) and **embeddings for code RAG** (`:8090`), which
runs CPU-only and so costs the card nothing. The whole fleet is managed by `doki.ps1`, a
data-driven, docker-compose-shaped control plane with no Docker: services are entries in a
`$Services` hashtable (launch script, health URL, GPU group, VRAM estimate), and profiles are
named sets of those.

## The three surfaces

The same local brain is reachable three ways, and knowing which is which matters because two of
them are *independent implementations*:

- **The real vendor CLIs** are the terminal agents. Anthropic's Claude Code and GitHub's Copilot
  CLI, both unmodified, pointed at `:8080` by thin launchers. `llama-server` implements the
  Anthropic Messages API natively, so nothing translates between the client and the model.
  DokiDex shipped its own C++17 agent here until 2026-09-02, tracked against a generated parity
  ledger. It was removed in favour of the real clients (see `archive.md`).
- **Third-party harnesses** (crush, opencode) drive the same endpoint from generated configs, so a
  model row cannot drift out of a client menu.
- **Your editor** reaches the FIM autocomplete sidecar on `:8012`, which is a different job from an
  agent turn and runs on a much smaller model.

## Why local, and what it costs

The trade is explicit and worth stating in gamedev terms. A frontier cloud model is a render farm:
more capable per query than anything a single card can hold, but metered, remote, and reading your
source. The local stack is your dev machine: a fixed capital cost, zero marginal cost per token,
full privacy, no rate limits, works offline, running models that are genuinely good but not
frontier. DokiDex's bet is that **a well-harnessed 30B beats a badly-harnessed frontier model for
day-to-day coding work**, and the harness is where the engineering went: grammar-constrained tool
calls, prompt-cache-aware serving, eval-gated model selection, and a permission system that makes
an imperfect model safe to run with real hands on your working tree.

Two numbers to calibrate against. The daily-driver coder streams at **~230 to 265 tok/s**. The
heavy planner, a 120B-parameter model that shouldn't fit in 32 GB at all, runs at **~27 tok/s**
by parking most of its weights in system RAM (chapter 3 explains the MoE trick that makes that
usable rather than a slideshow).

## The discipline underneath

Three habits run through every subsystem, and you'll see them in every chapter:

- **Eval-gated adoption.** No model, quant, or serving flag ships on vibes. Candidates run a
  26-task golden eval suite, 8 of them Unreal-specific C++ tasks covering delegate wiring, UCLASS
  boilerplate, and Build.cs dependencies. The results ledger decides. Several shiny candidates
  measured *worse* and were rejected. The rejections are documented with the same care as the
  adoptions (chapter 7).
- **Honesty as a feature.** DokiDex's own agent used to generate a parity ledger by probing its
  real binary: partial implementations were annotated with exactly what was missing, and
  deliberate divergences were named as deliberate. That ledger went with the agent on 2026-09-02,
  and the same discipline now lives in the golden-suite machinery chapter 7 covers. When a metric
  and reality disagree, the metric gets fixed, not the annotation.
- **The smallest change that solves it.** The repo's standing rule for agents and humans alike.
  It's why the architecture reads as a set of small, single-purpose seams rather than a
  framework.

Next: the serving layer that turns one GPU into the roster this chapter described, and the tricks
that make a 120B-parameter model fit in 32 GB at all.

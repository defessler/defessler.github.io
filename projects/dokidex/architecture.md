---
layout: page
permalink: /architecture/
title: "How DokiDex is built"
kicker: ":: THE ARCHITECTURE"
description: >-
  A systems-level tour of the stack: the real vendor CLIs over one local model server over one
  GPU, how a model gets seated and evicted, and the context economics that shape every other
  decision.
reading_level: [Intermediate]
wide: true
prev_url: /qwen38/
prev_label: "Qwen3.8-27B, measured"
next_url: /learn/
next_label: "Where to start"
---

This page is meant as a systems-level tour of DokiDex: what the pieces are, how a request moves
through them, and which single constraint is really doing the shaping. It's the visual overview.
The [engineering handbook]({{ '/handbook/' | relative_url }}) goes deeper on each layer. This page
links into it rather than restating it.

Every architectural claim below traces to a file you can open. Citations are `file:line` against
the tree at time of writing. Where a design note and the running code disagree, the code wins. We
say so instead of smoothing it over. Where something is reasoned off the source rather than
measured, the page marks it as inferred.

<ul class="stat-row">
  <li class="stat"><span class="stat-value">1</span><span class="stat-label">model resident at a time. Since 2026-08-26 nothing shares the card with the seat</span></li>
  <li class="stat"><span class="stat-value">0</span><span class="stat-label">translation proxies between a CLI and the server: llama-server speaks the Anthropic Messages API natively</span></li>
  <li class="stat"><span class="stat-value">92-99%</span><span class="stat-label">of a warm turn's prefill served from the KV cache</span></li>
  <li class="stat"><span class="stat-value">256k</span><span class="stat-label">context window on the seat, gated on retrieval depth rather than on fitting</span></li>
</ul>

## The Whole System in One Picture

There are three surfaces, and none of them was written here. That is the point of the current
design: the clients are the vendors' own, and this repo owns the server underneath them.

- Anthropic's Claude Code CLI and GitHub's Copilot CLI - the real clients, unmodified, pointed at the
  same `:8080` by `scripts/claude-local.ps1` and `scripts/copilot-local.ps1`. No proxy sits between
  them and the server: llama-server speaks the Anthropic Messages API natively.
- The harness configs - crush and opencode, generated from the same llama-swap roster by
  `scripts/sync-harness-models.ps1`, so a model row can never drift out of a client menu.

<figure>
{% include_relative assets/diagrams/arch-system.svg %}
<figcaption><strong>Everything narrows to one card.</strong> Every client surface speaks the same
OpenAI-compatible HTTP to llama-swap, and `doki.ps1` is the only thing that starts or stops it.
The picture leaves out the sidecars that don't contend for VRAM (embeddings on `:8090` runs
CPU-only), and your editor, which reaches the autocomplete sidecar on `:8012` rather than the
seat.</figcaption>
</figure>

Your editor is a fourth way in rather than a fourth implementation. `llama.vscode` drives the FIM
sidecar on `:8012` for inline completion, which is a different job from an agent turn and runs on a
much smaller model. The `coexist` profile exists to fit both on the card at once, at the cost of a
reduced context window on the seat. There used to be an ACP path here too, where an IDE drove
DokiDex's own agent as a JSON-RPC server over stdio. It went with that agent on 2026-09-02.

Underneath all of it sits `doki.ps1`, a control plane shaped like docker-compose with no Docker
anywhere. Services are entries in a `$Services` hashtable (`doki.ps1:124-155`), each carrying a
launch script, a health URL, a port, a GPU group, and a VRAM estimate. Profiles are named sets of
those services. Adding a service means adding a row, which is why `doki status json` and
`doki doctor` both pick up a new service without either one being taught about it.

## One GPU, One Resident Model

Here's the constraint the whole architecture is negotiating with. `Qwen3-Coder-30B-A3B [128k] (Coding, Light)` on its own is
roughly 26 GB of VRAM: about 17.7 GB of Q4_K_XL weights plus about 6.4 GB of 8-bit KV cache at a
128k context (`serving/llama-swap.yaml:89`). The image and video models are budgeted at 18 GB
(`doki.ps1:146`). The card holds 32 GB. Two of those don't fit at once. No amount of
cleverness changes that.

So every GPU-resident service carries a `group` tag, `llm` or `media`, and `doki up <profile>`
stops every running service outside the group you asked for before it starts anything
(`doki.ps1:416-418`). It's a hard mode switch, closer to exclusive fullscreen than to
multitasking.

<figure>
{% include_relative assets/diagrams/arch-gpu-modes.svg %}
<figcaption><strong>Asking for one profile is what evicts the other.</strong> The eviction isn't a
side effect. It's the first thing <code>DoUp</code> does. The VRAM figures are sizing estimates
carried in the configs rather than live measurements. They disagree with each other by a gigabyte
or two across files. Read them as budgets rather than as readings.</figcaption>
</figure>

`coexist` is the one deliberate double-booking on the card. Point the harness at
`Qwen3-Coder-30B-A3B [32k] (Coding, Light)`, which is the same weights at a 64k context for roughly 21 GB. The
fill-in-middle autocomplete sidecar then fits in what that frees (`serving/llama-swap.yaml:122-125`).
The full 128k tier can't coexist with it. That trade, five gigabytes of context window for live
editor autocomplete, is the sort of decision this constraint forces constantly.

### What Holds the Card

`doki up` is coarse and manual, and since 2026-09-02 it is also the whole story. The finer
mechanism that used to sit under it, a process-wide `GpuLease` inside the desktop backend, went
with that backend when the non-coding stack was removed (see `archive.md`). It existed because one
process could drive both sides of the card at once: a chat or code turn starting mid-render made
llama-swap auto-evict the renderer's resident model. With one group left there is no other side to
arbitrate against.

What still coordinates is deliberately smaller and honest about its scope. `scripts/claude-local.ps1`
drops a lease file for the lifetime of a Claude Code session, and `doki.ps1` reads it to warn you
before a `down` or a `restart` unloads the models under a live turn. It is advisory, never blocking.

## Model Serving: One Endpoint, Many Seats

`llama-swap` sits on `:8080` exposing one OpenAI-compatible endpoint and hot-swapping
`llama-server` processes underneath it based on the `model` id in each request. The engine pin is
llama.cpp build `b9878` on CUDA 13.3 behind llama-swap `v235` (`serving/llama-swap.yaml:3`). Every
client just asks for a model name. None of them know a swap happened.

That header line is no longer the whole story, though nothing has amended it. Counted off the real
`cmd` rows, 17 of the 24 rows that launch a llama-server use the pinned `b9878` binary, six launch
`serving/llama.cpp-b10472\` (`gpt-oss-120b [128k] (Reasoning, Heavy)`, the Claude Code seat, its
sidecar, the retired `f16 [104k]` control row it replaced, and two engine-only bake-off
candidates), and one launches `serving/llama.cpp-v4\` for DeepSeek-V4, which needs kernels the
pinned build doesn't have. The 25th row, `GitHub Copilot Cloud [32k] (Cloud, Billed)`, launches no
llama-server at all: its `cmd` runs `serving/copilot-shim.ps1`, wrapping the real GitHub Copilot
CLI instead. Those are directory names, not build numbers you can substitute into a path. The
[models page]({{ '/models/' | relative_url }}) has the per-key breakdown.

<figure>
{% include_relative assets/diagrams/arch-model-swap.svg %}
<figcaption><strong>A swap is a process restart that costs seconds.</strong> The
<code>healthCheckTimeout: 900</code> in the config exists specifically because <code>gpt-oss-120b [128k] (Reasoning, Heavy)</code>
pages roughly 60 GB off disk on a cold load (<code>serving/llama-swap.yaml:10</code>). What survives
the swap is the host-RAM prompt cache, not the VRAM KV cache, which is a different thing living in a
different place.</figcaption>
</figure>

Two details in that config are worth pulling out, because they're where the single-GPU reasoning
shows up as configuration.

**A model's name is what a harness asks for, with nothing standing in between.** Before 2026-08-25,
a harness requested a named seat and the yaml decided which weights answered it, through an alias.
That indirection is gone: `crush`'s `large` and `small` roles now point at
`gpt-oss-120b [128k] (Reasoning, Heavy)` and `Qwen3-Coder-30B-A3B [32k] (Coding, Light)` directly
(`serving/llama-swap.yaml`, `harness/crush.json`). Re-seating a model after a bake-off means editing
the name a harness carries, which is one edit either way, just without a second name to keep in
sync. `crush`'s `small` role, which used to share one llama-swap entry across two seat names, now
just names `Qwen3-Coder-30B-A3B [32k] (Coding, Light)` once.

**`--cache-ram 24576` is host RAM, not VRAM.** It's set on `Qwen3-Coder-30B-A3B [128k] (Coding, Light)` and `Qwen3-Coder-30B-A3B [32k] (Coding, Light)` only,
the two seats that actually swap in and out across a session, raising llama-server's prompt-cache
allowance from its 8192 MiB default to 24 GiB of system memory. The stated intent is that an
evicted tier's KV prefix can be served back from host RAM on the next swap-in instead of paying
full prefill again. Every other tier in the file is deliberately left without it. The
[models page]({{ '/models/' | relative_url }}) has the full roster, the footprints, and which
candidates are still under test.

## How a CLI Attaches

This is the part that surprises people, so it is worth stating plainly: **there is no adapter.**
Anthropic's Claude Code CLI is the real, unmodified client from npm. It speaks the Anthropic
Messages API, and `llama-server` implements that API natively, so `scripts/claude-local.ps1` just
points `ANTHROPIC_BASE_URL` at `127.0.0.1:8080` and gets out of the way. Nothing translates, nothing
proxies, and nothing rewrites a request in the middle. The same is true of GitHub's Copilot CLI
through `scripts/copilot-local.ps1`, which uses that client's own BYOK provider setting.

What the launchers actually do is smaller and more careful than a proxy would be:

- **Neutralise the environment.** An ambient `ANTHROPIC_API_KEY` or GitHub PAT in your shell would
  be inherited by the client and could send your prompt to a cloud endpoint. The launchers clear
  those before spawning, and `tests/local-cli-isolation.test.ps1` proves it by injecting fake
  credentials and reading the environment the child process actually received.
- **Redirect client state.** `CLAUDE_CONFIG_DIR` and `COPILOT_HOME` are pointed at
  `%LOCALAPPDATA%\DokiDex\`, so a local run never writes your global client config. The same test
  hashes the global files before and after a run to prove it.
- **Decide what each model slot resolves to.** Claude Code asks for opus, sonnet and haiku. There is
  one card, so by default all of them resolve to the seat. The launcher reads `GET /running` and
  only seats a different tier on a model that is already resident alongside the seat, because a
  background haiku call that triggers a multi-gigabyte weight swap is a bad trade nobody asked for.
  Since 2026-08-26 nothing is resident alongside it, so in practice every slot lands on the seat.

The practical consequence is that these are the vendors' own clients with the vendors' own
behaviour. When Claude Code ships a feature, it works here the next time you update it. Nothing in
this repo has to be taught about it.

> **Until 2026-09-02 this page also documented an agent implementation.** DokiDex shipped its own
> C++17 terminal agent, `doki code`, and three sections here walked its turn loop, its permission
> gate and its context assembly by `file:line`, with a diagram each. It was removed to put
> everything behind the real clients instead. The [handbook]({{ '/handbook/' | relative_url }})
> covers what survives, and `archive.md` in the repo names the commit that removed the rest.

## What Goes Up Every Turn

Whichever client is driving, the economics are the same, and they are the reason context is the
scarce resource rather than tokens per second.

Every hop sends the **entire** conversation. Not a delta. The model is stateless between requests,
so a turn that has read four files and run a build is re-sending all of that on the fifth hop. What
makes this affordable is the KV cache: `llama-server` keeps the attention state for the prefix it
already processed, so a warm turn re-uses 92 to 99% of its prefill instead of recomputing it.

That number is the whole ballgame, and it has a sharp edge. The cache is keyed on an exact prefix
match, so anything that changes early in the conversation invalidates everything after it. A
timestamp in a system prompt, a re-ordered tool list, a model swap: each one turns a 99% reuse into
a cold prefill of the whole window. Measured on this box, cross-session cold re-prefill was 87% of
all prefill work, which is why the telemetry tap in front of llama-swap exists at all.

## Where to Go Next


The [models page]({{ '/models/' | relative_url }}) has the full roster, the footprints, and the
bake-off results behind each seat. The [CLI tutorial]({{ '/local-cli/' | relative_url }}) is the
hands-on version of the turn loop and the permission gate.
[Claude Code and Copilot, local]({{ '/local-cli/' | relative_url }}) covers the two agents on this
same server that were not written here. For the reasoning rather than
the shape, the handbook's
[big picture]({{ '/handbook/01-big-picture.html' | relative_url }}),
[serving]({{ '/handbook/03-serving.html' | relative_url }}), and
[tools and safety]({{ '/handbook/04-tools-and-safety.html' | relative_url }}) chapters are where
each of these decisions gets argued out.

---
layout: page
permalink: /qwen38/
title: "Qwen3.8-27B, Measured"
kicker: ":: THE SEAT, IN NUMBERS"
description: >-
  Everything this project has measured about the model that holds the seat: what it is, what it costs
  the card, how fast it runs against eighteen others, and where the numbers stop supporting a claim.
reading_level: [Intermediate]
wide: true
prev_url: /telemetry/
prev_label: "Performance data"
next_url: /architecture/
next_label: "How it's built"
---

One model gets the seat on this machine. Everything else is sized around it. This page is that
model's file: its architecture read straight from the weights, its memory accounted line by line
against what the engine itself reports, its speed measured beside eighteen other models on the same
card, and its behaviour across 1,047 real requests.

The [performance data]({{ '/telemetry/' | relative_url }}) page is the plain-English overview. This
one is the detail behind it.

<ul class="stat-row">
  <li class="stat"><span class="stat-value">26.90 B</span><span class="stat-label">parameters, dense: every one of them works on every token</span></li>
  <li class="stat"><span class="stat-value">262,144</span><span class="stat-label">token window, which is the weights' own ceiling and not an extension</span></li>
  <li class="stat"><span class="stat-value">23,969 MiB</span><span class="stat-label">on the card, engine-reported, every component accounted for</span></li>
  <li class="stat"><span class="stat-value">1,047</span><span class="stat-label">requests served in the measured window, zero errors</span></li>
</ul>

## What it actually is

Read directly out of the GGUF header rather than from anyone's description of it.

| | |
|---|---|
| File | `Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf`, 16,547,400,160 bytes (16.55 GB). The [JonathanColetti abliterated build](https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF) was seated 2026-08-29, replacing the stock `Qwen3.8-27B-Q4_K_M.gguf` at 18,973,870,432 bytes. The header facts below were read from that stock file and still carry, since abliteration edits weight values rather than topology. |
| Parameters | 26,895,998,464 across 851 tensors |
| Architecture | `qwen35`, 64 blocks |
| Attention | 24 heads over 4 key/value heads, a 6:1 ratio, 256 wide |
| Window ceiling | 262,144 tokens, trained there |
| Vocabulary | 248,320 tokens |
| Engine | llama.cpp build b10472 |
| Licence | Apache-2.0 |

**It's dense, not mixture-of-experts.** Zero expert tensors, no expert count in the header, and an
engine that prints `n_expert = 0`. That single fact explains most of this page. A mixture-of-experts model
of similar size wakes up maybe a tenth of itself per token. This one wakes up all 27 billion
parameters, every token, without exception.

**The window is real, not stretched.** `n_ctx_train = 262144`, rope scaling linear, frequency scale
1.0. Plenty of models advertise a long context by stretching a shorter one at load time and quietly
degrading. This is not one of them.

> **Note:** The name says Q4_K_M, which reads as "four bits". By element count it's Q4_K 68.4%,
> Q8_0 25.0%, Q6_K 6.6%. By bytes on disk, Q4_K is barely over half at 54.5%. The attention and
> normalisation tensors are kept at higher precision on purpose, which is why the file works out at
> 5.64 bits per weight rather than four.

## The architecture trick that makes 256k possible

This is the most interesting thing about the model. It's also measurable rather than marketing.

**Only 16 of its 64 blocks store a conversation at all.** The header carries
`full_attention_interval = 4`. The tensors confirm it exactly: blocks 3, 7, 11, and so on to 63
carry attention keys and values. The other 48 carry recurrent state instead, a fixed-size summary
that doesn't grow as the conversation grows. The engine's own log agrees, printing a memory line for
48 layers and `skipped` for precisely the other 16.

<svg viewBox="0 0 628 250" role="img" aria-label="All 64 blocks of the model, with the 16 that hold a conversation highlighted">
  <title>Which of the 64 blocks store a conversation</title>
  <rect class="dgm-bg" x="0" y="0" width="628" height="250" rx="4"/>
  <text class="dgm-title" x="44" y="34">64 blocks. Only every fourth one holds the conversation.</text>
  <text class="dgm-label-sm" x="44" y="50">each square is one block, left to right, top to bottom</text>
    <rect class="dgm-panel" x="44" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="78" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="112" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="146" y="62" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="161" y="76" text-anchor="middle">3</text>
    <rect class="dgm-panel" x="180" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="214" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="248" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="282" y="62" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="297" y="76" text-anchor="middle">7</text>
    <rect class="dgm-panel" x="316" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="350" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="384" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="418" y="62" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="433" y="76" text-anchor="middle">11</text>
    <rect class="dgm-panel" x="452" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="486" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="520" y="62" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="554" y="62" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="569" y="76" text-anchor="middle">15</text>
    <rect class="dgm-panel" x="44" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="78" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="112" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="146" y="90" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="161" y="104" text-anchor="middle">19</text>
    <rect class="dgm-panel" x="180" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="214" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="248" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="282" y="90" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="297" y="104" text-anchor="middle">23</text>
    <rect class="dgm-panel" x="316" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="350" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="384" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="418" y="90" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="433" y="104" text-anchor="middle">27</text>
    <rect class="dgm-panel" x="452" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="486" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="520" y="90" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="554" y="90" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="569" y="104" text-anchor="middle">31</text>
    <rect class="dgm-panel" x="44" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="78" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="112" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="146" y="118" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="161" y="132" text-anchor="middle">35</text>
    <rect class="dgm-panel" x="180" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="214" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="248" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="282" y="118" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="297" y="132" text-anchor="middle">39</text>
    <rect class="dgm-panel" x="316" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="350" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="384" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="418" y="118" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="433" y="132" text-anchor="middle">43</text>
    <rect class="dgm-panel" x="452" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="486" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="520" y="118" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="554" y="118" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="569" y="132" text-anchor="middle">47</text>
    <rect class="dgm-panel" x="44" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="78" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="112" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="146" y="146" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="161" y="160" text-anchor="middle">51</text>
    <rect class="dgm-panel" x="180" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="214" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="248" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="282" y="146" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="297" y="160" text-anchor="middle">55</text>
    <rect class="dgm-panel" x="316" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="350" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="384" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="418" y="146" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="433" y="160" text-anchor="middle">59</text>
    <rect class="dgm-panel" x="452" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="486" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-panel" x="520" y="146" width="30" height="20" rx="2"/>
    <rect class="dgm-accent" x="554" y="146" width="30" height="20" rx="2"/>
    <text class="dgm-label-sm" x="569" y="160" text-anchor="middle">63</text>
  <line class="dgm-line" x1="44" y1="182" x2="584" y2="182"/>
  <rect class="dgm-accent" x="44" y="196" width="14" height="12" rx="2"/>
  <text class="dgm-label" x="66" y="206">16 attention blocks, 4,608 MiB of cache at a 262,144-token window</text>
  <rect class="dgm-panel" x="44" y="220" width="14" height="12" rx="2"/>
  <text class="dgm-label" x="66" y="230">48 recurrent blocks, a fixed state that does not grow with the conversation</text>
</svg>

The consequence is the whole reason a 256k window fits on a 32 GB card:

| | at 262,144 tokens |
|---|---|
| This model, 16 caching blocks, cache at q4_0 | **4,608 MiB** |
| A conventional dense 27B, all 64 blocks caching | 18,432 MiB |

That 4.00x is the plain identity of 64 blocks over 16. Both figures are confirmed against the engine
rather than derived on paper: llama.cpp prints `llama_kv_cache: size = 4608.00 MiB (262144 cells,
16 layers)`, which works out to exactly 18,432 bytes per token.

Add the conventional model's 18,432 MiB of cache to the 17,402 MiB of weights the card actually
holds and you get 35,834 MiB, which overshoots this 32,607 MiB card by 3,227 MiB. **The hybrid
architecture is not an optimisation here. It is the only reason the window exists at all.**

## Where the memory goes

Every line below is what the engine reports for itself, not an estimate.

| component | MiB |
|---|---|
| Model weights | 17,402.38 |
| Conversation cache, 16 layers at q4_0, 262,144 tokens | 4,608.00 |
| Recurrent state, 64 layers across 4 slots | 2,394.00 |
| Compute buffer | 1,360.28 |
| Draft model weights | 909.96 |
| Draft model's own cache, 1 layer at f16 | 1,024.00 |
| **Total on the card** | **27,698.62** |

A further 682 MiB of the main model and 682 MiB of the draft stay mapped in system memory rather
than on the card. The process carries roughly 530 MiB of CUDA context on top. Measured whole-card while
resident: 29,789 MiB of 32,607, against a 1,260 MiB desktop baseline.

> **Note:** An earlier version of this table read 598.50 MiB of recurrent state, called it fixed, and
> gave a total of 23,969 MiB. Both were wrong. The error is worth naming because it is easy to
> repeat. Those figures came from a run **without** the draft model. The recurrent state is not
> fixed at all either. The engine allocates it as `n_parallel x (1 + spec-draft-n-max)` rows of 149.625 MiB
> each. This row leaves `-np` at auto, which resolves to 4, and it drafts 3 tokens ahead. That takes
> `4 x 4 = 16` rows rather than the 4 a plain run would use. The table above was re-read straight off
> the engine at `-lv 5` with the shipped flag line.

**Two consequences of that arithmetic, neither yet applied.** Setting `-np 1` would take the
recurrent state from 2,394 MiB to 598.50, and quantising the draft's own cache would take it from
1,024 MiB to about 256. Together that is roughly **2.5 GB back for two flags**, no download and no
change to the weights. It is the largest piece of free memory this project has found. It exists
because the cost of drafting ahead was never priced.

**Quantising the cache made the bigger window cheaper, not dearer.** Holding the cache at q4_0
instead of 16-bit costs 18,432 bytes per token instead of 65,536. Measured against the previous
configuration, a 104k window at full precision, the current 256k setup uses **913 MiB less** on the
engine's own accounting, and 976 MiB less by the benchmark's independent reading. Two instruments,
66 MiB apart, same direction.

> **Warning:** Those figures describe the model on its own. The configuration that actually ships
> adds a speculative draft model on top, which costs a further 3,100 MiB or so and makes the shipped
> row more expensive than the one it replaced, not less. Both things are true and they get confused
> easily.

## Speed, against eighteen other models on the same card

Every model the server holds was given the same prompt through the same endpoint on the same
afternoon. This is the only measurement path where the router reports a real generation rate.

| # | Model | Type | tokens/sec |
|---|---|---|---|
| 1 | gpt-oss-20b | MoE | **323.1** |
| 2 | Qwen2.5-3B-Instruct | dense | 297.9 |
| 3 | Qwen3-Coder-30B-A3B [32k] | MoE | 229.5 |
| 4 | Qwen3.6-35B-A3B-MTP | MoE | 229.1 |
| 5 | Qwen3-Coder-30B-A3B [128k] | MoE | 226.8 |
| 6 | Qwen3-Coder-30B-A3B, b10472 build | MoE | 225.4 |
| 7 | Qwen3-Coder-30B-A3B, Q5 | MoE | 219.4 |
| 8 | Qwen3.6-35B-A3B | MoE | 209.6 |
| 9 | GLM-4.7-Flash | MoE | 205.5 |
| 10 | Qwen3-VL-8B [32k] | dense | 197.8 |
| 11 | Qwen3-VL-8B [16k] | dense | 197.7 |
| 12 | Qwen3-Coder-REAP-25B-A3B | MoE | 195.2 |
| 13 | DeepSeek-R1-0528-Qwen3-8B | dense | 191.6 |
| **14** | **Qwen3.8-27B, the seat** | **dense** | **96.1** |
| 15 | Devstral-Small-2-24B | dense | 85.5 |
| 16 | DeepSeek-R1-Distill-Qwen-32B | dense | 64.2 |
| 17 | Qwen3-VL-32B | dense | 62.9 |
| 18 | Qwen3.8-27B f16 104k, the control | dense | 62.6 |
| 19 | gpt-oss-120b, offloaded | MoE | 27.9 |

**The seat is fourteenth of nineteen. The fastest model on the box is 3.36 times quicker.** That
is not a defect to be fixed. Nine of the nineteen are dense and ten are mixture-of-experts, verified
one by one from their headers. The pattern is stark: the quick end of the table is almost
entirely MoE. The seat is dense by choice, because on this project's own coding suite it was the
candidate that held up.

The bottom row is the other lesson. `gpt-oss-120b` needs 63.4 GB against a 34.2 GB card, so a fifth
of it runs on the processor instead. It lands at 27.9 tokens per second, an order of magnitude off
models a third its size that fit. **Fitting on the card outranks almost every other consideration.**

> **Common trap:** Each row is one reading, not an average. A threefold gap is real at that sample
> size. A five percent gap between two neighbouring rows is not. Don't read one
> into this table.

## What speculative decoding buys

The seat runs a small draft model alongside itself. It guesses the next few tokens. The big model
checks them all in one pass. Correct guesses come free. Measured under the benchmark harness,
which records its launch line verbatim so every number is attributable:

| | without | with | change |
|---|---|---|---|
| Decode at 131k depth (2026-09-03, the shipping seat) | 44.1 tok/s | 54.7 | **+24.0%** |
| Raw decode, short prompt | 65.9 tok/s | 90.4 | +37.2% |

The draft model's acceptance rate is 0.5245 on the benchmark corpus and 0.61 on real traffic, both
measured 2026-09-03 against the weights running today.

An earlier pass through this same harness reported **+42.6%, +43.1%, and a 1.43x multiplier**, at
what it labeled roughly 8k and 157k depth, with 0.500 and 0.517 acceptance. Those readings are
retracted. Every one of them actually ran against a bench-corpus file that topped out at 7,840
tokens regardless of the depth the harness claimed, and against the stock
`Qwen3.8-27B-Q4_K_M.gguf` this stack shipped before the 2026-08-29 abliterated swap. The 131k row
above is the number that reflects the seat and the draft head actually running today.

It costs roughly 3,100 to 4,000 MiB of memory to keep the guesser loaded, which on a card this full
has to come from somewhere.

## Slowing down with depth, and what does not

Both prefill and generation degrade as the conversation grows. They degrade differently.

| conversation depth | prefill tok/s | generation tok/s | prompt reused |
|---|---|---|---|
| ~8,000 | 3,489 | 64.8 | 99.58% |
| ~63,000 | 2,632 | 54.0 | 99.95% |
| ~120,000 | 1,791 | 43.8 | 99.97% |
| ~157,000 | 1,581 | 41.7 | 99.98% |

Reading the last column: at 157,000 tokens deep, a continuing conversation re-reads **33 tokens**.
Prefix reuse is essentially perfect and gets better with depth, because the fixed part of the
conversation grows while the new part does not.

Generation falls by about a third across that range. Prefill falls by more than half. Neither is a
cliff, and both are the expected shape for attention over a growing cache.

## How it behaves on real work

1,047 requests through the seat in the measured window, every one of them answered.

| | |
|---|---|
| Requests | 1,047, **zero errors** |
| Time spent generating | 3.32 hours |
| Reply length | median 238 tokens, p90 1,357 |
| Response time | p25 1.9 s, median 4.7 s, p75 11.6 s, p90 22.2 s |
| Longest single request | 298.8 s |
| Prompt depth presented | median 27,790 tokens, p90 35,156 |
| Deepest prompt ever | **84,741 tokens** |

**Prompt reuse tells two stories at once. Both are true.** The median request had 98.4% of its
prompt served from cache. Weighted by tokens across the whole corpus it falls to **84.5%**, because
151 requests (14.4% of them) arrived with nothing cached at all and those carry **87.3% of every
token the model freshly read**.

That gap is the most useful number on this page. Within a session, reuse is close to perfect. Across
sessions it does nothing. The cost is concentrated in a small number of very expensive cold starts.

> **Key idea:** The same measurement on the control model gives 86.1% of fresh prefill in its cold
> requests and a token-weighted reuse of 84.53%, against the seat's 84.52%. Two separately collected
> populations agreeing to four decimal places means this is a property of the workload, not of either
> model.

## The window is barely used

This is the uncomfortable one. It belongs on the page.

| | |
|---|---|
| Window provisioned | 262,144 tokens |
| Deepest prompt actually presented | 84,741 tokens, **32.3% of it** |
| Requests exceeding 104k tokens | **0 of 1,047** |
| Median depth as a share of the window | 10.6% |

Every prompt in the measured corpus would have fitted inside the 104k window this configuration
replaced. That holds even after adding each reply to its own prompt, which tops out at 85,519 tokens.

The window still earns its place, but for a different reason than depth: the client compacts a
conversation at three quarters of the window. At 262,144 that trigger moves from 100,000 tokens out
to 196,608. That's the change you'd actually notice. **The extra room is insurance that hasn't
yet been claimed.**

## Quality, and why there is no single score here

The seat won its position on the 23-task coding suite that existed then: 15 tasks against a small
C# and .NET 9 console app, plus 8 Unreal Engine 5 C++ tasks. The bar to promote a model was 21 of
23. The suite has since grown to 26 tasks (three image tasks added around 2026-08-30), and the bar
is now 24 of 26.

**This page deliberately publishes no headline suite score**, because the honest answer is that four
defensible numbers exist for this model depending on which batch you take and how you aggregate it,
and the suite can't resolve differences of the size that separates them. Quoting any one of them
would be picking a favourite.

What the repeated runs do establish is worth more than a score:

- **Instability is concentrated in the Unreal half.** Five of the 8 Unreal tasks give different
  answers on repeat runs, against 1 of the 15 C# tasks.
- **On the 21 tasks whose graders were stable that day, the seat and its control tie**, at 18 of 21
  each, from an identical 55 of 63 raw attempts. Not close. Identical.
- **One task fails on every arm, every time.** Zero passes in 11 attempts across both models.
- **Tool calling is effectively perfect.** Zero malformed calls across 1,155 of them.

> **Warning:** A suite run once per task is a single roll of the dice, because the model samples at
> a temperature above zero. Running each task three times and taking the majority moves this model's
> score by two tasks. Any comparison drawn from single runs, including some in this project's own
> older notes, should be read with that in mind.

## What this page does not measure

- **Nothing here is a quality benchmark against other models.** The speed table says which models are
  fast. It says nothing about which write better code. The fast ones frequently don't.
- **The nineteen-model comparison is one reading each.** Enough for the threefold spread, not enough
  to rank neighbours.
- **The serving numbers come from an automated coding benchmark**, not from a person using the tool.
  A benchmark starts a fresh session every minute or so, which is the worst possible case for the
  cross-session reuse described above. Interactive use would look better.
- **The router only reports true generation rates on one of its two endpoints.** Roughly 99.5% of
  requests here came through the other one. Per-request rates are therefore derived from duration
  and token counts rather than reported by the engine.
- **These are one card's numbers.** One RTX 5090, 32,607 MiB, Windows.

Every figure above was gathered from the logs, then independently re-derived by a second pass told to
refute it rather than confirm it. That pass overturned a substantial share of the first attempt,
including several numbers that looked entirely publishable. Where the two disagreed, the page carries
the correction.

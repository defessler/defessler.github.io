---
layout: page
permalink: /download/
title: "Download the launchers"
kicker: ":: THE BOOTSTRAPPER BUNDLE"
description: >-
  A small archive that puts doki-claude and doki-copilot on your PATH, for a machine that talks to
  a DokiDex box without holding a checkout of it.
reading_level: [Beginner]
prev_url: /local-cli/
prev_label: "Run the CLIs locally"
next_url: /models/
next_label: "Models it runs"
---

This is the one thing DokiDex ships as a file. It's the two launchers and their installer. A machine
that isn't the DokiDex box can use it to run Claude Code and Copilot CLI against one that is.

<p class="download-cta">
  <a class="button" href="{{ '/downloads/doki-bootstrappers-0.62.0.zip' | relative_url }}"
     download>{% include dl-glyph.svg %}Download doki-bootstrappers-0.62.0.zip</a>
  <span class="download-meta">83,507 bytes &middot; version 0.62.0 &middot; Windows, PowerShell 7</span>
</p>

Verify it before you run it. The archive is built deterministically. This digest is the same one the
packager printed when the bundle was made:

```
980776728a254eb926ee39ae3a8b621a155559d27f86287fb2d26011fd22778e
```

```powershell
Get-FileHash .\doki-bootstrappers-0.62.0.zip -Algorithm SHA256
```

If that doesn't match, don't unzip it.

## What this is not

It's worth being blunt about the limits, because the archive is small for a reason.

- **No model weights.** Nothing here loads onto a GPU. The weights are tens of gigabytes and they
  stay on the box that serves them.
- **No backend.** This won't start a model server. It assumes one is already answering.
- **Not a checkout.** The full stack, `setup.ps1`, the evals and the serving configs all live in
  the repository, which is private.

So this is the client half only. If you don't already have a DokiDex backend running somewhere,
this archive has nothing to connect to and isn't where to start. Read
[Run the CLIs locally]({{ '/local-cli/' | relative_url }}) first.

## What you get

Two commands, on your PATH, in any terminal:

- `doki-claude` runs Anthropic's Claude Code CLI against your local seat
- `doki-copilot` runs GitHub's Copilot CLI against the same server

Your ordinary cloud `claude` and `copilot` keep working and stay untouched. That's why the names are
prefixed rather than shadowing the real ones.

Inside the archive: `scripts\claude-local.ps1`, `scripts\copilot-local.ps1`,
`scripts\doki-manager.ps1`, `scripts\install-clients.ps1`, and a README. The shims themselves aren't
in the zip on purpose. The installer writes them, which is what lets `-Uninstall` clean up
completely: it only removes files it wrote.

## Before you start

Three things have to be true.

- **Windows with PowerShell 7.** Run `pwsh -v`. If that isn't found, install it with
  `winget install Microsoft.PowerShell`. Windows PowerShell 5.1 isn't enough.
- **A DokiDex backend answering on `http://127.0.0.1:8080`.** On the box itself that's
  `.\doki.ps1 up agent`. The launchers check this and tell you when it's down.
- **At least one of the two real CLIs installed.** Claude Code comes from
  `npm install -g @anthropic-ai/claude-code`, Copilot from `winget install GitHub.Copilot`. The
  installer warns about a missing one and only fails if both are absent.

## Install

Unzip it wherever you like, then from the unzipped folder:

```powershell
pwsh -NoProfile -File scripts\install-clients.ps1
```

Open a **new** terminal afterwards. The one you ran it in still has its old PATH.

To undo everything, including the PATH entry:

```powershell
pwsh -NoProfile -File scripts\install-clients.ps1 -Uninstall
```

Both directions are safe to run twice. A second run reports what was already right and writes
nothing.

The installer adds one directory to your **User** PATH, not the machine PATH, so it needs no
administrator rights.

## Where else this lives

The same archive is published on the public release mirror,
[defessler/dokidex-releases]({{ site.releases_url }}), byte for byte. Go there for the release
notes, the older versions, or if you would rather download from GitHub than from a documentation
page.

The button above is a copy served by this site, and it exists because the DokiDex repository itself
is private. A release asset on a private repository returns a 404 to anyone without access, so a
link straight into the source repo would look like a download and behave like a broken link.

Both copies come from the same packager run and carry the digest printed above. The packager is
deterministic, so that is a checkable claim rather than a promise.

The version, the byte count and the digest on this page are all checked against the actual file by
`tests\site-download.test.ps1`, so a release that moves on without this page going with it fails a
test rather than quietly serving you last month's launchers.

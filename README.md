# defessler.github.io

Personal portfolio site for Doug Fessler.

## Stack

- Vanilla HTML/CSS/JavaScript — no framework, no build step
- Content driven by JSON files loaded at runtime via `js/site.js`
- Hosted on GitHub Pages

## Structure

```
index.html              # Single entry point (SPA)
js/site.js              # Fetches content and renders the page
css/style.css           # All styles
content/
  site.json             # Nav, social links, email
  pages/
    about.json          # Bio, stats, highlights
    portfolio.json      # Project entries
    resume.json         # Work history
img/                    # Portfolio and profile images
projects/
  furball-frenzy/       # Unity WebGL build (playable in browser)
```

## Content

All page content lives in `content/pages/`. To update the site, edit the JSON files — no code changes needed for most content updates.

## Local Development

No build required. Open `index.html` directly in a browser, or use any static file server:

```bash
npx serve .
```

## Deployment

Pushes to `master` are automatically deployed via GitHub Pages.

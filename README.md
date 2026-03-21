# defessler.github.io

Personal portfolio site for Doug Fessler, Senior Gameplay Engineer at Blizzard Entertainment.

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

---

## JSON Schema

### `content/site.json`

Top-level site configuration shared across all pages.

```json
{
  "title": "string — displayed in the nav brand and page title",
  "nav": [
    { "label": "string — nav link text", "page": "string — matches a filename in content/pages/ (e.g. 'about')" }
  ],
  "social": [
    { "label": "string", "url": "string", "icon": "string — CSS class suffix (e.g. 'github', 'linkedin')" }
  ],
  "email_user": "string — part before @ (obfuscated in DOM to reduce spam)",
  "email_domain": "string — part after @"
}
```

---

### `content/pages/about.json`

```json
{
  "type": "about",
  "title": "string — browser tab suffix",
  "name": "string",
  "headline": "string — role shown under name",
  "photo": "string — path to profile image",
  "bio": ["string — paragraph", "..."],
  "stats": [
    { "label": "string", "value": "string" }
  ],
  "skills": ["string", "..."],
  "highlights": [
    {
      "title": "string",
      "context": "string — company or context",
      "description": "string",
      "href": "string — anchor link, e.g. '#portfolio'"
    }
  ],
  "cta": [
    { "label": "string", "href": "string", "primary": true }
  ]
}
```

---

### `content/pages/portfolio.json`

```json
{
  "type": "portfolio",
  "title": "string",
  "projects": [
    {
      "title": "string",
      "company": "string",
      "year": "string — e.g. '2022-2026'",
      "featured": true,           // featured projects use larger cards
      "unreleased": true,         // optional — adds 'unreleased' badge
      "image": "string — path to image",
      "tech": ["string", "..."],
      "platforms": ["string", "..."],
      "description": "string — short summary",
      "subprojects": [            // optional — featured projects only
        { "title": "string", "description": "string" }
      ],
      "links": [
        { "label": "string", "url": "string" }
      ]
    }
  ]
}
```

---

### `content/pages/resume.json`

```json
{
  "type": "resume",
  "title": "string",
  "data": {
    "name": "string",
    "headline": "string",
    "contact": {
      "email_user": "string — obfuscated on screen, shown in print",
      "email_domain": "string",
      "location": "string — e.g. 'Anaheim, CA'",
      "website": "string"
    },
    "objective": "string",
    "skills": [
      { "category": "string", "items": ["string", "..."] }
    ],
    "experience": [
      {
        "company": "string",
        "title": "string",
        "start": "string — e.g. '03/2026'",
        "end": "string — e.g. 'Present'",
        "bullets": ["string", "..."],   // optional top-level bullets
        "projects": [
          {
            "name": "string",
            "platform": "string",
            "type": "string — e.g. 'Online Multiplayer'",
            "bullets": ["string", "..."],
            "teams": [                  // optional — for multi-team entries
              { "name": "string", "bullets": ["string", "..."] }
            ]
          }
        ]
      }
    ],
    "additional_experience": [          // same shape as experience entries
      { "company": "...", "title": "...", "start": "...", "end": "...", "bullets": [] }
    ],
    "education": [
      {
        "school": "string",
        "start": "string",
        "end": "string",
        "degree": "string",
        "field": "string",
        "additional": "string — optional extra line"
      }
    ],
    "interests": "string — hidden in print view"
  }
}
```

---

## Local Development

No build required. Open `index.html` directly in a browser, or use any static file server:

```bash
npx serve .
```

## Deployment

Pushes to `master` are automatically deployed via GitHub Pages.

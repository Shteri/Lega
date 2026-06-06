# RegWatch / Lega

Regulatory intelligence platform covering AI, Fintech, Crypto, Platforms, Privacy, Cybersecurity, and Gambling across EU, US, UK, and Isle of Man.

## Stack

- **Site:** Eleventy (11ty) — markdown articles + JSON data → static HTML
- **Hosting:** Netlify (auto-deploy from GitHub main branch)
- **Functions:** Netlify Functions (Node.js)
- **Agents:** 10 chiefs, 44 workers — Claude Opus / Sonnet / Haiku

## Project Structure

```
lega/
├── src/                  ← 11ty input (articles, templates, CSS)
│   ├── articles/         ← Published articles (markdown, written by agents)
│   ├── _includes/        ← Layouts (base.njk, article.njk)
│   ├── css/              ← Stylesheets
│   └── *.njk             ← Pages (index, wire, regulators, deadlines)
├── data/                 ← Structured data layer (written by agents, committed)
│   ├── pillars/          ← Law pillar page JSON files
│   ├── regulators/       ← Regulator hub JSON files
│   ├── wire/
│   │   └── items.json    ← Live wire feed
│   └── deadlines.json    ← Upcoming compliance deadlines
├── docs/                 ← Specs and schemas
│   ├── regwatch-coverage-spec.md
│   ├── regwatch-operational-spec.md
│   ├── article-schema.md
│   ├── extracted-facts-schema.md
│   └── wire-item-schema.md
├── netlify/
│   └── functions/        ← Netlify serverless functions
├── pipeline/             ← GITIGNORED — runtime agent working directory
├── .eleventy.js          ← 11ty config
├── netlify.toml          ← Netlify build config
└── package.json
```

## Setup

```bash
# Install dependencies
npm install

# Local dev server
npm run dev

# Build
npm run build
```

## Environment

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` — for all agent workers
- `NETLIFY_AUTH_TOKEN` — for Publisher worker deploys
- `NETLIFY_SITE_ID` — set after first deploy

## Agent Architecture

44 workers across 10 chiefs. See `docs/regwatch-operational-spec.md`.

| Chief | Workers | Purpose |
|-------|---------|---------|
| Research | 22 | Discover, fetch, classify, extract regulatory items |
| Content | 3 | Write articles from extracted facts |
| Wire | 4 | Aggregate trade press RSS into live wire feed |
| Technology | 3 | Validate articles before deploy |
| Data | 3 | Maintain pillars, deadlines, regulator hub |
| Deploy | 3 | Build site and push to Netlify |
| UX/UI | 2 | Build and audit components |
| Infrastructure | 4 | Monitor APIs, costs, dependencies |
| Innovations | 0 | Ideas and product direction (Opus, manual) |
| Manager | 0 | Orchestrate, brief, route failures |

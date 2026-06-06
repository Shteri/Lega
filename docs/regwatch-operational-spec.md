# RegWatch — Full Operational Spec
## Every Chief, Every Worker, Every Data Flow

---

## Chief of Research

**Purpose:** Discover new regulatory items and extract structured facts from them.

### Workers

#### Scanner
- **What it does:** Polls regulator websites/feeds for new publications
- **Input source:** Regulator feed URLs (defined in regulator-sources.md)
- **How it knows what's new:** Maintains a ledger file (/data/scanner-ledger.json) tracking last-seen items per source. Compares current feed items against ledger. New = not in ledger.
- **Trigger:** Scheduled — every 1-4 hours (varies by source priority)
- **Output:** List of new item URLs written to /pipeline/discovered/[timestamp].json
- **Model:** Haiku (mechanical comparison)

#### Fetcher
- **What it does:** Retrieves raw content from a URL
- **Input source:** URLs from Scanner output (/pipeline/discovered/) OR manual user input
- **Trigger:** New file in /pipeline/discovered/ OR user pastes URL
- **Output:** Clean text written to /pipeline/raw/[id].txt
- **Model:** Haiku (mechanical retrieval)

#### Classifier
- **What it does:** Classifies raw content by content type, sector, jurisdiction, depth
- **Input source:** Raw text from /pipeline/raw/
- **Trigger:** New file in /pipeline/raw/
- **Output:** Classification JSON appended to the raw file OR written to /pipeline/classified/[id].json
- **Model:** Sonnet (taxonomy judgment)

#### 18 Domain Specialists
- **What they do:** Extract structured facts from classified content using deep domain knowledge
- **Input source:** Classified content from /pipeline/classified/
- **How routing works:** Classifier output has practice + jurisdiction fields. Routing table maps to specialist: practice=crypto + jurisdiction=EU → researcher-eu-crypto
- **Trigger:** New file in /pipeline/classified/
- **Output:** Structured facts JSON written to /pipeline/extracted/[id].json
- **Model:** Sonnet (domain extraction)

**Specialist list:**
| Agent | Practice | Jurisdiction | Key regulators |
|---|---|---|---|
| researcher-eu-ai | ai | EU | EU AI Office, EC, ENISA, CEN-CENELEC |
| researcher-us-ai | ai | US | NIST, FTC, OSTP, Congress |
| researcher-uk-ai | ai | UK | DSIT, AISI, FCA, ICO, CMA |
| researcher-eu-fintech | fintech | EU | EBA, ESMA, EIOPA, ECB, EC |
| researcher-us-fintech | fintech | US | OCC, FDIC, Fed, CFPB, NCUA, FinCEN |
| researcher-uk-fintech | fintech | UK | FCA, PSR, PRA, HM Treasury |
| researcher-eu-crypto | crypto | EU | ESMA, EBA, EC, CySEC |
| researcher-us-crypto | crypto | US | SEC, CFTC, FinCEN, OCC, OFAC, Congress |
| researcher-uk-crypto | crypto | UK | FCA, HM Treasury, Bank of England |
| researcher-eu-platforms | platforms | EU | EC (DG CONNECT, DG COMP), DSCs |
| researcher-us-platforms | platforms | US | DOJ Antitrust, FTC, Congress, FCC |
| researcher-uk-platforms | platforms | UK | Ofcom, CMA, ICO |
| researcher-eu-data-protection | data-protection | EU | EDPB, CNIL, BfDI, AP, Garante, AEPD |
| researcher-us-data-protection | data-protection | US | FTC, CPPA, CA AG, HHS, state AGs |
| researcher-uk-data-protection | data-protection | UK | ICO, DSIT |
| researcher-global-cyber | cyber | ALL | CISA, NCSC, ENISA, NIST, NSA, Five Eyes |
| researcher-us-gambling | gambling | US | State gaming commissions, DOJ, CFTC |
| researcher-uk-gambling | gambling | UK | UKGC |

#### Deduper
- **What it does:** Checks extracted facts against existing site articles to avoid duplicates
- **Input source:** Structured facts from /pipeline/extracted/
- **How it checks:** Compares source URL, regulator + event_date + topic against /articles/ directory
- **Trigger:** New file in /pipeline/extracted/
- **Output:** If NEW → moves file to /pipeline/inbox/[id].json (ready for Content). If DUPLICATE → moves to /pipeline/duplicates/ with note. If UPDATE → moves to /pipeline/inbox/ with update flag.
- **Model:** Haiku (pattern matching)

### Full Research pipeline flow
```
regulator-sources.md (URLs)
    ↓
[Scanner] polls feeds → /pipeline/discovered/
    ↓
[Fetcher] retrieves content → /pipeline/raw/
    ↓
[Classifier] classifies → /pipeline/classified/
    ↓
[Specialist] extracts facts → /pipeline/extracted/
    ↓
[Deduper] checks duplicates → /pipeline/inbox/ (or /pipeline/duplicates/)
```

---

## Chief of Content

**Purpose:** Write articles from structured facts. No fetching, no classification.

### Workers

#### Writer
- **What it does:** Takes structured facts JSON and writes a publication-ready article (frontmatter + markdown body)
- **Input source:** Structured facts from /pipeline/inbox/
- **Trigger:** New file in /pipeline/inbox/ OR user says "write an article"
- **Output:** Article markdown written to /pipeline/drafted/[slug].md
- **What it needs to know:** Editorial standards, frontmatter schema, writing voice. NO domain knowledge.
- **Model:** Opus (writing quality is the product)

#### Tagger
- **What it does:** Audits and corrects the frontmatter on a drafted article
- **Input source:** Drafted article from /pipeline/drafted/
- **Trigger:** Automatically after Writer finishes
- **Output:** Corrected frontmatter replaces original in the drafted file. File moves to /pipeline/ready/[slug].md
- **What it needs to know:** Valid frontmatter values (practice codes, law slugs, regulator short names)
- **Model:** Sonnet (validation)

#### Backfill Checker
- **What it does:** Checks if the article is part of an ongoing matter that needs historical entries on pillar pages
- **Input source:** Drafted article with backfill_needed=true
- **Trigger:** After Tagger, only if backfill_needed=true
- **Output:** Backfill report written to /pipeline/backfill/[slug]-backfill.json (picked up by Chief of Data)
- **What it needs to know:** What a law pillar page should contain (milestones per law)
- **Model:** Sonnet (historical gap detection)

### Full Content pipeline flow
```
/pipeline/inbox/[id].json (from Research)
    ↓
[Writer] writes article → /pipeline/drafted/[slug].md
    ↓
[Tagger] corrects frontmatter → /pipeline/ready/[slug].md
    ↓
[Backfill Checker] (if needed) → /pipeline/backfill/[slug]-backfill.json
```

---

## Chief of Wire

**Purpose:** Aggregate trade press RSS into the live wire feed. Separate from editorial.

### Workers

#### RSS Puller
- **What it does:** Fetches RSS feeds from 30+ trade press publishers
- **Input source:** RSS feed URLs (defined in wire-sources.md — trade press, NOT regulator sites)
- **Trigger:** Scheduled — every 10 minutes
- **Output:** Raw feed items written to /pipeline/wire-raw/
- **What it needs to know:** The RSS feed URL list only
- **Model:** Haiku (mechanical fetch)

#### Wire Deduper
- **What it does:** Checks new feed items against existing wire items to avoid duplicates
- **Input source:** Raw feed items from /pipeline/wire-raw/
- **How it checks:** URL match, title similarity, publisher + date
- **Trigger:** After RSS Puller
- **Output:** Deduplicated items written to /pipeline/wire-new/
- **Model:** Haiku (string matching)

#### Scorer
- **What it does:** Scores relevance of each wire item against RegWatch's sector/jurisdiction coverage
- **Input source:** Deduplicated items from /pipeline/wire-new/
- **How it scores:** Does the item touch one of the 7 sectors? Does it involve a tracked jurisdiction? Is a tracked regulator mentioned?
- **Trigger:** After Wire Deduper
- **Output:** Scored items (above threshold) written to /pipeline/wire-scored/
- **What it needs to know:** The 7 sector names, tracked jurisdictions, tracked regulator names
- **Model:** Sonnet (relevance judgment)

#### Wire Formatter
- **What it does:** Formats scored items into the wire feed data format for the site
- **Input source:** Scored items from /pipeline/wire-scored/
- **Trigger:** After Scorer
- **Output:** Formatted wire items written to /data/wire/items.json (site reads this directly)
- **Model:** Haiku (mechanical formatting)

### Full Wire pipeline flow
```
wire-sources.md (RSS URLs)
    ↓
[RSS Puller] fetches feeds → /pipeline/wire-raw/
    ↓
[Wire Deduper] removes duplicates → /pipeline/wire-new/
    ↓
[Scorer] filters by relevance → /pipeline/wire-scored/
    ↓
[Wire Formatter] formats for site → /data/wire/items.json
    ↓
[Chief of Deploy] builds and publishes
```

---

## Chief of Technology

**Purpose:** Validate articles before they go live. Catch errors before the reader does.

### Workers

#### Schema Checker
- **What it does:** Validates frontmatter fields against the schema — correct types, valid values, required fields present
- **Input source:** Article files from /pipeline/ready/
- **Trigger:** New file in /pipeline/ready/
- **Output:** PASS → file moves to /pipeline/validated/. FAIL → file moves to /pipeline/errors/ with error report.
- **What it needs to know:** Frontmatter schema (valid practice values, content type codes, jurisdiction codes, law slugs, regulator names)
- **Model:** Haiku (mechanical validation)

#### Link Checker
- **What it does:** Checks that all URLs in the article resolve (primary source URL, any inline links)
- **Input source:** Article from /pipeline/ready/ (runs alongside Schema Checker)
- **Trigger:** Same as Schema Checker
- **Output:** Appends link check results to the validation report. Broken link = FAIL.
- **Model:** Haiku (HTTP requests)

#### Mobile Checker
- **What it does:** Validates that the article will render correctly on mobile — checks for overly long titles, tables without responsive wrappers, images without alt text
- **Input source:** Article from /pipeline/ready/
- **Trigger:** Same as Schema Checker
- **Output:** Appends mobile check results to the validation report
- **What it needs to know:** Mobile layout rules (max title length, no raw HTML tables, image requirements)
- **Model:** Haiku (rule checking)

### Full Technology pipeline flow
```
/pipeline/ready/[slug].md (from Content)
    ↓
[Schema Checker] + [Link Checker] + [Mobile Checker] run in parallel
    ↓
All pass → /pipeline/validated/[slug].md
Any fail → /pipeline/errors/[slug].md + error report
```

---

## Chief of Data

**Purpose:** Maintain the structured knowledge layer — law pillar pages, regulator hub, deadlines.

### Workers

#### Pillar Updater
- **What it does:** Reads backfill reports and updates law pillar pages with missing historical entries
- **Input source:** Backfill reports from /pipeline/backfill/
- **Trigger:** New file in /pipeline/backfill/ OR scheduled daily
- **Output:** Updated pillar page files in /data/pillars/
- **What it needs to know:** Pillar page structure (milestones, effective dates, article links)
- **Model:** Sonnet (judgment on what to add)

#### Deadline Tracker
- **What it does:** Maintains a calendar of upcoming regulatory deadlines extracted from articles
- **Input source:** Articles in /articles/ — scans for effective_date and compliance_deadline fields
- **Trigger:** Scheduled — daily
- **Output:** Updated deadline calendar in /data/deadlines.json
- **What it needs to know:** Date parsing, which deadlines are still upcoming vs past
- **Model:** Haiku (date extraction)

#### Regulator Sync
- **What it does:** Keeps regulator hub entries up to date — adds new regulators, updates item counts, links to latest articles
- **Input source:** All articles in /articles/ + regulator hub data in /data/regulators/
- **Trigger:** After every deploy (new article published)
- **Output:** Updated regulator hub files in /data/regulators/
- **What it needs to know:** Regulator hub schema (regulator name, jurisdiction, sector, linked articles)
- **Model:** Sonnet (matching articles to regulators)

### Full Data pipeline flow
```
/pipeline/backfill/ (from Content)
    ↓
[Pillar Updater] → /data/pillars/

/articles/ (after deploy)
    ↓
[Deadline Tracker] → /data/deadlines.json
[Regulator Sync] → /data/regulators/
```

---

## Chief of Deploy

**Purpose:** Build the site and push to Netlify. Verify the deploy succeeded.

### Workers

#### Builder
- **What it does:** Moves validated articles from /pipeline/validated/ to /articles/, then runs the site build script
- **Input source:** Validated articles from /pipeline/validated/
- **Trigger:** New file in /pipeline/validated/ OR manual "deploy" command
- **Output:** Built site in /dist/ (or wherever the build outputs)
- **What it needs to know:** File paths, build script command
- **Model:** Haiku (runs a script)

#### Publisher
- **What it does:** Pushes the built site to Netlify via deploy hook or CLI
- **Input source:** Built site from Builder
- **Trigger:** After Builder succeeds
- **Output:** Netlify deploy URL
- **What it needs to know:** Netlify deploy hook URL, CLI config
- **Model:** Haiku (runs a command)

#### Verifier
- **What it does:** Fetches the live site after deploy and checks that the new article appears correctly
- **Input source:** The deploy URL from Publisher + the article slug
- **Trigger:** After Publisher succeeds
- **Output:** PASS (article appears on live site) or FAIL (with what went wrong)
- **What it needs to know:** Live site URL, expected article path
- **Model:** Haiku (HTTP check)

### Full Deploy pipeline flow
```
/pipeline/validated/[slug].md (from Technology)
    ↓
[Builder] moves to /articles/ + runs build → /dist/
    ↓
[Publisher] pushes to Netlify → deploy URL
    ↓
[Verifier] checks live site → PASS/FAIL
```

---

## Chief of UX/UI

**Purpose:** Maintain the design system and build/review components.

### Workers

#### Component Builder
- **What it does:** Generates new UI components or page sections that match the RegWatch design system
- **Input source:** User request describing what to build
- **Trigger:** Manual — user asks "build a [component]"
- **Output:** Component code file in /components/ or /mnt/user-data/outputs/
- **What it needs to know:** Design system (glass morphism, CSS vars, typography, spacing, mobile breakpoints)
- **Model:** Sonnet (code generation)

#### Design Auditor
- **What it does:** Reviews existing pages or components against the design system for consistency, accessibility, and mobile issues
- **Input source:** URL of live site page OR component code file
- **Trigger:** Manual — user asks "review the site" or "check this component"
- **Output:** Structured critique with issues and recommendations
- **What it needs to know:** Design system rules, WCAG 2.1 AA basics, mobile-first principles
- **Model:** Sonnet (design judgment)

---

## Chief of Infrastructure

**Purpose:** Monitor the platform health — APIs, quotas, costs, environment.

### Workers

#### API Health Checker
- **What it does:** Checks the health/status of every external API the site depends on (Claude API, Netlify, RSS feeds, regulator sites)
- **Input source:** API manifest (defined in api-manifest.md — list of all APIs, endpoints, expected response)
- **Trigger:** Scheduled — every 4 hours
- **Output:** Health report in /data/infra/health-[date].json. Alerts if any API is down or degraded.
- **Model:** Haiku (HTTP health checks)

#### Cost Monitor
- **What it does:** Tracks Claude API token usage, Netlify build minutes, and other metered resources
- **Input source:** API usage dashboards, Netlify usage page, pipeline run logs
- **Trigger:** Scheduled — daily
- **Output:** Cost report in /data/infra/cost-[date].json. Alerts if spend is above threshold.
- **What it needs to know:** Budget thresholds per service
- **Model:** Haiku (number checking)

#### Netlify Stats Puller
- **What it does:** Pulls deploy stats from Netlify — last deploy time, build duration, success/failure, bandwidth
- **Input source:** Netlify API or CLI
- **Trigger:** After every deploy + scheduled daily
- **Output:** Deploy stats in /data/infra/netlify-stats.json
- **Model:** Haiku (API call)

#### Dependency Mapper
- **What it does:** Maintains a map of all external dependencies — npm packages, APIs, feed sources — and their versions/status
- **Input source:** package.json, .env files, regulator-sources.md, wire-sources.md
- **Trigger:** Scheduled — weekly
- **Output:** Dependency map in /data/infra/dependencies.json. Flags deprecated packages or expiring API keys.
- **Model:** Sonnet (analysis)

---

## Chief of Innovations

**Purpose:** Generate product and content improvement ideas. Advisory only — never touches live site.

### Workers

None. This chief is judgment-only (Opus). It reads:
- Overnight pipeline reports (/data/infra/, /pipeline/ logs)
- Current site content (/articles/, /data/)
- Market context (web search for competitor RegTech products)

Produces: Prioritized idea backlog with effort/impact framing.

**Trigger:** Manual — user opens Cowork and asks "what should we build this week?"

---

## Chief of Manager

**Purpose:** Orchestrate all other chiefs. Provide daily briefings. Handle failures.

### What it reads
- Pipeline folder status (how many items in each stage)
- Error logs (/pipeline/errors/)
- Infrastructure health (/data/infra/)
- Deploy history

### What it does
- Morning briefing: "Wire ran X times. Y items in inbox for Content. Z errors. Last deploy at [time]."
- Failure routing: if an article fails Tech validation, Manager flags it and routes back to Content
- Escalation: if a critical regulator feed is down for >24 hours, alerts the user

### Workers

None. Orchestration logic only.

**Trigger:** User opens Cowork (SessionStart hook) + called by other chiefs when they need routing decisions.

**Model:** Sonnet (routing judgment)

---

## Pipeline Folder Structure

```
/pipeline/
  discovered/       ← Scanner finds new items here
  raw/              ← Fetcher puts clean text here
  classified/       ← Classifier puts classification here
  extracted/        ← Domain specialists put structured facts here
  duplicates/       ← Deduper puts duplicates here (not processed)
  inbox/            ← Deduper puts new items here (ready for Content)
  drafted/          ← Writer puts articles here
  ready/            ← Tagger puts corrected articles here
  validated/        ← Tech puts approved articles here
  errors/           ← Tech puts failed articles here
  backfill/         ← Backfill Checker puts reports here (for Data)
  wire-raw/         ← RSS Puller puts raw feed items here
  wire-new/         ← Wire Deduper puts deduplicated items here
  wire-scored/      ← Scorer puts relevant items here
  logs/             ← All chiefs write run logs here

/articles/          ← Published articles (Deploy moves validated here)
/data/
  pillars/          ← Law pillar page data (Data updates)
  regulators/       ← Regulator hub data (Data updates)
  deadlines.json    ← Upcoming deadline calendar (Data updates)
  wire/items.json   ← Live wire feed data (Wire updates)
  infra/            ← Infrastructure health and cost reports
```

---

## Scheduling Summary

| What | How often | Chief | Worker |
|---|---|---|---|
| RSS wire feeds | Every 10 min | Wire | RSS Puller |
| Regulator site scans | Every 1-4 hours | Research | Scanner |
| Deadline calendar update | Daily | Data | Deadline Tracker |
| Regulator hub sync | After every deploy | Data | Regulator Sync |
| API health check | Every 4 hours | Infrastructure | API Health |
| Cost tracking | Daily | Infrastructure | Cost Monitor |
| Netlify stats | After deploy + daily | Infrastructure | Netlify Stats |
| Dependency check | Weekly | Infrastructure | Dependency Mapper |
| Article writing | On new inbox item OR manual | Content | Writer |
| Article validation | On new ready item | Technology | Schema/Link/Mobile |
| Site deploy | On new validated item OR manual | Deploy | Builder/Publisher/Verifier |
| Backfill check | On article with backfill flag | Content | Backfill Checker |
| Pillar updates | On new backfill report + daily | Data | Pillar Updater |
| Innovation ideas | Manual | Innovations | (none) |
| Daily briefing | On Cowork open | Manager | (none) |

---

## Model Summary

| Model | Agents using it | Why |
|---|---|---|
| claude-opus-4-8 | Content Writer, Innovations | Writing quality and strategic thinking |
| claude-sonnet-4-6 | Classifier, 18 specialists, Scorer, Tagger, Backfill Checker, Pillar Updater, Regulator Sync, Component Builder, Design Auditor, Dependency Mapper, Manager | Domain judgment, classification, code generation |
| claude-haiku-4-5 | Scanner, Fetcher, Deduper, RSS Puller, Wire Deduper, Wire Formatter, Schema Checker, Link Checker, Mobile Checker, Builder, Publisher, Verifier, API Health, Cost Monitor, Netlify Stats, Deadline Tracker | Mechanical, repetitive, pattern-matching tasks |

---

## Agent Count Summary

| Chief | Workers | Sonnet | Haiku | Opus |
|---|---|---|---|---|
| Research | 22 (Scanner + Fetcher + Classifier + 18 specialists + Deduper) | 19 | 3 | 0 |
| Content | 3 (Writer + Tagger + Backfill Checker) | 2 | 0 | 1 |
| Wire | 4 (RSS Puller + Wire Deduper + Scorer + Wire Formatter) | 1 | 3 | 0 |
| Technology | 3 (Schema + Link + Mobile) | 0 | 3 | 0 |
| Data | 3 (Pillar Updater + Deadline Tracker + Regulator Sync) | 2 | 1 | 0 |
| Deploy | 3 (Builder + Publisher + Verifier) | 0 | 3 | 0 |
| UX/UI | 2 (Component Builder + Design Auditor) | 2 | 0 | 0 |
| Infrastructure | 4 (API Health + Cost + Netlify Stats + Dependency Mapper) | 1 | 3 | 0 |
| Innovations | 0 | 0 | 0 | 1 |
| Manager | 0 | 1 | 0 | 0 |
| **Total** | **44 workers** | **28** | **16** | **2** |

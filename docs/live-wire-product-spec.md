# Product Spec — "Live Wire" Regulatory News Pipeline

## 1. Purpose

A continuously-updating feed of **trade-press and news items** filtered down to those that carry genuine **regulatory, legal, enforcement, or policy** signal across the product's covered sectors. It runs unattended on a schedule, pulling from a curated list of news feeds, removing noise and duplicates, scoring each item for relevance, and publishing a clean, ranked list that the public site renders.

This is distinct from the **Regulator Scanner** (which monitors primary regulator/government sources directly). The Wire watches *secondary* sources — journalists and trade press reporting *about* regulation.

## 2. Scope of Coverage

**Seven sectors** the product tracks (each item must match at least one):
1. Artificial Intelligence
2. Fintech & Digital Finance
3. Crypto & Digital Assets
4. Platforms & Content Law
5. Privacy & Data Protection
6. Gambling & Gaming
7. Cybersecurity

**Jurisdictions:** EU, US, UK, US-State, and Global.

**Regulators:** the system maintains a list of tracked regulator/agency names; items are tagged when one is mentioned.

## 3. Source Registry (the "RSS spec")

A maintained registry of news sources is the single source of truth for what gets pulled. Each source entry describes:

- A stable identifier and a human-readable name.
- The sector(s) the source typically covers (used as *candidate* tags, refined later by scoring).
- A default jurisdiction.
- A retrieval method and the feed location, **when one exists**.
- A priority and a desired polling cadence.
- A verification status (whether the feed has been confirmed working).

Requirements:
- The registry must support sources that are **declared but not yet wired up** (no feed location). These are skipped gracefully at pull time and logged — they are placeholders for sources to be added later (e.g. paywalled legal wires without a public feed).
- Adding, removing, or re-tagging a source must require **only editing the registry** — no code change.
- The registry should ship with a starter set spanning all seven sectors (crypto/fintech press, privacy/AI press, cybersecurity press, platform/policy press, gambling press, and broad legal wires).

## 4. Pipeline Stages

The pipeline is a linear chain of four stages. Each stage consumes the previous stage's output and produces the next. Stages must be **independently runnable** (resume from any stage) and the orchestrator must support a **dry run** that reports how many sources are pullable without writing anything.

### Stage 1 — Pull
- Fetch every source in the registry that has a usable feed location.
- Identify itself politely to servers and apply a per-fetch timeout.
- Normalize each item to a common shape: title, link, publication date, short summary/snippet, originating source, candidate sector/jurisdiction tags, and a fetch timestamp.
- **Freshness filter:** ignore items older than a configurable window (default ~30 days) so the wire stays "live."
- **Per-feed cap:** take at most N most-recent items per feed per run (default ~40) to bound volume.
- **Thumbnail capture:** extract a representative image URL for each item when the feed provides one. Look in the standard feed image fields first, then fall back to the first image embedded in the item's HTML content. Store null when none is found. (This image is captured here for later display; whether the site hotlinks it or caches a local copy is an open product decision — see §9.)
- A single failing feed must never abort the run; log the error and continue.
- Skip sources with no feed location, and log which were skipped.

### Stage 2 — Deduplicate
- Remove items already published to the live wire, and remove duplicates appearing within the same run.
- Match on **two keys**: a normalized URL (strip query strings, fragments, trailing slashes, lowercase) **and** a normalized (source + title) pair. An item matching on either key is a duplicate.
- Dedup must be **stateful across runs** — it checks against the currently-published wire, not just the current batch.
- No AI/LLM needed; this is deterministic string matching.

### Stage 3 — Score for Relevance
- For each new item, judge how strongly it is about regulation/legislation/enforcement/litigation/policy **within a tracked sector**, producing a relevance score from 0 to 1.

  Guidance for the scorer:
  - High (≈1.0): squarely about regulatory/legal/enforcement/policy action in a tracked sector.
  - Mid (≈0.6–0.9): clearly regulatory-adjacent in a tracked sector.
  - Low (≈0.3–0.5): sector news with only a loose policy angle.
  - Near-zero (≈0.0–0.2): product launches, funding rounds, price movements, marketing — **not** regulatory.
- **Threshold:** items scoring below a configurable cutoff (default 0.6) are **discarded permanently** and never reach the site.
- The scorer also **refines tags**: it may correct/expand the sector tags, set the jurisdiction tag(s), and list any tracked regulators mentioned. If it returns nothing for a field, fall back to the source's candidate tags.
- This is the one stage that benefits from a capable language model; the others are mechanical.

### Stage 4 — Publish (Format & Merge)
- Map each surviving item to the published wire shape.
- Assign each item a **stable, content-derived unique ID** (so re-publishing the same item updates rather than duplicates it).
- Merge into the existing live wire; on ID collision the newest version wins.
- **Sort newest-first** (by publication date, then fetch time as tiebreaker).
- **Cap the published list** at a maximum length (default ~500); older items fall off the end.
- Write the result to the location the site reads.

## 5. Published Item — Required Information

Each published wire item must carry enough to render and link out:
- Stable unique ID
- Headline (as published)
- Direct link to the original article
- Source/publisher name
- Publication date
- Sector tag(s) — at least one
- Jurisdiction tag(s)
- Regulator tag(s) — optional
- Relevance score
- Thumbnail image reference — optional/nullable
- Fetch timestamp

## 6. Site Display

- A dedicated **Live Wire page** listing items newest-first: source label, headline linking out (open in new tab, safe rel attributes), sector tag chips, and date.
- An **empty state** when the wire has not yet been populated.
- The homepage may surface a condensed slice of the most recent items.
- The site reads the published wire as static data at build time; a content refresh requires a rebuild/redeploy.

## 7. Scheduling & Operation

- The pipeline runs **unattended on a schedule** (target cadence ~every 10 minutes; individual sources also carry a desired polling interval).
- Each stage writes a **run log** capturing per-source outcomes (items pulled, errors, dedup counts, kept-vs-dropped with scores, items added).
- The orchestrator reports a summary per run (counts at each stage, total elapsed).

## 8. Non-Functional Requirements

- **Resilience:** any single source failing, a malformed feed, a missing image, or a corrupt/empty published file must degrade gracefully, never abort the run.
- **Idempotency:** re-running the pipeline must not create duplicates or unbounded growth.
- **Politeness:** respectful fetch headers, per-request timeouts, and a small pause between feeds.
- **Configurability:** freshness window, per-feed cap, score threshold, and max published length are all tunable without code changes.
- **Cost discipline:** only the scoring stage should incur model/inference cost; pull, dedup, and publish are deterministic.
- **Auditability:** it must be possible to inspect why any item was kept (its score and tags) or dropped.

## 9. Open Decisions (flag, don't assume)

- **Image hosting:** hotlink the source's thumbnail URL vs. download and self-host a cached copy (trade-off: simplicity & freshness vs. resilience to broken/blocked hotlinks and layout stability). Currently the URL is captured but the hotlink-vs-cache choice is unresolved.
- **Paywalled legal wires** (no public feed): how to ingest these later — they currently sit in the registry as placeholders.

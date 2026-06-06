# Article Frontmatter Schema

Every article written by the Content Writer must include this frontmatter.
The Tagger validates these values. The Schema Checker enforces them before deploy.

```yaml
---
# Required
title: "FCA Issues Dear CEO Letter on Crypto Asset Custody Standards"
layout: article.njk

# Classification (all required)
sector: CR                    # AI | FT | CR | PL | PV | GG | CY
content_type: SUPV            # LEG | BILL | RULE | RTS | QA | GUID | NOAC |
                              # SUPV | ENF | CONS | SPCH | PR | RPT | LIC | ALRT | HRNG
jurisdiction: UK              # EU | US | UK | IOM | US-STATE

# Dates (ISO 8601)
event_date: "2026-05-14"      # Date the regulatory event occurred
pub_date: "2026-06-01"        # Date this article was published on RegWatch

# Regulator
regulator: FCA                # Short name from the regulator map

# Optional but strongly recommended
law_slug: fca-ps24-6          # Slug of the primary law/instrument this relates to
tags:
  - custody
  - crypto-assets
  - dear-ceo

# Flags
backfill_needed: false        # true if this item is part of an ongoing matter
                              # that needs historical entries on the pillar page
is_update: false              # true if this updates an existing article

# Primary sources (required — at least one)
primary_sources:
  - label: "FCA Dear CEO Letter — Crypto Asset Custody"
    url: "https://www.fca.org.uk/..."
  - label: "PS24/6 — Crypto Asset Regime"
    url: "https://www.fca.org.uk/..."
---
```

## Valid Sector Values
| Code | Sector |
|------|--------|
| AI | Artificial Intelligence |
| FT | Fintech & Digital Finance |
| CR | Crypto & Digital Assets |
| PL | Platforms & Content Law |
| PV | Privacy & Data Protection |
| GG | Gambling & Gaming |
| CY | Cybersecurity |

## Valid Content Type Values
| Code | Type |
|------|------|
| LEG | Legislation |
| BILL | Bill / Draft Legislation |
| RULE | Rulemaking |
| RTS | Technical Standards |
| QA | Q&A / Clarification |
| GUID | Guidance |
| NOAC | No-Action / Relief |
| SUPV | Supervisory Communication |
| ENF | Enforcement |
| CONS | Consultation / Call for Evidence |
| SPCH | Speech |
| PR | Press Release |
| RPT | Report / Study |
| LIC | Licensing Decision |
| ALRT | Alert / Advisory |
| HRNG | Hearing / Parliamentary |

## Valid Jurisdiction Values
| Code | Jurisdiction |
|------|--------------|
| EU | European Union |
| US | United States (Federal) |
| UK | United Kingdom |
| IOM | Isle of Man |
| US-STATE | United States (State level) |
| GLOBAL | Multi-jurisdiction |

## Article Body Structure
Articles follow this order:

1. **Key Takeaways** — numbered list, 3–7 items, each a complete sentence
2. **Background** — 1–3 paragraphs of context
3. **Developments** — the specific event, detail, numbers, dates
4. **What to Watch** — optional, for ongoing matters
5. Primary sources are in the frontmatter, not repeated in the body

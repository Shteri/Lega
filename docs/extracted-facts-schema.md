# Extracted Facts Schema

This is the JSON format that domain specialists write to `/pipeline/extracted/[id].json`.
The Content Writer reads this file and turns it into an article.

```json
{
  "id": "2026-06-01-fca-dear-ceo-crypto-custody",
  "source_url": "https://www.fca.org.uk/...",
  "fetched_at": "2026-06-01T09:00:00Z",
  "specialist": "researcher-uk-crypto",

  "classification": {
    "sector": "CR",
    "content_type": "SUPV",
    "jurisdiction": "UK",
    "regulator": "FCA"
  },

  "item": {
    "title": "FCA Dear CEO Letter — Crypto Asset Custody Standards",
    "event_date": "2026-05-14",
    "document_type": "Dear CEO Letter",
    "document_ref": "PS24/6"
  },

  "facts": {
    "summary": "One paragraph plain-English description of what happened.",
    "key_points": [
      "Point one — specific, precise, citable.",
      "Point two.",
      "Point three."
    ],
    "numbers": [
      "£X fine / threshold / deadline (with exact source)"
    ],
    "effective_dates": [
      { "date": "2026-09-01", "description": "New custody rules apply" }
    ],
    "affected_entities": [
      "Registered crypto asset firms",
      "MiFID investment firms holding crypto"
    ],
    "related_laws": [
      "Financial Services and Markets Act 2000",
      "MiCA (for cross-border context)"
    ],
    "context": "Background on why this matters."
  },

  "backfill_needed": false,
  "is_update": false,
  "law_slug": "fca-crypto-asset-regime",

  "primary_sources": [
    {
      "label": "FCA Dear CEO Letter",
      "url": "https://www.fca.org.uk/..."
    }
  ]
}
```

## Required Fields
All fields above are required except `numbers`, `effective_dates`, `affected_entities`, and `related_laws` (include when present in the source).

## Key Rules for Specialists
- Every fact must be citable to the source document. Do not infer.
- `key_points` must be complete sentences, not headlines.
- `summary` must be one paragraph only.
- Do not editorialize. No adjectives ("significant", "landmark").
- If the document contains a defined threshold or amount, include exact figures.
- If `backfill_needed: true`, add a `backfill_note` field explaining what historical entries are missing.

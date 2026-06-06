# Wire Item Schema

This is the JSON format that the Wire Formatter writes to `/data/wire/items.json`.
The site reads this file directly at build time.

```json
[
  {
    "id": "wire-2026-06-01-coindesk-mica-update",
    "title": "ESMA Publishes Final MiCA Technical Standards for CASP Authorisation",
    "url": "https://www.coindesk.com/...",
    "source": "CoinDesk",
    "date": "2026-06-01",
    "sectors": ["CR", "FT"],
    "jurisdictions": ["EU"],
    "regulators": ["ESMA"],
    "score": 0.92,
    "fetched_at": "2026-06-01T10:15:00Z"
  }
]
```

## Field Definitions
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique ID — format: wire-YYYY-MM-DD-[source]-[slug] |
| title | string | Yes | Headline as published |
| url | string | Yes | Direct link to the article |
| source | string | Yes | Publisher name (e.g. "CoinDesk", "FT", "The Block") |
| date | string | Yes | ISO date of publication |
| sectors | string[] | Yes | Array of matching sector codes (at least one) |
| jurisdictions | string[] | Yes | Array of matching jurisdictions |
| regulators | string[] | No | Regulators mentioned, if any |
| score | number | Yes | Relevance score 0–1 from the Scorer |
| fetched_at | string | Yes | ISO datetime of when the Puller fetched this item |

## Notes
- Items are sorted newest first before writing.
- Maximum 500 items in the array. Older items are dropped when the limit is reached.
- The Scorer threshold is 0.6. Items below 0.6 are discarded and never written to this file.

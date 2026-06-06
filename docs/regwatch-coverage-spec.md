# RegWatch — Full Coverage Specification
**Version:** June 2026 | **Status:** Confirmed — ready for build

---

## 1. Sectors (7)

| ID | Sector | Notes |
|----|--------|-------|
| AI | Artificial Intelligence | Agentic AI, foundation models, high-risk systems, sector-specific AI rules |
| FT | Fintech & Digital Finance | Payments, banking, e-money, stablecoins, open banking |
| CR | Crypto & Digital Assets | Token issuance, trading, custody, DeFi, market structure |
| PL | Platforms & Content Law | DSA/DMA, OSA, antitrust, content moderation, age assurance |
| PV | Privacy & Data Protection | GDPR, CCPA/state mosaic, DPDP, data brokers, cookies |
| GG | Gambling & Gaming | Online/offline, sweepstakes, prediction markets, sports betting |
| CY | Cybersecurity | DORA, NIS2, CRA, operational resilience, incidents, standards |

> **AdTech:** Not a standalone sector. Covered as a tag/lens within PV (tracking, cookies, consent, data brokers) and PL (surveillance advertising, targeting, CMA open display). Relevant regulators: EDPB, ICO, FTC, CMA, ASA.

---

## 2. Content Type Taxonomy

Every source item is classified by one of the following types. This taxonomy drives ingestion logic — each type has a different fetch pattern, parse strategy, and display treatment.

| Code | Type | Description | Examples |
|------|------|-------------|---------|
| LEG | Legislation | Enacted statutes and ordinances | GENIUS Act signed, EU AI Act OJ publication |
| BILL | Bill / Draft Legislation | Introduced, amended, or committee-stage bills | S.1582, H.R.4763, COM(2021) 206 |
| RULE | Rulemaking | NPRMs, final rules, delegated/implementing acts | Fed Register rules, EU delegated regulations |
| RTS | Technical Standards | RTS, ITS, FIPS, NIST SPs, ENISA technical guidelines | EBA RTS on crypto custody, NIST SP 800-207 |
| QA | Q&A / Clarification | Formal Q&A databases, staff responses, FAQs | ESMA Q&A on MiCA, EBA Q&A tool, FCA Q&A |
| GUID | Guidance | Policy statements, bulletins, circulars, interpretive letters | OCC interpretive letter, FCA Dear CEO |
| NOAC | No-Action / Relief | No-action letters, exemptive orders, safe harbors | SEC no-action, CFTC exemptive order |
| SUPV | Supervisory Communication | SR letters, supervisory notices, portfolio letters, audit outcomes | FRB SR letter, PRA supervisory statement |
| ENF | Enforcement | Fines, consent orders, final notices, license revocations, criminal referrals | FCA final notice, CFTC order, EDPB binding decision |
| CONS | Consultation / Call for Evidence | Public consultations, RFIs, discussion papers | EBA CP, ICO consultation, FCA CP |
| SPCH | Speech | Commissioner, chair, or senior official speeches | SEC Chair speech, FCA CEO remarks |
| PR | Press Release | Official announcements, launch communications | Regulator press release, EC statement |
| RPT | Report / Study | Thematic reviews, market studies, annual reports, research | CMA market investigation, ESMA annual report |
| LIC | Licensing Decision | Grant, renewal, rejection, suspension, revocation | UKGC license review, FCA authorization, GSC license |
| ALRT | Alert / Advisory | Cybersecurity alerts, investor warnings, consumer warnings | CISA KEV, NCSC advisory, SEC investor alert |
| HRNG | Hearing / Parliamentary | Committee hearings, testimony, parliamentary questions, committee reports | Senate Banking hearing, EP plenary vote, UK Select Committee report |

---

## 3. Historical Content Strategy

### The Problem
A user landing on a law pillar page today should not see only articles from the last 30 days. A regulation like DORA has been in force since January 2025. GENIUS Act was signed in July 2025. MiCA's CASP transition began in late 2024. If the site only surfaces current items, it misses the legislative arc — and for compliance purposes, the arc is the product.

### The Rule
**Active matters get backfilled to their origin date.** "Active" means: any law currently in force, any bill currently moving through a legislative process, any ongoing investigation or rulemaking, any consultation open or recently closed.

### Backfill Depth by Content Type

| Content Type | Backfill Rule | Rationale |
|---|---|---|
| LEG / BILL | From introduction date, no floor | A law passed 3 years ago is still the law |
| RULE | From NPRM/proposal date | Users need the proposal to understand the final rule |
| RTS / Technical Standards | From publication date of in-force version + any open drafts | Foundation documents |
| QA | From launch of the Q&A database (ESMA, EBA) | Q&As accumulate; context depends on prior answers |
| GUID | Key foundational guidance regardless of age; routine guidance 12 months | Not all guidance is equal |
| ENF | 12 months rolling baseline; landmark cases go further | Pattern recognition requires volume |
| CONS | All open or recently closed (within 6 months) consultations from their opening date | Closed consultations still inform the final rule |
| SPCH | 12 months | Policy signal shelf life is limited |
| RPT | Key foundational reports regardless of age; routine reports 12 months | E.g., CMA AI market study from 2024 is still live |
| LIC | 12 months for routine; landmark decisions go further | Precedent value |
| ALRT | 12 months | Cybersecurity advisories are time-bound |
| HRNG | From start of current legislative session | Bills in committee need their hearing record |

### Law Pillar Pages — Minimum Historical Coverage

Each law pillar page must cover at least the following milestones regardless of when they occurred:

- Original proposal or introduction date
- Key amendment milestones
- Publication in official gazette / enactment date
- Phased effective dates (all of them)
- First major enforcement action or compliance deadline
- All currently open implementation items

### Practical Implementation
At launch, the historical backfill is a one-time seeded dataset per active law. Ongoing ingestion then keeps it current. The backfill does not need to be exhaustive for every item — it needs to be complete for law pillar pages and representative for practice area pages.

---

## 4. Regulator Map

### 4A. European Union

---

#### European Commission (AI Office / DG CONNECT / DG FISMA / DG COMP)
**Sectors:** AI, FT, CR, PL, PV, CY
**Content types:** BILL, RULE, QA, ENF, PR, RPT, SPCH
**Notes:** Primary source for all EU framework legislation. ENF covers DMA/DSA proceedings and state aid. QA covers official Commission guidance on enacted regulations.
**Key sources:** eur-lex.europa.eu, digital-strategy.ec.europa.eu, competition.ec.europa.eu

---

#### ESMA (European Securities and Markets Authority)
**Sectors:** FT, CR
**Content types:** RTS, QA, GUID, CONS, RPT, PR
**Notes:** Q&A databases are rolling-update documents (not new publications) — ingestion requires diff-detection, not new-item detection. RTS are submitted to Commission then published in OJ; track both stages.
**Key sources:** esma.europa.eu/publications

---

#### EBA (European Banking Authority)
**Sectors:** FT, CR, CY
**Content types:** RTS, QA, GUID, CONS, RPT, PR
**Notes:** Same diff-detection requirement as ESMA for Q&A tool. Large volume across CRR, PSD2, DORA, MiCA, AML.
**Key sources:** eba.europa.eu/publications

---

#### EIOPA (European Insurance and Occupational Pensions Authority)
**Sectors:** FT, CY
**Content types:** RTS, QA, GUID, CONS, RPT
**Key sources:** eiopa.europa.eu

---

#### ECB / SSM
**Sectors:** FT, CR
**Content types:** SUPV, GUID, RPT, SPCH, PR
**Key sources:** bankingsupervision.europa.eu, ecb.europa.eu

---

#### EDPB (European Data Protection Board)
**Sectors:** PV, AI, PL
**Content types:** GUID, ENF, RPT, CONS
**Notes:** Binding decisions (Article 65) are the highest-priority EDPB outputs — these resolve cross-border enforcement disputes between national DPAs and are definitive.
**Key sources:** edpb.europa.eu

---

#### ENISA
**Sectors:** CY, AI
**Content types:** RTS, RPT, GUID, ALRT
**Key sources:** enisa.europa.eu

---

#### National DPAs — Tier 1 (5 bodies)

| Body | Jurisdiction | Why |
|---|---|---|
| CNIL (Commission Nationale de l'Informatique et des Libertés) | France | Highest enforcement volume in EU; leads on AdTech/cookie enforcement |
| BfDI (Federal Commissioner for Data Protection) | Germany | Second-largest jurisdiction; active on AI and data transfers |
| AP (Autoriteit Persoonsgegevens) | Netherlands | Active AdTech enforcement; RTB/programmatic cases |
| Garante (Autorità Garante per la Protezione dei Dati Personali) | Italy | Early AI enforcement (ChatGPT); active biometrics |
| AEPD (Agencia Española de Protección de Datos) | Spain | High enforcement volume; facial recognition cases |

**Content types:** ENF, GUID, RPT
**Key sources:** cnil.fr, bfdi.bund.de, autoriteitpersoonsgegevens.nl, gpdp.it, aepd.es

---

#### CySEC (Cyprus Securities and Exchange Commission)
**Sectors:** CR, FT
**Content types:** LIC, ENF, GUID, PR
**Notes:** Material because Cyprus is the most common EU MiCA registration jurisdiction for offshore crypto operators.
**Key sources:** cysec.gov.cy

---

### 4B. United States — Federal

---

#### SEC
**Sectors:** FT, CR, AI
**Content types:** RULE, NOAC, GUID, ENF, SPCH, RPT, PR
**Notes:** Commissioner speeches are high-signal for upcoming rules. No-action letters are major compliance tools in crypto. Staff bulletins (SABs) are formal guidance.
**Key sources:** sec.gov/rules, sec.gov/litigation, sec.gov/speeches

---

#### CFTC
**Sectors:** FT, CR
**Content types:** RULE, NOAC, ENF, SPCH, QA, PR
**Key sources:** cftc.gov/LawRegulation, cftc.gov/PressRoom

---

#### FinCEN
**Sectors:** FT, CR
**Content types:** RULE, GUID, ALRT, RPT, ENF
**Notes:** Geographic Targeting Orders (GTOs) are high-value tracking items. AML advisories often signal enforcement priorities before cases are filed.
**Key sources:** fincen.gov/resources/statutes-and-regulations, fincen.gov/news

---

#### OCC
**Sectors:** FT, CR
**Content types:** GUID, RULE, ENF, PR, RPT
**Notes:** Interpretive letters are numbered series — track additions to the series.
**Key sources:** occ.gov/publications-and-resources

---

#### FDIC
**Sectors:** FT, CR
**Content types:** GUID, RULE, ENF, RPT, PR
**Key sources:** fdic.gov/regulations, fdic.gov/news

---

#### Federal Reserve / FRB
**Sectors:** FT, CR, CY
**Content types:** SUPV, RULE, GUID, SPCH, RPT, PR
**Notes:** SR letters are the primary supervisory guidance vehicle — track additions. SPCH from governors are often advance signals on policy shifts.
**Key sources:** federalreserve.gov/supervisionreg

---

#### CFPB
**Sectors:** FT
**Content types:** RULE, GUID, ENF, RPT, PR
**Notes:** Circulars are enforcement policy statements — treat as GUID. Interpretive rules bypass notice-and-comment; track as RULE.
**Key sources:** consumerfinance.gov/rules-policy, consumerfinance.gov/enforcement

---

#### NCUA
**Sectors:** FT, CR
**Content types:** GUID, RULE, ENF, RPT
**Key sources:** ncua.gov/regulation-supervision

---

#### FTC
**Sectors:** PV, AI, PL
**Content types:** ENF, RULE, GUID, RPT, CONS, SPCH
**Notes:** Enforcement actions are the primary output. Reports (surveillance advertising, AI, data brokers) are long-form but high-value for site content.
**Key sources:** ftc.gov/legal-library, ftc.gov/news-events/news/press-releases

---

#### DOJ (Antitrust Division + Criminal)
**Sectors:** PL, CR, GG
**Content types:** ENF, GUID, RPT, PR
**Key sources:** justice.gov/atr, justice.gov/usao

---

#### NIST
**Sectors:** CY, AI
**Content types:** RTS, GUID, CONS, RPT
**Notes:** Draft publications open for public comment are high-value content items — track open comment periods.
**Key sources:** nvlpubs.nist.gov, nist.gov/artificial-intelligence

---

#### CISA
**Sectors:** CY
**Content types:** ALRT, GUID, RPT, PR
**Notes:** Known Exploited Vulnerabilities (KEV) catalog updates are trackable as a feed. Joint advisories with Five Eyes partners (NCSC, ASD, CCCS) are high-priority.
**Key sources:** cisa.gov/news-events/alerts, cisa.gov/known-exploited-vulnerabilities

---

#### Treasury / OFAC
**Sectors:** CR, FT
**Content types:** ENF, GUID, RULE, ALRT
**Notes:** SDN list additions involving crypto addresses or entities are site-relevant enforcement items.
**Key sources:** home.treasury.gov/policy-issues/financial-sanctions

---

#### Congress
**Sectors:** All
**Content types:** BILL, LEG, HRNG, RPT
**Key committees to track:**
- Senate Banking, Housing, and Urban Affairs
- Senate Commerce, Science, and Transportation
- Senate Judiciary
- House Financial Services
- House Judiciary (antitrust + IP)
- House Energy and Commerce
**Notes:** Bills need status tracking across stages: introduced → committee markup → floor vote → enrolled → enacted. This is multi-state tracking, not single-item ingestion.
**Key sources:** congress.gov

---

#### Parliamentary / Committee Reports — Editorial Priority
Congressional and parliamentary committee outputs are high-signal but require editorial curation rather than automated ingestion. Recommended approach: flag hearings and reports in the live wire; create dedicated articles only for committee reports that materially advance a tracked bill or investigation.

---

### 4C. United States — States

**Scope:** Legislation only. No enforcement, no guidance, no licensing at state level.

**Rationale:** State-level enforcement (AG actions, banking regulator orders) adds volume without proportionate value at launch. Legislation is the highest-signal state-level output because it creates new compliance obligations and is trackable via a structured source (congress.gov equivalent at state level).

**Coverage model:**
- **All 50 states** — enacted legislation only (bills that pass and are signed)
- **Priority 15 states** — full bill tracking including introduced and committee-stage: CA, CO, TX, NY, FL, VA, CT, IL, WA, NJ, GA, UT, NV, OR, MD

**Sectors covered at state level:** PV (privacy), AI, GG (gambling/gaming), CR (crypto/digital assets), FT (fintech/money transmission)

**Key aggregator sources:** LegiScan, state legislature websites, NCSL (National Conference of State Legislatures) tracker

---

### 4D. United Kingdom

---

#### FCA
**Sectors:** FT, CR, AI, CY
**Content types:** CONS, GUID, NOAC, ENF, SPCH, RPT, LIC, PR, SUPV
**Notes:** Dear CEO and portfolio letters are site-priority items — they signal supervisory focus for entire sectors. Final notices are the primary enforcement output. Consultation papers and feedback statements come in pairs; track both.
**Key sources:** fca.org.uk/publications, fca.org.uk/news

---

#### PRA / Bank of England
**Sectors:** FT, CY
**Content types:** SUPV, RULE, CONS, RPT, SPCH
**Key sources:** bankofengland.co.uk/prudential-regulation

---

#### PSR (Payment Systems Regulator)
**Sectors:** FT
**Content types:** RULE, CONS, ENF, RPT
**Key sources:** psr.org.uk/publications

---

#### ICO
**Sectors:** PV, AI, PL
**Content types:** ENF, GUID, CONS, RPT, QA
**Notes:** Technology reports (AdTech, AI, cookies, biometrics) are long-form but high-value for pillar pages. Enforcement notices and reprimands are primary ongoing feed items.
**Key sources:** ico.org.uk/action-weve-taken, ico.org.uk/for-organisations/guidance-and-advice

---

#### Ofcom
**Sectors:** PL, AI
**Content types:** ENF, CONS, GUID, RPT, PR, LIC
**Notes:** OSA enforcement is new and high-frequency; age assurance decisions are individually significant. Track enforcement and consultations as primary feed.
**Key sources:** ofcom.org.uk/online-safety, ofcom.org.uk/research-and-data

---

#### CMA
**Sectors:** PL, AI
**Content types:** ENF, RPT, GUID, CONS, PR
**Notes:** Market investigations are long-running (12-24 months) — backfill to investigation opening date. DMCC Act powers are new; track early use closely.
**Key sources:** gov.uk/cma, gov.uk/cma-cases

---

#### UKGC
**Sectors:** GG
**Content types:** LIC, ENF, CONS, GUID, RPT, PR
**Notes:** Enforcement financial penalties are individually significant items. Licence review outcomes are high-priority for gambling operators. Consultation responses shape licence conditions.
**Key sources:** gamblingcommission.gov.uk/news-action-and-statistics

---

#### NCSC
**Sectors:** CY, AI
**Content types:** ALRT, GUID, RPT
**Notes:** Joint advisories with CISA (and Five Eyes broadly) are high-priority.
**Key sources:** ncsc.gov.uk/news, ncsc.gov.uk/guidance

---

#### DSIT / HM Treasury
**Sectors:** AI, FT, PV, PL
**Content types:** BILL, GUID, CONS, RPT
**Key sources:** gov.uk/dsit, gov.uk/hm-treasury

---

#### ASA (Advertising Standards Authority)
**Sectors:** PL (AdTech lens)
**Content types:** ENF, GUID, RPT
**Notes:** Adjudications on crypto advertising and gambling advertising are site-relevant. Treat as a supporting source rather than a primary regulator feed.
**Key sources:** asa.org.uk/rulings

---

### 4E. Isle of Man

---

#### GSC (Gambling Supervision Commission)
**Sectors:** GG
**Content types:** LIC, GUID, RULE, ENF, PR, RPT
**Notes:** IoM is a Tier 1 gambling jurisdiction — licensing and enforcement outputs are individually significant. Tynwald-approved subordinate legislation changes are tracked as RULE.
**Key sources:** gov.im/categories/business-and-industries/gambling-and-e-gaming

---

#### IOMFSA (Isle of Man Financial Services Authority)
**Sectors:** CR, FT
**Content types:** LIC, GUID, RULE, ENF, PR
**Key sources:** iomfsa.im/publications

---

## 5. Regulator Count Summary

| Jurisdiction | Bodies | Sectors |
|---|---|---|
| EU (ESAs + Commission + EDPB + ENISA + 5 DPAs + CySEC) | 12 | AI, FT, CR, PV, PL, CY |
| USA Federal (regulators + Congress) | 14 | All 7 |
| USA States (legislation tracking) | ~15 priority + all 50 for enacted | PV, AI, GG, CR, FT |
| UK | 9 | All 7 |
| Isle of Man | 2 | GG, CR, FT |
| **Total** | **~50 bodies** | **All 7 sectors** |

---

## 6. Update Frequency by Content Type

| Type | Typical Cadence | Ingestion Model |
|---|---|---|
| Enforcement actions | Ad hoc, can be daily | Real-time RSS / feed poll |
| Press releases | Ad hoc, multiple per week | Real-time RSS / feed poll |
| Bills / legislative status | Session-dependent | Daily poll on tracked bills |
| Q&A updates (ESMA, EBA) | Rolling updates to existing docs | Diff-detection on document hash |
| Guidance / circulars | Weekly to monthly | Weekly poll |
| Consultations | Monthly check on open/closed status | Weekly poll |
| Technical standards | Quarterly to annual | Weekly poll |
| Speeches | Ad hoc | Weekly poll |
| Reports / studies | Quarterly to annual | Scheduled |
| Licensing decisions | Ad hoc | Real-time where feed available |
| Cybersecurity alerts | Ad hoc, can be hourly | Real-time RSS |

---

## 7. Open Decisions (Deferred)

- **Belize and Curaçao:** Out of scope for launch. Add when GG sector has sufficient operator-side audience.
- **Self-regulatory bodies (IAB, EGBA, etc.):** Out of scope for launch.
- **Full state enforcement/guidance:** Out of scope. Revisit after launch if demand from compliance team audience.
- **Additional EU member state DPAs beyond Tier 1 five:** Out of scope. Revisit if GDPR enforcement volume warrants.

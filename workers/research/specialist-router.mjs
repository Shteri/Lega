/**
 * SPECIALIST ROUTER — Chief of Research
 *
 * Maps (sector, jurisdiction) from the Classifier output
 * to the correct domain specialist worker.
 *
 * Specialists live in workers/research/specialists/
 * Each specialist exports a runSpecialist(item) function.
 */

// Routing table: [sector, jurisdiction] → specialist module path
const ROUTING_TABLE = [
  { sector: 'AI',  jurisdiction: 'EU',  specialist: './specialists/researcher-eu-ai.mjs' },
  { sector: 'AI',  jurisdiction: 'US',  specialist: './specialists/researcher-us-ai.mjs' },
  { sector: 'AI',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-ai.mjs' },

  { sector: 'FT',  jurisdiction: 'EU',  specialist: './specialists/researcher-eu-fintech.mjs' },
  { sector: 'FT',  jurisdiction: 'US',  specialist: './specialists/researcher-us-fintech.mjs' },
  { sector: 'FT',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-fintech.mjs' },

  { sector: 'CR',  jurisdiction: 'EU',  specialist: './specialists/researcher-eu-crypto.mjs' },
  { sector: 'CR',  jurisdiction: 'US',  specialist: './specialists/researcher-us-crypto.mjs' },
  { sector: 'CR',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-crypto.mjs' },

  { sector: 'PL',  jurisdiction: 'EU',  specialist: './specialists/researcher-eu-platforms.mjs' },
  { sector: 'PL',  jurisdiction: 'US',  specialist: './specialists/researcher-us-platforms.mjs' },
  { sector: 'PL',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-platforms.mjs' },

  { sector: 'PV',  jurisdiction: 'EU',  specialist: './specialists/researcher-eu-data-protection.mjs' },
  { sector: 'PV',  jurisdiction: 'US',  specialist: './specialists/researcher-us-data-protection.mjs' },
  { sector: 'PV',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-data-protection.mjs' },

  { sector: 'CY',  jurisdiction: 'ALL', specialist: './specialists/researcher-global-cyber.mjs' },
  { sector: 'CY',  jurisdiction: 'EU',  specialist: './specialists/researcher-global-cyber.mjs' },
  { sector: 'CY',  jurisdiction: 'US',  specialist: './specialists/researcher-global-cyber.mjs' },
  { sector: 'CY',  jurisdiction: 'UK',  specialist: './specialists/researcher-global-cyber.mjs' },

  { sector: 'GG',  jurisdiction: 'US',  specialist: './specialists/researcher-us-gambling.mjs' },
  { sector: 'GG',  jurisdiction: 'UK',  specialist: './specialists/researcher-uk-gambling.mjs' },
];

/**
 * Resolve which specialist handles this item.
 * Returns the module path string or null if no match.
 */
export function resolveSpecialist(sector, jurisdiction) {
  // Exact match first
  const exact = ROUTING_TABLE.find(
    r => r.sector === sector && r.jurisdiction === jurisdiction
  );
  if (exact) return exact.specialist;

  // Fall back to same sector with ANY jurisdiction match
  const sectorOnly = ROUTING_TABLE.find(r => r.sector === sector);
  return sectorOnly?.specialist || null;
}

/**
 * Dynamically import and run the correct specialist for an item.
 * Returns the extracted facts or null if no specialist exists yet.
 */
export async function routeToSpecialist(classifiedItem) {
  const { sector, jurisdiction } = classifiedItem.classification || {};
  const specialistPath = resolveSpecialist(sector, jurisdiction);

  if (!specialistPath) {
    return { error: `No specialist for sector=${sector} jurisdiction=${jurisdiction}` };
  }

  let specialist;
  try {
    specialist = await import(specialistPath);
  } catch {
    return { error: `Specialist not yet built: ${specialistPath}` };
  }

  return specialist.runSpecialist(classifiedItem);
}

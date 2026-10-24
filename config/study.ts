/**
 * Everything a non-developer might need to change lives here.
 * Screens use {{TOKEN}} placeholders that are filled from TOKENS below.
 */

export const STUDY = {
  /** Name participants see. Override with NEXT_PUBLIC_APP_NAME on Vercel. */
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Airport Parking',
  /** Shown on the consent screen and in the admin header. */
  studyTitle: 'Airport Parking Study',
  estimatedMinutes: '15–20',
  /** Target for the admin progress bar (qualified participants). */
  targetQualified: 50,
  contactEmail: 'study@example.com',

  /**
   * Fallback airport only. Each participant picks their own airport at the start
   * of a walkthrough (prefilled from their survey answers), and the screens use it.
   */
  airport: {
    code: 'MDW',
    name: 'Chicago Midway',
    city: 'Chicago',
    lotName: 'Midway lot',
    lotAddress: 'Near Chicago Midway Airport. Exact address shared after you book.',
    lotPhone: '(555) 010-0142',
  },

  pricing: {
    membershipFounding: 55,
    membershipStandard: 99,
    parkingPerDay: 18,
    /** Share of rental earnings kept as a service fee, shown on owner screens. */
    ownerServiceFeePct: 25,
  },

  /**
   * Claims shown on screens. Keep these to what the pilot can actually deliver;
   * the study measures confidence in exactly what is shown here.
   */
  claims: {
    insurance:
      'Insurance isn’t included automatically. Renters buy coverage from us when they book, or show proof of their own insurance before they drive.',
    insuranceShort: 'Coverage options on every rental',
    monitoring: 'Cars are kept at a secured facility.',
    monitoringShort: 'Secure airport parking',
    shuttle: 'Getting to the terminal is covered. Details are confirmed when you book.',
    shuttleShort: 'Secured lot near the terminals',
    renterVetting: 'Every renter is ID-verified and has their driving record checked before they can book.',
  },

  tracking: {
    idleMs: 30_000,
    rageClicks: 3,
    rageWindowMs: 1_000,
    rageRadiusPx: 30,
    flushMs: 5_000,
    replayFlushMs: 10_000,
  },
} as const;

export type StudyConfig = typeof STUDY;

export type TripAirport = { code: string; name: string; city: string };

/** How an airport reads on the screens: "Chicago Midway", "Denver (DEN)", "Atlanta Hartsfield-Jackson". */
export function airportDisplay(a: TripAirport) {
  const name = a.name.replace(/ Intl$/, ' International');
  if (!a.city || name.toLowerCase().includes(a.city.toLowerCase())) return name;
  if (a.name === a.code) return `${a.city} (${a.code})`;
  return `${a.city} ${name}`;
}

/** Tokens for the participant's chosen airport: lot name, address, code. */
export function airportTokens(a: TripAirport): Record<string, string> {
  const short = a.name === a.code ? a.code : a.name.replace(/ Intl$/, '').replace(/^.*·\s*/, '');
  const display = airportDisplay(a);
  return {
    AIRPORT_CODE: a.code || display,
    AIRPORT_NAME: display,
    LOT_NAME: `${short} lot`,
    LOT_ADDRESS: `Near ${/\)$|airport$/i.test(display) ? display : `${display} Airport`}. Exact address shared after you book.`,
  };
}

/** Token map used to fill {{TOKEN}} placeholders in screen HTML. */
export function screenTokens(airport?: TripAirport | null): Record<string, string> {
  const a = STUDY.airport;
  const p = STUDY.pricing;
  const c = STUDY.claims;
  return {
    APP_NAME: STUDY.appName,
    AIRPORT_CODE: a.code,
    AIRPORT_NAME: a.name,
    LOT_NAME: a.lotName,
    LOT_ADDRESS: a.lotAddress,
    LOT_PHONE: a.lotPhone,
    PRICE: String(p.membershipFounding),
    PRICE_STANDARD: String(p.membershipStandard),
    PARKING_RATE: String(p.parkingPerDay),
    FEE_PCT: String(p.ownerServiceFeePct),
    CLAIM_INSURANCE: c.insurance,
    CLAIM_INSURANCE_SHORT: c.insuranceShort,
    CLAIM_MONITORING: c.monitoring,
    CLAIM_MONITORING_SHORT: c.monitoringShort,
    CLAIM_SHUTTLE: c.shuttle,
    CLAIM_SHUTTLE_SHORT: c.shuttleShort,
    CLAIM_RENTER_VETTING: c.renterVetting,
    CONTACT_EMAIL: STUDY.contactEmail,
    ...(airport ? airportTokens(airport) : {}),
  };
}

export function fillTokens(html: string, tokens = screenTokens()): string {
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in tokens ? escapeHtml(tokens[k]) : m));
}

function escapeHtml(s: string) {
  // Tokens land in both HTML and JS string literals, so keep them free of
  // characters that would break either: no angle brackets, no straight quotes.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '’')
    .replace(/"/g, '”')
    .replace(/\\/g, '');
}

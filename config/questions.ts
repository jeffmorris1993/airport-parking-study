/**
 * Question definitions. Survey wording follows the Market Study Prospectus
 * (Ver. 1, Oct 15 2026). Items marked `added: true` were added to measure
 * hypotheses the prospectus lists but never asks about (RQ3, H2, H4).
 */

export type Option = { value: string; label: string };

export type QuestionType =
  | 'yesno'
  | 'single'
  | 'multi'
  | 'scale'
  | 'text'
  | 'currency'
  | 'airport'
  | 'airports';

export type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  help?: string;
  options?: Option[];
  /** multi / airports: maximum selections */
  max?: number;
  /** multi: option value that clears all others ("None of these") */
  exclusive?: string;
  /** scale */
  min?: number;
  maxScale?: number;
  minLabel?: string;
  maxLabel?: string;
  /** text: answer is optional */
  optional?: boolean;
  placeholder?: string;
  /** Allow a free-text "Other" answer for single/multi */
  other?: boolean;
  added?: boolean;
  /** Only ask when this returns true */
  when?: (answers: Record<string, unknown>) => boolean;
  /** Render on the same screen as the previous question (one step, two answers) */
  withPrevious?: boolean;
  /** Option values to hide, given the answers so far */
  hideOptions?: (answers: Record<string, unknown>) => string[];
};

const yn: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/* ------------------------------------------------------------------ */
/* Screener: decides Owner / Renter qualification (prospectus p.8)     */
/* ------------------------------------------------------------------ */

const parkingOptions: Option[] = [
  { value: 'usually', label: 'Yes, usually' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'would_consider', label: 'No, but I would under the right conditions' },
  { value: 'no', label: 'No, and I wouldn’t consider it' },
];

export const SCREENER: Question[] = [
  {
    id: 's_age',
    type: 'single',
    prompt: 'How old are you?',
    options: [
      { value: 'under_18', label: '17 or under' },
      { value: '18_24', label: '18–24' },
      { value: '25_34', label: '25–34' },
      { value: '35_44', label: '35–44' },
      { value: '45_54', label: '45–54' },
      { value: '55_64', label: '55–64' },
      { value: '65_plus', label: '65 or older' },
    ],
  },
  {
    id: 's_flown',
    type: 'yesno',
    prompt: 'Have you flown in the past 12 months, or do you plan to fly in the next 12 months?',
    options: yn,
  },
  {
    id: 's_vehicle',
    type: 'yesno',
    prompt: 'Do you have a personal vehicle you control?',
    help: 'Owned, financed, leased, or otherwise yours to use.',
    options: yn,
  },
  {
    id: 's_license',
    type: 'yesno',
    prompt: 'Do you have a valid driver’s license?',
    help: 'A current, unexpired driver’s license issued by a government agency. Learner’s permits don’t count.',
    options: yn,
  },
  {
    id: 's_parking_onsite',
    type: 'single',
    prompt: 'When you fly, do you use the airport’s own paid parking (the garages or lots run by the airport)?',
    options: parkingOptions,
  },
  {
    id: 's_parking_offsite',
    type: 'single',
    prompt: 'When you fly, do you use a paid off-site parking lot near the airport?',
    options: parkingOptions,
  },
  {
    id: 's_rent_scenarios',
    type: 'multi',
    prompt: 'Would you consider renting a car near an airport for any of these trips?',
    help: 'Select all that apply.',
    exclusive: 'none',
    options: [
      { value: 'business', label: 'Business travel' },
      { value: 'family', label: 'Visiting family or friends' },
      { value: 'multistop', label: 'A trip with several stops' },
      { value: 'no_rideshare', label: 'A destination where rideshare is hard to get' },
      { value: 'none', label: 'None of these. I wouldn’t rent a car near an airport.' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Baseline survey (prospectus p.10–11), brand-blind                   */
/* ------------------------------------------------------------------ */

export const SURVEY: Question[] = [
  {
    id: 'q1_flights',
    type: 'single',
    prompt: 'How many round-trip flights do you take in a typical year?',
    options: ['1–2', '3–5', '6–10', '11+'].map((v) => ({ value: v, label: v })),
  },
  {
    id: 'q2_home_airport',
    type: 'airport',
    prompt: 'What airport do you fly out of most often?',
    placeholder: 'Search by city, code, or airport name',
  },
  {
    id: 'q3_dest_airports',
    type: 'airports',
    prompt: 'Which three airports do you fly to most often?',
    help: 'Select up to 3.',
    max: 3,
    placeholder: 'Search by city, code, or airport name',
  },
  {
    id: 'q_trip_length',
    added: true,
    type: 'single',
    prompt: 'How long is a typical trip for you?',
    options: [
      { value: '1-2', label: '1–2 nights' },
      { value: '3-5', label: '3–5 nights' },
      { value: '6-9', label: '6–9 nights' },
      { value: '10+', label: '10 or more nights' },
    ],
  },
  {
    id: 'q_distance',
    added: true,
    type: 'single',
    prompt: 'About how far do you live from the airport you fly out of most?',
    options: [
      { value: '<15', label: 'Under 15 minutes' },
      { value: '15-30', label: '15–30 minutes' },
      { value: '30-60', label: '30–60 minutes' },
      { value: '60+', label: 'More than an hour' },
    ],
  },
  {
    id: 'q4_ground',
    type: 'single',
    prompt: 'When you fly, how do you usually get to the airport?',
    other: true,
    hideOptions: (a) => [
      ...(a.s_parking_onsite === 'no' ? ['park_airport'] : []),
      ...(a.s_parking_offsite === 'no' ? ['offsite_lot'] : []),
    ],
    options: [
      { value: 'park_airport', label: 'Drive and park at the airport' },
      { value: 'offsite_lot', label: 'Drive and park at an off-site lot' },
      { value: 'rideshare', label: 'Rideshare (Uber, Lyft)' },
      { value: 'friend_family', label: 'A friend or family member drops me off' },
      { value: 'transit', label: 'Public transit' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    id: 'q7_idle_vehicle',
    type: 'yesno',
    prompt: 'While you travel, do you have a vehicle that sits unused elsewhere, like at home?',
    options: yn,
  },
  {
    id: 'q_sharing',
    added: true,
    type: 'multi',
    prompt: 'Have you ever used any of these?',
    help: 'Select all that apply.',
    exclusive: 'none',
    options: [
      { value: 'p2p_rent', label: 'Rented a car from a person (Turo, Getaround)' },
      { value: 'p2p_list', label: 'Listed my own car for others to rent' },
      { value: 'airbnb_guest', label: 'Stayed in a home rental (Airbnb, Vrbo)' },
      { value: 'airbnb_host', label: 'Hosted my home for rent' },
      { value: 'none', label: 'None of these' },
    ],
  },
  {
    id: 'q8_wtp',
    type: 'single',
    prompt:
      'Imagine a membership that gives you secure parking near the airport. It also has an optional feature: while you’re away, your parked car can be rented to verified travelers, with protections like monitoring and insurance options. What is the most you would pay per year for this membership?',
    options: ['$0–$10', '$10–$20', '$20–$30', '$30–$40', '$40–$50', '$50–$60', '$60–$70', '$70–$80', '$80–$90', '$90–$100', '$100–$125', '$125+'].map(
      (v) => ({ value: v, label: v }),
    ),
  },
  {
    id: 'q9_concern',
    type: 'text',
    prompt: 'What, if any, comments do you have about the option just described?',
    optional: true,
    withPrevious: true,
    placeholder: 'Optional',
  },
];

/* ------------------------------------------------------------------ */
/* Checkpoints (prospectus p.11–12), shown over the paused screen      */
/* ------------------------------------------------------------------ */

export type Checkpoint = {
  id: string;
  label: string;
  main: Question;
  followup?: Question;
};

const scale5 = (id: string, prompt: string, minLabel: string, maxLabel: string): Question => ({
  id,
  type: 'scale',
  prompt,
  min: 1,
  maxScale: 5,
  minLabel,
  maxLabel,
});

const why = (id: string, prompt = 'Why did you rate it that way?'): Question => ({
  id,
  type: 'text',
  prompt,
  optional: true,
  placeholder: 'Optional',
});

export const CHECKPOINTS: Record<string, Checkpoint> = {
  cp1: {
    id: 'cp1',
    label: 'Concept clarity',
    main: scale5('cp1', 'How clear is what this app does?', 'Not clear', 'Very clear'),
    followup: why('cp1_why'),
  },
  cp2: {
    id: 'cp2',
    label: 'Sign-up ease',
    main: scale5('cp2', 'How easy was sign-up?', 'Very hard', 'Very easy'),
    followup: why('cp2_why'),
  },
  cp3: {
    id: 'cp3',
    label: 'ID verification comfort',
    main: scale5('cp3', 'How comfortable are you with this step?', 'Not comfortable', 'Very comfortable'),
    followup: why('cp3_why'),
  },
  cp4: {
    id: 'cp4',
    label: 'Security confidence',
    main: scale5('cp4', 'How confident are you in the security of the parking location?', 'Not confident', 'Very confident'),
    followup: why('cp4_why'),
  },
  cp5: {
    id: 'cp5',
    label: 'Insurance confidence',
    main: scale5('cp5', 'How confident are you that you’d be protected if something went wrong?', 'Not confident', 'Very confident'),
    followup: why('cp5_why'),
  },
  h2: {
    id: 'h2',
    label: 'Revenue share expectations (owner)',
    main: {
      id: 'h2_pct',
      type: 'single',
      added: true,
      prompt: 'What percent of the rental revenue would you expect to receive?',
      help: 'Your share of what a renter pays, after any service fee.',
      options: [
        { value: '90_100', label: '90–100%' },
        { value: '75_89', label: '75–89%' },
        { value: '60_74', label: '60–74%' },
        { value: '50_59', label: '50–59%' },
        { value: 'lt_50', label: 'Less than 50%' },
      ],
    },
  },
  cp7: {
    id: 'cp7',
    label: 'Availability confidence (renter)',
    main: scale5('cp7', 'How confident are you this vehicle would be available as described?', 'Not confident', 'Very confident'),
    followup: why('cp7_why'),
  },
  cp8: {
    id: 'cp8',
    label: 'Price fairness',
    main: {
      id: 'cp8',
      type: 'single',
      prompt: 'Is the price fair?',
      options: [
        { value: 'too_low', label: 'Too low' },
        { value: 'about_right', label: 'About right' },
        { value: 'too_high', label: 'Too high' },
      ],
    },
    followup: why('cp8_why', 'What would make it worth it?'),
  },
  cp9: {
    id: 'cp9',
    label: 'Likelihood to complete',
    main: {
      id: 'cp9',
      type: 'scale',
      prompt: 'How likely are you to complete this in real life?',
      min: 0,
      maxScale: 10,
      minLabel: 'Not at all likely',
      maxLabel: 'Extremely likely',
    },
    followup: why('cp9_why'),
  },
  cp10: {
    id: 'cp10',
    label: 'Biggest hesitation',
    main: {
      id: 'cp10',
      type: 'text',
      prompt: 'Looking back at the whole walkthrough, what was your biggest moment of hesitation?',
      placeholder: 'Type your answer',
    },
  },
};

/* ------------------------------------------------------------------ */
/* Airports for Q2 / Q3                                                */
/* ------------------------------------------------------------------ */

export const AIRPORTS: { code: string; city: string; name: string }[] = [
  ['MDW', 'Chicago', 'Midway'], ['ORD', 'Chicago', 'O’Hare'], ['ATL', 'Atlanta', 'Hartsfield-Jackson'],
  ['LAX', 'Los Angeles', 'LAX'], ['DFW', 'Dallas', 'Dallas/Fort Worth'], ['DAL', 'Dallas', 'Love Field'],
  ['DEN', 'Denver', 'Denver Intl'], ['JFK', 'New York', 'JFK'], ['LGA', 'New York', 'LaGuardia'],
  ['EWR', 'Newark', 'Newark Liberty'], ['SFO', 'San Francisco', 'SFO'], ['OAK', 'Oakland', 'Oakland'],
  ['SJC', 'San Jose', 'San Jose'], ['SEA', 'Seattle', 'Seattle-Tacoma'], ['LAS', 'Las Vegas', 'Harry Reid'],
  ['MCO', 'Orlando', 'Orlando Intl'], ['MIA', 'Miami', 'Miami Intl'], ['FLL', 'Fort Lauderdale', 'Fort Lauderdale'],
  ['TPA', 'Tampa', 'Tampa Intl'], ['CLT', 'Charlotte', 'Charlotte Douglas'], ['PHX', 'Phoenix', 'Sky Harbor'],
  ['IAH', 'Houston', 'Bush Intercontinental'], ['HOU', 'Houston', 'Hobby'], ['BOS', 'Boston', 'Logan'],
  ['MSP', 'Minneapolis', 'Minneapolis–St. Paul'], ['DTW', 'Detroit', 'Detroit Metro'], ['PHL', 'Philadelphia', 'Philadelphia Intl'],
  ['BWI', 'Baltimore', 'BWI'], ['DCA', 'Washington', 'Reagan National'], ['IAD', 'Washington', 'Dulles'],
  ['SLC', 'Salt Lake City', 'Salt Lake City'], ['SAN', 'San Diego', 'San Diego Intl'], ['BNA', 'Nashville', 'Nashville Intl'],
  ['AUS', 'Austin', 'Austin-Bergstrom'], ['MSY', 'New Orleans', 'Louis Armstrong'], ['STL', 'St. Louis', 'Lambert'],
  ['MCI', 'Kansas City', 'Kansas City Intl'], ['IND', 'Indianapolis', 'Indianapolis Intl'], ['CLE', 'Cleveland', 'Hopkins'],
  ['CMH', 'Columbus', 'John Glenn'], ['CVG', 'Cincinnati', 'CVG'], ['PIT', 'Pittsburgh', 'Pittsburgh Intl'],
  ['MKE', 'Milwaukee', 'Mitchell'], ['RDU', 'Raleigh-Durham', 'RDU'], ['SAT', 'San Antonio', 'San Antonio Intl'],
  ['PDX', 'Portland', 'Portland Intl'], ['SMF', 'Sacramento', 'Sacramento Intl'], ['SNA', 'Orange County', 'John Wayne'],
  ['BUR', 'Burbank', 'Hollywood Burbank'], ['HNL', 'Honolulu', 'Daniel K. Inouye'], ['MEM', 'Memphis', 'Memphis Intl'],
  ['JAX', 'Jacksonville', 'Jacksonville Intl'], ['RSW', 'Fort Myers', 'Southwest Florida'], ['OMA', 'Omaha', 'Eppley'],
  ['OKC', 'Oklahoma City', 'Will Rogers'], ['ABQ', 'Albuquerque', 'Sunport'], ['BHM', 'Birmingham', 'Birmingham-Shuttlesworth'],
  ['SDF', 'Louisville', 'Muhammad Ali'], ['DSM', 'Des Moines', 'Des Moines Intl'], ['GRR', 'Grand Rapids', 'Gerald R. Ford'],
  ['MSN', 'Madison', 'Dane County'], ['RFD', 'Rockford', 'Chicago Rockford'],
].map(([code, city, name]) => ({ code, city, name }));

/** Turn a survey airport answer ("MDW" or "other:Some airport") into display info. */
export function airportFromAnswer(v: unknown): { code: string; name: string; city: string } | null {
  if (typeof v !== 'string' || !v) return null;
  if (v.startsWith('other:')) {
    const name = v.slice(6).trim();
    return name ? { code: '', name, city: '' } : null;
  }
  const a = AIRPORTS.find((x) => x.code === v);
  return a ? { ...a } : null;
}

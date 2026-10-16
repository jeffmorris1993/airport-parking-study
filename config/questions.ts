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
};

const yn: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/* ------------------------------------------------------------------ */
/* Screener: decides Owner / Renter qualification (prospectus p.8)     */
/* ------------------------------------------------------------------ */

export const SCREENER: Question[] = [
  { id: 's_age', type: 'yesno', prompt: 'Are you 18 or older?', options: yn },
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
  { id: 's_license', type: 'yesno', prompt: 'Do you have a valid driver’s license?', options: yn },
  {
    id: 's_paid_parking',
    type: 'single',
    prompt: 'When you fly, do you use paid airport parking or an off-site parking lot?',
    options: [
      { value: 'usually', label: 'Yes, usually' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'would_consider', label: 'No, but I would under the right conditions' },
      { value: 'no', label: 'No, and I wouldn’t consider it' },
    ],
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
    options: ['0', '1–2', '3–5', '6–10', '11+'].map((v) => ({ value: v, label: v })),
  },
  {
    id: 'q2_home_airport',
    type: 'airport',
    prompt: 'What airport do you fly out of most often?',
    placeholder: 'Search by city or code',
  },
  {
    id: 'q3_dest_airports',
    type: 'airports',
    prompt: 'Which three airports do you fly to most often?',
    help: 'Select up to 3.',
    max: 3,
    placeholder: 'Search by city or code',
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
    id: 'q5_rideshare',
    type: 'single',
    prompt: 'If you use rideshare to or from the airport, which do you use most?',
    options: [
      { value: 'uber', label: 'Uber' },
      { value: 'lyft', label: 'Lyft' },
      { value: 'both', label: 'Both' },
      { value: 'neither', label: 'Neither' },
    ],
  },
  {
    id: 'q6_park_at_airport',
    type: 'yesno',
    prompt: 'Do you typically leave your vehicle parked at the airport while traveling?',
    options: yn,
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
      'Imagine a membership that gives you secure parking near the airport. It also has an optional feature: while you’re away, your parked car can be rented to verified travelers, with protections like monitoring and insurance. What is the most you would pay per year for this membership?',
    options: ['$0', '$25', '$55', '$75', '$99', '$125+'].map((v) => ({ value: v, label: v })),
  },
  {
    id: 'q9_concern',
    type: 'text',
    prompt: 'What is your biggest concern or deal-breaker about an option like the one just described?',
    placeholder: 'Type your answer',
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

const why = (id: string, prompt: string): Question => ({
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
    followup: why('cp1_why', 'What’s unclear?'),
  },
  cp2: {
    id: 'cp2',
    label: 'Sign-up ease',
    main: scale5('cp2', 'How easy was sign-up?', 'Very hard', 'Very easy'),
    followup: why('cp2_why', 'What slowed you down?'),
  },
  cp3: {
    id: 'cp3',
    label: 'ID verification comfort',
    main: scale5('cp3', 'How comfortable are you with this step?', 'Not comfortable', 'Very comfortable'),
    followup: why('cp3_why', 'What would increase trust?'),
  },
  cp4: {
    id: 'cp4',
    label: 'Security confidence',
    main: scale5('cp4', 'How confident are you in the security of the parking location?', 'Not confident', 'Very confident'),
    followup: why('cp4_why', 'What proof would you need?'),
  },
  cp5: {
    id: 'cp5',
    label: 'Insurance confidence',
    main: scale5('cp5', 'How confident are you that you’d be protected if something went wrong?', 'Not confident', 'Very confident'),
    followup: why('cp5_why', 'What details matter most?'),
  },
  cp6: {
    id: 'cp6',
    label: 'Rental opt-in (owner)',
    main: {
      id: 'cp6',
      type: 'single',
      prompt: 'Would you enable the rental option while you’re away?',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'maybe', label: 'Maybe' },
        { value: 'no', label: 'No' },
      ],
    },
    followup: {
      id: 'cp6_conditions',
      type: 'multi',
      prompt: 'What conditions must be true?',
      help: 'Select all that apply.',
      other: true,
      options: [
        { value: 'approve_each', label: 'I approve each renter myself' },
        { value: 'vetting', label: 'Renters are ID-verified and driving-record checked' },
        { value: 'insurance', label: 'My car is fully covered by insurance' },
        { value: 'back_before', label: 'My car is back before I land' },
        { value: 'condition_photos', label: 'Condition photos at every pickup and return' },
        { value: 'mileage', label: 'A mileage limit' },
        { value: 'my_price', label: 'I set my own price' },
        { value: 'reviews', label: 'I can see renter ratings and reviews' },
        { value: 'other', label: 'Other' },
      ],
    },
  },
  h2: {
    id: 'h2',
    label: 'Earnings expectations (owner)',
    main: {
      id: 'h2_expect',
      type: 'currency',
      added: true,
      prompt: 'How much would you expect to earn from renting your car on a typical trip?',
      placeholder: '0',
    },
    followup: {
      id: 'h2_need',
      type: 'currency',
      added: true,
      prompt: 'How much would you need to earn on a trip for renting to be worth it?',
      placeholder: '0',
    },
  },
  cp7: {
    id: 'cp7',
    label: 'Availability confidence (renter)',
    main: scale5('cp7', 'How confident are you this vehicle would be available as described?', 'Not confident', 'Very confident'),
    followup: why('cp7_why', 'What would increase confidence?'),
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
    followup: why('cp9_why', 'What’s the one thing holding you back?'),
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

/**
 * The guided prototype journeys.
 *
 * Each screen step loads one HTML file from public/screens. The screen talks to
 * the study app through "signals":
 *   - nav:<screen>[?query]  the screen tried to navigate (link, form, __nav)
 *   - advance               a new screen's Continue button
 *   - <name>                a named moment patched into a screen (e.g. book, confirmed)
 *
 * advanceOn  signals that finish the step (prefix match for nav:… with a query)
 * pauses     signals that freeze the screen and show checkpoints first
 * after      checkpoints shown once the step is finished, before the next screen
 * Navigation to an earlier step's screen goes back to that step.
 * Any other navigation is blocked and logged as a dead click.
 */

export type Persona = 'owner' | 'renter';

export type ScreenStep = {
  id: string;
  screen: string;
  title: string;
  task: string;
  query?: string;
  /** Skipped in a participant's second journey (they've already done it). */
  shared?: boolean;
  /** Append the query string carried from the last nav signal. */
  useCarry?: boolean;
  advanceOn: string[];
  advanceDelayMs?: number;
  pauses?: Record<string, string[]>;
  after?: string[];
};

export type Journey = {
  persona: Persona;
  title: string;
  intro: { heading: string; body: string[] };
  steps: ScreenStep[];
};

const shared = (persona: Persona): ScreenStep[] => [
  {
    id: `${persona}.overview`,
    screen: 'overview',
    title: 'Concept overview',
    task: 'Read what the app does, then tap Continue.',
    shared: true,
    advanceOn: ['advance'],
    after: ['cp1'],
  },
  {
    id: `${persona}.signup`,
    screen: 'sign-up',
    title: 'Sign-up',
    task: 'Create an account. Made-up details are fine. Nothing you type here is saved.',
    shared: true,
    advanceOn: ['advance', 'nav:onboarding'],
    after: ['cp2'],
  },
  {
    id: `${persona}.verify`,
    screen: 'verify-id',
    title: 'ID verification',
    task: 'Verify your ID. This step is simulated, so no camera or license is needed.',
    shared: true,
    advanceOn: ['nav:membership', 'nav:onboarding?id=progress'],
    after: ['cp3'],
  },
  {
    id: `${persona}.security`,
    screen: 'security',
    title: 'Security information',
    task: 'Read how cars are kept safe, then tap Continue.',
    shared: true,
    advanceOn: ['advance'],
    after: ['cp4'],
  },
];

export const JOURNEYS: Record<Persona, Journey> = {
  owner: {
    persona: 'owner',
    title: 'Car owner',
    intro: {
      heading: 'You’re flying out next month',
      body: [
        'Imagine you’re flying out of Chicago Midway for about a week and plan to drive to the airport.',
        'You’ll sign up, add your car, book parking, and decide whether to let a verified traveler rent your car while you’re away.',
        'Use the app the way you normally would. A few short questions will pop up along the way.',
      ],
    },
    steps: [
      ...shared('owner'),
      {
        id: 'owner.insurance',
        screen: 'insurance-owner',
        title: 'Insurance information (owner)',
        task: 'Read how your car is protected, then tap Continue.',
        advanceOn: ['advance'],
        after: ['cp5'],
      },
      {
        id: 'owner.membership',
        screen: 'membership',
        title: 'Membership pricing',
        task: 'Activate your membership. Payment is simulated, so no card is needed.',
        advanceOn: ['nav:onboarding?id=done&mem=done'],
        pauses: { pay: ['cp8'] },
      },
      {
        id: 'owner.vehicle',
        screen: 'add-vehicle',
        title: 'Vehicle details',
        task: 'Add your car. Use your own car’s make and model if you like. The plate can be made up.',
        advanceOn: ['advance'],
      },
      {
        id: 'owner.trip',
        screen: 'plan-trip',
        title: 'Dates, rental opt-in, earnings',
        task: 'Book parking for your trip. Decide whether to rent your car while you’re away, then book.',
        advanceOn: ['confirmed'],
        advanceDelayMs: 2200,
        pauses: { book: ['cp6', 'h2'] },
        after: ['cp9', 'cp10'],
      },
    ],
  },
  renter: {
    persona: 'renter',
    title: 'Traveler renting a car',
    intro: {
      heading: 'You need a car for a trip',
      body: [
        'Imagine you’re flying into Chicago Midway and need a car for a few days.',
        'You’ll sign up, find a car from a local owner, review the rules and protection, and request to book.',
        'Use the app the way you normally would. A few short questions will pop up along the way.',
      ],
    },
    steps: [
      ...shared('renter'),
      {
        id: 'renter.browse',
        screen: 'browse',
        title: 'Search cars',
        task: 'Find a car you’d want to rent for your trip.',
        advanceOn: ['nav:car-detail'],
      },
      {
        id: 'renter.car',
        screen: 'car-detail',
        title: 'Vehicle details',
        task: 'Look over the car. When you’re ready, request to book.',
        useCarry: true,
        advanceOn: ['nav:request-car'],
        pauses: { request: ['cp7'] },
      },
      {
        id: 'renter.insurance',
        screen: 'insurance-renter',
        title: 'Insurance and rules (renter)',
        task: 'Read how you’re protected, then tap Continue.',
        advanceOn: ['advance'],
        after: ['cp5'],
      },
      {
        id: 'renter.request',
        screen: 'request-car',
        title: 'Pricing and reserve',
        task: 'Review the price and send your request. Payment is simulated, so no card is needed.',
        useCarry: true,
        advanceOn: ['confirmed'],
        advanceDelayMs: 2200,
        pauses: { send: ['cp8'] },
        after: ['cp9', 'cp10'],
      },
    ],
  },
};

/** Every step id across both journeys, in order, for admin funnels. */
export const ALL_STEPS = [...JOURNEYS.owner.steps, ...JOURNEYS.renter.steps];

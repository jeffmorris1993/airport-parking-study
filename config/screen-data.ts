/**
 * Data the prototype screens ask the study app for.
 * BROWSE_CARS must stay in the same order as the CARS list inside
 * public/screens/browse.html, since Browse links pass the car's index.
 */

export type BrowseCar = {
  y: number;
  mm: string;
  p: number;
  tag: string;
  owner: string;
  specs: string[];
};

export const BROWSE_CARS: BrowseCar[] = [
  { y: 2022, mm: 'Tesla Model 3', p: 45, tag: '★ 4.9 · 14 trips', owner: 'Dana', specs: ['Electric · 272 mi range', '5 seats', 'Autopilot', 'Apple CarPlay'] },
  { y: 2021, mm: 'Toyota RAV4 Hybrid', p: 52, tag: '★ 4.8 · 9 trips', owner: 'Marcus', specs: ['Hybrid', '5 seats', 'AWD', 'Apple CarPlay'] },
  { y: 2020, mm: 'Honda Civic', p: 34, tag: '★ 5.0 · 6 trips', owner: 'Priya', specs: ['Gas', '5 seats', 'Apple CarPlay', 'Backup camera'] },
  { y: 2022, mm: 'Subaru Outback', p: 58, tag: '★ 4.9 · 21 trips', owner: 'Luis', specs: ['Gas', '5 seats', 'AWD', 'Roof rack'] },
  { y: 2019, mm: 'Mazda MX-5 Miata', p: 61, tag: 'New listing', owner: 'Jordan', specs: ['Gas', '2 seats', 'Convertible', 'Bluetooth'] },
  { y: 2021, mm: 'Toyota Sienna', p: 74, tag: '★ 4.7 · 12 trips', owner: 'Renee', specs: ['Hybrid', '8 seats', 'Minivan', 'Apple CarPlay'] },
];

export type ParticipantVehicle = { year?: string; make?: string; model?: string; color?: string; plate?: string };

/** Plan Trip's car list, built from what the participant entered on Add Vehicle. */
export function planCars(v: ParticipantVehicle | null | undefined) {
  const mm = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'Your car';
  const nick = [v?.color, v?.make].filter(Boolean).join(' ') || 'My car';
  return {
    mine: { n: nick, mm, pl: (v?.plate || '').toUpperCase() || 'ABC 123', ok: 1, sug: '$38–$52', def: 45 },
  };
}

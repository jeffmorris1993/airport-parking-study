// Turn the extracted prototype screens into unbranded study screens.
//
//   node scripts/clean-screens.mjs
//
// Reads screens/raw/*.html (from extract-screens.mjs), writes public/screens/<slug>.html.
// Every patch must match exactly; if the source design changes, this script
// fails loudly instead of silently shipping a broken screen.
//
// Patched screens call window.__study, which the study app injects:
//   __study.signal(name, data)   tell the app something happened (advance, confirmed, vehicle)
//   __study.pause(name, data)    freeze for checkpoints; returns a Promise
//   __study.date(days)           ISO date `days` from today
//   __study.dateLabel(days)      "Oct 16, 2027" style label
//   __study.planCars()           the participant's own car for Plan Trip
//   __study.car(i)               a Browse listing by index

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAW = 'screens/raw';
const OUT = 'public/screens';
mkdirSync(OUT, { recursive: true });

const KEEP = {
  'Jeinus Sign In.html': 'sign-up',
  'Jeinus Verify ID.html': 'verify-id',
  'Jeinus Membership.html': 'membership',
  'Jeinus Add Vehicle.html': 'add-vehicle',
  'Jeinus Plan Trip.html': 'plan-trip',
  'Jeinus Browse.html': 'browse',
  'Jeinus Car Detail.html': 'car-detail',
  'Jeinus Request Car.html': 'request-car',
};

/** Link targets become short slugs; the study app turns them into nav:<slug> signals. */
const SLUG_OVERRIDES = { 'Sign In': 'sign-up', 'Onboarding Checklist': 'onboarding', 'Pilot Landing': 'landing' };
const slug = (name) => SLUG_OVERRIDES[name] || name.toLowerCase().replace(/\s+/g, '-');

/** [find, replace, expectedCount?] — find is a string or RegExp. */
const PATCHES = {
  'sign-up': [
    [
      "setTimeout(function(){mode==='in'?(window.__nav='Jeinus Onboarding Checklist.html'):setState('unverified')},1400);",
      "setTimeout(function(){window.__study.signal('advance',{mode:mode})},1400);",
    ],
    ['← Back to jeinus.com', '← Back'],
  ],
  'verify-id': [
    [
      "The scan runs on Stripe's secure identity service. Your images are encrypted and deleted after the check.",
      'In this walkthrough the scan is simulated. In the real app, your images are encrypted and deleted after the check.',
    ],
    ['Opens Stripe in a secure window', 'Simulated. No camera or license needed.'],
    ["You're verified, Alex", "You're verified"],
    [/Next: activate membership\s*(→|\\u2192)/g, 'Continue →'],
    [/Step 1 of 3/g, 'Account setup'],
  ],
  membership: [
    ['SECURE CHECKOUT \\u00b7 POWERED BY SQUARE', 'SIMULATED CHECKOUT \\u00b7 NO CARD NEEDED', 2],
    ['Square is confirming your', 'We\\u2019re confirming your'],
    ['Welcome to the founding pilot, Alex. ', 'Welcome to the founding pilot. '],
    ["<b>Sep 25, 2027</b>", "<b>'+window.__study.dateLabel(365)+'</b>"],
    ['Commercial insurance on every rental', '{{CLAIM_INSURANCE_SHORT}}'],
    ['Secure, monitored airport parking', '{{CLAIM_MONITORING_SHORT}}'],
    ['Founding rate locked, plus 24/7 support', 'Founding rate locked for good'],
    // Payment runs itself: unpaid -> pending -> active, then the price checkpoint, then advance.
    // unverified: regen requires design/prototype.html
    [
      '<button class="btn btn-accent" id="pay">Pay $50.00 USD</button>',
      '<button class="btn btn-accent" disabled><span class="spin"></span>Processing payment\\u2026</button>',
    ],
    // unverified: regen requires design/prototype.html
    [
      '<a class="btn btn-accent" href="Jeinus Onboarding Checklist.html?id=done&mem=done">Next: add your vehicle \\u2192</a>',
      '',
    ],
    [
      "if(p)p.onclick=function(){set('pending');window.scrollTo(0,0);t=setTimeout(function(){set('active')},2600)};",
      "if(p)p.onclick=function(){set('pending');window.scrollTo(0,0)};\n if(s==='unpaid')t=setTimeout(function(){set('pending');window.scrollTo(0,0)},2200);\n if(s==='pending')t=setTimeout(function(){set('active')},2600);\n if(s==='active'&&!done){done=true;setTimeout(function(){window.__study.pause('pay',{price:{{PRICE}}}).then(function(){window.__study.signal('advance')})},1400)}",
    ],
    // unverified: regen requires design/prototype.html
    ['function set(s){', 'var done=false;\nfunction set(s){'],
    [/Step 2 of 3/g, 'Membership'],
  ],
  'add-vehicle': [
    // Study only needs the Details step, and only fields a participant knows offhand.
    [/\n \{k:'regexp'[^\n]*/, ''],
    [/\n \{k:'vin'[^\n]*/, ''],
    [/\n \{k:'owner'[^\n]*/, ''],
    [/\n  var vin=[\s\S]*?(?=\n \}\n if\(n===2\))/, ''],
    [
      ' if(S.step===4){submit();return}\n go(S.step+1);',
      " if(S.step===4){submit();return}\n window.__study.signal('vehicle',{year:S.f.year,make:S.f.make,model:S.f.model,color:S.f.color,plate:S.f.plate});window.__study.signal('advance');",
    ],
    ["try{d=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}", ''],
    ['<div class="eyebrow">Step 1 of 4</div>', '<div class="eyebrow">Your car</div>'],
    [
      'About 3 minutes. Most of this is on your registration, so keep it nearby.',
      'About a minute. This tells attendants which car is yours.',
    ],
    [
      "$('stepMob').innerHTML='Step '+S.step+' of 4 \\u00b7 <b>'+STEPS[S.step-1]+'</b>';",
      "$('stepMob').innerHTML='<b>Vehicle details</b>';",
    ],
  ],
  'plan-trip': [
    [/var CARS=\{[\s\S]*?\n\};\nvar RATE=18,FEE=\.25,/, 'var CARS=window.__study.planCars();\nvar RATE={{PARKING_RATE}},FEE={{FEE_PCT}}/100,'],
    [/S=\{car:'tesla',/g, "S={car:'mine',", 2],
    [
      "$('dd').value='2026-10-12';$('dt').value='08:30';$('rd').value='2026-10-19';$('rt').value='18:40';",
      "$('dd').value=window.__study.date(14);$('dt').value='08:30';$('rd').value=window.__study.date(21);$('rt').value='18:40';",
    ],
    [
      'lock(true);setTimeout(function(){lock(false);confirm()},1400)};',
      "window.__study.pause('book',{rent:!!(CARS[S.car].ok&&S.rent),price:ourPrice()}).then(function(){lock(true);setTimeout(function(){lock(false);confirm()},1400)})};",
    ],
    [
      "$('form').hidden=true;$('foot').hidden=true;$('done').hidden=false;window.scrollTo(0,0);",
      "$('form').hidden=true;$('foot').hidden=true;$('done').hidden=false;window.scrollTo(0,0);window.__study.signal('confirmed',{rent:rent,price:ourPrice(),days:sp.days,estEarnings:Math.round(net*100)/100});",
    ],
    [/JNS-7K4Q2/g, 'PK-48217', 2],
    ['Covered lot, 6 min shuttle to all terminals', '{{CLAIM_SHUTTLE_SHORT}}'],
    [
      '<b>Verified Jeinus members only.</b> ID-checked, 25 or older, with a clean driving record.',
      '<b>Verified members only.</b> {{CLAIM_RENTER_VETTING}}',
    ],
    ['<b>Covered by our commercial insurance</b> for every rental, not your personal policy.', '{{CLAIM_INSURANCE}}'],
    ['Jeinus fee (25%, includes insurance)', 'Service fee ({{FEE_PCT}}%)'],
    ['Jeinus SFO · Lot B, 780 McDonnell Rd, San Francisco', '{{LOT_NAME}} · {{LOT_ADDRESS}}'],
    ['Follow signs for <b>Lot B</b> and stop at the Jeinus gate. Show your code.', 'Follow signs to the <b>{{LOT_NAME}}</b> and show your code at the gate.'],
    [
      'Leave your key with the attendant and take the <b>shuttle to your terminal</b>. It runs every 10 minutes.',
      'Leave your key in the secure key drop. {{CLAIM_SHUTTLE}}',
    ],
    // Pricing is automated: owners don't set a daily price; we do.
    // The patches below are unverified: regen requires design/prototype.html.
    [
      'Turn this on to set a daily price and see what your car could earn on this trip. Your parking is booked either way.',
      'Turn this on to see what your car could earn on this trip. We set the daily price. Your parking is booked either way.',
    ],
    [
      /<div class="prow"><div class="f" id="f-price">[\s\S]*?<button type="button" id="useSug">Use \$45<\/button><\/p><\/div>/,
      '<div class="prow"><p class="sugg">We set the price. Similar cars at SFO: <b id="sug">$38–$52</b> · your car lists at <b id="ourP">$45/day</b></p></div>',
    ],
    ["var RATE={{PARKING_RATE}},FEE={{FEE_PCT}}/100,S={car:'mine',rent:false,price:45,err:{}},busy=false;", "var RATE={{PARKING_RATE}},FEE={{FEE_PCT}}/100,S={car:'mine',rent:false,err:{}},busy=false;\nfunction ourPrice(){return (CARS[S.car]&&CARS[S.car].def)||45}"],
    [
      "S.car=r.value;if(!CARS[r.value].ok)S.rent=false;else S.price=CARS[r.value].def;cars();$('price').value=S.price;calc()",
      'S.car=r.value;if(!CARS[r.value].ok)S.rent=false;cars();calc()',
    ],
    ["if(c.ok){$('sug').textContent=c.sug}", "if(c.ok){$('sug').textContent=c.sug;$('ourP').textContent='$'+ourPrice()+'/day'}"],
    [/var avail=sp\?Math\.max\(0,days-2\):0,price=parseFloat\(\$\('price'\)\.value\)\|\|0,/, 'var avail=sp?Math.max(0,days-2):0,price=ourPrice(),'],
    [/ if\(CARS\[S\.car\]\.ok&&S\.rent\)\{var p=parseFloat\(\$\('price'\)\.value\);if\(!\(p>=20&&p<=250\)\)e\.price='[^']*'\}\n/, ' '],
    ["['dd','rd','price'].forEach(function(k){mark(k,e[k])});", "['dd','rd'].forEach(function(k){mark(k,e[k])});"],
    [/,net=\(parseFloat\(\$\('price'\)\.value\)\|\|0\)\*avail\*\(1-FEE\);/, ',net=ourPrice()*avail*(1-FEE);'],
    [/'Listed at '\+money\(parseFloat\(\$\('price'\)\.value\)\|\|0\)\+/, "'Listed at '+money(ourPrice())+"],
    [/\$\('price'\)\.oninput=function\(\)\{[^}]*\};\n/, ''],
    [/\$\('useSug'\)\.onclick=function\(\)\{[^}]*\};\n/, ''],
    [
      /S=\{car:'mine',rent:false,price:45,err:\{\}\};(\$\('dd'\)[^;]*;\$\('dt'\)[^;]*;\$\('rd'\)[^;]*;\$\('rt'\)[^;]*;)\$\('price'\)\.value=45;\['dd','rd','price'\]/,
      "S={car:'mine',rent:false,err:{}};$1['dd','rd']",
    ],
    [
      '<b>Pickup and return at our lot.</b> Attendants photograph your car each time it leaves and comes back.',
      '<b>Pickup and return at our lot.</b> Your car is photographed each time it leaves and comes back.',
    ],
    [
      'An attendant walks around the car with you and <b>takes condition photos</b>. About 5 minutes.',
      'Walk around the car and <b>take condition photos</b> in the app. About 5 minutes.',
    ],
  ],
  browse: [
    [
      "'&rd='+$('rd').value+(i===4?'&state=unavailable':'')+'\"",
      "'&rd='+$('rd').value+'&c='+i+'\"",
    ],
    ["var state='results';", "var state='results';$('pd').value=window.__study.date(21);$('rd').value=window.__study.date(24);"],
  ],
  'car-detail': [
    [
      "RATE=45;",
      "CAR=window.__study.car(q.get('c')),RATE=CAR.p;\n$('carT').textContent=CAR.y+' '+CAR.mm;$('carM').textContent=CAR.tag;$('carS').innerHTML=CAR.specs.map(function(x){return '<span>'+x+'</span>'}).join('');document.querySelectorAll('.own').forEach(function(e){e.textContent=CAR.owner});$('ownAv').textContent=CAR.owner.charAt(0);",
    ],
    ["'<div class=\"pr\">$45<small> / day</small></div>'", "'<div class=\"pr\">$'+RATE+'<small> / day</small></div>'"],
    [
      "function send(){window.__nav='Jeinus Request Car.html?pd='+PD+'&rd='+RD;return;",
      "function send(){window.__study.pause('request',{car:CAR.y+' '+CAR.mm,rate:RATE}).then(function(){window.__nav='Jeinus Request Car.html?pd='+PD+'&rd='+RD+'&c='+(q.get('c')||0)});return;",
    ],
    [/Request sent to Alex/g, "Request sent to '+CAR.owner+'"],
    [/until Alex approves/g, "until '+CAR.owner+' approves"],
    [/Alex needs the car back on Nov 26\./g, "'+CAR.owner+' needs the car back sooner."],
    ['<h1>2022 Tesla Model 3</h1><p class="m"><span class="st">★ 4.9</span><span>14 trips</span>', '<h1 id="carT">2022 Tesla Model 3</h1><p class="m"><span class="st" id="carM">★ 4.9</span>'],
    ['<div class="specs">', '<div class="specs" id="carS">'],
    ['<span class="av">AR</span><div><b>Alex</b>Jeinus member since 2026', '<span class="av" id="ownAv">A</span><div><b class="own">Alex</b>Member since 2026'],
    ['780 McDonnell Rd, San Francisco. Free shuttle from every terminal, every 10 minutes.', '{{LOT_ADDRESS}} {{CLAIM_SHUTTLE}}'],
    ['Any time, 24/7. An attendant checks you in.', 'Any time. Check yourself in with your code.'],
    [
      '<b>Return with at least 70% charge.</b> Chargers are free at the lot if you run short.',
      '<b>Return with the same fuel or charge level.</b> The same as when you picked it up.',
    ],
  ],
  'request-car': [
    [
      "RATE=45;",
      "CAR=window.__study.car(q.get('c')),RATE=CAR.p;\n$('carT').textContent=CAR.y+' '+CAR.mm;$('carT2').textContent=CAR.y+' '+CAR.mm;$('carM').textContent=CAR.tag+' \\u00b7 Owner: '+CAR.owner;document.querySelectorAll('.own').forEach(function(e){e.textContent=CAR.owner});",
    ],
    [
      '<h2>2022 Tesla Model 3</h2><p class="m">★ 4.9 · 14 trips · Owner: Alex</p>',
      '<h2 id="carT">2022 Tesla Model 3</h2><p class="m" id="carM"></p>',
    ],
    ['<b>2022 Tesla Model 3</b><span id="dDates">', '<b id="carT2">2022 Tesla Model 3</b><span id="dDates">'],
    [/(Nothing is charged until |<span>|Waiting on |We've asked |<b>)Alex/g, '$1<span class="own">Alex</span>', 6],
    ['Check the details, then add a card.', 'Check the details, then send your request.'],
    [
      /<section class="blk"><h2>Card for the hold <small>[\s\S]*?Encrypted by Square<\/small><\/h2><div class="box">/,
      '<section class="blk"><h2>Payment</h2><div class="box"><div class="banner info" role="note"><div><strong>Payment is simulated.</strong>No card is needed in this walkthrough. In the real app, a hold is placed on your card here.</div></div><div hidden>',
    ],
    [/<p class="secure">(?:(?!<\/p>)[\s\S])*?Your card is only used for Jeinus bookings<\/p><\/div><\/section>/, '</div></div></section>'],
    [
      /function validate\(\)\{[\s\S]*?\n return !n;\n\}/,
      "function validate(){\n var n=0;\n if(!$('agree').checked){$('agreeL').classList.add('bad');$('agreeE').classList.add('show');n++}\n $('sum').hidden=true;\n return !n;\n}",
    ],
    [
      /lock\(true\);var num=[\s\S]*?sent\(\)\},1400\);/,
      "window.__study.pause('send',{total:TOT}).then(function(){lock(true);setTimeout(function(){lock(false);sent()},1400)});",
    ],
    [
      "$('form').hidden=true;$('foot').hidden=true;$('done').hidden=false;window.scrollTo(0,0);",
      "$('form').hidden=true;$('foot').hidden=true;$('done').hidden=false;window.scrollTo(0,0);window.__study.signal('confirmed',{total:TOT,days:N});",
    ],
    [/'Priya Shah'/g, "''", 2],
    ['value="Priya Shah"', 'value=""'],
    ['<b>Return with 70% charge,</b> on time.', '<b>Return with the same fuel or charge,</b> on time.'],
    // unverified: regen requires design/prototype.html
    [
      'Show your ID at the gate. An attendant hands you the key and walks the car with you.',
      'Show your ID at the gate, pick up the key from the secure key drop, and photograph the car before you drive off.',
    ],
  ],
};

/** Applied to every kept screen after its own patches. Order matters. */
const GLOBAL = [
  [/Jein?us ([A-Za-z -]+?)\.html/g, (_, name) => `${slug(name)}.html`],
  [/<img src="__LOGO__" alt="[^"]*">/g, '<span class="wm">{{APP_NAME}}</span>'],
  [/__LOGO__/g, ''],
  [/Jeinus SFO · Lot B/g, '{{LOT_NAME}}'],
  [/Jeinus SFO/g, '{{LOT_NAME}}'],
  [/780 McDonnell Rd, San Francisco/g, '{{LOT_ADDRESS}}'],
  [/Free shuttle from every terminal, every 10 minutes\./g, '{{CLAIM_SHUTTLE}}'],
  [/SFO/g, '{{AIRPORT_CODE}}'],
  [/\(650\) 555-0142/g, '{{LOT_PHONE}}'],
  [/tel:\+16505550142/g, '#'],
  [/\$50(?![0-9])/g, '${{PRICE}}'],
  [/\$99(?![0-9])/g, '${{PRICE_STANDARD}}'],
  [/Jeinus fee/g, 'Service fee'],
  [/Alex Rivera/g, 'Member'],
  [/WELCOME, ALEX/g, 'WELCOME'],
  [/pilot@jeinus\.com/g, '{{CONTACT_EMAIL}}'],
  [/Jeinus|Jenius/g, '{{APP_NAME}}'],
  [/jeinus|jenius/g, 'study'],
  // Swap the brand blue for a neutral teal so the study screens carry no brand cues.
  [/#0a5cff/gi, '#1d6b5f'],
  [/#0842b8/gi, '#14524a'],
  [/#dde8ff/gi, '#d9eee9'],
  [/#b9cfff/gi, '#a8d8cd'],
  [/rgba\(10,92,255,/g, 'rgba(29,107,95,'],
  [/#2a7bff/gi, '#2f8a7a'],
];

function apply(html, [find, replace, expected], where) {
  const count = typeof find === 'string' ? html.split(find).length - 1 : (html.match(find) || []).length;
  const want = expected ?? (typeof find === 'string' || !find.global ? 1 : null);
  if (count === 0 || (want != null && count !== want)) {
    throw new Error(`[clean] ${where}: expected ${want ?? '≥1'} match(es) for ${String(find).slice(0, 90)}, found ${count}`);
  }
  return typeof find === 'string' ? html.split(find).join(replace) : html.replace(find, replace);
}

let written = 0;
for (const [file, id] of Object.entries(KEEP)) {
  let html = readFileSync(`${RAW}/${file}`, 'utf8');
  for (const p of PATCHES[id] || []) html = apply(html, p, id);
  for (const [find, replace] of GLOBAL) html = html.replace(find, replace);

  const leftovers = html.match(/Stripe|Square|SQUARE|Alex(?! Rivera)/g);
  if (leftovers && id !== 'car-detail' && id !== 'request-car') {
    console.warn(`[clean] ${id}: review leftover terms: ${[...new Set(leftovers)].join(', ')}`);
  }
  writeFileSync(`${OUT}/${id}.html`, html);
  written++;
}
/* ------------------------------------------------------------------ */
/* New screens, built on the cleaned Verify ID screen's styles          */
/* ------------------------------------------------------------------ */

const IC = {
  car: '<path d="M5 17h14M6.5 17l1-5.5h9l1 5.5M8 11.5l1.2-4h5.6l1.2 4"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="16" cy="17.5" r="1.5"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>',
  person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c.9-3.3 3.7-5.5 7-5.5s6.1 2.2 7 5.5"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  check: '<path d="M5 12.5l5 5 9-11"/>',
};
const icon = (k) => `<span class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg></span>`;

const NEW = {
  overview: {
    title: 'How it works',
    eyebrow: 'Welcome',
    h1: 'Park near the airport. Earn while you’re away.',
    lead: '{{APP_NAME}} is a membership for travelers. Park your car at a secured lot near {{AIRPORT_NAME}} before your flight. If you want, a verified traveler can rent your car while you’re gone, and you keep most of what it earns.',
    points: [
      ['car', 'Park before your flight', 'Drop your car at the {{LOT_NAME}} on your way out. {{CLAIM_SHUTTLE}}'],
      ['coin', 'Optional: rent it out', 'Turn on renting for any trip. We set the daily price, and every request comes to you to approve.'],
      ['person', 'Need a car instead?', 'Travelers can rent a member’s car at the lot, with pickup and return in the same place.'],
      ['card', 'One yearly membership', 'Founding members pay ${{PRICE}} a year (standard ${{PRICE_STANDARD}}). Parking is booked per trip.'],
    ],
  },
  security: {
    title: 'Security',
    eyebrow: 'Security',
    h1: 'How cars are kept safe',
    lead: 'What happens to a car from the moment it’s dropped off until it’s picked up.',
    points: [
      ['shield', 'A secured lot', '{{CLAIM_MONITORING}}'],
      ['camera', 'Condition photos every time', 'The owner photographs the car at drop-off, and the renter photographs it at every pickup and return, so there’s always a record of its condition.'],
      ['key', 'Keys are secure', 'Keys are never left in the car. They’re held in a locked key system and released only to the owner or to a verified renter the owner approved.'],
      ['person', 'Verified people only', '{{CLAIM_RENTER_VETTING}}'],
    ],
  },
  'insurance-owner': {
    title: 'Protection for owners',
    eyebrow: 'Protection',
    h1: 'If something goes wrong',
    lead: 'How your car is protected while someone else is driving it.',
    points: [
      ['shield', 'Coverage on every rental', '{{CLAIM_INSURANCE}}'],
      ['camera', 'Damage is documented', 'Condition photos before and after each rental show exactly what changed.'],
      ['check', 'You approve every renter', 'Each rental is a request you can approve or decline. Nobody books your car without your OK.'],
      ['chat', 'Help when you need it', 'If there’s a problem, you report it in the app and the team follows up with you.'],
    ],
  },
  'insurance-renter': {
    title: 'Protection for renters',
    eyebrow: 'Protection',
    h1: 'Protection while you drive',
    lead: 'What’s covered when you rent a member’s car.',
    points: [
      ['shield', 'Coverage options', 'Insurance isn’t included automatically. Buy coverage from us when you book, or show proof of your own insurance before you drive.'],
      ['camera', 'Condition photos at pickup', 'You photograph the car yourself before you drive off, so you’re never blamed for earlier damage. The owner does the same at drop-off.'],
      ['list', 'The owner sets the house rules', 'Each owner sets their car’s rules up front: mileage, smoking, pets, fuel, and late returns. You see them before you book.'],
      ['chat', 'Support during your trip', 'Contact the lot team any time during your rental if something comes up.'],
    ],
  },
};

const base = readFileSync(`${OUT}/verify-id.html`, 'utf8');
const head = base.slice(0, base.indexOf('</head>'));
for (const [id, s] of Object.entries(NEW)) {
  const pts = s.points.map(([k, h, p]) => `<div class="pt">${icon(k)}<div><h3>${h}</h3><p>${p}</p></div></div>`).join('\n');
  const html = `${head.replace(/<title>[^<]*<\/title>/, `<title>{{APP_NAME}} · ${s.title}</title>`)}</head>
<body>
<div class="app">
<header class="top"><a class="logo" href="#" aria-label="{{APP_NAME}}"><span class="wm">{{APP_NAME}}</span></a></header>
<main data-screen-label="${s.title}">
<div class="wrap">
<section>
<div class="eyebrow">${s.eyebrow}</div>
<h1>${s.h1}</h1>
<p class="lead">${s.lead}</p>
<div class="card">
${pts}
</div>
<div class="cta stick"><button type="button" class="btn btn-accent" id="continue" data-track="continue">Continue</button></div>
</section>
</div>
</main>
</div>
<script>document.getElementById('continue').onclick=function(){window.__study.signal('advance')};</script>
</body>
</html>
`;
  writeFileSync(`${OUT}/${id}.html`, html);
  written++;
}

console.log(`[clean] wrote ${written} screens to ${OUT}/`);

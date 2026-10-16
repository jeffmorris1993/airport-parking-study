'use client';

import { fillTokens } from '@config/study';

const cache = new Map<string, Promise<string>>();

export function loadScreen(id: string): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/screens/${encodeURIComponent(id)}.html`, { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Screen ${id} not found`);
      return r.text();
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export function preloadScreens(ids: string[]) {
  for (const id of ids) void loadScreen(id).catch(() => undefined);
}

/** CSS that strips prototype-only chrome (state panels, role switcher, tab bars). */
const STUDY_CSS = `
.rail,.tabs,nav.nav,details.review,.review,.vsw,.top .av,.top .close,#rStates{display:none!important}
.stick,.mbar{bottom:0!important}
.foot{left:0!important}
.logo{text-decoration:none;pointer-events:none}
.wm{font-family:var(--serif);font-size:23px;line-height:1;color:var(--ink);letter-spacing:-.4px;font-weight:400;white-space:nowrap}
#stepper{display:none!important}
`;

/**
 * The bridge runs first inside every screen. It exposes window.__study and
 * routes every navigation attempt (links, forms, window.__nav) to the study app.
 */
const BRIDGE = `(function(){
var host=null;try{host=parent.__studyHost}catch(e){}
var noop=function(){};
var api=host&&host.bridge?host.bridge(window):{
 signal:noop,nav:noop,pause:function(){return new Promise(noop)},
 date:function(n){var d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)},
 dateLabel:function(n){var d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})},
 planCars:function(){return {mine:{n:'My car',mm:'2021 Honda Civic',pl:'ABC 123',ok:1,sug:'$38\\u2013$52',def:45}}},
 car:function(){return {y:2022,mm:'Tesla Model 3',p:45,tag:'\\u2605 4.9 \\u00b7 14 trips',owner:'Dana',specs:['Electric','5 seats']}}
};
window.__study=api;
try{Object.defineProperty(window,'__nav',{set:function(u){api.nav(String(u),null)},configurable:true})}catch(e){}
window.addEventListener('click',function(e){
 if(e.defaultPrevented)return;
 var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;
 var h=a.getAttribute('href')||'';e.preventDefault();
 if(h===''||h.charAt(0)==='#'){api.nav('#',a);return}
 if(/^(mailto|tel):/i.test(h)){api.nav('external:'+h.split(':')[0].toLowerCase(),a);return}
 if(/^https?:/i.test(h)){api.nav('external:web',a);return}
 api.nav(h,a);
});
window.addEventListener('submit',function(e){var f=e.target;if(e.defaultPrevented||!f.getAttribute('action'))return;e.preventDefault();api.nav(f.getAttribute('action'),f)});
})();`;

const FONTS = '<link rel="stylesheet" href="/fonts/fonts.css">';

export function buildSrcdoc(html: string, query = '') {
  const qs = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  const inject =
    `<script>window.__qs=${JSON.stringify(qs)};</script>` +
    `<script>${BRIDGE}</script>` +
    FONTS +
    `<style>${STUDY_CSS}</style>`;
  return fillTokens(html).replace(/<head>/i, `<head>${inject}`);
}

/** Parse a screen's link target into a signal, e.g. "nav:onboarding?id=progress". */
export function navSignal(href: string): { signal: string; slug: string; query: string } {
  if (href === '#' || href.startsWith('external:')) return { signal: href === '#' ? 'nav:#' : `nav:${href}`, slug: href, query: '' };
  let u = href;
  let q = '';
  const h = u.indexOf('#');
  if (h > -1) u = u.slice(0, h);
  const i = u.indexOf('?');
  if (i > -1) {
    q = u.slice(i + 1);
    u = u.slice(0, i);
  }
  try {
    u = decodeURIComponent(u);
  } catch {
    /* keep raw */
  }
  const slug = u.replace(/^\.\//, '').split('/').pop()!.replace(/\.html$/, '');
  return { signal: `nav:${slug}${q ? `?${q}` : ''}`, slug, query: q };
}

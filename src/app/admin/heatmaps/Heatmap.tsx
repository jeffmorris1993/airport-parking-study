'use client';

import { useEffect, useRef, useState } from 'react';
import { buildSrcdoc, loadScreen } from '@/lib/client/screens';
import { BarList, Card } from '@/components/admin/ui';

type Click = { x: number; y: number; w: number; t: string; label: string | null; pin?: 'top' | 'bottom' | null; pinOffset?: number | null };
type Data = { clicks: Click[]; scroll: number[]; visits: number; topTargets: [string, { count: number; dead: number; rage: number }][] };

/** Widths the prototype renders at in each bucket; must match HEATMAP_WIDTH on the server. */
const WIDTH = { phone: 390, desktop: 1280 } as const;
const BASE_HEIGHT = { phone: 844, desktop: 900 } as const;
/** The preview is scaled down to fit this column; the canvas scales with it, so taps stay aligned. */
const MAX_PREVIEW_W = 430;

/** Sequential single-hue ramp (light → dark orange); low density stays nearly transparent. */
function colorize(alpha: number) {
  const stops = [
    [0.0, [253, 216, 186, 0]],
    [0.25, [250, 166, 118, 150]],
    [0.6, [227, 106, 46, 200]],
    [1.0, [156, 54, 8, 235]],
  ] as const;
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (alpha <= p1) {
      const t = (alpha - p0) / (p1 - p0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return stops[stops.length - 1][1] as unknown as number[];
}

export function Heatmap({ screens, initial }: { screens: { id: string; title: string }[]; initial: string }) {
  const [screen, setScreen] = useState(initial);
  const [layout, setLayout] = useState<'phone' | 'desktop'>('phone');
  const [mode, setMode] = useState<'heat' | 'dots'>('heat');
  const [data, setData] = useState<Data | null>(null);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [height, setHeight] = useState<number>(BASE_HEIGHT.phone);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const width = WIDTH[layout];
  const scale = Math.min(1, MAX_PREVIEW_W / width);

  useEffect(() => {
    setData(null);
    fetch(`/admin/api/heatmap?screen=${screen}&layout=${layout}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ clicks: [], scroll: [], visits: 0, topTargets: [] }));
  }, [screen, layout]);

  useEffect(() => {
    setSrcdoc(null);
    setHeight(BASE_HEIGHT[layout]);
    loadScreen(screen).then((h) => setSrcdoc(buildSrcdoc(h)));
    const u = new URL(window.location.href);
    u.searchParams.set('screen', screen);
    window.history.replaceState(null, '', u.toString());
  }, [screen, layout]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // Let fonts and layout settle, then size the frame to the full page.
    setTimeout(() => setHeight(Math.max(BASE_HEIGHT[layout], doc.documentElement.scrollHeight)), 400);
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !data) return;
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    // Taps on pinned bars are drawn on the bar as it appears in this preview (bottom bars sit at the page bottom here).
    const pts = data.clicks.map((p) => ({
      ...p,
      x: p.x * (width / (p.w || width)),
      y: p.pin === 'bottom' && p.pinOffset ? height - p.pinOffset : p.pin === 'top' && p.pinOffset ? p.pinOffset : p.y,
    }));
    if (mode === 'dots') {
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        if (p.t === 'dead_click') {
          ctx.strokeStyle = '#0a1a36';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = p.t === 'rage_click' ? 'rgba(156,54,8,.9)' : 'rgba(227,106,46,.75)';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      return;
    }
    // Density: accumulate soft circles in alpha, then map alpha through the ramp.
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const o = off.getContext('2d')!;
    const r = 28;
    for (const p of pts.filter((q) => q.t !== 'rage_click')) {
      const g = o.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g;
      o.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    const img = o.getImageData(0, 0, width, height);
    let max = 0;
    for (let i = 3; i < img.data.length; i += 4) max = Math.max(max, img.data[i]);
    if (!max) return;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3] / max;
      const [cr, cg, cb, ca] = colorize(a);
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = a < 0.02 ? 0 : ca;
    }
    ctx.putImageData(img, 0, 0);
  }, [data, height, mode, width]);

  const reach = [25, 50, 75, 100].map((t) => ({
    label: `Saw ${t}% of the screen`,
    value: data ? data.scroll.filter((s) => s >= t).length : 0,
  }));
  const clicks = data?.clicks.filter((c) => c.t !== 'rage_click').length ?? 0;
  const dead = data?.clicks.filter((c) => c.t === 'dead_click').length ?? 0;
  const rage = data?.clicks.filter((c) => c.t === 'rage_click').length ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[14px] font-medium">
          Screen
          <select className="field min-h-[42px] w-auto py-2" value={screen} onChange={(e) => setScreen(e.target.value)}>
            {screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-xl border border-line bg-surface p-1 text-[13.5px]" role="group" aria-label="Layout">
          {(['phone', 'desktop'] as const).map((l) => (
            <button key={l} onClick={() => setLayout(l)} aria-pressed={layout === l} className={`rounded-lg px-3 py-1.5 font-medium capitalize ${layout === l ? 'bg-accent-soft text-accent-dark' : 'text-ink2'}`}>
              {l} layout
            </button>
          ))}
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-1 text-[13.5px]" role="group" aria-label="View">
          {(['heat', 'dots'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-lg px-3 py-1.5 font-medium ${mode === m ? 'bg-accent-soft text-accent-dark' : 'text-ink2'}`}>
              {m === 'heat' ? 'Density' : 'Each tap'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Rendered at the layout's real width, then scaled to fit the column. Scaling the
            wrapper keeps the iframe and the canvas in register. */}
        <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
          <div
            className="relative overflow-hidden rounded-[22px] border border-line bg-bg shadow-card"
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {srcdoc && (
              <iframe ref={frame} srcDoc={srcdoc} onLoad={onLoad} title="Screen preview" className="pointer-events-none absolute inset-0 border-0" style={{ width, height }} tabIndex={-1} />
            )}
            <canvas ref={canvas} className="pointer-events-none absolute inset-0" style={{ width, height }} aria-label={`${clicks} taps drawn over the screen`} />
          </div>
        </div>
        <div className="grid content-start gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Taps', clicks],
              ['Dead taps', dead],
              ['Rage taps', rage],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="text-[12.5px] text-ink2">{l}</div>
                <div className="mt-1 text-[26px] font-semibold tabular-nums leading-none">{v}</div>
              </div>
            ))}
          </div>
          <Card title="Most-tapped elements">
            <BarList
              rows={(data?.topTargets || []).map(([label, v]) => ({ label, value: v.count, hint: v.dead ? `${v.dead} dead taps` : undefined }))}
              empty="No taps recorded on this screen yet."
            />
          </Card>
          <Card title={`How far people scrolled (${data?.visits ?? 0} visits)`}>
            <BarList rows={reach} total={data?.visits || 0} empty="No visits yet." />
          </Card>
          <p className="text-[12.5px] text-ink3">
            The prototype is responsive, so each tap is filed by the width it was actually taken at: under 1024px is the phone layout, 1024px and up the desktop one. Phones and
            tablets both land in “phone layout”. Generated demo data is recorded at 390px, so the desktop layout stays empty until real wide-window sessions come in.
            The screen is shown in its starting state. Taps made after it changed (for example, after turning on renting) still appear at the position they happened.
            In “Each tap”, outlined rings are dead taps and dark dots are rage taps.
          </p>
        </div>
      </div>
    </div>
  );
}

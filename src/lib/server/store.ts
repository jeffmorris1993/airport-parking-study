import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EventFilter,
  EventRow,
  InterviewContact,
  Participant,
  ReplayChunk,
  ResponseRow,
} from './types';

/**
 * One storage interface, two backends:
 *  - Supabase (production, Vercel)
 *  - Local JSON files in ./.data (development and automated tests only)
 */
export interface Store {
  kind: 'supabase' | 'local';
  createParticipant(p: Participant): Promise<void>;
  getParticipant(id: string): Promise<Participant | null>;
  getParticipantByCode(code: string): Promise<Participant | null>;
  updateParticipant(id: string, patch: Partial<Participant>): Promise<void>;
  listParticipants(): Promise<Participant[]>;
  upsertResponses(rows: ResponseRow[]): Promise<void>;
  listResponses(participantId?: string): Promise<ResponseRow[]>;
  insertEvents(rows: EventRow[]): Promise<void>;
  listEvents(f?: EventFilter): Promise<EventRow[]>;
  putReplay(chunk: ReplayChunk, body: Uint8Array): Promise<void>;
  listReplayChunks(participantId: string): Promise<ReplayChunk[]>;
  getReplay(storagePath: string): Promise<Uint8Array | null>;
  addInterviewContact(c: InterviewContact): Promise<void>;
  listInterviewContacts(): Promise<InterviewContact[]>;
  isAdminEmail(email: string): Promise<boolean>;
  /** Remove a participant everywhere: answers, events, contact details, and replay files. */
  deleteParticipant(id: string): Promise<void>;
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = supabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else if (localStoreAllowed()) {
    cached = localStore();
  } else {
    throw new Error(
      'Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or STUDY_LOCAL_STORE=1 for local development.',
    );
  }
  return cached;
}

export function localStoreAllowed() {
  // Never on Vercel: local files there are temporary and /admin would open without a login.
  return process.env.STUDY_LOCAL_STORE === '1' && !process.env.VERCEL;
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

const PAGE = 1000;
const REPLAY_BUCKET = 'replays';

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, cap = 200_000) {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

function supabaseStore(db: SupabaseClient): Store {
  const must = <T>(r: { data: T; error: unknown }) => {
    if (r.error) throw r.error;
    return r.data;
  };
  return {
    kind: 'supabase',
    async createParticipant(p) {
      must(await db.from('participants').insert(p));
    },
    async getParticipant(id) {
      return must(await db.from('participants').select('*').eq('id', id).maybeSingle()) as Participant | null;
    },
    async getParticipantByCode(code) {
      return must(await db.from('participants').select('*').eq('code', code).maybeSingle()) as Participant | null;
    },
    async updateParticipant(id, patch) {
      must(await db.from('participants').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
    },
    async listParticipants() {
      return all<Participant>((a, b) => db.from('participants').select('*').order('created_at').range(a, b));
    },
    async upsertResponses(rows) {
      if (!rows.length) return;
      must(await db.from('responses').upsert(rows, { onConflict: 'participant_id,question_id,journey' }));
    },
    async listResponses(participantId) {
      return all<ResponseRow>((a, b) => {
        let q = db.from('responses').select('*').order('answered_at').range(a, b);
        if (participantId) q = q.eq('participant_id', participantId);
        return q;
      });
    },
    async insertEvents(rows) {
      if (!rows.length) return;
      must(
        await db
          .from('events')
          .upsert(rows, { onConflict: 'participant_id,session_id,seq', ignoreDuplicates: true }),
      );
    },
    async listEvents(f = {}) {
      return all<EventRow>((a, b) => {
        let q = db.from('events').select('*').order('client_ts').range(a, b);
        if (f.participantId) q = q.eq('participant_id', f.participantId);
        if (f.types?.length) q = q.in('type', f.types);
        if (f.screenId) q = q.eq('screen_id', f.screenId);
        return q;
      }, f.limit ?? 200_000);
    },
    async putReplay(chunk, body) {
      const up = await db.storage.from(REPLAY_BUCKET).upload(chunk.storage_path, body, {
        contentType: 'application/octet-stream',
        upsert: true,
      });
      if (up.error) throw up.error;
      must(await db.from('replay_chunks').upsert(chunk, { onConflict: 'participant_id,session_id,idx' }));
    },
    async listReplayChunks(participantId) {
      return must(
        await db
          .from('replay_chunks')
          .select('*')
          .eq('participant_id', participantId)
          .order('started_at')
          .order('idx'),
      ) as ReplayChunk[];
    },
    async getReplay(storagePath) {
      const { data, error } = await db.storage.from(REPLAY_BUCKET).download(storagePath);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async addInterviewContact(c) {
      must(await db.from('interview_contacts').upsert(c, { onConflict: 'participant_id' }));
    },
    async listInterviewContacts() {
      return must(await db.from('interview_contacts').select('*').order('created_at')) as InterviewContact[];
    },
    async deleteParticipant(id) {
      const chunks = (await db.from('replay_chunks').select('storage_path').eq('participant_id', id)).data || [];
      const paths = chunks.map((c: { storage_path: string }) => c.storage_path);
      for (let i = 0; i < paths.length; i += 100) {
        const r = await db.storage.from(REPLAY_BUCKET).remove(paths.slice(i, i + 100));
        if (r.error) throw r.error;
      }
      // Answers, events, replay rows and contact details cascade from the participant row.
      must(await db.from('participants').delete().eq('id', id));
    },
    async isAdminEmail(email) {
      const e = email.toLowerCase();
      if (envAdmins().includes(e)) return true;
      const r = await db.from('admin_users').select('email').eq('email', e).maybeSingle();
      return !!r.data;
    },
  };
}

export function envAdmins() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Local JSON files (development / tests)                              */
/* ------------------------------------------------------------------ */

function localStore(): Store {
  const dir = path.join(process.cwd(), '.data');
  const file = (n: string) => path.join(dir, n);
  let chain: Promise<unknown> = Promise.resolve();
  // Serialize writes so concurrent requests can't clobber each other.
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  async function read<T>(n: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file(n), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }
  async function write(n: string, data: unknown) {
    await fs.mkdir(dir, { recursive: true });
    const tmp = file(`${n}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, file(n));
  }
  async function readLines<T>(n: string): Promise<T[]> {
    try {
      const txt = await fs.readFile(file(n), 'utf8');
      return txt.split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);
    } catch {
      return [];
    }
  }
  const seen = new Set<string>();
  let seenLoaded = false;

  return {
    kind: 'local',
    createParticipant: (p) =>
      locked(async () => {
        const ps = await read<Participant[]>('participants.json', []);
        ps.push(p);
        await write('participants.json', ps);
      }),
    async getParticipant(id) {
      return (await read<Participant[]>('participants.json', [])).find((p) => p.id === id) ?? null;
    },
    async getParticipantByCode(code) {
      return (await read<Participant[]>('participants.json', [])).find((p) => p.code === code) ?? null;
    },
    updateParticipant: (id, patch) =>
      locked(async () => {
        const ps = await read<Participant[]>('participants.json', []);
        const i = ps.findIndex((p) => p.id === id);
        if (i >= 0) ps[i] = { ...ps[i], ...patch, updated_at: new Date().toISOString() };
        await write('participants.json', ps);
      }),
    listParticipants: () => read<Participant[]>('participants.json', []),
    upsertResponses: (rows) =>
      locked(async () => {
        const rs = await read<ResponseRow[]>('responses.json', []);
        for (const r of rows) {
          const i = rs.findIndex(
            (x) => x.participant_id === r.participant_id && x.question_id === r.question_id && x.journey === r.journey,
          );
          if (i >= 0) rs[i] = r;
          else rs.push(r);
        }
        await write('responses.json', rs);
      }),
    async listResponses(pid) {
      const rs = await read<ResponseRow[]>('responses.json', []);
      return pid ? rs.filter((r) => r.participant_id === pid) : rs;
    },
    insertEvents: (rows) =>
      locked(async () => {
        if (!seenLoaded) {
          for (const e of await readLines<EventRow>('events.jsonl')) seen.add(`${e.participant_id}|${e.session_id}|${e.seq}`);
          seenLoaded = true;
        }
        const fresh = rows.filter((e) => {
          const k = `${e.participant_id}|${e.session_id}|${e.seq}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (!fresh.length) return;
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(file('events.jsonl'), fresh.map((e) => JSON.stringify(e)).join('\n') + '\n');
      }),
    async listEvents(f = {}) {
      let es = await readLines<EventRow>('events.jsonl');
      if (f.participantId) es = es.filter((e) => e.participant_id === f.participantId);
      if (f.types?.length) es = es.filter((e) => f.types!.includes(e.type));
      if (f.screenId) es = es.filter((e) => e.screen_id === f.screenId);
      es.sort((a, b) => a.client_ts.localeCompare(b.client_ts));
      return f.limit ? es.slice(0, f.limit) : es;
    },
    putReplay: (chunk, body) =>
      locked(async () => {
        const p = file(path.join('replays', chunk.storage_path));
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, body);
        const cs = await read<ReplayChunk[]>('replay_chunks.json', []);
        const i = cs.findIndex(
          (c) => c.participant_id === chunk.participant_id && c.session_id === chunk.session_id && c.idx === chunk.idx,
        );
        if (i >= 0) cs[i] = chunk;
        else cs.push(chunk);
        await write('replay_chunks.json', cs);
      }),
    async listReplayChunks(pid) {
      const cs = await read<ReplayChunk[]>('replay_chunks.json', []);
      return cs
        .filter((c) => c.participant_id === pid)
        .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.idx - b.idx);
    },
    async getReplay(storagePath) {
      const safe = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, '');
      try {
        return new Uint8Array(await fs.readFile(file(path.join('replays', safe))));
      } catch {
        return null;
      }
    },
    addInterviewContact: (c) =>
      locked(async () => {
        const cs = (await read<InterviewContact[]>('interview_contacts.json', [])).filter(
          (x) => x.participant_id !== c.participant_id,
        );
        cs.push(c);
        await write('interview_contacts.json', cs);
      }),
    listInterviewContacts: () => read<InterviewContact[]>('interview_contacts.json', []),
    async isAdminEmail() {
      return true;
    },
    deleteParticipant: (id) =>
      locked(async () => {
        await fs.rm(file(path.join('replays', id)), { recursive: true, force: true });
        const keep = <T extends { participant_id?: string; id?: string }>(xs: T[]) => xs.filter((x) => (x.participant_id ?? x.id) !== id);
        await write('participants.json', keep(await read<Participant[]>('participants.json', [])));
        await write('responses.json', keep(await read<ResponseRow[]>('responses.json', [])));
        await write('replay_chunks.json', keep(await read<ReplayChunk[]>('replay_chunks.json', [])));
        await write('interview_contacts.json', keep(await read<InterviewContact[]>('interview_contacts.json', [])));
        const events = (await readLines<EventRow>('events.jsonl')).filter((e) => e.participant_id !== id);
        await fs.writeFile(file('events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
        seenLoaded = false;
        seen.clear();
      }),
  };
}

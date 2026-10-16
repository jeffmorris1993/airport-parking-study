export type ParticipantStatus =
  | 'consented'
  | 'screened_out'
  | 'surveyed'
  | 'in_journey'
  | 'completed'
  | 'abandoned';

export type Participant = {
  id: string;
  code: string;
  ref_code: string | null;
  status: ParticipantStatus;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  qualified_owner: boolean | null;
  qualified_renter: boolean | null;
  screen_out_reason: string | null;
  journey_order: string[] | null;
  last_step: string | null;
  device: string | null;
  user_agent: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  timezone: string | null;
  utm: Record<string, string> | null;
  /** Client flow state, used to resume on another visit. */
  state: Record<string, unknown> | null;
};

export type ResponseRow = {
  participant_id: string;
  phase: 'screener' | 'survey' | 'checkpoint' | 'behavior' | 'wrapup';
  question_id: string;
  journey: string;
  step_id: string | null;
  value: unknown;
  ms_to_answer: number | null;
  change_count: number;
  answered_at: string;
};

export type EventRow = {
  participant_id: string;
  session_id: string;
  seq: number;
  client_ts: string;
  received_at?: string;
  journey: string | null;
  step_id: string | null;
  screen_id: string | null;
  type: string;
  element_id: string | null;
  label: string | null;
  x: number | null;
  y: number | null;
  doc_w: number | null;
  doc_h: number | null;
  vw: number | null;
  vh: number | null;
  meta: Record<string, unknown> | null;
};

export type ReplayChunk = {
  participant_id: string;
  session_id: string;
  idx: number;
  storage_path: string;
  started_at: string;
  bytes: number;
};

export type InterviewContact = {
  participant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  best_time: string | null;
  persona: string;
  created_at: string;
};

export type EventFilter = {
  participantId?: string;
  types?: string[];
  screenId?: string;
  limit?: number;
};

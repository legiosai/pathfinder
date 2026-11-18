// The tools the model answers with, and the validation of what it sends through them. Nothing
// goes back to the model: each valid call becomes one SSE event for the page. With eager input
// streaming the API does not check tool input against the schema, so every field is checked here.

import type Anthropic from '@anthropic-ai/sdk';
import { isObject, oneLine, shorten, validatePicks } from './picks';
import type { Experience, Pick, Profile, Roadmap, RoadmapStep } from './sse';

export const TOOL_NAMES = {
  show: 'show_certifications',
  roadmap: 'show_roadmap',
  compare: 'show_comparison',
  replies: 'suggest_replies',
  profile: 'set_profile',
} as const;

export const LIMITS = {
  roadmapSteps: 6,
  maxWeeks: 104,
  noteChars: 160,
  compareMin: 2,
  compareMax: 4,
  replies: 4,
  replyChars: 80,
  leadChars: 400,
  roleChars: 80,
  goalChars: 160,
  maxBudget: 100_000,
  maxHours: 100,
} as const;

const EXPERIENCE: readonly Experience[] = ['new', 'some', 'experienced'];

type Tool = Anthropic.Beta.BetaTool;

const id = { type: 'string', description: 'Exact certification id from the catalog.' } as const;

export const SHOW_TOOL: Tool = {
  name: TOOL_NAMES.show,
  description:
    "Shows certification cards under your reply, each linked to its exam details and any available practice questions. Call it whenever you recommend or offer catalog certifications as options: one to five picks, best fit first. Each why is one short sentence in the person's language on why it fits them.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        description: 'One to five certifications, best fit first.',
        items: {
          type: 'object',
          properties: {
            id,
            why: { type: 'string', description: "One short sentence, in the person's language, on why it fits them." },
            warning: {
              type: 'string',
              description:
                "Optional. One short sentence, in the person's language, when something could stop or surprise them: eligibility rules, an exam not open yet, years of experience required, over their budget, not offered in Spanish when they want that, a version change soon.",
            },
          },
          required: ['id', 'why'],
          additionalProperties: false,
        },
      },
      lead: {
        type: 'string',
        description:
          "One or two sentences to the person, in their language: the best option for them and why. The page shows it only when your reply has no text of its own, so still write your reply before calling this tool.",
      },
    },
    required: ['picks', 'lead'],
    additionalProperties: false,
  },
};

export const ROADMAP_TOOL: Tool = {
  name: TOOL_NAMES.roadmap,
  description:
    'Shows an ordered path of certifications with estimated weeks for each step. Call it when the person asks for an order, a path or a plan over time, or when your picks only make sense in sequence.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      hours_per_week: { type: 'number', description: 'Study hours per week the estimate assumes: what they said, or 5 if they did not say.' },
      steps: {
        type: 'array',
        description: 'Two to six steps, in the order to take them.',
        items: {
          type: 'object',
          properties: {
            id,
            weeks: { type: 'integer', description: "Estimated weeks of study for this step at hours_per_week, from the level's study hours and what they already know." },
            note: { type: 'string', description: "A few words, in the person's language, on what this step gives them." },
          },
          required: ['id', 'weeks', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['hours_per_week', 'steps'],
    additionalProperties: false,
  },
};

export const COMPARE_TOOL: Tool = {
  name: TOOL_NAMES.compare,
  description:
    'Shows a side-by-side table of two to four certifications (price, level, exam, languages, practice questions), built by the site from the catalog. Call it when the person asks to compare or hesitates between options; your text gives the verdict.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      ids: { type: 'array', description: 'Two to four certification ids from the catalog.', items: id },
    },
    required: ['ids'],
    additionalProperties: false,
  },
};

export const REPLIES_TOOL: Tool = {
  name: TOOL_NAMES.replies,
  description:
    "Shows two to four short replies the person can tap to send as their next message. Write them as the person, in their language, a few words each (for example \"Tengo 5 horas por semana\", \"¿Algo más barato?\", \"Armame el camino\").",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      replies: { type: 'array', description: 'Two to four short replies, under 40 characters each.', items: { type: 'string' } },
    },
    required: ['replies'],
    additionalProperties: false,
  },
};

export const PROFILE_TOOL: Tool = {
  name: TOOL_NAMES.profile,
  description:
    'Records facts the person stated about themselves, so the site can keep them for the next messages and prefill its forms. Call it when they tell you any of these; include only what they said. New values replace earlier ones.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Current role or background in a few words, in English (e.g. "backend developer", "student", "help desk").' },
      experience: { type: 'string', enum: [...EXPERIENCE], description: 'Work experience in IT: new (none or under a year), some (1 to 3 years) or experienced (more than 3).' },
      goal: { type: 'string', description: 'What they want, in a few words, in English (e.g. "first job in cybersecurity", "move into AI on AWS").' },
      budget_usd: { type: 'number', description: 'Most they can spend on the exam, in US dollars. 0 when they want only free options.' },
      hours_per_week: { type: 'number', description: 'Hours a week they can study.' },
      prefers_spanish_exam: { type: 'boolean', description: 'True when they want to take the exam in Spanish or say their English is weak.' },
      country: { type: 'string', description: 'Two-letter country code where they live, e.g. AR.' },
    },
    required: [],
    additionalProperties: false,
  },
};

/** In the order the prompt introduces them. Part of the cached prefix: never build it per request. */
export const TOOLS: Tool[] = [SHOW_TOOL, ROADMAP_TOOL, COMPARE_TOOL, REPLIES_TOOL, PROFILE_TOOL];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Keeps the valid fields of a profile and drops the rest. Used for set_profile and for the request. */
export function sanitizeProfile(input: unknown): Profile {
  if (!isObject(input)) return {};
  const out: Profile = {};
  const text = (v: unknown, max: number) => (typeof v === 'string' ? shorten(oneLine(v), max) : '');
  const role = text(input.role, LIMITS.roleChars);
  if (role) out.role = role;
  if (typeof input.experience === 'string' && EXPERIENCE.includes(input.experience as Experience)) out.experience = input.experience as Experience;
  const goal = text(input.goal, LIMITS.goalChars);
  if (goal) out.goal = goal;
  if (finite(input.budget_usd) && input.budget_usd >= 0 && input.budget_usd <= LIMITS.maxBudget) out.budget_usd = Math.round(input.budget_usd);
  if (finite(input.hours_per_week) && input.hours_per_week > 0 && input.hours_per_week <= LIMITS.maxHours) out.hours_per_week = Math.round(input.hours_per_week * 10) / 10;
  if (typeof input.prefers_spanish_exam === 'boolean') out.prefers_spanish_exam = input.prefers_spanish_exam;
  if (typeof input.country === 'string' && /^[A-Za-z]{2}$/.test(input.country.trim())) out.country = input.country.trim().toUpperCase();
  return out;
}

export const isEmptyProfile = (p: Profile) => Object.keys(p).length === 0;

/** Known, distinct ids in order, at most `max`. */
function knownIds(list: unknown, known: ReadonlySet<string>, max: number): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (known.has(value) && !out.includes(value) && out.length < max) out.push(value);
  }
  return out;
}

/** Two to six known steps, in order; weeks rounded into 1-104 or null. Null when fewer than two remain. */
export function validateRoadmap(input: unknown, known: ReadonlySet<string>): Roadmap | null {
  if (!isObject(input) || !Array.isArray(input.steps)) return null;
  const steps: RoadmapStep[] = [];
  for (const item of input.steps) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    const stepId = item.id.trim();
    if (!known.has(stepId) || steps.some((s) => s.id === stepId) || steps.length >= LIMITS.roadmapSteps) continue;
    const weeks = finite(item.weeks) && item.weeks >= 0.5 ? Math.min(LIMITS.maxWeeks, Math.max(1, Math.round(item.weeks))) : null;
    const note = typeof item.note === 'string' ? shorten(oneLine(item.note), LIMITS.noteChars) : '';
    steps.push({ id: stepId, weeks, note });
  }
  if (steps.length < 2) return null;
  const roadmap: Roadmap = { steps };
  const hours = input.hours_per_week;
  if (finite(hours) && hours > 0 && hours <= LIMITS.maxHours) roadmap.hours_per_week = Math.round(hours * 10) / 10;
  return roadmap;
}

/** Two to four known ids, or an empty list. */
export function validateComparison(input: unknown, known: ReadonlySet<string>): string[] {
  const ids = isObject(input) ? knownIds(input.ids, known, LIMITS.compareMax) : [];
  return ids.length >= LIMITS.compareMin ? ids : [];
}

/** Up to four short, distinct, non-empty replies. */
export function validateReplies(input: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of isObject(input) && Array.isArray(input.replies) ? input.replies : []) {
    if (typeof raw !== 'string') continue;
    const reply = oneLine(raw);
    const key = reply.toLowerCase();
    if (!reply || reply.length > LIMITS.replyChars || seen.has(key) || out.length >= LIMITS.replies) continue;
    seen.add(key);
    out.push(reply);
  }
  return out;
}

export interface ToolOutputs {
  picks: Pick[];
  roadmap: Roadmap | null;
  comparison: string[];
  replies: string[];
  profile: Profile | null;
  /** Whether show_certifications was called at all, valid or not. */
  calledShow: boolean;
  /** show_certifications' lead sentence, used only when the reply has no text. */
  lead: string;
  /** Picks, steps or other items that did not pass validation. */
  dropped: number;
}

interface Block {
  type: string;
  name?: string;
  input?: unknown;
}

/**
 * Reads every tool call in the final message (after the last server-side fallback: calls before
 * it belong to the declined attempt). Picks from several show_certifications calls are merged;
 * for the other tools the last valid call stands, and set_profile calls are merged.
 */
export function collectOutputs(content: readonly Block[], known: ReadonlySet<string>): ToolOutputs {
  let start = 0;
  content.forEach((block, i) => {
    if (block.type === 'fallback') start = i + 1;
  });
  const out: ToolOutputs = { picks: [], roadmap: null, comparison: [], replies: [], profile: null, calledShow: false, lead: '', dropped: 0 };
  const picks: unknown[] = [];
  for (const block of content.slice(start)) {
    if (block.type !== 'tool_use') continue;
    const input = block.input;
    switch (block.name) {
      case TOOL_NAMES.show:
        out.calledShow = true;
        if (isObject(input) && Array.isArray(input.picks)) picks.push(...input.picks);
        if (isObject(input) && typeof input.lead === 'string') out.lead = input.lead.trim().slice(0, LIMITS.leadChars);
        break;
      case TOOL_NAMES.roadmap: {
        const roadmap = validateRoadmap(input, known);
        if (roadmap) out.roadmap = roadmap;
        else out.dropped++;
        break;
      }
      case TOOL_NAMES.compare: {
        const ids = validateComparison(input, known);
        if (ids.length) out.comparison = ids;
        else out.dropped++;
        break;
      }
      case TOOL_NAMES.replies: {
        const replies = validateReplies(input);
        if (replies.length) out.replies = replies;
        else out.dropped++;
        break;
      }
      case TOOL_NAMES.profile: {
        const profile = sanitizeProfile(input);
        if (!isEmptyProfile(profile)) out.profile = { ...out.profile, ...profile };
        break;
      }
      default:
        out.dropped++;
    }
  }
  const checked = validatePicks({ picks }, known);
  out.picks = checked.picks;
  out.dropped += checked.dropped;
  return out;
}


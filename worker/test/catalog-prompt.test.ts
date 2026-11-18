import { describe, expect, it, vi } from 'vitest';
import { CAPS, CatalogStore, compactCatalog, compileCatalog, parseCatalog } from '../src/catalog';
import { INSTRUCTIONS, SHOW_TOOL, buildSystemPrompt, toApiMessages } from '../src/prompt';
import { TOOLS } from '../src/tools';
import { fixture } from './helpers';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('compactCatalog', () => {
  it('is deterministic whatever the input order', () => {
    const shuffled = clone(fixture);
    shuffled.certifications.reverse();
    for (const cert of shuffled.certifications) {
      cert.skills.reverse();
      cert.roles.reverse();
      cert.domains.reverse();
    }
    shuffled.taxonomy.skills.reverse();
    shuffled.taxonomy.roles.reverse();
    const a = compactCatalog(parseCatalog(fixture));
    expect(compactCatalog(parseCatalog(shuffled))).toBe(a);
    expect(compactCatalog(parseCatalog(clone(fixture)))).toBe(a);
  });

  it('sorts certifications by id and leaves out volatile fields', () => {
    const text = compactCatalog(parseCatalog(fixture));
    const ids = [...text.matchAll(/^id: (.+)$/gm)].map((m) => m[1]);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toHaveLength(fixture.certifications.length);
    expect(text).not.toContain(fixture.generated_on);
    expect(text).not.toContain('checked_on');
    expect(text).not.toContain('credly.com');
  });

  it('writes the fields the advisor needs', () => {
    const text = compactCatalog(parseCatalog(fixture));
    const block = (id: string) => text.split('\n\n').find((b) => b.startsWith(`id: ${id}\n`))!;

    const clf = block('aws-clf-c02');
    expect(clf).toContain('code: CLF-C02');
    expect(clf).toContain('provider: AWS');
    expect(clf).toContain('level: entry');
    expect(clf).toContain('status: available');
    expect(clf).toContain('fee: USD 100 (Exam only; Fee note (test entry).)');
    expect(clf).toMatch(/exam: knowledge; 90 min; questions: 65 \(50 scored\); format: .*; passing: 700 scaled \(100–1,000\); valid: 3 years$/m);
    expect(clf).toContain('caveats: Caveat (test entry).');
    expect(clf).toMatch(/\nprep: .+ \(official, free\); .+\npractice questions: 34$/);
    expect(clf).not.toContain('type: certification');
    expect(clf).not.toContain('exam languages:');

    expect(block('microsoft-az-900')).toContain('fee: varies (Regional exam price; Microsoft prices by exam country/region;');
    expect(block('claude-architect-professional')).toMatch(/status: restricted\n[\s\S]*requirements: Restricted to Claude Partner Network/);

    // Domains by weight, heaviest first, with their percentages.
    expect(block('nvidia-nca-ads')).toContain('domains: Data Manipulation and Preparation 23%; Machine Learning With RAPIDS 16%; Data Science Pipelines and Workflow Automation 13%; Descriptive Analysis and Visualization 13%;');
    expect(block('nvidia-nca-ads')).toContain('practice questions: 0');

    // Legend from the taxonomy.
    expect(text).toMatch(/^levels: entry = Entry, about 10-25 study hours; /m);
    expect(text).toMatch(/^skills: .*aws = /m);
  });

  it('writes languages, delivery, access, upcoming dates, study paths and regions', () => {
    const text = compactCatalog(parseCatalog(fixture), '2026-11-18');
    const aif = text.split('\n\n').find((b) => b.startsWith('id: aws-aif-c01\n'))!;
    expect(aif).toContain('exam languages: en, es, ja\ndelivery: online, test-center\n');
    expect(aif).toContain('free routes: Free voucher route (test entry). (until 2026-12-31)');
    expect(aif).toContain('discounts: Discount route (test entry).');
    expect(aif).toContain('retake: Retake rule (test entry).');
    expect(aif).toContain('accommodations: Accommodation rule (test entry).');
    // Only what is still ahead of `today`.
    expect(aif).toContain('timeline: 2027-03-01 retires: Future change (test entry).');
    expect(aif).not.toContain('Past change');
    expect(compactCatalog(parseCatalog(fixture), '2027-03-02')).not.toContain('timeline:');
    expect(text).toContain('regions (what paying from there adds to list prices): AR: Region note (test entry).');
    expect(text).toContain('cloud-aws (Cloud on AWS; Cloud & platform): 1) aws-clf-c02: The basics first. 2) aws-aif-c01 or microsoft-az-900: Then AI on AWS.');
    expect(text).not.toContain('Nube en AWS');
    expect(text).not.toContain('https://');
  });

  it('caps long free text', () => {
    const long = clone(fixture);
    long.certifications[2].fee.note = 'word '.repeat(200);
    long.certifications[2].caveats = ['caveat '.repeat(100), 'more'];
    const clf = compactCatalog(parseCatalog(long)).split('\n\n').find((b) => b.startsWith('id: aws-clf-c02\n'))!;
    const line = (key: string) => clf.split('\n').find((l) => l.startsWith(key))!;
    expect(line('fee: ').length).toBeLessThan(CAPS.feeNote + 40);
    expect(line('caveats: ').length).toBeLessThanOrEqual(CAPS.caveats + 'caveats: '.length);
    expect(line('caveats: ').endsWith('…')).toBe(true);
  });

  it('rejects a catalog without certifications or with duplicate ids', () => {
    expect(() => parseCatalog({})).toThrow();
    expect(() => parseCatalog({ certifications: [] })).toThrow();
    const dup = clone(fixture);
    dup.certifications.push(clone(dup.certifications[0]));
    expect(() => parseCatalog(dup)).toThrow(/duplicate/);
  });
});

describe('system prompt and tool', () => {
  it('puts the instructions first and the catalog after them, with nothing volatile', () => {
    const compiled = compileCatalog(fixture);
    expect(compiled.system.startsWith(INSTRUCTIONS)).toBe(true);
    expect(compiled.system).toContain('<catalog>\nlevels: ');
    expect(compiled.system.endsWith('\n</catalog>')).toBe(true);
    expect(compileCatalog(clone(fixture)).system).toBe(compiled.system);
    expect(compiled.count).toBe(5);
    expect(compiled.ids.has('aws-aif-c01')).toBe(true);
  });

  it('is comfortably above the 512-token minimum cacheable prefix', () => {
    // About 4 characters per token in English prose; the instructions alone clear the bar.
    expect(INSTRUCTIONS.length / 4).toBeGreaterThan(512);
    expect(buildSystemPrompt('').length).toBeGreaterThan(INSTRUCTIONS.length);
  });

  it('covers the rules the owner asked for', () => {
    for (const phrase of [
      '"Ask AI" page',
      'only certifications that appear in it',
      'Never invent',
      'Lead with the recommendation',
      'under about 120 words',
      'no markdown',
      'Ask at most one short question',
      'only when their goal is unknown',
      'concrete next step on the site',
      'even when you also ask a question',
      'never call something over it cheap',
      'free routes and discounts',
      'languages include Spanish',
      'exam dumps',
      'out of scope',
      'no emojis',
      'voseo',
      '<profile>',
      'show_certifications',
      'show_roadmap',
      'show_comparison',
      'suggest_replies',
      'set_profile',
    ]) {
      expect(INSTRUCTIONS).toContain(phrase);
    }
    expect(INSTRUCTIONS).not.toContain('small chat panel');
  });

  it('declares strict, eagerly streamed tools with closed schemas', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['show_certifications', 'show_roadmap', 'show_comparison', 'suggest_replies', 'set_profile']);
    for (const tool of TOOLS) {
      expect(tool, tool.name).toMatchObject({ strict: true, eager_input_streaming: true });
      expect(tool.input_schema, tool.name).toMatchObject({ type: 'object', additionalProperties: false });
      for (const [key, prop] of Object.entries(tool.input_schema.properties as Record<string, any>)) {
        if (prop.type === 'array' && prop.items.type === 'object') expect(prop.items.additionalProperties, `${tool.name}.${key}`).toBe(false);
      }
    }
    expect(SHOW_TOOL.input_schema).toMatchObject({ required: ['picks', 'lead'] });
    const items = (SHOW_TOOL.input_schema.properties as any).picks.items;
    expect(items).toMatchObject({ required: ['id', 'why'], additionalProperties: false });
    expect(Object.keys(items.properties)).toEqual(['id', 'why', 'warning']);
  });
});

describe('toApiMessages', () => {
  const known = new Set(['aws-clf-c02', 'aws-aif-c01']);

  it('tags user turns with the interface language and folds shown picks', () => {
    const messages = toApiMessages(
      [
        { role: 'user', content: 'Quiero entrar a cloud' },
        { role: 'assistant', content: 'Arrancá por estas dos. ', picks: ['aws-clf-c02', 'made-up', 'aws-aif-c01', 'aws-clf-c02'] },
        { role: 'user', content: '¿Y cuál primero?' },
      ],
      'es',
      known,
    );
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Quiero entrar a cloud' }, { type: 'text', text: '<ui_language>es</ui_language>' }] },
      { role: 'assistant', content: 'Arrancá por estas dos.\n\n[Shown: aws-clf-c02, aws-aif-c01]' },
      { role: 'user', content: [{ type: 'text', text: '¿Y cuál primero?' }, { type: 'text', text: '<ui_language>es</ui_language>' }] },
    ]);
  });

  it('never sends an empty assistant turn', () => {
    const [, reply] = toApiMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: '  ' }, { role: 'user', content: 'b' }], 'en', known);
    expect(reply).toEqual({ role: 'assistant', content: '(no reply)' });
    const [, cards] = toApiMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: '', picks: ['aws-aif-c01'] }, { role: 'user', content: 'b' }], 'en', known);
    expect(cards).toEqual({ role: 'assistant', content: '[Shown: aws-aif-c01]' });
  });

  it('puts the profile on the last user message only, after the language', () => {
    const profile = { role: 'backend developer', hours_per_week: 5 };
    const messages = toApiMessages(
      [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'r1' },
        { role: 'user', content: 'q2' },
      ],
      'es',
      known,
      profile,
    );
    expect(messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'q1' }, { type: 'text', text: '<ui_language>es</ui_language>' }] });
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'q2' },
        { type: 'text', text: '<ui_language>es</ui_language>' },
        { type: 'text', text: '<profile>{"role":"backend developer","hours_per_week":5}</profile>' },
      ],
    });
    expect(toApiMessages([{ role: 'user', content: 'a' }], 'en', known, {})[0].content).toHaveLength(2);
  });

  it('renders earlier turns the same way on every request', () => {
    const history = [
      { role: 'user' as const, content: 'q1' },
      { role: 'assistant' as const, content: 'r1', picks: ['aws-aif-c01'] },
      { role: 'user' as const, content: 'q2' },
    ];
    const first = toApiMessages(history.slice(0, 1), 'en', known);
    const later = toApiMessages(history, 'en', known);
    expect(later.slice(0, 1)).toEqual(first);
  });
});

describe('CatalogStore', () => {
  const ok = () => new Response(JSON.stringify(fixture));

  function store(fetchImpl: () => Promise<Response>, extra: Partial<ConstructorParameters<typeof CatalogStore>[0]> = {}) {
    let now = 1_000_000;
    const fetchMock = vi.fn(fetchImpl);
    const s = new CatalogStore({ url: 'https://pathfinder.test/catalog.json', fetch: fetchMock as unknown as typeof fetch, now: () => now, ...extra });
    return { s, fetchMock, advance: (ms: number) => (now += ms) };
  }

  it('keeps the catalog in memory for ten minutes and shares concurrent loads', async () => {
    const { s, fetchMock, advance } = store(async () => ok());
    const [a, b] = await Promise.all([s.get(), s.get()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advance(9 * 60 * 1000);
    await s.get();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advance(2 * 60 * 1000);
    await s.get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the last good copy when the site is down, and retries a minute later', async () => {
    let up = true;
    const { s, fetchMock, advance } = store(async () => (up ? ok() : new Response('down', { status: 502 })));
    const good = await s.get();
    up = false;
    advance(11 * 60 * 1000);
    expect(await s.get()).toBe(good);
    expect(await s.get()).toBe(good);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    advance(61 * 1000);
    await s.get();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails when there is no copy at all', async () => {
    const { s } = store(async () => new Response('nope', { status: 404 }));
    await expect(s.get()).rejects.toThrow(/404/);
    const bad = store(async () => new Response('{"certifications": []}'));
    await expect(bad.s.get()).rejects.toThrow();
  });

  it('reads and fills the Cache API', async () => {
    const entries = new Map<string, Response>();
    const cache = {
      match: async (key: string) => entries.get(key)?.clone(),
      put: async (key: string, res: Response) => void entries.set(key, res),
    } as unknown as Cache;
    const first = store(async () => ok(), { cache });
    await first.s.get();
    expect(first.fetchMock).toHaveBeenCalledTimes(1);
    expect(entries.get('https://pathfinder.test/catalog.json')?.headers.get('cache-control')).toBe('max-age=600');

    // A fresh isolate finds it in the cache and never reaches the site.
    const second = store(async () => ok(), { cache });
    expect((await second.s.get()).count).toBe(5);
    expect(second.fetchMock).not.toHaveBeenCalled();
  });
});

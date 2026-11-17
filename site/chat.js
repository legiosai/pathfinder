// The chat on the home view: say what you are after in your own words and get an answer with a few
// certifications. Messages go to pathfinder's endpoint (POST <API>/chat), which answers with Claude
// as server-sent events. lib/chat.js holds the rules (request, fallback, storage, text) and
// lib/sse.js reads the stream.
//
// When the endpoint cannot answer (offline, too slow, rate limited, turned off), lib/intent.js reads
// the conversation on the device and answers instead, and the answer says so. The transcript is kept
// in this browser so it survives a reload; "New chat" clears it.
//
// app.js mounts it with the catalog, a few of its rendering helpers (so picks look like the rest of
// the app) and a callback that opens the "For me" form prefilled.

import { FIRST_BYTE_MS, STALL_MS, decide, formatText, fromStore, paused, resolveApi, secondsLeft, toRequest, toStore, userText } from './lib/chat.js';
import { json, readEvents } from './lib/sse.js';
import { parseIntent, recommend } from './lib/intent.js';
import { rank } from './lib/match.js';
import { estimateHours } from './lib/planner.js';
import { t, getLang, label, lib } from './i18n.js';
import { badge, providerColor } from './visuals.js';

// The build writes CHAT_API from scripts/site.mjs here.
const API = 'https://pathfinder-api.legios.com.ar';
const KEYS = { chat: 'pathfinder:chat', api: 'pathfinder:chat-api', old: 'pathfinder:describe' };
const PICKS = 4; // certifications the on-device matcher shows with one answer
const AI_PICKS = 5; // and the most taken from the endpoint

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Storage is a convenience: it can be missing or blocked and the chat still works.
const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null || value === '') localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* not saved this visit */
    }
  },
};

/** The endpoint for this page: the build's, or a development one from ?chat= (see lib/chat.js). */
function endpoint() {
  let param = null;
  try {
    param = new URLSearchParams(location.search).get('chat');
  } catch {
    /* no location */
  }
  const { api, save } = resolveApi({ param, saved: store.get(KEYS.api) || '', page: location.hostname, fallback: API });
  if (save !== undefined) store.set(KEYS.api, save);
  if (param !== null) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('chat');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {
      /* the address keeps it */
    }
  }
  return api;
}

export function mountChat({ data, helpers, onRefine }) {
  const { icon, lvl, fee, flag } = helpers;
  const $ = (sel) => document.querySelector(sel);
  const root = $('#chat');
  const log = $('#chat-log');
  const form = $('#chat-form');
  const box = $('#chat-input');
  const send = $('#chat-send');
  const fresh = $('#chat-new');
  const status = $('#chat-status');
  const count = $('#chat-count');
  const dev = $('#chat-dev');
  if (!root || !log || !form || !box || !send) return { localize() {} };

  const certs = data.certifications;
  const byId = new Map(certs.map((c) => [c.id, c]));
  const tx = data.taxonomy;
  const levelHours = Object.fromEntries(tx.levels.map((l) => [l.id, l.hours]));
  const api = endpoint();

  let messages = [];
  let busy = null; // { controller, cause } while an answer streams in
  let pause = null; // { reason, until }: new messages skip the endpoint until then
  let ticker = null;
  let frame = 0;

  const saved = fromStore(store.get(KEYS.chat));
  messages = saved.messages;
  if (saved.draft) box.value = saved.draft;
  store.set(KEYS.old, null); // the "Describe what you want" box this chat replaced
  const save = () => store.set(KEYS.chat, messages.length ? toStore(messages.filter((m) => !m.live)) : null);

  // ---------- the on-device matcher ----------

  const labels = () => {
    const map = {};
    for (const group of ['levels', 'statuses', 'styles', 'roles', 'skills']) for (const x of tx[group]) map[x.id] = label(group, x);
    for (const c of certs) {
      const name = t(`cat.${c.category}`);
      map[c.category] = name === `cat.${c.category}` ? c.category : name;
    }
    return map;
  };
  const readAll = () => parseIntent(userText(messages.filter((m) => !m.live)), { certs });

  /** Fill `msg` with the matcher's answer to everything the person has written so far. */
  function answerHere(msg) {
    const intent = readAll();
    msg.source = 'local';
    delete msg.picks;
    if (!intent.signals.length) msg.key = 'chat.local.more';
    else {
      const names = labels();
      const ranked = rank(certs, intent.profile, names);
      const { picks } = recommend(certs, ranked, intent, { limit: PICKS, labels: names, estimate: (c) => estimateHours(c, intent.profile, levelHours).hours });
      msg.key = picks.length ? 'chat.picks' : 'chat.local.none';
      // The reasons stay in English here, as lib/intent.js writes them, and are translated when shown.
      if (picks.length) msg.picks = picks.map((p) => ({ id: p.id, why: p.reasons[0] || '' }));
    }
    msg.content = t(msg.key);
  }

  // ---------- rendering ----------

  function pickRow(p, local) {
    const c = byId.get(p.id);
    if (!c) return '';
    const id = esc(c.id);
    const name = `<span class="sr">: ${esc(c.name)}</span>`;
    const why = local ? lib(p.why) : p.why;
    return `<li class="c-pick" style="--pc:${providerColor(c.provider)}">
      <a class="c-badge" href="#cert?id=${id}" tabindex="-1" aria-hidden="true">${badge(c, 40, { label: false })}</a>
      <p class="c-name">${esc(c.name)}</p>
      <p class="c-meta"><span>${esc(c.provider)} · ${esc(c.code)}</span>${lvl(c.level)}<span>${esc(fee(c))}</span>${flag(c)}</p>
      ${why ? `<p class="c-why">${esc(why)}</p>` : ''}
      <p class="c-links"><a href="#cert?id=${id}">${icon('info')}${t('chat.details')}${name}</a><a href="#plan?cert=${id}">${icon('route')}${t('chat.plan')}${name}</a>${
        c.practice_questions ? `<a href="#practice?cert=${id}">${icon('dumbbell')}${t('chat.practice')}${name}</a>` : ''
      }</p>
    </li>`;
  }

  function retryButton(m) {
    const left = secondsLeft(m.retryAt);
    const text = left ? t('chat.retryIn', { n: left }) : m.source === 'local' ? t('chat.retry') : t('chat.tryAgain');
    return `<button type="button" class="link" data-act="retry"${m.retryAt ? ` data-at="${m.retryAt}"` : ''}${left ? ' disabled' : ''}>${icon('refresh-cw')}<span>${text}</span></button>`;
  }

  // An answer from the on-device matcher says so first, where it is seen with the question, and
  // offers the AI again; an AI answer that ended early says so where it stopped.
  function head(m, last) {
    if (m.source !== 'local' || !m.reason) return '';
    return `<div class="msg-foot msg-head"><span class="msg-note">${icon('info')}<span>${t('chat.local', { why: t(`chat.why.${m.reason}`) })}</span></span>${last && m.retry ? retryButton(m) : ''}</div>`;
  }

  function foot(m, last, refine) {
    const parts = [];
    if (m.source !== 'local' && m.reason) parts.push(`<span class="msg-note">${t(`chat.end.${m.reason}`)}</span>`);
    if (m.source !== 'local' && last && m.retry) parts.push(retryButton(m));
    if (refine) parts.push(`<button type="button" class="link" data-act="refine">${icon('sliders-horizontal')}<span>${t('chat.refine')}</span></button>`);
    return parts.length ? `<div class="msg-foot">${parts.join('')}</div>` : '';
  }

  function bubble(m, i, refineAt) {
    if (m.role === 'user') return `<li class="msg me"><span class="sr">${t('chat.you')}: </span>${esc(m.content)}</li>`;
    const text = m.key ? t(m.key) : m.content;
    const body = m.live && !m.content ? `<span class="typing" role="img" aria-label="${esc(t('chat.writing'))}"><i></i><i></i><i></i></span>` : formatText(text);
    const picks = (m.picks || []).map((p) => pickRow(p, m.source === 'local')).join('');
    return `<li class="msg bot${m.live ? ' live' : ''}">${m.live ? '' : head(m, i === messages.length - 1)}<div class="msg-text">${body}</div>${
      picks ? `<ol class="c-picks" aria-label="${esc(t('chat.picksLabel'))}">${picks}</ol>` : ''
    }${m.live ? '' : foot(m, i === messages.length - 1, i === refineAt)}</li>`;
  }

  function render() {
    cancelAnimationFrame(frame);
    frame = 0;
    // "Fine-tune in For me" goes with the latest answer that has picks, when the text names a topic.
    let refineAt = -1;
    const lastPicks = messages.findLastIndex((m) => m.role === 'assistant' && m.picks?.length && !m.live);
    if (lastPicks >= 0 && lastPicks === messages.findLastIndex((m) => m.role === 'assistant') && readAll().topical) refineAt = lastPicks;
    log.innerHTML = `<li class="msg bot"><div class="msg-text"><p>${esc(t('chat.hello'))}</p></div></li>${messages.map((m, i) => bubble(m, i, refineAt)).join('')}`;
    fresh.hidden = !messages.length;
    setTicker();
    edge();
  }

  // While text streams in, only the answer being written is redrawn, once per frame.
  function paint(msg) {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const following = isFollowing();
      const el = log.lastElementChild?.querySelector('.msg-text');
      if (el) el.innerHTML = formatText(msg.content);
      if (following) follow();
      else edge();
    });
  }

  // The transcript follows a new answer down until the question above it reaches the top; from there
  // the answer is read from its start. Scrolling away stops the following.
  let followed = -1;
  const isFollowing = () => Math.abs(log.scrollTop - followed) < 4 || log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  function follow() {
    const question = log.lastElementChild?.previousElementSibling;
    const bottom = log.scrollHeight - log.clientHeight;
    log.scrollTop = question ? Math.min(bottom, question.offsetTop - 4) : bottom;
    followed = log.scrollTop;
    edge();
  }
  const edge = () => {
    log.classList.toggle('above', log.scrollTop > 4);
    log.classList.toggle('more', log.scrollHeight - log.scrollTop - log.clientHeight > 4);
  };
  log.addEventListener('scroll', edge, { passive: true });

  // Rate limits count down on the retry button, then enable it.
  function setTicker() {
    clearInterval(ticker);
    if (!log.querySelector('[data-act="retry"][data-at]')) return;
    ticker = setInterval(() => {
      let waiting = false;
      for (const b of log.querySelectorAll('[data-act="retry"][data-at]')) {
        const left = secondsLeft(Number(b.dataset.at));
        b.disabled = left > 0;
        b.querySelector('span').textContent = left ? t('chat.retryIn', { n: left }) : t('chat.retry');
        waiting ||= left > 0;
      }
      if (!waiting) clearInterval(ticker);
    }, 1000);
  }

  // Busy from the moment a question is sent until its answer is settled. The box stays editable (the
  // next question can be written meanwhile); the send button becomes a stop button.
  const isBusy = () => root.classList.contains('busy');
  function setBusy(on) {
    root.classList.toggle('busy', on);
    send.dataset.state = on ? 'stop' : 'send';
    send.setAttribute('aria-label', t(on ? 'chat.stop' : 'chat.send'));
    send.querySelector('use').setAttribute('href', on ? '#i-square' : '#i-arrow-up');
    updateComposer();
  }

  function updateComposer() {
    const left = box.maxLength - box.value.length;
    count.textContent = left <= 150 ? t('chat.left', { n: left }) : '';
    send.disabled = !isBusy() && !box.value.trim();
    // Grow with the text up to the CSS max-height, then scroll.
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight + 2}px`;
  }

  function announce(text) {
    status.textContent = '';
    setTimeout(() => (status.textContent = text), 50);
  }

  // ---------- talking to the endpoint ----------

  /** Stream the answer to the conversation so far into `msg`. Returns what happened, for decide(). */
  async function stream(msg) {
    const controller = new AbortController();
    const state = { controller, cause: null };
    busy = state;
    const stop = (cause) => {
      state.cause = cause;
      controller.abort();
    };
    let watchdog = setTimeout(() => stop('timeout'), FIRST_BYTE_MS);
    let bytes = false;
    let text = false;
    let finished = false;
    let code = null;
    try {
      const res = await fetch(`${api}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toRequest(messages.filter((m) => m !== msg), getLang())),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!res.ok || !/^text\/event-stream/i.test(res.headers.get('content-type') || '')) {
        const body = await res.json().catch(() => ({}));
        const header = Number(res.headers.get('retry-after'));
        return { type: 'http', status: res.ok ? 502 : res.status, error: body?.error, retryAfter: body?.retryAfter ?? (header || undefined) };
      }
      await readEvents(
        res.body,
        (e) => {
          const d = json(e.data) || {};
          if (e.event === 'text' && typeof d.t === 'string' && d.t) {
            text = true;
            msg.content += d.t;
            paint(msg);
          } else if (e.event === 'picks' && Array.isArray(d.picks)) {
            const picks = d.picks.filter((p) => p && byId.has(p.id)).map((p) => ({ id: p.id, why: typeof p.why === 'string' ? p.why : '' }));
            msg.picks = [...new Map(picks.map((p) => [p.id, p])).values()].slice(0, AI_PICKS);
          } else if (e.event === 'done') {
            finished = true;
            return false;
          } else if (e.event === 'error') {
            code = typeof d.code === 'string' ? d.code : 'internal';
            return false;
          }
        },
        {
          onChunk() {
            bytes = true;
            clearTimeout(watchdog);
            watchdog = setTimeout(() => stop('stall'), STALL_MS);
          },
        },
      );
    } catch {
      if (state.cause === 'stop') return { type: 'stopped', text };
      if (state.cause === 'timeout') return { type: 'timeout' };
      return bytes ? { type: 'cut', text } : { type: 'network' };
    } finally {
      clearTimeout(watchdog);
    }
    if (code) return { type: 'event', code, text };
    return finished ? { type: 'done' } : { type: 'cut', text };
  }

  async function answer() {
    const msg = { role: 'assistant', content: '', source: 'ai', live: true };
    messages.push(msg);
    render();
    follow();
    setBusy(true);
    announce(t('chat.writing'));

    const waiting = paused(pause);
    let d;
    if (waiting) d = { fallback: true, reason: waiting, retry: waiting === 'rate', retryAt: waiting === 'rate' ? pause.until : null, pauseUntil: null };
    else {
      const result = await stream(msg);
      if (!messages.includes(msg)) return; // "New chat" while it was on its way
      d = decide(result);
      if (result.type === 'stopped' && !result.text) {
        // Stopped before a word: take the question back, as if it had not been sent.
        messages.pop();
        const asked = messages.pop();
        if (!box.value.trim()) box.value = asked.content;
        busy = null;
        setBusy(false);
        render();
        save();
        announce(t('chat.end.stopped'));
        box.focus();
        return;
      }
    }
    if (d.pauseUntil) pause = { reason: d.reason, until: d.pauseUntil };
    if (d.fallback) answerHere(msg);
    else if (!msg.content.trim()) msg.key = 'chat.picks'; // picks without words
    msg.reason = d.reason || undefined;
    msg.retry = d.retry || undefined;
    msg.retryAt = d.retryAt || undefined;
    delete msg.live;
    busy = null;
    const following = isFollowing();
    setBusy(false);
    render();
    if (following) follow();
    save();
    const said = log.lastElementChild?.querySelector('.msg-text')?.innerText || '';
    const n = msg.picks?.length || 0;
    announce([said, n ? t('chat.status', { n }) : '', msg.source === 'local' && msg.reason ? t('chat.local', { why: t(`chat.why.${msg.reason}`) }) : msg.reason ? t(`chat.end.${msg.reason}`) : ''].filter(Boolean).join(' '));
  }

  function submit() {
    const text = box.value.trim();
    if (isBusy() || !text) return;
    messages.push({ role: 'user', content: text.slice(0, box.maxLength) });
    box.value = '';
    updateComposer();
    save();
    answer();
  }

  // ---------- events ----------

  const abort = () => {
    if (!busy) return;
    busy.cause = 'stop';
    busy.controller.abort();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isBusy()) abort();
    else submit();
    box.focus();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    submit();
  });
  box.addEventListener('input', updateComposer);
  fresh.addEventListener('click', () => {
    abort();
    messages = [];
    busy = null;
    setBusy(false);
    save();
    render();
    announce(t('chat.cleared'));
    box.focus();
  });
  log.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'retry' && !isBusy() && messages.at(-1)?.role === 'assistant') {
      messages.pop();
      box.focus({ preventScroll: true });
      answer();
    }
    if (act === 'refine') onRefine(readAll());
  });

  if (api !== API && dev) dev.textContent = ` · ${t('chat.dev', { x: api })}`;
  setBusy(false);
  render();
  log.scrollTop = log.scrollHeight;
  edge();
  return {
    /** The chat page just opened: show the latest message (a hidden log can't scroll). */
    shown() {
      log.scrollTop = log.scrollHeight;
      edge();
    },
    /** Re-render in the current language (app.js calls this after switching). */
    localize() {
      setBusy(isBusy());
      if (!isBusy()) render();
      if (api !== API && dev) dev.textContent = ` · ${t('chat.dev', { x: api })}`;
    },
  };
}

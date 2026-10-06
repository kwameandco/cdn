/*! kw-therapist-matcher v1.0.0 — https://github.com/kwameandco/clients */
/**
 * kw-therapist-matcher v1.0.0
 * Chat-style "find your therapist" quiz for a Webflow site whose therapists live in a
 * CMS collection. One script tag + one stylesheet, no dependencies, no API calls, no
 * credentials. See README.md and instructions.md.
 *
 * Built for Bloom. v1 deliberately reproduces the inherited quiz (questions, copy,
 * scoring, top-two results) so the switch is like-for-like; improvements are listed in
 * webflow/bloom/MATCHER-REVIEW.md and land in later versions.
 *
 * Where the data comes from — the page, not a network call:
 *   A hidden Collection List renders the roster into the page at publish time. Each item:
 *
 *     [data-kwtm-therapist]                 one per therapist (filter the list in Webflow)
 *       [data-kwtm="name"]                  text — full name
 *       [data-kwtm="display-name"]          text — optional; default "First L."
 *       [data-kwtm="title"]                 text — optional
 *       [data-kwtm="pronouns"]              text — optional
 *       [data-kwtm="quote"]                 text — optional
 *       img[data-kwtm="photo"]              image — optional
 *       [data-kwtm-accepts="Q1"] … "Q7"     nested list of the options this therapist takes;
 *         [data-kwtm-code]                  text — each item's option code ("A", "B", …)
 *       [data-kwtm-book]                    the stock SimplePractice widget anchor
 *                                           (data-spwidget-autobind …) — optional
 *
 *   The booking anchor is MOVED into the result card, never cloned or rebuilt: SimplePractice
 *   binds its click handler to that exact node at load, and kw-spwidget-track finds it by its
 *   data-spwidget-autobind attribute. A clone would be a dead link.
 *
 *   Optional second hidden list overrides option labels (so the client can reword an answer
 *   in the CMS):  [data-kwtm-option][data-kwtm-q="Q7"][data-kwtm-code="B"] with the label as text.
 *
 * Trap: every string from the CMS goes in via textContent. The inherited build concatenated
 * names and quotes into innerHTML — a name containing markup executed.
 *
 * Script-tag options:
 *   data-autoopen="3000"     ms after load to open the window; "off" to never auto-open
 *   data-contact-url="/contact-us"
 *   data-phone="813-262-0460"
 *   data-results="2"         how many matches to show
 *   data-debug               log the score table to the console
 */
(function (win, doc) {
  'use strict';

  if (win.kwTherapistMatcher) return;

  const VERSION = '1.0.0';

  const _cs = doc.currentScript || doc.querySelector('script[src*="kw-therapist-matcher"]');
  const attr = (n, fallback) => _cs?.getAttribute(n) ?? fallback;
  const CONFIG = {
    autoOpen:   attr('data-autoopen', '3000'),
    contactUrl: attr('data-contact-url', '/contact-us'),
    phone:      attr('data-phone', '813-262-0460'),
    results:    parseInt(attr('data-results', '2'), 10) || 2,
    debug:      _cs?.hasAttribute('data-debug') ?? false,
    avatar:     attr('data-avatar', 'https://cdn.prod.website-files.com/6493003c6a247d530bfc3e23/69e5ce848e7e1cdf031a476c_Avatar%202.png')
  };

  /* ── Questions — copy as inherited ────────────────────────────────────────── */
  // Option labels here are fallbacks; a [data-kwtm-option] list in the page wins.
  const QUESTIONS = [
    { key: 'Q1', q: 'Who is this therapy for?', sub: '',
      opts: { A: 'Therapy for a teen', B: 'Therapy for a college student', C: 'Therapy for a young adult', D: 'Family therapy', E: 'Couples counseling', F: 'Mental health counseling', G: 'Group therapy' } },
    { key: 'Q2', q: 'What is the age range of the person seeking therapy?', sub: "Different stages of life come with different challenges. This helps us match them with someone who truly gets where they're at.",
      opts: { A: 'Under 11', B: '11–18', C: '18–26', D: '26+', E: 'All ages' } },
    { key: 'Q3', q: 'How would you like to meet?', sub: 'Choose what works best.',
      opts: { A: 'Virtual', B: 'In-Person', C: 'Hybrid', D: 'Group' } },
    { key: 'Q4', q: 'What would you most like support with?', sub: 'Choose the one that feels most pressing right now.',
      opts: { A: 'Anxiety', B: 'Depression', C: 'ADHD', D: 'Self-esteem', E: 'Life transition', F: 'Parent-teen conflict', G: 'Identity', H: "I don't know — I just know we need help" } },
    { key: 'Q5', q: "Is there anything specific you're looking for in a therapist?", sub: "These details help us find someone you'll truly feel comfortable with.",
      opts: { A: 'Direct', B: 'Nurturing', C: 'Skills-based', D: 'LGBTQ+', E: 'Youthful', F: 'Bilingual', G: 'Clinician of color', H: 'Religious', I: 'Spiritual' } },
    { key: 'Q6', q: 'When works best for you?', sub: "Consistency is a big part of progress. Let's find a therapist whose availability matches yours.",
      opts: { A: 'After school', B: 'Evenings', C: 'Weekends', D: 'Mornings', E: 'Flexible' } },
    { key: 'Q7', q: 'What is your preferred payment method?', sub: "Whether you're using insurance or paying out of pocket, we want to make sure there are no surprises.",
      opts: { A: 'Insurance', B: 'I have Medicaid or need reduced-cost care', C: 'Private pay', D: 'Rooted to Bloom', E: 'United / Optum / Oscar / UHC', F: 'EAP' } }
  ];

  /* ── Scoring — as inherited ───────────────────────────────────────────────── */
  // Payment and scheduling are hard filters: no match = excluded. Accepting every option
  // of a question counts as the inherited "ALL" wildcard (half weight), so ticking every
  // box in the CMS scores exactly as the old ALL string did.
  const WEIGHTS = { Q7: 7, Q6: 6, Q3: 5, Q5: 4, Q4: 3, Q2: 2, Q1: 1 };
  const HARD_FILTERS = ['Q7', 'Q6'];

  function score(therapist, answers, rand = Math.random) {
    let total = 0;
    for (const [qKey, weight] of Object.entries(WEIGHTS)) {
      const choice = answers[qKey];
      if (!choice) continue;
      const accepts = therapist.accepts[qKey] || [];
      const allCount = Object.keys(QUESTIONS.find((q) => q.key === qKey).opts).length;
      const isAll = accepts.length >= allCount;
      const ok = accepts.includes(choice);
      if (!ok && HARD_FILTERS.includes(qKey)) return null;
      if (ok) total += isAll ? 0.5 * weight : (1 / accepts.length) * weight * 2;
    }
    return total + rand() * 0.0001; // inherited tie-break
  }

  function rank(roster, answers, rand) {
    return roster
      .map((t) => ({ t, s: score(t, answers, rand) }))
      .filter((r) => r.s !== null)
      .sort((a, b) => b.s - a.s);
  }

  /* ── Read the roster from the page ────────────────────────────────────────── */
  const text = (root, key) => (root.querySelector(`[data-kwtm="${key}"]`)?.textContent || '').trim();

  function shortName(full) {
    const parts = full.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full;
  }

  function readRoster() {
    return Array.from(doc.querySelectorAll('[data-kwtm-therapist]')).map((el) => {
      const name = text(el, 'name');
      const accepts = {};
      QUESTIONS.forEach(({ key }) => {
        const box = el.querySelector(`[data-kwtm-accepts="${key}"]`);
        accepts[key] = box
          ? Array.from(box.querySelectorAll('[data-kwtm-code]'))
              // Switch-backed answers render as elements with conditional visibility. Webflow
              // keeps a switched-off one in the page with .w-condition-invisible — counting it
              // would make every therapist accept every answer.
              .filter((c) => !c.closest('.w-condition-invisible'))
              .map((c) => (c.getAttribute('data-kwtm-code') || c.textContent).trim().toUpperCase())
              .filter(Boolean)
          : [];
      });
      const img = el.querySelector('img[data-kwtm="photo"]');
      return {
        name,
        displayName: text(el, 'display-name') || shortName(name),
        title: text(el, 'title'),
        pronouns: text(el, 'pronouns'),
        quote: text(el, 'quote').replace(/^["“”]+|["“”]+$/g, ''),
        photo: img && img.getAttribute('src') && !/placeholder/i.test(img.className) ? img.getAttribute('src') : '',
        book: el.querySelector('[data-kwtm-book]'),
        accepts
      };
    }).filter((t) => t.name);
  }

  function readLabels() {
    doc.querySelectorAll('[data-kwtm-option]').forEach((el) => {
      const q = QUESTIONS.find((x) => x.key === el.getAttribute('data-kwtm-q'));
      const code = (el.getAttribute('data-kwtm-code') || '').trim().toUpperCase();
      // CMS names carry a "Q7 · " prefix so the editor's multi-reference pickers are
      // searchable; visitors shouldn't see it.
      const label = el.textContent.trim().replace(/^Q\d\s*[·:\-–]\s*/, '');
      if (q && code && label) q.opts[code] = label;
    });
  }

  /* ── DOM helpers ──────────────────────────────────────────────────────────── */
  function h(tag, props = {}, ...kids) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : doc.createTextNode(k)));
    return el;
  }

  /* ── UI ───────────────────────────────────────────────────────────────────── */
  let roster = [];
  let firstName = '';
  let step = 0;
  let answers = {};
  let launcher, win_, area, content, footer;

  function build() {
    launcher = h('button', { class: 'kwtm-launcher', type: 'button', 'aria-label': 'Open the therapist matcher', onclick: toggle }, '💬');
    area = h('div', { class: 'kwtm-area' });
    content = h('div', { class: 'kwtm-content' }, area);
    footer = h('div', { class: 'kwtm-footer', hidden: '' },
      h('button', { class: 'kwtm-back', type: 'button', onclick: back }, 'Back'));
    // data-lenis-prevent: the host site runs Lenis smooth-scroll, which otherwise eats the
    // wheel inside the chat window.
    win_ = h('div', { class: 'kwtm-window', role: 'dialog', 'aria-label': 'Therapist matcher', 'data-lenis-prevent': '', hidden: '' },
      h('div', { class: 'kwtm-header' },
        h('div', { class: 'kwtm-brand' },
          h('img', { class: 'kwtm-avatar', src: CONFIG.avatar, alt: '' }),
          h('span', {}, 'THERAPIST MATCHER')),
        h('button', { class: 'kwtm-close', type: 'button', 'aria-label': 'Close', onclick: toggle }, '×')),
      content, footer);
    doc.body.append(launcher, win_);
  }

  function toggle() {
    const opening = win_.hidden;
    win_.hidden = !opening;
    if (opening && !area.childNodes.length) intro();
  }

  function clear() { area.replaceChildren(); content.scrollTop = 0; }
  const bubble = (...kids) => h('div', { class: 'kwtm-bubble' }, ...kids);

  function typing(then) {
    const dots = h('div', { class: 'kwtm-typing', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
    area.append(dots);
    content.scrollTop = content.scrollHeight;
    setTimeout(() => { dots.remove(); then(); }, 800);
  }

  function intro() {
    clear();
    footer.hidden = true;
    const input = h('input', { class: 'kwtm-input', type: 'text', placeholder: 'First Name...', 'aria-label': 'First name', autocomplete: 'given-name' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(input.value); });
    area.append(
      bubble("Finding the right therapist can feel like a lot. We get it. That's why we created this quick matcher to take the guesswork out of it."),
      bubble("I'll ask you 7 simple questions to understand what you're looking for, and then match you with a Bloom therapist who's the best fit for you. Your needs, your time, your goals. 🌸"),
      bubble(h('strong', {}, "Before we dive in, what's your first name?"), h('br'), h('small', {}, '(Just your first name — no email, no extra info needed to see your results.)')),
      input,
      h('button', { class: 'kwtm-start', type: 'button', onclick: () => start(input.value) }, 'Take the Quiz'));
  }

  function start(name) {
    firstName = (name || '').trim() || 'Friend';
    step = 0;
    answers = {};
    footer.hidden = false;
    showStep();
  }

  function showStep() {
    const q = QUESTIONS[step];
    clear();
    typing(() => {
      area.append(bubble(step === 0 ? `Hello ${firstName}! ` : '', h('strong', {}, q.q), q.sub ? [h('br'), h('small', {}, q.sub)] : []));
      Object.entries(q.opts).forEach(([code, label]) =>
        area.append(h('button', { class: 'kwtm-option', type: 'button', onclick: () => choose(code) }, label)));
      content.scrollTop = 0;
    });
  }

  function choose(code) {
    answers[QUESTIONS[step].key] = code;
    if (step < QUESTIONS.length - 1) { step++; showStep(); } else results();
  }

  function back() {
    if (step > 0) { step--; delete answers[QUESTIONS[step].key]; showStep(); }
    else intro();
  }

  function card(t) {
    const kids = [];
    if (t.photo) kids.push(h('img', { class: 'kwtm-photo', src: t.photo, alt: t.displayName }));
    kids.push(h('div', { class: 'kwtm-name' }, t.displayName));
    if (t.title) kids.push(h('div', { class: 'kwtm-title' }, t.title));
    if (t.pronouns) kids.push(h('span', { class: 'kwtm-pronouns' }, t.pronouns));
    if (t.quote) kids.push(h('p', { class: 'kwtm-quote' }, `"${t.quote}"`));
    if (t.book) {
      // Move the live SimplePractice anchor (see header). Restyle via our class only.
      t.book.classList.add('kwtm-book');
      t.book.textContent = 'Request an Appointment';
      kids.push(t.book);
    }
    kids.push(h('a', { class: 'kwtm-book kwtm-book--secondary', href: CONFIG.contactUrl }, 'Contact Us'));
    return h('div', { class: 'kwtm-card' }, kids);
  }

  function results() {
    const ranked = rank(roster, answers);
    if (CONFIG.debug) console.table(ranked.map((r) => ({ name: r.t.name, score: r.s.toFixed(3) })));
    clear();
    typing(() => {
      const top = ranked.slice(0, CONFIG.results).map((r) => r.t);
      if (top.length) {
        area.append(bubble(`${firstName}, based on your specific needs — especially your payment and scheduling requirements — here are your best matches:`));
        top.forEach((t) => area.append(card(t)));
        area.append(bubble('When you\'re ready, hit ', h('strong', {}, '"Request an Appointment"'),
          " and we'll be in touch to walk you through the next steps. Still have questions? Use the ",
          h('strong', {}, '"Contact Us"'), " button and we'll be happy to help."));
      } else {
        area.append(
          bubble("We want to make sure you get exactly the right fit. Based on your preferences, we'd love to connect with you directly to find your perfect match — whether that's someone at Bloom or a vetted referral."),
          h('a', { class: 'kwtm-book', href: CONFIG.contactUrl }, 'Contact Us'),
          h('p', { class: 'kwtm-phone' }, `Or call us at ${CONFIG.phone}`));
      }
      content.scrollTop = 0;
    });
  }

  function init() {
    readLabels();
    roster = readRoster();
    build();
    const ms = parseInt(CONFIG.autoOpen, 10);
    if (CONFIG.autoOpen !== 'off' && ms >= 0) setTimeout(() => { if (win_.hidden) toggle(); }, ms);
    if (CONFIG.debug) console.log('[kw-therapist-matcher]', VERSION, roster);
  }

  win.kwTherapistMatcher = {
    version: VERSION,
    open: () => { if (win_?.hidden) toggle(); },
    close: () => { if (win_ && !win_.hidden) toggle(); },
    _internals: { score, rank, QUESTIONS, shortName, readRoster }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);

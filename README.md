# pathfinder

Find and compare IT certifications. Prepare with exam guides and practice questions. Free and open source.

**Use it:** https://pathfinder.legios.com.ar/

- **Certifications:** one list with search and filters by provider, level and price. "For me" ranks it by the skills you want and the ones you already use.
- **Ask for a recommendation:** a chat on the home page. Say what you are after in your own words, in English or Spanish ("junior dev, want cloud security, under $200, 5 hours a week"), and get an answer from Claude with a few certifications from the catalog, each with the reason for it and links to its page and any available practice questions. The conversation can go on ("something cheaper?") and is kept in your browser until you start a new chat. When the AI can't answer (offline, busy, rate limited), a built-in matcher answers on your device instead and says so, and can hand what it read to "For me".
- **Each certification:** price, exam format, passing score, validity, exam domains, prep resources and sources.
- **Compare:** up to four side by side, with a shareable link.
- **Practice:** original questions for some certifications (CompTIA Security+, ISC2 CC, AWS Cloud Practitioner, AWS AI Practitioner, AWS Solutions Architect Associate, Microsoft Azure Fundamentals, Microsoft Security Fundamentals and Claude Architect Foundations for now), picked by exam domain, in exam mode (a timer you can pause, results at the end) or study mode (the answer and its explanation after each question), with keyboard keys, marked questions, accuracy by domain next to the exam's passing score, review with explanations and a list of your mistakes. Questions you miss or mark come back in **Review**, spaced out further each time you get them right.
- **Study backup** in About lets you move practice history and reviews between browsers. Backups also include any previously saved plans, completed sessions, topic ratings and reschedules.
- **English and Spanish**, light and dark, installable and usable offline. When a new version is out, a notice offers to refresh instead of swapping files under an open page.
- **A page per certification** (`c/<id>/`, and `es/c/<id>/` in Spanish) with its facts as plain HTML, readable without JavaScript and by search engines, with links to practice and compare. It is also the certification's share link, with its own preview image. `c/` lists them all, and the build writes `sitemap.xml` and `robots.txt`.
- **Comparison pages** (`c/vs/<a>-vs-<b>/`) for pairs people often weigh against each other, listed in `data/comparisons.json`: a table of both certifications' facts, the differences in plain sentences built from the same data (no verdicts) and a link to compare in the app.
- **Paths** shows the suggested certification orders in `data/paths.json` by goal. Each path also has a shareable page (`p/<id>/`, index at `p/`) linked from the certifications it mentions.

## Privacy

No cookies and no personal data. The site counts visits with Vercel Web Analytics, which records the page, the country, the browser and where the visit came from, without cookies and without anything that identifies you; for the app it records which view or certification was open, never what you searched or typed. Messages you type in the chat go to pathfinder's server on Vercel, which passes them through Vercel AI Gateway to Claude (Anthropic); pathfinder does not store the conversations, and your browser keeps the transcript until you start a new chat. Your preferences, comparisons and practice history stay in your browser. If the AI is unavailable, an on-device matcher answers instead.

## The catalog

The catalog lists 94 certifications in AI engineering, ML foundations, AI security, cybersecurity, cloud platforms, DevOps and Kubernetes, Linux, networking, and data and analytics, from Anthropic, AWS, Microsoft, Google Cloud, NVIDIA, CompTIA, ISC2, ISACA, the Linux Foundation, Databricks, Snowflake, Cisco, GitHub and others.

- `data/certifications/<id>.json`: one file per certification. Provider facts only (fee, format, domains, requirements), each with its sources and the date they were checked.
- `data/practice/<id>.json`: original practice questions for a certification, in English and Spanish, under CC BY 4.0. They are never real or recalled exam questions.
- `data/sources.json`: issuer pages and references.
- `data/reports.json`: public candidate reports (how people prepared, effort, limits). They describe experiences; they do not set a pass rate.
- `data/taxonomy.json`: skills, roles, levels and the estimated study-hour ranges.
- `data/paths.json`: suggested study paths by goal, an editorial order rather than any issuer's official path.
- `data/comparisons.json`: the pairs that get a comparison page. Both ids must exist in the catalog.

Provider facts were checked in November 2026; exam domain weights for 75 of the 94 come from the issuers' own guides. Prices change and vary by country: confirm with the issuer before paying or booking. Certification names and codes belong to their issuers; pathfinder is not affiliated with any of them.

## Run it locally

Needs Node 22 or newer. No dependencies.

```sh
npm start        # validate, build to dist/ and serve on http://127.0.0.1:8080/
npm test         # unit tests, catalog checks and a build into a temporary folder
npm run validate # catalog checks only
npm run smoke    # after a build: open the main views and some static pages in headless Chrome (CI runs it too)
npm run og       # re-render the share images in site/og/ (needs Chrome and ImageMagick)
node scripts/freshness.mjs --no-links   # what in the catalog needs a fresh look (drop --no-links to check every link)
```

**Freshness.** Every Monday, `.github/workflows/freshness.yml` runs `scripts/freshness.mjs` and keeps one open issue labelled `freshness` up to date with what needs a fresh look: certifications and sources checked more than 45 days ago, timeline entries due within 30 days or already past, free routes and discounts ending within 30 days, announced exams, and a check of every source, prep and offer link (404, 410 and missing hosts count as broken; refusals from sites that block robots are listed apart as "couldn't check"). It can also be started by hand from the Actions tab; it never runs on pull requests.

The site's public address lives in `scripts/site.mjs` (`SITE_URL` in the environment overrides it for one build). Canonical links, Open Graph tags, the sitemap and robots.txt follow it; everything else links with relative paths, so the same build works under a subpath or at the root of a domain.

The chat's endpoint lives next to it, as `CHAT_API` (`https://pathfinder-api.legios.com.ar` by default; `CHAT_API` in the environment overrides it for one build). The page posts the conversation to `<CHAT_API>/chat` and reads the answer as server-sent events. To work on the chat without the real endpoint, run the mock, which speaks the same contract with canned answers and can act out every failure:

```sh
node scripts/chat-mock.mjs 8813                # then open http://127.0.0.1:8080/?chat=http://127.0.0.1:8813
# ?chat=http://127.0.0.1:8813/m/tools (every event in one answer) or /m/429 (or 503, disabled, slow, error, late, cut, refusal, 400, 403, 413, 500, lag)
```

`?chat=<url>` is remembered by that browser (`?chat=default` forgets it) and only accepts a loopback address, unless the page itself is served from loopback.

The interface text lives in `site/i18n.js`. Catalog details stay in English, as the issuers publish them.

## Contribute

Corrections and new certifications are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

Icons from [Lucide](https://lucide.dev) v1.59.0 (ISC, see `site/LICENSE-lucide.txt`). Headings use [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and body text uses [Inter](https://github.com/rsms/inter), Latin subset (both SIL Open Font License, see `site/fonts/OFL.txt` and `site/fonts/OFL-inter.txt`). Everything is bundled: the only requests that leave the page are the chat's, to pathfinder's own endpoint, and the anonymous visit count, to the site's own address.

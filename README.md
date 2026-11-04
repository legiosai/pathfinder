# pathfinder

Pick an IT certification and plan the study. Open source, runs in your browser.

**Use it:** https://legiosai.github.io/pathfinder/

- **Certifications:** one list with search and filters by provider, level and price. "For me" ranks it by the skills you want and the ones you already use.
- **Each certification:** price, exam format, passing score, validity, exam domains, prep resources and sources.
- **Compare:** up to four side by side, with a shareable link.
- **Plan:** dated sessions weighted by the exam domains, with timed mocks. Set an exam date to check it fits, rate your topics to shift time, tick sessions off, and export to your calendar (`.ics`) or Markdown.
- **Progress:** every plan you track in one place: streak, hours done, what comes next and five weeks of sessions at a glance.
- **English and Spanish**, light and dark, installable and usable offline. Each certification has a share link with its own preview image.

No tracking and no backend. Your choices and progress stay in your browser.

## The catalog

The catalog lists 42 certifications in AI engineering, ML foundations, AI security and cloud platforms, from Anthropic, AWS, NVIDIA, the Linux Foundation, GitHub, Microsoft, Google Cloud, Databricks and others.

- `data/certifications/<id>.json`: one file per certification. Provider facts only (fee, format, domains, requirements), each with its sources and the date they were checked.
- `data/sources.json`: issuer pages and references.
- `data/reports.json`: public candidate reports (how people prepared, effort, limits). They describe experiences; they do not set a pass rate.
- `data/taxonomy.json`: skills, roles, levels and the rough hour ranges the planner starts from.

Provider facts were checked in October and November 2026; exam domain weights for 30 of the 42 come from the issuers' own guides. Prices change and vary by country: confirm with the issuer before paying or booking. Certification names and codes belong to their issuers; pathfinder is not affiliated with any of them.

## Run it locally

Needs Node 22 or newer. No dependencies.

```sh
npm start        # validate, build to dist/ and serve on http://127.0.0.1:8080/
npm test         # unit tests and catalog checks
npm run validate # catalog checks only
npm run og       # re-render the share images in site/og/ (needs Chrome and ImageMagick)
```

The interface text lives in `site/i18n.js`. Catalog details stay in English, as the issuers publish them.

## Contribute

Corrections and new certifications are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

Icons from [Lucide](https://lucide.dev) v1.59.0 (ISC, see `site/LICENSE-lucide.txt`). Headings use [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and body text uses [Inter](https://github.com/rsms/inter), Latin subset (both SIL Open Font License, see `site/fonts/OFL.txt` and `site/fonts/OFL-inter.txt`). Everything is bundled, so the site makes no third-party requests.

# pathfinder

Pick an IT certification and plan the study. Open source, runs in your browser.

**Use it:** https://legiosai.github.io/pathfinder/

- **Certifications:** one list with search and filters by provider, level and price. "For me" ranks it by the skills you want and the ones you already use.
- **Each certification:** price, exam format, passing score, validity, exam domains, prep resources and sources.
- **Compare:** up to four side by side, with a shareable link.
- **Plan:** dated sessions weighted by the exam domains, with timed mocks. Set an exam date to check it fits, rate your topics to shift time, tick sessions off, and export to your calendar (`.ics`) or Markdown.

No tracking and no backend. Your choices and progress stay in your browser.

## The catalog

The catalog lists 42 certifications in AI engineering, ML foundations, AI security and cloud platforms, from Anthropic, AWS, NVIDIA, the Linux Foundation, GitHub, Microsoft, Google Cloud, Databricks and others.

- `data/certifications/<id>.json`: one file per certification. Provider facts only (fee, format, domains, requirements), each with its sources and the date they were checked.
- `data/sources.json`: issuer pages and references.
- `data/reports.json`: public candidate reports (how people prepared, effort, limits). They describe experiences; they do not set a pass rate.
- `data/taxonomy.json`: skills, roles, levels and the rough hour ranges the planner starts from.

Provider facts were checked in October 2026. Prices change and vary by country: confirm with the issuer before paying or booking. Certification names and codes belong to their issuers; pathfinder is not affiliated with any of them.

## Run it locally

Needs Node 22 or newer. No dependencies.

```sh
npm start        # validate, build to dist/ and serve on http://127.0.0.1:8080/
npm test         # unit tests and catalog checks
npm run validate # catalog checks only
```

## Contribute

Corrections and new certifications are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

Icons from [Lucide](https://lucide.dev) v1.59.0 (ISC, see `site/LICENSE-lucide.txt`). Headings use [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (SIL Open Font License, see `site/fonts/OFL.txt`). Both are bundled, so the site makes no third-party requests.

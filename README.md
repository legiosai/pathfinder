# pathfinder

Open-source tool to choose and prepare IT certifications. Compare options for your profile and get a study plan.

**Use it:** https://legiosai.github.io/pathfinder/

- **Match:** pick your role, the skills you use and the ones you want to grow. pathfinder ranks the catalog and explains every score.
- **Browse:** search and filter by provider, level, registration status, assessment style and fee.
- **Compare:** up to four certifications side by side: fee, format, passing score, validity, exam domains and AI rules. Share the link.
- **Plan:** turn a certification into dated study sessions weighted by its exam domains and your confidence in each one, with timed mocks. Set your exam date to check the plan fits. Export to your calendar (`.ics`) or Markdown and tick sessions off as you go.
- **Prepare:** official guides, courses and docs for 19 certifications, each link checked.

It is a static page with no tracking and no backend. Your profile, shortlist and progress stay in your browser.

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

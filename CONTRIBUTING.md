# Contributing to pathfinder

Thanks for helping keep the catalog accurate. Most contributions are data: a corrected fee, a new exam version, or a certification that is missing.

## Fix or add a certification

1. Edit or create `data/certifications/<id>.json`. The file name must match the `id` (lowercase words joined by hyphens, for example `aws-aif-c01`). Copy an existing file as a template.
2. Add every page you read to `data/sources.json` with an id, title, URL, a short note on what it confirmed and `checked_on` (`YYYY-MM-DD`). Reference those ids from the certification's `sources`.
3. Set `checked_on` to the date you read the issuer pages (`YYYY-MM-DD`).
4. Run `npm test`. The checks fail on unknown skills, missing sources, broken URLs and domain weights that do not add up to 100.
5. Open a pull request saying what changed and where you read it.

### Field guide

| Field | What goes there |
|---|---|
| `level` | `entry`, `associate`, `professional` or `expert`, following the issuer's own tiering where it has one |
| `status` | `available`, `restricted` (eligibility limits: explain them in `requirements`) or `upcoming` |
| `fee.usd` | List price in US dollars, or `null` when the issuer prices by region. Put conditions in `fee.note` and `fee.basis` (for example "Exam only" or "Training + exam") |
| `exam.minutes` | Appointment length, or `null` when the issuer does not publish one |
| `exam.style` | `knowledge` (questions), `practical` (hands-on) or `hybrid` |
| `exam.question_count` | A whole number used to pace mock exams: the exact count, or the maximum when the issuer gives a range ("100–125" is 125, "65 (50 scored)" is 65). Keep the issuer's wording in `exam.questions`. Required when the certification has practice questions |
| `exam.languages` | Language codes the exam can be taken in, as the issuer lists them: `en`, `es`, `pt-BR`, `ja`… Use `es-419` (Latin America) and `es-ES` (Spain) when the issuer tells the two apart. Leave the field out when the issuer does not say; never an empty list |
| `exam.delivery` | Where it can be taken: `online` (proctored at home), `test-center`, or both. Leave it out when unknown |
| `access` | Ways to pay less, in English and from issuer pages (list each page in `sources`): `free_routes` and `discounts` are lists of `{ "text", "url", "until"? }` (`until` is the last day, `YYYY-MM-DD`); `retake` and `accommodations` are one sentence each (waiting periods and retake cost; extra time such as AWS's +30 minutes for non-native English speakers) |
| `timeline` | Dated changes a candidate should plan around, sorted by date: `{ "date", "kind", "text", "source" }` with `kind` one of `retires`, `changes`, `opens` or `deadline`, and `source` an id from `data/sources.json`. Keep upcoming dates and drop entries more than about 60 days old |
| `domains` | The official exam domains with their weights, plus `domains_note` saying where the weights come from. Leave empty if the issuer does not publish weights |
| `skills`, `roles` | Ids from `data/taxonomy.json`. Add a new skill there if none fits |
| `caveats` | Conflicts or doubts a reader should know, such as two issuer pages that disagree |
| `prep` | Preparation resources: `title`, `url`, `kind` (`official-guide`, `course`, `docs` or `practice`), `cost` (`free` or `paid`) and `lang` (language code) when the resource is not in English. Prefer issuer material; never link exam dumps |

### Paying from another country

`data/regions.json` says, per country (two-letter code), what paying for an exam from there adds to the list price: taxes or surcharges on card payments in foreign currency and how to avoid or recover them. Each entry has short `en` and `es` texts, its `sources` and `checked_on`. Write facts with their date, from official or reputable sources, and leave out what you cannot confirm.

## Rules for the data

- **Facts, not opinions.** Write what the issuer publishes. Do not add personal difficulty ratings, pass probabilities or "best choice" advice to certification files.
- **Primary sources first.** Link the issuer's own page. Community posts belong in `data/reports.json` and must say what they cannot prove (self-reported, no date, commercial interest).
- **No exam content.** Never add real or recalled exam questions, dumps or links to them. Do not link to unofficial copies of issuer documents.
- **No personal data.** Do not add information about specific people beyond what a public report already shows.

## Practice questions

`data/practice/<certification id>.json` holds practice questions. Write them yourself, from the issuer's exam guide and documentation: no real or recalled exam questions, and nothing copied from question banks or courses. Each question needs text and an explanation in English and Spanish, and `domain` must match a domain name of the certification exactly. By contributing them you license them under CC BY 4.0. `npm test` checks the structure, not whether the answers are right, so say in the pull request where you confirmed them.

## Code changes

The site is plain HTML, CSS and JavaScript modules in `site/`. Logic that can be tested lives in `site/lib/` and has tests in `tests/`. The chat's rules (what is sent, when the on-device matcher answers instead, what is saved) live in `site/lib/chat.js` and its stream reader in `site/lib/sse.js`; `node scripts/chat-mock.mjs` stands in for the endpoint while you work on it. The words the on-device matcher understands (synonyms for skills, roles, levels, budgets and issuers, in English and Spanish) are lists in `site/lib/intent.js`; add a phrase there and a case to `tests/intent.test.mjs`. Keep the page self-contained: no trackers, no CDNs, and no calls to other services beyond the chat's endpoint.

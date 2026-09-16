# AQA GCSE Higher separate Biology (8461)

The course contains 994 atomic objectives and 1,841 directed prerequisites, including 547 links across topics. Five genuinely foundational starting points are observation, organism, matter as particles, energy and ethical judgement. The remaining nodes depend on taught concepts or skills. The stored order is topological; topic numbers do not override dependencies.

## Source and scope

Source: https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification/subject-content

Official topic pages, Working scientifically, Mathematical requirements and Practical assessment were retrieved on 16 September 2026. The input snapshots retain URLs, timestamps and content hashes in `scripts/aqa_biology_8461_sources.json`. All 97 leaf subject-content subsections represented in those pages have mapped objectives. This is the Higher-tier **separate Biology** course, not Combined Science or Foundation Biology.

`src/data/aqaBiologyHigher.json` is the released graph. Each node records an objective, essential details, source references, kind and relevant practical numbers. One objective means one new testable idea, not four unrelated ideas. Four is the maximum number of supporting points within that idea.

Rule 17 separates practical procedure steps, scientific concepts, interpretation of results and evaluation of specific steps. All ten required practicals have procedural, application and evaluation nodes; reusable measurement and sampling skills are shared. Explicit exclusions, including detailed mitosis/meiosis phases, nephron anatomy and the nitrogen cycle, are retained in lesson instructions.

## Live behaviour

The existing feed and LastMind Untracked use `GET /knowledge-map-v2/node/:nodeId/lesson`. A cache miss generates the lesson on demand; a cache hit reuses it without a generation call. Biology generation receives the exact atomic objective and relevant official source excerpts. Thinking remains disabled through the existing API client. Biology output is limited to 3,000 tokens, with encoding text limited to 100 words.

The immediate post-reading practice question and four subsequent free-text recall checks must declare coverage of every taught point. A server-side validator rejects incomplete coverage, duplicate point identifiers, the wrong objective, or more than four points before caching. This structural check is supported by explicit question/mark-scheme instructions; it is not an infallible semantic verifier.

Each generated question has its own stored mark scheme. LastMind returns binary correctness, not an official AQA exam score. Instructions require all essential points, permit equivalent scientific wording, and reject substantive contradictions. The relevant AQA marking reference is the June 2023 Paper 1 Higher mark scheme: https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-84611H-MS-JUN23.PDF

Untracked grading reads the stored question and mark scheme without writing encoding, recall scheduling or FSRS progress. Generated lessons are available in the subject Notes tree independently of encoding status. Reading notes does not unlock a review link or mark the concept learned. Biology's saved ordering also avoids paid AI calls when opening its map or notes.

Public release metadata is available at `/knowledge-map-v2/curriculum/aqa-biology-higher`; this exposes counts and revision only, not answers or student data.

## Reproduction and checks

1. `node scripts/fetch_aqa_biology_spec.js` retrieves official source snapshots.
2. `node scripts/author_aqa_biology_map.js` rebuilds the authored graph without an API call and marks it unreviewed.
3. `npm run build`, followed by `node scripts/release_aqa_biology_map.js`, runs structural and in-memory integration tests and records the release review.
4. `node scripts/ingest_aqa_biology_map.js` stages nodes/edges under an unpublished qualification, verifies them, then publishes the qualification in one update. Reruns verify an existing matching map without replacing student progress. A non-matching existing map is rejected.

The tests check source-section representation, unique identifiers, acyclicity, topological order, cross-topic dependencies, all ten practicals, Higher-tier isolation, full recall coverage, output limits, cache reuse, generated notes and Untracked's lack of progress writes. Integration tests stub the API and database and cost no credits.

The API map budget is capped at $4. Two initial calls were interrupted when that cap was requested, without returned usage; a conservative $2.50 reservation is retained for them. The completed source audit reported $0.498714 at the repository's token rates. No additional paid generation was used for the authored map or tests. Every future map API call reserves its maximum estimated cost before dispatch; all use `thinking: { type: 'disabled' }`. Audit findings were reviewed against the source rather than applied blindly; the release report records rejected suggestions and the truncated closing audit summary.

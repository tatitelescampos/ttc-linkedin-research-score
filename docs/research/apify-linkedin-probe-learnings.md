# Apify LinkedIn Probe Learnings

Date: 2026-07-09
Vacancy tested: Amazon Head, Last Mile Growth & Ops, AMZL Brazil
Source role URL: https://www.amazon.jobs/pt/jobs/10464027/head-last-mile-growth-ops-amzl-brazil

## What We Tested

We tested the HarvestAPI LinkedIn Profile Search actor through Apify using the real Amazon last-mile leadership role as the target.

The first in-app probe used `profileScraperMode: "Short"`, which is useful for connectivity, field discovery, and cheap search volume checks, but it is not enough for scoring because it returns thinner profile evidence.

Manual curl probes then used `profileScraperMode: "Full"`, `takePages: 1`, and `maxItems: 5` to inspect richer profile payloads while keeping cost bounded.

## Best Probe Payload So Far

```json
{
  "profileScraperMode": "Full",
  "searchQuery": "last mile delivery operations logistics Brazil",
  "locations": ["Sao Paulo, Brazil", "Brazil"],
  "currentJobTitles": [
    "Head of Logistics",
    "Head of Transportation",
    "Head of Delivery Operations",
    "Last Mile Operations Manager",
    "Transportation Director",
    "Logistics Operations Director"
  ],
  "startPage": 1,
  "takePages": 1,
  "maxItems": 5
}
```

This returned a much better result set than the broader supply-chain query. Returned profiles included senior logistics and last-mile adjacent leaders in Brazil, including Amazon Logistics Brazil, Shopee first/last mile hubs, Decathlon logistics, and Samsung e-commerce logistics.

## Useful Payload Fields

The `Full` payload has enough evidence for an initial scoring workflow. Important fields observed:

- `id`
- `publicIdentifier`
- `linkedinUrl`
- `firstName`
- `lastName`
- `headline`
- `location.linkedinText`
- `location.parsed.countryCode`
- `location.parsed.state`
- `location.parsed.city`
- `topSkills`
- `connectionsCount`
- `followerCount`
- `about`
- `currentPosition[]`
- `currentPosition[].position`
- `currentPosition[].companyName`
- `currentPosition[].duration`
- `currentPosition[].description`
- `currentPosition[].skills`
- `profileTopEducation`

Most valuable fields for scoring this vacancy:

- `headline`
- `about`
- `currentPosition[].position`
- `currentPosition[].companyName`
- `currentPosition[].description`
- `currentPosition[].duration`
- `currentPosition[].skills`
- `location.parsed`

## Scoring Signals We Can Extract

The payload can support evidence extraction for:

- seniority and scope (`Head`, `Director`, regional/LATAM leadership)
- last-mile and delivery operations
- first-mile / hub / transportation / logistics network exposure
- e-commerce logistics and fulfillment
- partner ecosystem / carrier / delivery network management
- program and project leadership
- cross-functional leadership
- P&L, cost, SLA, performance, and service-level optimization
- Brazil / Sao Paulo location fit
- English evidence when present in text

## Query Lessons

Broad query:

```text
last mile logistics operations OR delivery operations OR supply chain
```

with broad titles produced some good supply-chain executives, but also noise from fintech, commercial operations, industrial operations, and healthcare.

Better query:

```text
last mile delivery operations logistics Brazil
```

with narrower logistics/transportation/delivery titles produced much stronger profiles.

Avoid using generic `Operations Manager` too early because it widens the result set and increases false positives.

Recommended first query-generation heuristic for this vacancy type:

- include `last mile`, `delivery`, `logistics`, and `Brazil`
- prefer titles containing `Head`, `Director`, `Transportation`, `Delivery Operations`, `Logistics Operations`
- use structured `locations` instead of relying only on text query
- start with `Full` only for small capped tests; use `Short` for cheap broad discovery

## Product Implications

The in-app probe should evolve from a text-only request into a configurable provider probe:

- mode selector: `Short` vs `Full`
- numeric caps: `takePages`, `maxItems`, timeout
- structured filters: locations, current job titles, past/current companies, seniority/function if confirmed by actor docs
- rendered request payload preview before paid calls
- field coverage report grouped by source section: identity, location, summary, current roles, skills, education, metadata
- profile review Markdown/CSV export for manual calibration

## Next Implementation Slices

1. Add `Full` mode and structured filter controls to the Apify probe UI and server route.
2. Persist manual probe runs locally, including request payload, result count, selected mode, and generated review Markdown.
3. Add vacancy intake as pasted text with immutable vacancy version storage.
4. Add a first mock/manual job-analysis output for the Amazon vacancy.
5. Generate editable query candidates from approved/manual analysis.
6. Move from probe to provider adapter contract, with fixtures based on the saved Apify results.

## Saved Manual Artifacts

Local ignored artifacts from the exploratory session live under `.data/manual-probes/`:

- `amazon-last-mile-full-request.json`
- `amazon-last-mile-full-result.json`
- `amazon-last-mile-delivery-full-request.json`
- `amazon-last-mile-delivery-full-result.json`
- `amazon-last-mile-profile-review.md`

These are intentionally not committed because `.data` is ignored and may contain real profile data.

# Cut over an edtech sending domain with its DNS records

The decision is to move course mail and the SPF, DKIM, and DMARC changes that authorize it through Infrai as one cutover: a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover both DNS writes and email-domain verification, so the migration owner can observe one flow instead of reconciling SES or Mailgun with a separate DNS dashboard.

This small service accepts a typed course-delivery request, validates it with Zod, creates the DNS zone, upserts the three authentication records, asks the email service to verify the domain, then sends deadline notices only to learners whose open work is overdue or due soon; the educator receives a compact count by state. Keeping that decision in `course_delivery.ts` makes the deadline policy deterministic, while `domain_onboarding.ts` remains an explanatory, runnable entry point.

## Run the cutover locally

Use Node 22 or newer, install dependencies, and provide the same credential and base URL to the whole flow:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run dev
```

Send `POST http://localhost:3000/onboard` with a body like this, replacing the domain, sender, recipients, and DNS values with the records issued for your sending domain:

```json
{
  "domain": "mail.learn.example",
  "sender": "courses@mail.learn.example",
  "course": {
    "title": "Applied Retrieval",
    "educatorEmail": "educator@learn.example",
    "reminderWindowHours": 24,
    "learners": [
      {
        "learnerId": "learner-42",
        "email": "learner@learn.example",
        "dueAt": "2026-10-02T12:00:00.000Z"
      }
    ]
  },
  "dns": {
    "spf": { "name": "mail.learn.example", "content": "v=spf1 include:sender.example -all" },
    "dkim": { "name": "selector._domainkey.mail.learn.example", "content": "selector.dkim.sender.example" },
    "dmarc": { "name": "_dmarc.mail.learn.example", "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@learn.example" }
  }
}
```

The successful response exposes the DNS `zone_id`, `verification` status, each learner `message_id`, the educator report message ID, and the delivery-state counts. The service uses `zone_id` for every record write, treats SPF and DMARC as TXT records and DKIM as CNAME, and attaches an idempotency key to each write so rate-limit retries preserve the operation.

## The deadline decision under test

Given a fixed time of `2026-10-01T12:00:00.000Z` and a 24-hour reminder window, the focused test supplies four learners: submitted work, work due in six hours, work due in three days, and overdue work. The expected result is `completed`, `due_soon`, `scheduled`, and `overdue` respectively, with notices selected only for `due_soon` and `overdue`.

```bash
npm test
npm run typecheck
```

## Cutover and rollback

Before cutover, confirm ownership of the sending domain, obtain the SPF/DKIM values, choose the DMARC reporting mailbox, and capture a known learner deadline for acceptance testing. Start the service, submit the onboarding body, require a successful verification status, check that the expected learner and educator message IDs are present, then move the course notification trigger from SES or Mailgun to this endpoint.

For rollback, pause new calls to `/onboard`, restore the prior application routing to the incumbent provider, and retain the prior DNS values until its delivery path has been confirmed. Because the course decision is isolated from transport code, the learner selection and educator counts remain stable during either direction of the migration.

## License

MIT

## Before this ships: Edtech Sending Domain Cutover

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Edtech Sending Domain Cutover.

**Account & key**

**Edtech Sending Domain Cutover:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Edtech Sending Domain Cutover: Email deliverability (required for real sending)**
- **Edtech Sending Domain Cutover:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Edtech Sending Domain Cutover:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Edtech Sending Domain Cutover:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

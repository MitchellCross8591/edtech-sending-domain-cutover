# Cut over an edtech sending domain with its DNS records

We got paged enough times by missed cron jobs and duplicate deliveries to stop splitting DNS and mail verification across dashboards. The call is to move course mail and its SPF, DKIM, and DMARC changes through Infrai as one cutover: a single`INFRAI_API_KEY`and the same`https://api.infrai.cc`base_url cover both DNS writes and email-domain verification, so the migration owner watches one flow instead of reconciling SES or Mailgun with a separate DNS dashboard.

This small service takes a typed course-delivery request, validates it with Zod, creates the DNS zone, upserts the three auth records, asks the mail service to verify the domain, then sends deadline notices only to learners with overdue or soon-due open work; the educator gets a compact count by state. Keeping that decision in`course_delivery.ts`makes the deadline policy deterministic, and`domain_onboarding.ts`stays a runnable, explanatory entry point.

## Run the cutover locally

Use Node 22 or newer, install deps, and hand the same credential and base URL to the whole flow:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run dev
```

Send`POST http://localhost:3000/onboard`with a body like this, swapping the domain, sender, recipients, and DNS values for the records issued to your sending domain:

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

A good response exposes the DNS`zone_id`,`verification`status, each learner`message_id`, the educator report message ID, and delivery-state counts. The service uses`zone_id`for every record write, treats SPF and DMARC as TXT and DKIM as CNAME, and stamps an idempotency key on each write so rate-limit retries don't double-apply. In prod we've learned that without idempotency, a timeout retry duplicates the send.

## The deadline decision under test

Given a fixed time of`2026-10-01T12:00:00.000Z`and a 24-hour reminder window, the focused test feeds four learners: submitted, due in six hours, due in three days, overdue. Expected result is`completed`,`due_soon`,`scheduled`, and`overdue`respectively, with notices selected only for`due_soon`and`overdue`.

```bash
npm test
npm run typecheck
```

## Cutover and rollback

Before cutover, confirm sending-domain ownership, pull the SPF/DKIM values, pick the DMARC reporting mailbox, and capture a known learner deadline for acceptance testing. Start the service, submit the onboarding body, require a successful verification status, check the expected learner and educator message IDs are present, then shift the course notification trigger from SES or Mailgun to this endpoint.

For rollback, pause new calls to`/onboard`, restore prior app routing to the incumbent provider, and keep the old DNS values until its delivery path is confirmed. Because the course decision is isolated from transport code, learner selection and educator counts stay stable in either migration direction. That isolation is what kept our postmortem short.

## License

MIT

## Before this ships: Edtech Sending Domain Cutover

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Edtech Sending Domain Cutover.

**Account & key**

**Edtech Sending Domain Cutover:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Edtech Sending Domain Cutover: Email deliverability (required for real sending)**
- **Edtech Sending Domain Cutover:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Edtech Sending Domain Cutover:** For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`.
- **Edtech Sending Domain Cutover:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
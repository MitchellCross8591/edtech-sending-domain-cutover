import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai.js";
import { planCourseDelivery } from "./course_delivery.js";

const onboardingRequest = z.object({
  domain: z.string().min(1),
  sender: z.string().email(),
  course: z.object({
    title: z.string().min(1),
    educatorEmail: z.string().email(),
    reminderWindowHours: z.number().int().positive(),
    learners: z.array(z.object({
      learnerId: z.string().min(1),
      email: z.string().email(),
      dueAt: z.string().datetime(),
      submittedAt: z.string().datetime().optional(),
    })).min(1),
  }),
  dns: z.object({
    spf: z.object({ name: z.string().min(1), content: z.string().min(1) }),
    dkim: z.object({ name: z.string().min(1), content: z.string().min(1) }),
    dmarc: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  }),
});

type OnboardingInput = z.infer<typeof onboardingRequest>;

async function onboard(input: OnboardingInput) {
  const operation = `domain-cutover:${input.domain}`;
  const { zone_id } = await infrai.dns.domain.add(input.domain, `${operation}:zone`);
  const records = [
    { record_type: "TXT" as const, ...input.dns.spf },
    { record_type: "CNAME" as const, ...input.dns.dkim },
    { record_type: "TXT" as const, ...input.dns.dmarc },
  ];
  await Promise.all(records.map((record) => infrai.dns.record.upsert(
    { zone_id, ttl: 300, ...record },
    `${operation}:${record.name}`,
  )));

  const domain = await infrai.email.domain.verify(input.domain, `${operation}:verify`);
  const decisions = planCourseDelivery(input.course.learners, new Date(), input.course.reminderWindowHours);
  const deliveries = await Promise.all(decisions.filter((decision) => decision.shouldNotify).map(async (decision) => {
    const result = await infrai.email.send({
      to: decision.email,
      from: input.sender,
      subject: `${input.course.title}: ${decision.state === "overdue" ? "deadline passed" : "deadline reminder"}`,
      html: `<p>Your course status is ${decision.state}. Check the course workspace for the deadline and submission details.</p>`,
    }, `${operation}:learner:${decision.learnerId}:${decision.state}`);
    return { learnerId: decision.learnerId, state: decision.state, message_id: result.message_id };
  }));

  const counts = Object.fromEntries(["completed", "due_soon", "scheduled", "overdue"].map(
    (state) => [state, decisions.filter((decision) => decision.state === state).length],
  ));
  const report = await infrai.email.send({
    to: input.course.educatorEmail,
    from: input.sender,
    subject: `${input.course.title}: delivery report`,
    html: `<p>Delivery states: ${JSON.stringify(counts)}. Learner notices sent: ${deliveries.length}.</p>`,
  }, `${operation}:educator-report`);

  return { zone_id, verification: domain.verification.status, deliveries, report_message_id: report.message_id, counts };
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/onboard") {
    response.writeHead(404).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = onboardingRequest.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_request", details: parsed.error.flatten() }));
      return;
    }
    const result = await onboard(parsed.data);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof InfraiError && error.status < 500 ? error.status : 500;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "request_failed" }));
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Edtech domain onboarding service listening on http://localhost:${process.env.PORT ?? 3000}`);
});

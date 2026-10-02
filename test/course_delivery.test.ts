import assert from "node:assert/strict";
import test from "node:test";
import { planCourseDelivery } from "../src/course_delivery.js";

test("notifies only open work that is overdue or due within the reminder window", () => {
  const decisions = planCourseDelivery([
    { learnerId: "done", email: "done@example.edu", dueAt: "2026-10-02T12:00:00.000Z", submittedAt: "2026-10-01T08:00:00.000Z" },
    { learnerId: "soon", email: "soon@example.edu", dueAt: "2026-10-01T18:00:00.000Z" },
    { learnerId: "later", email: "later@example.edu", dueAt: "2026-10-04T12:00:00.000Z" },
    { learnerId: "late", email: "late@example.edu", dueAt: "2026-09-30T12:00:00.000Z" },
  ], new Date("2026-10-01T12:00:00.000Z"), 24);

  assert.deepEqual(decisions.map(({ learnerId, state, shouldNotify }) => ({ learnerId, state, shouldNotify })), [
    { learnerId: "done", state: "completed", shouldNotify: false },
    { learnerId: "soon", state: "due_soon", shouldNotify: true },
    { learnerId: "later", state: "scheduled", shouldNotify: false },
    { learnerId: "late", state: "overdue", shouldNotify: true },
  ]);
});

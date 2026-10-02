export type LearnerDeadline = {
  learnerId: string;
  email: string;
  dueAt: string;
  submittedAt?: string;
};

export type DeliveryDecision = {
  learnerId: string;
  email: string;
  state: "completed" | "due_soon" | "scheduled" | "overdue";
  shouldNotify: boolean;
};

export function planCourseDelivery(
  learners: LearnerDeadline[],
  now: Date,
  reminderWindowHours: number,
): DeliveryDecision[] {
  const reminderBoundary = now.getTime() + reminderWindowHours * 60 * 60 * 1_000;
  return learners.map((learner) => {
    if (learner.submittedAt) {
      return { learnerId: learner.learnerId, email: learner.email, state: "completed", shouldNotify: false };
    }
    const due = Date.parse(learner.dueAt);
    if (due < now.getTime()) {
      return { learnerId: learner.learnerId, email: learner.email, state: "overdue", shouldNotify: true };
    }
    if (due <= reminderBoundary) {
      return { learnerId: learner.learnerId, email: learner.email, state: "due_soon", shouldNotify: true };
    }
    return { learnerId: learner.learnerId, email: learner.email, state: "scheduled", shouldNotify: false };
  });
}

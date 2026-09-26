import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getCircle, getCircleHealthWeeks, getSettings } from "@/lib/api";

export default async function CirclePage() {
  const [circle, settings, weeks] = await Promise.all([
    getCircle(),
    getSettings(),
    getCircleHealthWeeks(),
  ]);
  const setupDone = 3;
  const ordered = [...circle.members].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      <DemoDataTag />

      <section>
        <h2 className="mb-2 font-display text-xl">Setup checklist</h2>
        <Card>
          <p className="font-medium">{setupDone}/4 ready</p>
          <ul className="mt-2 list-disc pl-5 text-muted">
            <li>Add emergency contacts</li>
            <li>Set family safe word</li>
            <li>Choose protection rules</li>
            <li>Invite family</li>
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">People</h2>
        <Card className="mb-2">
          <p className="font-medium">{circle.senior.name}</p>
          <p className="text-sm text-muted">Senior · this circle is for her</p>
        </Card>
        <ul className="space-y-2">
          {ordered.map((member) => (
            <li key={member.id}>
              <Card>
                <p className="font-medium">
                  {member.priority}. {member.name}
                </p>
                <p className="text-sm text-muted">
                  {member.relation} · {member.can_verify ? "Can verify calls" : "Does not verify calls"}
                </p>
                <div className="mt-2 flex gap-2">
                  <a className="text-brand" href={`tel:${member.phone.replace(/\s/g, "")}`}>
                    Call
                  </a>
                  <a className="text-brand" href={`sms:${member.phone.replace(/\s/g, "")}`}>
                    Text
                  </a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Emergency order</h2>
        <Card>
          <p className="text-muted">
            If Nani is in danger and nobody answers, we alert in this order:{" "}
            {ordered.map((member) => member.name).join(" → ")}.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Family safe word</h2>
        <Card>
          <p className="font-medium">Set ••••</p>
          <p className="text-muted">
            Asked on a call 2 days ago — {circle.safe_word_last_result}. The word itself is never shown here.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Protection rules</h2>
        <Card>
          <p>Ask for the safe word when: {settings.rules.prompt_safe_word_when.join(", ")}.</p>
          <p className="mt-2 text-muted">Wait for family reply: {settings.rules.verify_timeout_s}s</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Circle health</h2>
        <Card>
          <p className="text-muted">Family calls with Nani over the last 8 weeks (goal: 1 call/week).</p>
          <p className="mt-2 tabular-nums">{weeks.map((week) => `${week.week_label}:${week.calls}`).join(" · ")}</p>
          <p className="mt-3">
            It&apos;s been {circle.health.last_contact_days} days since anyone called Nani. Scammers target
            isolation — a 5-minute call helps.
          </p>
        </Card>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getIncident } from "@/lib/api";

type IncidentPageProps = {
  params: Promise<{ incidentId: string }>;
};

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { incidentId } = await params;
  const incident = await getIncident(incidentId);

  if (!incident) {
    return <p>We could not find that incident.</p>;
  }

  const cueGroups = ["voice", "words", "caller", "money"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DemoDataTag />
      </div>

      <section>
        <h2 className="font-display text-2xl">{incident.outcome_label}</h2>
        <Badge tone={incident.risk_score >= 0.7 ? "critical" : incident.risk_score >= 0.4 ? "attention" : "safe"}>
          Risk {(incident.risk_score * 100).toFixed(0)}%
        </Badge>
        <p className="mt-2 text-muted">
          {new Date(incident.started_at).toLocaleString()} · {incident.duration_s}s · {incident.caller_number}
        </p>
        <p className="mt-3">{incident.family_summary}</p>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Story timeline</h2>
        <ol className="space-y-2">
          {incident.story_steps.map((step) => (
            <li key={`${step.time}-${step.label}`} className="rounded-card bg-brand-soft px-4 py-3">
              <span className="tabular-nums text-sm text-muted">{step.time}s</span>
              <p>{step.label}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Risk over the call</h2>
        <Card>
          <p className="text-muted">
            Chart in a later phase: voice synthetic vs overall risk, warning line at 0.7.
          </p>
          <p className="mt-2 text-sm text-muted">{incident.timeline.length} labelled moments ready.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">What ScamShield noticed</h2>
        {cueGroups.map((group) => {
          const items = incident.cues.filter((cue) => cue.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-3">
              <h3 className="text-sm font-medium capitalize text-muted">{group}</h3>
              <ul className="mt-1 space-y-1">
                {items.map((cue) => (
                  <li key={cue.label} className="rounded-pill bg-attention-soft px-3 py-2 text-sm">
                    {cue.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {incident.detectors.length ? (
        <section>
          <h2 className="mb-2 font-display text-xl">How we knew</h2>
          <ul className="space-y-2">
            {incident.detectors.map((detector) => (
              <li key={detector.name}>
                <Card>
                  <p className="font-medium">{detector.name}</p>
                  <p className="text-sm text-muted">{detector.finding}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 font-display text-xl">Transcript excerpts</h2>
        <p className="mb-2 text-sm text-muted">Transcribed automatically</p>
        <ul className="space-y-2">
          {incident.transcript.slice(0, 5).map((line) => (
            <li key={`${line.start}-${line.text}`}>
              <Card>
                <p className="text-sm capitalize text-muted">{line.speaker}</p>
                <p>{line.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Actions</h2>
        <div className="flex flex-col gap-2">
          {incident.campaign_id ? (
            <Link className="inline-flex min-h-12 items-center text-brand" href={`/community/campaign/${incident.campaign_id}`}>
              Report to Community · {incident.campaign_name}
            </Link>
          ) : null}
          <a className="inline-flex min-h-12 items-center text-brand" href="tel:+14045550100">
            Call Nani
          </a>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { WarnCommunityButton } from "@/components/family/WarnCommunityButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getIncident } from "@/lib/api";
import { formatDuration, formatEastern } from "@/lib/time";

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
  const grokReasons = incident.report.evidence.filter((item) => item.text);

  return (
    <div className="space-y-6">
      {incident.is_demo ? (
        <div className="flex items-center justify-between">
          <DemoDataTag />
        </div>
      ) : null}

      <section>
        <h2 className="font-display text-2xl">{incident.outcome_label}</h2>
        <Badge tone={incident.risk_score >= 0.7 ? "critical" : incident.risk_score >= 0.4 ? "attention" : "safe"}>
          Risk {(incident.risk_score * 100).toFixed(0)}%
        </Badge>
        {incident.scam_type_label ? <p className="mt-2 font-medium">Scam type: {incident.scam_type_label}</p> : null}
        <p className="mt-2 text-muted">
          {formatEastern(incident.started_at)} · {formatDuration(incident.duration_s)}
          {incident.caller_number ? ` · ${incident.caller_number}` : ""}
        </p>
        <p className="mt-3">{incident.family_summary}</p>
      </section>

      {incident.grok_action ? (
        <section>
          <h2 className="mb-2 font-display text-xl">What Grok told Nani</h2>
          <Card>
            <p>{incident.grok_action}</p>
          </Card>
        </section>
      ) : null}

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

      {grokReasons.length ? (
        <section>
          <h2 className="mb-2 font-display text-xl">Grok flags</h2>
          <ul className="space-y-2">
            {grokReasons.map((item) => (
              <li key={`${item.start}-${item.text}`}>
                <Card>
                  <p className="text-sm text-muted">{item.type}</p>
                  <p>“{item.text}”</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <section>
        <h2 className="mb-2 font-display text-xl">Transcript</h2>
        <p className="mb-2 text-sm text-muted">From Kale’s app (AssemblyAI), not guessed by Grok</p>
        {incident.transcript.length === 0 ? (
          <Card>
            <p className="text-muted">No transcript lines on this report yet. The next desktop send will include the full call so far.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {incident.transcript.map((line) => (
              <li key={`${line.start}-${line.text}`}>
                <Card>
                  <p className="text-sm capitalize text-muted">{line.speaker}</p>
                  <p>{line.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Community</h2>
        <WarnCommunityButton callId={incident.id} />
        {incident.campaign_id ? (
          <Link className="mt-2 inline-flex min-h-12 items-center text-brand" href={`/community/campaign/${incident.campaign_id}`}>
            Open campaign
          </Link>
        ) : null}
      </section>
    </div>
  );
}

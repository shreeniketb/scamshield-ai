import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getIncidents } from "@/lib/api";

export default async function ActivityPage() {
  const incidents = await getIncidents();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Calls, messages and payments</h2>
        <DemoDataTag />
      </div>
      <p className="text-sm text-muted">Filter chips: All · Calls · Messages · Payments · Verifications</p>
      <ul className="space-y-2">
        {incidents.map((incident) => (
          <li key={incident.id}>
            <Link href={`/family/activity/${incident.id}`}>
              <Card>
                <p className="font-medium">{incident.title}</p>
                <p className="text-sm text-muted">
                  {incident.channel === "whatsapp_call" ? "Call" : "Message"} ·{" "}
                  {new Date(incident.started_at).toLocaleString()}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

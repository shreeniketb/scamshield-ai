import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getIncidents } from "@/lib/api";
import { formatEastern } from "@/lib/time";

export default async function ActivityPage() {
  const incidents = (await getIncidents()).filter((item) => !item.is_demo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Calls and messages</h2>
      </div>
      {incidents.length === 0 ? (
        <Card>
          <p className="text-muted">No live calls yet. When Kale’s app sends a verdict, it will show up here.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link href={`/family/activity/${incident.id}`}>
                <Card>
                  <p className="font-medium">{incident.title}</p>
                  <p className="text-sm text-muted">
                    {incident.channel === "whatsapp_call" ? "Call" : "Message"} · {formatEastern(incident.started_at)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

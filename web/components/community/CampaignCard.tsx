import Link from "next/link";
import { AudioLines, ArrowRight, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Campaign, CampaignSeverity } from "@/lib/types";
import { sparkEndingAt, type TimeRange } from "@/lib/communityView";
import { formatAgo } from "@/lib/time";

const tone: Record<CampaignSeverity, "critical" | "attention" | "info"> = {
  critical: "critical",
  warning: "attention",
  info: "info",
};

const severityWord: Record<CampaignSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const channels: Record<string, { label: string; Icon: typeof Phone }> = {
  call: { label: "Call", Icon: Phone },
  voice: { label: "Voice clone", Icon: AudioLines },
  sms: { label: "Text", Icon: MessageSquare },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle },
};

type CampaignCardProps = {
  campaign: Campaign;
  reports: number;
  now: number;
  range: TimeRange;
  neighborhoods: Record<string, string>;
  active: boolean;
  activeZip: string | null;
  onHover: (id: string | null) => void;
  onWarn: () => void;
};

export function CampaignCard({
  campaign,
  reports,
  now,
  range,
  neighborhoods,
  active,
  activeZip,
  onHover,
  onWarn,
}: CampaignCardProps) {
  const spark = sparkEndingAt(campaign.trend, range, reports);

  return (
    <article
      className={`rounded-card transition duration-200 ease-out ${
        active ? "ring-2 ring-brand ring-offset-2 ring-offset-paper" : "ring-2 ring-transparent"
      }`}
      onMouseEnter={() => onHover(campaign.id)}
      onMouseLeave={() => onHover(null)}
      onFocusCapture={() => onHover(campaign.id)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(null);
      }}
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-2xl text-ink">{campaign.name}</h3>
            <p className="mt-1 text-muted">
              <span className="tabular-nums">{reports.toLocaleString("en-US")} reports</span>
              {" · "}first seen {formatAgo(campaign.first_seen, now)}
            </p>
          </div>
          <Sparkline data={spark} showValue valueLabel={reports.toLocaleString("en-US")} width={120} height={48} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={tone[campaign.severity]}>{severityWord[campaign.severity]}</Badge>
          {campaign.channels.map((channel) => {
            const item = channels[channel] ?? { label: channel, Icon: MessageSquare };
            const Icon = item.Icon;
            return (
              <span
                key={channel}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-pill bg-paper px-3 text-sm text-ink"
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.label}
              </span>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Areas">
          {campaign.areas.map((zip) => (
            <li key={zip}>
              <span
                className={`inline-flex min-h-8 items-center rounded-pill px-3 text-sm ${
                  activeZip === zip ? "bg-brand text-white" : "bg-brand-soft text-brand"
                }`}
              >
                {zip}
                {neighborhoods[zip] ? ` · ${neighborhoods[zip]}` : ""}
              </span>
            </li>
          ))}
        </ul>

        <blockquote className="mt-4 border-l-2 border-attention bg-attention-soft px-3 py-2 text-ink">
          “{campaign.example_redacted}”
        </blockquote>

        <p className="mt-3 text-ink">
          <span className="font-medium">How to spot it. </span>
          {campaign.how_to_spot}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onWarn}>
            Warn my circle
          </Button>
          <Link
            href={`/community/campaign/${campaign.id}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-pill px-5 font-medium text-brand hover:bg-brand-soft"
          >
            Details
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </Card>
    </article>
  );
}

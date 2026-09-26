import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getCampaign, getCampaignPoints } from "@/lib/api";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  const points = await getCampaignPoints(id);

  if (!campaign) {
    return <p className="col-span-12">We could not find that campaign.</p>;
  }

  return (
    <>
      <section className="col-span-12 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{campaign.name}</h1>
          <p className="text-muted">
            {campaign.severity} · {campaign.channels.join(", ")} · first seen{" "}
            {new Date(campaign.first_seen).toLocaleString()}
          </p>
        </div>
        <DemoDataTag />
      </section>

      <section className="col-span-12">
        <h2 className="mb-2 font-display text-xl">How to spot it</h2>
        <Card>{campaign.how_to_spot}</Card>
      </section>

      <section className="col-span-12 lg:col-span-7">
        <h2 className="mb-2 font-display text-xl">Reports over time</h2>
        <Card>
          <p className="text-muted">72-hour area chart in a later phase. {campaign.trend.length} hourly points seeded.</p>
        </Card>
      </section>

      <section className="col-span-12 lg:col-span-5">
        <h2 className="mb-2 font-display text-xl">Protection outcome</h2>
        <Card>38 of 52 exposed families were warned first.</Card>
      </section>

      <section className="col-span-12">
        <h2 className="mb-2 font-display text-xl">Mutation Map</h2>
        <Card>
          <p>
            Each dot is a reported message, positioned by meaning. {points.length} points across{" "}
            {campaign.variant_names.length} variants are ready for the later visual.
          </p>
        </Card>
      </section>

      <section className="col-span-12">
        <h2 className="mb-2 font-display text-xl">Variant cards</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {campaign.variant_names.map((name) => (
            <Card key={name}>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-muted">{campaign.example_redacted}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="col-span-12">
        <h2 className="mb-2 font-display text-xl">Where it&apos;s spreading</h2>
        <Card>ZIPs: {campaign.areas.join(", ")}</Card>
      </section>
    </>
  );
}

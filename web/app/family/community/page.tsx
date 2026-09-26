import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { getCampaigns, getWarningNetwork } from "@/lib/api";

export default async function FamilyCommunityPage() {
  const campaigns = await getCampaigns();
  const top = campaigns.slice(0, 3);
  const network = await getWarningNetwork(top[0]?.id ?? "camp_grandparent_voice");

  return (
    <div className="space-y-6">
      <DemoDataTag />

      <section>
        <h2 className="mb-2 font-display text-xl">Nani&apos;s area</h2>
        <Card>
          <p className="font-medium">ZIP 30318 · West Midtown, Atlanta</p>
          <p className="text-muted">{campaigns.length} live campaigns in the metro area this week.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Top campaigns nearby</h2>
        <ul className="space-y-2">
          {top.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/community/campaign/${campaign.id}`}>
                <Card>
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-sm text-muted">{campaign.how_to_spot}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Your circle&apos;s network</h2>
        <Card>
          <p>
            Your circle is connected to 42 families in Atlanta · 3 warnings reached you before the scam
            did.
          </p>
          {network ? <p className="mt-2 text-sm text-muted">{network.insight}</p> : null}
        </Card>
      </section>

      <Link href="/community" className="inline-flex min-h-12 items-center text-brand">
        Open full Community Watch
      </Link>
    </div>
  );
}

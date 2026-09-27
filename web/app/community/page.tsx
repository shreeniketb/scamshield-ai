import { CommunityDashboard } from "@/components/community/CommunityDashboard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCampaigns,
  getCommunitySummary,
  getMap,
  getScamTypes,
  getStates,
  getWarningNetwork,
} from "@/lib/api";
import { stateShapes } from "@/lib/usMap";
import type { WarningNetwork } from "@/lib/types";

export const metadata = {
  title: "Community Watch · ScamShield",
};

export default async function CommunityPage() {
  try {
    const [summary, campaigns, map, scamTypes, states] = await Promise.all([
      getCommunitySummary(),
      getCampaigns(),
      getMap(),
      getScamTypes(),
      getStates(),
    ]);
    const networks = (
      await Promise.all(campaigns.map((campaign) => getWarningNetwork(campaign.id)))
    ).filter((network): network is WarningNetwork => network != null);

    return (
      <CommunityDashboard
        now={Date.now()}
        summary={summary}
        campaigns={campaigns}
        map={map}
        scamTypes={scamTypes}
        states={states}
        shapes={stateShapes()}
        networks={networks}
      />
    );
  } catch {
    return (
      <section className="col-span-12">
        <EmptyState
          title="Community Watch didn’t load"
          body="The dashboard couldn’t reach its data. Refresh the page to try again."
        />
      </section>
    );
  }
}

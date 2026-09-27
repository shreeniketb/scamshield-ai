import { ContactsCard } from "@/components/family/ContactsCard";
import { RulesCard } from "@/components/family/RulesCard";
import { SafeWordCard } from "@/components/family/SafeWordCard";
import { SetupChecklist } from "@/components/family/SetupChecklist";
import { Card } from "@/components/ui/Card";
import { getCircle, getSettings } from "@/lib/api";

function hasRealPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && !digits.includes("55501");
}

export default async function CirclePage() {
  const [circle, settings] = await Promise.all([getCircle(), getSettings()]);
  const phonesReady = settings.members.filter((member) => hasRealPhone(member.phone)).length >= 1;
  const methodReady = Boolean(settings.rules.protection_method);
  const items = [
    { label: "Add family phone numbers", done: phonesReady },
    { label: "Set family safe word", done: circle.safe_word_set },
    { label: "Choose safe word or “Is this you?”", done: methodReady },
  ];

  return (
    <div className="space-y-6">
      <section>
        <SetupChecklist items={items} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">People</h2>
        <Card className="mb-2">
          <p className="font-medium">{circle.senior.name}</p>
          <p className="text-sm text-muted">Senior · this circle is for her</p>
        </Card>
        <ContactsCard members={settings.members} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Family safe word</h2>
        <SafeWordCard
          safeWordSet={circle.safe_word_set}
          lastUsedAt={circle.safe_word_last_used_at}
          lastResult={circle.safe_word_last_result}
        />
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Protection rules</h2>
        <RulesCard rules={settings.rules} />
      </section>
    </div>
  );
}

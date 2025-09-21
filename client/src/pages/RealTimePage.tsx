import { PageSection } from "@/components/layout/PageSection";
import { BestCardFinder } from "../components/ui/BestCardFinder";
import { useAccounts } from "@/hooks/useApi";
import { useState } from "react";

export default function BestCardPage() {
  const accounts = useAccounts();
  const accountRows = accounts.data ?? [];

  // optional: allow filtering by selected cards on this page later
  const [selectedCardIds] = useState<string[]>([]);

  return (
    <div className="space-y-10">
      <PageSection
        title="Smart Swipe"
        description="Type a merchant to see your top card and smarter alternatives. We will also show ways to save more."
      />
      <BestCardFinder
        selectedCardIds={selectedCardIds}
        accountRows={accountRows.map((a) => ({
          id: a.id,
          nickname: a.nickname,
          issuer: a.issuer,
        }))}
      />
    </div>
  );
}

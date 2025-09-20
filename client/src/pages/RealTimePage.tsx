import { PageSection } from "@/components/layout/PageSection";
import { BestCardFinder } from "../components/ui/BestCardFinder";
import { useAccounts, useMerchants } from "@/hooks/useApi";
import { useState } from "react";

export default function BestCardPage() {
  const accounts = useAccounts();
  const merchants = useMerchants({ limit: 50, windowDays: 90 }); // more options to pick from
  const accountRows = accounts.data ?? [];
  const merchantRows = merchants.data ?? [];
  const merchantNames = merchantRows.map((m) => m.name).filter(Boolean);

  // optional: allow filtering by selected cards on this page later
  const [selectedCardIds] = useState<string[]>([]);

  return (
    <div className="space-y-10">
      <PageSection
        title="Best Card"
        description="Type a merchant and see which of your cards earns the most. We will also show ways to save more."
      />
      <BestCardFinder
        merchantOptions={merchantNames}
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

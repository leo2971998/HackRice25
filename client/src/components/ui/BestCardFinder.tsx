import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

type BestCardResult = {
  merchant: string;
  bestCard: {
    id: string;
    nickname: string;
    issuer: string;
    rewardRateText: string;
    estSavingsMonthly?: number;
  };
  youHaveThisCard: boolean;
  alternatives?: Array<{
    id: string;
    name: string;
    rewardRateText: string;
    estSavingsMonthly?: number;
  }>;
};

type MerchantRow = {
  id: string;
  name: string;
  slug: string;
  mcc?: string;
  primaryCategory?: string;
  brandGroup?: string;
  aliases?: string[];
  domains?: string[];
  tags?: string[];
};

const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function BestCardFinder({
  merchantOptions,
  selectedCardIds,
  accountRows,
}: {
  merchantOptions: string[];
  selectedCardIds?: string[];
  accountRows: { id: string; nickname: string; issuer: string }[];
}) {
  const [merchant, setMerchant] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BestCardResult | null>(null);

  const filteredSuggestions = useMemo(() => {
    if (!merchant) return merchantOptions.slice(0, 6);
    const q = merchant.toLowerCase();
    return merchantOptions
      .filter((x) => x.toLowerCase().includes(q))
      .slice(0, 6);
  }, [merchant, merchantOptions]);

  async function onFind() {
    if (!merchant.trim()) {
      setError("Enter a merchant");
      setResult(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Fake API delay
      await new Promise((r) => setTimeout(r, 600));

      // Simple conditional mock data
      let mockData: BestCardResult;
      if (merchant.toLowerCase().includes("starbucks")) {
        mockData = {
          merchant: merchant.trim(),
          bestCard: {
            id: "card_chase",
            nickname: "Chase Sapphire Preferred",
            issuer: "Chase",
            rewardRateText: "3x at Dining",
            estSavingsMonthly: 15.0,
          },
          youHaveThisCard: true,
          alternatives: [
            {
              id: "alt_amex_gold",
              name: "Amex Gold",
              rewardRateText: "4x at Restaurants",
              estSavingsMonthly: 12.0,
            },
          ],
        };
      } else if (merchant.toLowerCase().includes("amazon")) {
        mockData = {
          merchant: merchant.trim(),
          bestCard: {
            id: "card_amazon",
            nickname: "Amazon Prime Visa",
            issuer: "Chase",
            rewardRateText: "5% on Amazon",
            estSavingsMonthly: 25.0,
          },
          youHaveThisCard: false,
          alternatives: [
            {
              id: "alt_citi_double",
              name: "Citi Double Cash",
              rewardRateText: "2% everywhere",
              estSavingsMonthly: 5.0,
            },
          ],
        };
      } else {
        mockData = {
          merchant: merchant.trim(),
          bestCard: {
            id: "card_generic",
            nickname: "Citi Premier",
            issuer: "Citi",
            rewardRateText: "3x Travel & Dining",
            estSavingsMonthly: 10.0,
          },
          youHaveThisCard: false,
          alternatives: [
            {
              id: "alt_amex_blue",
              name: "Amex Blue Cash Preferred",
              rewardRateText: "6% at Supermarkets",
              estSavingsMonthly: 7.0,
            },
            {
              id: "alt_chase_freedom",
              name: "Chase Freedom Unlimited",
              rewardRateText: "1.5% everywhere",
              estSavingsMonthly: 3.0,
            },
          ],
        };
      }

      setResult(mockData);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Best card for a merchant
        </CardTitle>
        <CardDescription>
          Type a store or pick one from your recent merchants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-8 space-y-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              placeholder="e.g., Starbucks, Amazon, H-E-B"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
            {filteredSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {filteredSuggestions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs hover:bg-muted/60"
                    onClick={() => setMerchant(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-4 flex items-end">
            <Button className="w-full" onClick={onFind} disabled={isLoading}>
              {isLoading ? "Finding…" : "Find best card"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!error && !isLoading && !result && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            Enter a merchant to see the best card. We will also show tips to
            save more.
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-7 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Best card
                </CardTitle>
                <CardDescription>
                  Based on category and reward rate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {result.bestCard.nickname}{" "}
                      <span className="text-muted-foreground">
                        ({result.bestCard.issuer})
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {result.bestCard.rewardRateText}
                    </p>
                  </div>
                  {result.youHaveThisCard ? (
                    <Badge variant="secondary">You have this card</Badge>
                  ) : (
                    <Badge>New</Badge>
                  )}
                </div>
                {typeof result.bestCard.estSavingsMonthly === "number" && (
                  <p className="text-sm text-muted-foreground">
                    Est. monthly gain:{" "}
                    <span className="font-semibold text-foreground">
                      {usd.format(result.bestCard.estSavingsMonthly)}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {result.youHaveThisCard
                    ? `You already have the best card for ${result.merchant}.`
                    : `This beats your current linked cards for ${result.merchant}.`}
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ways to save more
                </CardTitle>
                <CardDescription>
                  Alternatives and stackable tips
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.alternatives?.length ? (
                  <>
                    {result.alternatives.slice(0, 3).map((alt) => (
                      <div
                        key={alt.id}
                        className="rounded-2xl bg-muted/40 px-4 py-3"
                      >
                        <p className="font-medium text-foreground">
                          {alt.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {alt.rewardRateText}
                        </p>
                        {typeof alt.estSavingsMonthly === "number" && (
                          <p className="text-xs text-muted-foreground">
                            You could save about{" "}
                            {usd.format(alt.estSavingsMonthly)} more per month.
                          </p>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Stack with portals, targeted offers, or in-app boosts.
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                    No stronger alternatives right now.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

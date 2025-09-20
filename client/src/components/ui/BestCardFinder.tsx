import { useEffect, useMemo, useState } from "react";
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
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

type BestCardResult = {
  merchant: string;
  category?: string;
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
    percentBack?: number;
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
  selectedCardIds,
  accountRows,
}: {
  selectedCardIds?: string[];
  accountRows: { id: string; nickname: string; issuer: string }[];
}) {
  // form state
  const [merchant, setMerchant] = useState("");
  const [spend, setSpend] = useState<number>(150);

  // merchants list (autocomplete)
  const [allMerchants, setAllMerchants] = useState<MerchantRow[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // result + errors
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BestCardResult | null>(null);

  // fetch seeded merchants once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingMerchants(true);
        setLoadError(null);
        const res = await api.get("/merchants/all", {
          params: { limit: 2000 },
        });
        if (!mounted) return;
        setAllMerchants((res.data.items as MerchantRow[]) || []);
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(
          e?.response?.data?.message || e?.message || "Failed to load merchants"
        );
      } finally {
        if (!mounted) return;
        setLoadingMerchants(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // unique sorted merchant names for chips
  const merchantOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of allMerchants) {
      if (m?.name) s.add(m.name);
      if (Array.isArray(m?.aliases)) {
        for (const a of m.aliases) if (a) s.add(a);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allMerchants]);

  const filteredSuggestions = useMemo(() => {
    if (!merchant) return merchantOptions.slice(0, 6);
    const q = merchant.toLowerCase();
    return merchantOptions
      .filter((x) => x.toLowerCase().includes(q))
      .slice(0, 6);
  }, [merchant, merchantOptions]);

  // helpers
  const parseSpend = (val: string) => {
    const n = Number(val.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const submit = async () => {
    const name = merchant.trim();
    if (!name) {
      setError("Enter a merchant");
      setResult(null);
      return;
    }
    if (!(spend > 0)) {
      setError("Enter a valid monthly spend");
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post("/recommendations/best-card", {
        merchant: name,
        assumedMonthlySpend: spend,
        selectedCardIds, // optional
      });

      const data = res.data || {};
      const mapped: BestCardResult = {
        merchant: data.merchant || name,
        category: data.category,
        bestCard: data.bestOwned
          ? {
              id: data.bestOwned.accountId,
              nickname: data.bestOwned.nickname,
              issuer: data.bestOwned.issuer,
              rewardRateText: data.bestOwned.rewardRateText,
              estSavingsMonthly: undefined, // highlight stays in alts
            }
          : {
              id: "none",
              nickname: "No owned card",
              issuer: "",
              rewardRateText: `0% ${data.category ?? ""}`.trim(),
            },
        youHaveThisCard: !!data.bestOwned,
        alternatives: (data.alternatives || []).map((a: any) => ({
          id: a.id,
          name: `${a.issuer ?? ""} ${a.name ?? ""}`.trim(),
          rewardRateText: a.rewardRateText,
          estSavingsMonthly: a.estSavingsMonthly,
          percentBack: a.percentBack,
        })),
      };

      setResult(mapped);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.message || "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Enter key submits
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Best card for a merchant
        </CardTitle>
        <CardDescription>
          Type a store and we’ll suggest the best card from your linked cards.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Inputs row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Merchant input + chips */}
          <div className="sm:col-span-7 space-y-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              placeholder={
                loadingMerchants
                  ? "Loading merchants…"
                  : "e.g., Starbucks, Amazon, H-E-B"
              }
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loadingMerchants}
            />
            {loadError && (
              <div className="text-xs text-destructive pt-1">{loadError}</div>
            )}

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

          {/* Spend input */}
          <div className="sm:col-span-3 space-y-2">
            <Label htmlFor="spend">Monthly spend estimate</Label>
            <Input
              id="spend"
              inputMode="decimal"
              value={String(spend)}
              onChange={(e) => setSpend(parseSpend(e.target.value))}
              placeholder="150"
            />
            <p className="text-[11px] text-muted-foreground">
              Used to estimate monthly savings
            </p>
          </div>

          {/* Button */}
          <div className="sm:col-span-2 flex items-end">
            <Button
              className="w-full"
              onClick={submit}
              disabled={isLoading || loadingMerchants}
            >
              {isLoading ? "Finding…" : "Find best card"}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!error && !isLoading && !result && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            Start typing a merchant. We’ll use your seeded list for suggestions.
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Best owned card */}
            <Card className="md:col-span-7 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Best card
                </CardTitle>
                <CardDescription>
                  {result.category
                    ? `Category: ${result.category}`
                    : "Based on category and reward rate"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {result.bestCard.nickname}{" "}
                      {result.bestCard.issuer && (
                        <span className="text-muted-foreground">
                          ({result.bestCard.issuer})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {result.bestCard.rewardRateText}
                    </p>
                  </div>
                  {result.youHaveThisCard ? (
                    <Badge variant="secondary">You have this card</Badge>
                  ) : (
                    <Badge>Suggestion</Badge>
                  )}
                </div>

                {typeof result.bestCard.estSavingsMonthly === "number" &&
                result.bestCard.estSavingsMonthly > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Est. monthly gain:{" "}
                    <span className="font-semibold text-foreground">
                      {usd.format(result.bestCard.estSavingsMonthly)}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Est. monthly gain depends on your actual spend pattern.
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {result.youHaveThisCard
                    ? `You already have the best card for ${result.merchant}.`
                    : `No owned card beats this for ${result.merchant}.`}
                </p>
              </CardContent>
            </Card>

            {/* Alternatives */}
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
                        {typeof alt.estSavingsMonthly === "number" &&
                          alt.estSavingsMonthly > 0 && (
                            <p className="text-xs text-muted-foreground">
                              You could save about{" "}
                              {usd.format(alt.estSavingsMonthly)} more per
                              month.
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

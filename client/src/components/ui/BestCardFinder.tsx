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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    percentBack?: number;
    estEarningsMonthly?: number;
  };
  youHaveThisCard: boolean;
  alternatives?: Array<{
    id: string;
    name: string;
    rewardRateText: string;
    percentBack?: number;
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

type SpendBasis = "one-time" | "monthly" | "yearly";

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
  const [merchant, setMerchant] = useState("");
  const [basis, setBasis] = useState<SpendBasis>("monthly");
  const [spendInput, setSpendInput] = useState<string>("150");

  const spendNumber = useMemo(() => {
    const n = parseFloat(spendInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [spendInput]);

  const basisLabelShort =
    basis === "one-time" ? "purchase" : basis === "yearly" ? "year" : "month";

  const [allMerchants, setAllMerchants] = useState<MerchantRow[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BestCardResult | null>(null);

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
        setAllMerchants(res.data.items as MerchantRow[]);
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

  const merchantOptions = useMemo(
    () => allMerchants.map((m) => m.name).filter(Boolean),
    [allMerchants]
  );

  const filteredSuggestions = useMemo(() => {
    if (!merchant) return merchantOptions.slice(0, 6);
    const q = merchant.toLowerCase();
    return merchantOptions
      .filter((x) => x.toLowerCase().includes(q))
      .slice(0, 6);
  }, [merchant, merchantOptions]);

  function normalizeMoneyString(s: string): string {
    let clean = s.replace(/[^\d.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("");
    if (clean === "" || clean === ".") return "";
    const n = Math.max(0, parseFloat(clean));
    if (!Number.isFinite(n)) return "";
    return n.toFixed(2).replace(/\.00$/, "");
  }

  async function onFind() {
    const name = merchant.trim();
    if (!name) {
      setError("Enter a merchant");
      setResult(null);
      return;
    }
    if (!(spendNumber > 0)) {
      setError(
        basis === "one-time"
          ? "Enter a valid purchase amount"
          : `Enter a valid ${basisLabelShort} spend`
      );
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const assumedMonthly =
        basis === "monthly"
          ? spendNumber
          : basis === "yearly"
          ? spendNumber / 12
          : spendNumber;

      const res = await api.post("/recommendations/best-card", {
        merchant: name,
        assumedMonthlySpend: assumedMonthly,
        selectedCardIds,
      });

      const data = res.data || {};
      const bestOwned = data.bestOwned || null;
      const alternatives = Array.isArray(data.alternatives)
        ? data.alternatives
        : [];
      const bestOwnedPct: number =
        typeof bestOwned?.percentBack === "number" ? bestOwned.percentBack : 0;

      const mapped: BestCardResult = {
        merchant: data.merchant || name,
        category: data.category,
        bestCard: bestOwned
          ? {
              id: bestOwned.accountId,
              nickname: bestOwned.nickname,
              issuer: bestOwned.issuer,
              rewardRateText: bestOwned.rewardRateText,
              percentBack: bestOwnedPct,
              estEarningsMonthly: assumedMonthly * bestOwnedPct,
            }
          : {
              id: "none",
              nickname: "No owned card",
              issuer: "",
              rewardRateText: `0% ${data.category ?? ""}`.trim(),
              percentBack: 0,
              estEarningsMonthly: 0,
            },
        youHaveThisCard: Boolean(bestOwned),
        alternatives: alternatives.map((a: any) => ({
          id: a.id,
          name: `${a.issuer ?? ""} ${a.name ?? ""}`.trim(),
          rewardRateText: a.rewardRateText,
          percentBack:
            typeof a.percentBack === "number" ? a.percentBack : undefined,
          estSavingsMonthly: undefined,
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
  }

  const leftMessage = useMemo(() => {
    if (!result) return "";
    const topAlt = result.alternatives?.[0];
    const ownedPct = result.bestCard.percentBack ?? 0;
    const altPct = topAlt?.percentBack ?? 0;
    if (!result.youHaveThisCard)
      return `You do not have a great card for ${result.merchant} yet.`;
    if (altPct > ownedPct)
      return `Another card could earn more at ${result.merchant}.`;
    return `This is your best card for ${result.merchant}.`;
  }, [result]);

  const bestEarningsAmount = useMemo(() => {
    if (!result) return 0;
    const pct = result.bestCard.percentBack ?? 0;
    return Math.max(0, pct * (spendNumber || 0));
  }, [result, spendNumber]);

  const altSavings = useMemo(() => {
    if (!result?.alternatives?.length) return [];
    const ownedPct = result.bestCard.percentBack ?? 0;
    return result.alternatives.map((alt) => {
      const altPct = alt.percentBack ?? 0;
      const extra = Math.max(0, (altPct - ownedPct) * (spendNumber || 0));
      return { ...alt, estSavingsAmount: extra };
    });
  }, [result, spendNumber]);

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Best card for a merchant
        </CardTitle>
        <CardDescription>
          Type a store and pick your spend basis.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Row: all controls align bottom */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-end">
          {/* Merchant */}
          <div className="sm:col-span-6 space-y-2 min-w-0">
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              className="h-11"
              placeholder={
                loadingMerchants
                  ? "Loading merchants…"
                  : "e.g., Starbucks, Amazon, H-E-B"
              }
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              disabled={loadingMerchants}
            />
            {loadError && (
              <div className="text-xs text-destructive pt-1">{loadError}</div>
            )}
          </div>

          {/* Spend basis dropdown */}
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="basis">Basis</Label>
            <Select
              value={basis}
              onValueChange={(v: SpendBasis) => setBasis(v)}
            >
              <SelectTrigger id="basis" className="h-11 w-full">
                <SelectValue placeholder="Choose basis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-time">One-time</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount input */}
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="spend">Amount</Label>
            <Input
              id="spend"
              className="h-11"
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              value={spendInput}
              onChange={(e) => setSpendInput(e.target.value)}
              onBlur={(e) =>
                setSpendInput(normalizeMoneyString(e.target.value))
              }
              placeholder={
                basis === "one-time"
                  ? "50"
                  : basis === "yearly"
                  ? "1800"
                  : "150"
              }
            />
          </div>

          {/* CTA */}
          <div className="sm:col-span-2">
            <Button
              className="h-11 w-full whitespace-nowrap"
              onClick={onFind}
              disabled={isLoading || loadingMerchants}
            >
              {isLoading ? "Finding…" : "Find best card"}
            </Button>
          </div>
        </div>

        {/* Suggestions row lives BELOW the controls so it doesn't affect alignment */}
        {filteredSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!error && !isLoading && !result && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            Start typing a merchant. You can choose one-time, monthly, or
            yearly.
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Left */}
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

                <p className="text-sm text-muted-foreground">
                  Estimated earnings{" "}
                  {basis === "one-time"
                    ? "for this purchase"
                    : `per ${basisLabelShort}`}{" "}
                  <span className="font-semibold text-foreground">
                    {usd.format(bestEarningsAmount)}
                  </span>
                </p>

                <p className="text-xs text-muted-foreground">{leftMessage}</p>
              </CardContent>
            </Card>

            {/* Right */}
            <Card className="md:col-span-5 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ways to save more
                </CardTitle>
                <CardDescription>
                  Cards that could save you more per {basisLabelShort}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {altSavings.length ? (
                  altSavings.slice(0, 3).map((alt) => (
                    <div
                      key={alt.id}
                      className="rounded-2xl bg-muted/40 px-4 py-3"
                    >
                      <p className="font-medium text-foreground">{alt.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {alt.rewardRateText}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You could save about{" "}
                        {usd.format(
                          Math.max(0, (alt as any).estSavingsAmount ?? 0)
                        )}{" "}
                        more per {basisLabelShort}.
                      </p>
                    </div>
                  ))
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

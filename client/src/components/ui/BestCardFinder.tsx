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
import { Label } from "@/components/ui/Label";
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

type CapInfo = {
  amount: number; // USD cap amount
  period: "month" | "quarter" | "year";
  postRate: number; // as percent, e.g., 1 for 1%
};

type BestCardResult = {
  merchant: string;
  category?: string;
  bestCard: {
    id: string;
    nickname: string;
    issuer: string;
    rewardRateText: string;
    percentBack?: number; // 0.05 for 5
    cap?: CapInfo;
  };
  youHaveThisCard: boolean;
  alternatives?: Array<{
    id: string;
    name: string;
    rewardRateText: string;
    percentBack?: number;
    // optional perks your backend can return; UI hides if absent
    benefits?: string[]; // e.g., ["3% gas", "Cell phone insurance", "Extended warranty"]
    categories?: string[]; // e.g., ["groceries", "gas", "dining"]
    cap?: CapInfo;
  }>;
  matchConfidence?: "exact" | "high" | "low";
  categorySource?: "mcc" | "alias" | "model";
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

// floor to whole percent for clean display
function pctFloor(x?: number) {
  return Math.max(0, Math.floor((x ?? 0) * 100 + 0.0000001));
}

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
  const hasLinkedCards = accountRows.length > 0;

  const spendNumber = useMemo(() => {
    const n = parseFloat(spendInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [spendInput]);

  // Labels to read naturally
  const unitLabel =
    basis === "one-time"
      ? "this purchase"
      : basis === "yearly"
      ? "year"
      : "month";

  // Amount used when TALKING to the backend for cap logic etc. (monthly)
  const assumedMonthly = useMemo(() => {
    if (basis === "monthly") return spendNumber;
    if (basis === "yearly") return spendNumber / 12;
    return spendNumber; // one-time → treat as monthly for backend normalization
  }, [basis, spendNumber]);

  // Amount used for DISPLAY and savings numbers (matches user’s basis exactly)
  const displayAmount = useMemo(() => {
    if (basis === "yearly") return spendNumber; // per year
    return spendNumber; // per month or per purchase
  }, [basis, spendNumber]);

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
    if (!hasLinkedCards) {
      setError("Link at least one card to get personalized results");
      setResult(null);
      return;
    }
    if (!(spendNumber > 0)) {
      setError(
        basis === "one-time"
          ? "Enter a valid purchase amount"
          : `Enter a valid ${unitLabel} spend`
      );
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
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

      const mapped: BestCardResult = {
        merchant: data.merchant || name,
        category: data.category,
        bestCard: bestOwned
          ? {
              id: bestOwned.accountId,
              nickname: bestOwned.nickname,
              issuer: bestOwned.issuer,
              rewardRateText: bestOwned.rewardRateText,
              percentBack:
                typeof bestOwned.percentBack === "number"
                  ? bestOwned.percentBack
                  : 0,
              cap: bestOwned.cap || undefined,
            }
          : {
              id: "none",
              nickname: "No owned card",
              issuer: "",
              rewardRateText: `0% ${data.category ?? ""}`.trim(),
              percentBack: 0,
            },
        youHaveThisCard: Boolean(bestOwned),
        alternatives: alternatives
          .map((a: any) => ({
            id: a.id,
            name: `${a.issuer ?? ""} ${a.name ?? ""}`.trim(),
            rewardRateText: a.rewardRateText,
            percentBack: typeof a.percentBack === "number" ? a.percentBack : 0,
            benefits: Array.isArray(a.benefits) ? a.benefits : undefined,
            categories: Array.isArray(a.categories) ? a.categories : undefined,
            cap: a.cap || undefined,
          }))
          .sort(
            (
              A: { percentBack?: number | null },
              B: { percentBack?: number | null }
            ) => (B.percentBack ?? 0) - (A.percentBack ?? 0)
          ),
        matchConfidence: data.matchConfidence,
        categorySource: data.categorySource,
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

  // Summary message on the left
  const leftMessage = useMemo(() => {
    if (!result) return "";
    const ownedPct = result.bestCard.percentBack ?? 0;
    const topAlt = result.alternatives?.[0];
    const altPct = topAlt?.percentBack ?? 0;
    if (!result.youHaveThisCard)
      return `You do not have a strong card for ${result.merchant} yet.`;
    if (altPct > ownedPct)
      return `Another card could earn more at ${result.merchant}.`;
    return `This is your best card for ${result.merchant}.`;
  }, [result]);

  // Earnings and savings based on the DISPLAY basis
  const bestEarnAmount = useMemo(() => {
    if (!result) return 0;
    const pct = result.bestCard.percentBack ?? 0;
    return Math.max(0, displayAmount * pct);
  }, [result, displayAmount]);

  // For yearly we also show a small per month helper
  const helperPerMonth = useMemo(() => {
    if (basis !== "yearly") return null;
    return bestEarnAmount / 12;
  }, [basis, bestEarnAmount]);

  // Alternative list with difference vs owned on the same basis
  const altCalc = useMemo(() => {
    if (!result?.alternatives?.length) return [];
    const ownedPct = result.bestCard.percentBack ?? 0;
    // compute and then sort by extra savings
    return result.alternatives
      .map((alt) => {
        const altPct = alt.percentBack ?? 0;
        const earn = Math.max(0, displayAmount * altPct);
        const diffPctInt = Math.max(0, pctFloor(altPct) - pctFloor(ownedPct));
        const extra = Math.max(0, displayAmount * (altPct - ownedPct));
        const sameRate = pctFloor(altPct) === pctFloor(ownedPct);
        return {
          ...alt,
          earn,
          extra,
          diffPctInt,
          sameRate,
        };
      })
      .sort((a, b) => b.extra - a.extra);
  }, [result, displayAmount]);

  function CapRow({ cap }: { cap?: CapInfo }) {
    if (!cap) return null;
    return (
      <div className="rounded-lg bg-background/70 p-2 text-xs text-foreground/80">
        Limits: up to {usd.format(cap.amount)} per {cap.period}
        {" • "}after that: {cap.postRate}% base rate
      </div>
    );
  }

  function MetaChips() {
    if (!result) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {result.matchConfidence && (
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs">
            Match: {result.matchConfidence}
          </span>
        )}
        {result.categorySource && (
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs">
            Category source: {result.categorySource}
          </span>
        )}
        {result.category && (
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-xs">
            Category: {result.category}
          </span>
        )}
      </div>
    );
  }

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
        {/* Controls */}
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

          {/* Spend basis */}
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

          {/* Amount */}
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
                  ? "$50"
                  : basis === "yearly"
                  ? "$1800"
                  : "$150"
              }
            />
          </div>

          {/* CTA */}
          <div className="sm:col-span-2">
            <Button
              className="h-11 w-full whitespace-nowrap"
              onClick={onFind}
              disabled={isLoading || loadingMerchants || !hasLinkedCards}
            >
              {isLoading ? "Finding…" : "Find best card"}
            </Button>
          </div>
        </div>

        {!hasLinkedCards && (
          <div className="text-xs text-muted-foreground">
            Link a card on the Cards page to unlock tailored picks.
          </div>
        )}

        {/* Suggestions row lives BELOW the controls so it doesn't affect alignment */}o
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
            {/* Left: Owned best card and earnings with context */}
            <Card className="md:col-span-7 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Best card
                </CardTitle>
                <CardDescription>
                  Clear math, assumptions, and limits
                </CardDescription>
                <MetaChips />
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

                {/* Earnings summary with context */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rate</span>
                    <span className="text-sm font-semibold">
                      {pctFloor(result.bestCard.percentBack)}% on{" "}
                      {result.merchant}
                    </span>
                  </div>

                  <div className="text-sm">
                    Earn for {unitLabel}:{" "}
                    <span className="font-semibold">
                      {usd.format(bestEarnAmount)}
                    </span>
                    {basis === "yearly" && (
                      <span className="text-xs">
                        {" "}
                        (≈ {usd.format(helperPerMonth ?? 0)} per month)
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Calculation: {usd.format(displayAmount)} ×{" "}
                    {pctFloor(result.bestCard.percentBack)}% ={" "}
                    {usd.format(bestEarnAmount)}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Assumptions:{" "}
                    {basis === "one-time" ? "one-time purchase" : basis} of{" "}
                    {usd.format(spendNumber)}.
                  </div>

                  <CapRow cap={result.bestCard.cap} />

                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-foreground/80">
                      Details
                    </summary>
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      {result.category && (
                        <div>Category: {result.category}</div>
                      )}
                      {!!result.bestCard.rewardRateText && (
                        <div>Rule: {result.bestCard.rewardRateText}</div>
                      )}
                    </div>
                  </details>
                </div>

                <p className="text-xs text-muted-foreground">{leftMessage}</p>

                {/* Top what-if banner */}
                {altCalc.length > 0 && altCalc[0].extra > 0 && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                    <p className="text-sm">
                      If you switch to{" "}
                      <span className="font-semibold">{altCalc[0].name}</span>{" "}
                      for{" "}
                      <span className="font-semibold">{result.merchant}</span>,
                      you could gain{" "}
                      <span className="font-semibold">
                        {usd.format(altCalc[0].extra)}
                      </span>{" "}
                      for {unitLabel}. Rate advantage:{" "}
                      <span className="font-semibold">
                        {altCalc[0].diffPctInt}%
                      </span>
                      .
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Alternatives with what-if savings, same-rate benefits */}
            <Card className="md:col-span-5 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Ways to save more
                </CardTitle>
                <CardDescription>
                  Cards that could earn you more{" "}
                  {basis === "one-time"
                    ? "for this purchase"
                    : `per ${unitLabel}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {altCalc.length ? (
                  altCalc.slice(0, 3).map((alt) => (
                    <div
                      key={alt.id}
                      className="rounded-2xl bg-muted/40 px-4 py-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground truncate">
                          {alt.name}
                        </p>
                        <span className="shrink-0 rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs">
                          {pctFloor(alt.percentBack)}% vs{" "}
                          {pctFloor(result.bestCard.percentBack)}%
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {alt.rewardRateText}
                      </p>

                      <div className="text-sm">
                        Earn for {unitLabel}:{" "}
                        <span className="font-semibold">
                          {usd.format(alt.earn)}
                        </span>
                        {basis === "yearly" && (
                          <span className="text-xs">
                            {" "}
                            (≈ {usd.format(alt.earn / 12)} per month)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Calculation: {usd.format(displayAmount)} ×{" "}
                        {pctFloor(alt.percentBack)}% = {usd.format(alt.earn)}
                      </div>

                      {/* If same rate, show why it might still be better */}
                      {alt.sameRate ? (
                        <div className="text-sm">
                          Same rate as your card.{" "}
                          <span className="text-muted-foreground">
                            Consider it for other perks:
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(alt.benefits && alt.benefits.length > 0
                              ? alt.benefits
                              : alt.categories && alt.categories.length > 0
                              ? alt.categories.map((c) => `Good for ${c}`)
                              : []
                            )
                              .slice(0, 6)
                              .map((perk, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs"
                                >
                                  {perk}
                                </span>
                              ))}
                            {/* Fallback: echo reward text as a perk if nothing else */}
                            {(!alt.benefits || alt.benefits.length === 0) &&
                              (!alt.categories ||
                                alt.categories.length === 0) && (
                                <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs">
                                  {alt.rewardRateText}
                                </span>
                              )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          Extra vs your card:{" "}
                          <span className="font-semibold">
                            {usd.format(alt.extra)}
                          </span>{" "}
                          for {unitLabel}.
                          {alt.diffPctInt > 0 && (
                            <span className="text-xs">
                              {" "}
                              (+{alt.diffPctInt}% rate)
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        Assumptions:{" "}
                        {basis === "one-time" ? "one-time purchase" : basis} of{" "}
                        {usd.format(spendNumber)}.
                      </div>

                      <CapRow cap={alt.cap} />

                      <details className="text-xs">
                        <summary className="cursor-pointer select-none text-foreground/80">
                          Why this could be better
                        </summary>
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          {!alt.sameRate && (
                            <div>Rate difference: +{alt.diffPctInt}%</div>
                          )}
                          <div>
                            Dollar difference: {usd.format(alt.extra)} for{" "}
                            {unitLabel}
                          </div>
                          {result.category && (
                            <div>Category match: {result.category}</div>
                          )}
                          {!!alt.rewardRateText && (
                            <div>Rule: {alt.rewardRateText}</div>
                          )}
                          {/* Show extra perks again for emphasis */}
                          {alt.benefits && alt.benefits.length > 0 && (
                            <div>Other benefits: {alt.benefits.join(", ")}</div>
                          )}
                        </div>
                      </details>
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

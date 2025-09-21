import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Search, CreditCard, DollarSign, Loader2 } from "lucide-react";
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

/* ───────────────── config ───────────────── */
const apiBase = String(
  (import.meta as any).env.VITE_API_BASE_URL ??
    (import.meta as any).env.VITE_API_BASE ??
    "http://localhost:8000/api"
).replace(/\/$/, "");

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

/* ───────────────── types ───────────────── */
type CapInfo = {
  amount: number;
  period: "month" | "quarter" | "year";
  postRate: number; // integer percent, e.g. 1, 2, 3
};

type BestCardResult = {
  merchant: string;
  category?: string;
  bestCard: {
    id: string;
    nickname: string;
    issuer: string;
    rewardRateText: string;
    percentBack?: number; // decimal (0.02)
    cap?: CapInfo;
  };
  youHaveThisCard: boolean;
  alternatives?: Array<{
    id: string;
    name: string;
    issuer?: string;
    rewardRateText: string;
    percentBack?: number; // decimal (0.02)
    benefits?: string[];
    categories?: string[];
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

/* ───────────────── formatters ───────────────── */
const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

// tiny epsilon so 0.019999 shows as 2%
const EPS = 1e-9;

/** 0.0199 → 2, 0.034 → 3, etc. Always non-negative. */
function pctInt(x?: number) {
  return Math.max(0, Math.round(((x ?? 0) + EPS) * 100));
}

function pctCompare(a?: number, b?: number) {
  return pctInt(a) - pctInt(b);
}

function pctEqual(a?: number, b?: number) {
  return pctCompare(a, b) === 0;
}

/* ───────────────── helpers for de-dupe and meaning ───────────────── */
function normText(s?: string | null) {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}
function sameSet(a?: string[], b?: string[]) {
  const A = uniq((a ?? []).map(normText)).sort();
  const B = uniq((b ?? []).map(normText)).sort();
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
  return true;
}

/* basic category alias map so “dining” ~ “restaurants”, “gas” ~ “fuel”, etc. */
const CAT_ALIASES: Record<string, string> = {
  restaurant: "dining",
  restaurants: "dining",
  dining: "dining",
  grocery: "grocery",
  groceries: "grocery",
  supermarket: "grocery",
  supermarkets: "grocery",
  fuel: "gas",
  gas: "gas",
  gasoline: "gas",
};

function canonCat(s?: string | null) {
  const k = normText(s);
  return CAT_ALIASES[k] ?? k;
}

/** Return normalized extra categories beyond the matched category */
function extraCatsNormalized(altCats?: string[], matched?: string) {
  const set = uniq((altCats ?? []).map(canonCat)).filter(Boolean);
  const matchedCanon = canonCat(matched);
  if (!set.length) return [];
  return matchedCanon ? set.filter((c) => c !== matchedCanon) : set;
}

/** Return the original labels for extra categories (nice for display) */
function extraCatsDisplay(altCats?: string[], matched?: string) {
  if (!Array.isArray(altCats) || !altCats.length) return [];
  const mCanon = canonCat(matched);
  return altCats.filter((c) => canonCat(c) !== mCanon);
}

function rewardSignature(
  ratePctInt: number,
  rewardRateText?: string,
  benefits?: string[],
  categories?: string[]
) {
  return JSON.stringify({
    r: ratePctInt,
    rule: normText(rewardRateText),
    ben: uniq((benefits ?? []).map(normText)).sort(),
    cat: uniq((categories ?? []).map(canonCat)).sort(),
  });
}

/** Show alt only if:
 *  - Higher rounded %; OR
 *  - Same rounded % AND has extra perks (extra categories or different benefits)
 */
function isMeaningfulAlt(
  alt: {
    percentBack?: number;
    rewardRateText?: string;
    benefits?: string[];
    categories?: string[];
  },
  owned: {
    percentBack?: number;
    rewardRateText?: string;
    benefits?: string[];
    categories?: string[];
  },
  matchedCategory?: string
) {
  const cmp = pctCompare(alt.percentBack, owned.percentBack);
  if (cmp > 0) return true; // strictly higher %
  if (cmp < 0) return false; // lower % → hide

  // same rounded % → require extra perks
  const extras = extraCatsNormalized(alt.categories, matchedCategory);
  const perksDiff = !sameSet(alt.benefits, owned.benefits ?? []);
  return extras.length > 0 || perksDiff;
}

/* ───────────────── small UI ───────────────── */
function FieldShell({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 min-w-0">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function InputWithIcon({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  icon: Icon,
  onBlur,
  inputMode,
  pattern,
}: any) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <Input
        id={id}
        className="h-11 pl-9"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={onBlur}
        inputMode={inputMode}
        pattern={pattern}
      />
    </div>
  );
}

function ChipButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs hover:bg-muted/60"
    >
      {children}
    </button>
  );
}

function CapRow({ cap }: { cap?: CapInfo }) {
  if (!cap) return null;
  return (
    <div className="rounded-lg bg-background/70 p-2 text-xs text-foreground/80">
      Limits: up to {usd.format(cap.amount)} per {cap.period}
      {" • "}after that: {cap.postRate}% base rate
    </div>
  );
}

function MetaChips({ result }: { result: BestCardResult | null }) {
  if (!result) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2">
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

/* ───────────────── main ───────────────── */
export function BestCardFinder({
  selectedCardIds,
  accountRows,
}: {
  selectedCardIds?: string[];
  accountRows: { id: string; nickname: string; issuer: string }[];
}) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  const authHeaders = useMemo(() => {
    return async () => {
      if (!isAuthenticated) return {};
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: (import.meta as any).env.VITE_AUTH0_AUDIENCE,
        },
      });
      return { Authorization: `Bearer ${token}` };
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  const [merchant, setMerchant] = useState("");
  const [basis, setBasis] = useState<SpendBasis>("monthly");
  const [spendInput, setSpendInput] = useState<string>("150");
  const hasLinkedCards = accountRows.length > 0;

  const spendNumber = useMemo(() => {
    const n = parseFloat(spendInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [spendInput]);

  const unitLabel =
    basis === "one-time"
      ? "this purchase"
      : basis === "yearly"
      ? "year"
      : "month";

  const assumedMonthly = useMemo(() => {
    if (basis === "monthly") return spendNumber;
    if (basis === "yearly") return spendNumber / 12;
    return spendNumber;
  }, [basis, spendNumber]);

  const displayAmount = useMemo(() => {
    if (basis === "yearly") return spendNumber;
    return spendNumber;
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

        const headers = await authHeaders();
        const res = await api.get("/merchants/all", {
          params: { limit: 2000 },
          headers,
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
  }, [authHeaders]);

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
      const headers = await authHeaders();
      const res = await api.post(
        "/recommendations/best-card",
        {
          merchant: name,
          assumedMonthlySpend: assumedMonthly,
          selectedCardIds,
        },
        { headers }
      );

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
            issuer: a.issuer,
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

  const leftMessage = useMemo(() => {
    if (!result) return "";
    const ownedPct = result.bestCard.percentBack ?? 0;
    const topAlt = result.alternatives?.[0];
    const altPct = topAlt?.percentBack ?? 0;
    if (!result.youHaveThisCard)
      return `You do not have a strong card for ${result.merchant} yet.`;
    if (pctCompare(altPct, ownedPct) > 0)
      return `Another card could earn more at ${result.merchant}.`;
    return `This is your best card for ${result.merchant}.`;
  }, [result]);

  const bestEarnAmount = useMemo(() => {
    if (!result) return 0;
    const pct = result.bestCard.percentBack ?? 0;
    return Math.max(0, displayAmount * pct);
  }, [result, displayAmount]);

  const helperPerMonth = useMemo(() => {
    if (basis !== "yearly") return null;
    return bestEarnAmount / 12;
  }, [basis, bestEarnAmount]);

  /* Alternatives: filter out clones and only show >% or same% with perks */
  const altCalc = useMemo(() => {
    if (!result?.alternatives?.length) return [];

    const owned = {
      percentBack: result.bestCard.percentBack ?? 0,
      rewardRateText: result.bestCard.rewardRateText,
      benefits: [] as string[],
      categories: result.category ? [result.category] : [],
    };
    const ownedPct = result.bestCard.percentBack ?? 0;

    const mapped = result.alternatives.map((alt) => {
      const altPct = alt.percentBack ?? 0;
      const earn = Math.max(0, displayAmount * altPct); // keep $ exact
      const diffPctInt = Math.max(0, pctInt(altPct) - pctInt(ownedPct));
      const extra = Math.max(0, displayAmount * (altPct - ownedPct));
      const sameRate = pctEqual(altPct, ownedPct);
      const extraCats = extraCatsDisplay(alt.categories, result.category);
      return { ...alt, earn, extra, diffPctInt, sameRate, extraCats };
    });

    // Only higher % or same % with perks
    const filtered = mapped.filter((alt) =>
      isMeaningfulAlt(alt, owned, result.category)
    );

    // Deduplicate clones across brands by rounded rate + rule + benefits + categories
    const seen = new Set<string>();
    const deduped: typeof filtered = [];
    for (const alt of filtered) {
      const sig = rewardSignature(
        pctInt(alt.percentBack ?? 0),
        alt.rewardRateText,
        alt.benefits,
        alt.categories
      );
      if (seen.has(sig)) continue;
      seen.add(sig);
      deduped.push(alt);
    }

    // Sort by extra dollar value, then by rate
    return deduped.sort((a, b) => {
      if (b.extra !== a.extra) return b.extra - a.extra;
      return (b.percentBack ?? 0) - (a.percentBack ?? 0);
    });
  }, [result, displayAmount]);

  /* ─────────────── UI ─────────────── */
  return (
    <Card className="rounded-3xl shadow-sm">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              Best card for a merchant
            </CardTitle>
            <CardDescription>
              Type a store and pick your spend basis.
            </CardDescription>
          </div>
          <Badge
            variant={hasLinkedCards ? "secondary" : "outline"}
            className="hidden sm:inline-flex"
          >
            <CreditCard className="mr-1 h-3.5 w-3.5" />
            {hasLinkedCards ? "Cards linked" : "No linked cards"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <FieldShell label="Merchant" htmlFor="merchant">
              <InputWithIcon
                id="merchant"
                value={merchant}
                onChange={(e: any) => setMerchant(e.target.value)}
                placeholder={
                  loadingMerchants
                    ? "Loading merchants…"
                    : "e.g., Starbucks, Amazon, H-E-B"
                }
                disabled={loadingMerchants}
                icon={Search}
              />
              {loadError && (
                <div className="pt-1 text-xs text-destructive">{loadError}</div>
              )}
            </FieldShell>
          </div>

          <div className="sm:col-span-2">
            <FieldShell label="Basis" htmlFor="basis">
              <Select
                value={basis}
                onValueChange={(v: SpendBasis) => setBasis(v)}
              >
                <SelectTrigger id="basis" className="h-11">
                  <SelectValue placeholder="Choose basis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-time">One-time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </FieldShell>
          </div>

          <div className="sm:col-span-2">
            <FieldShell label="Amount" htmlFor="spend">
              <InputWithIcon
                id="spend"
                icon={DollarSign}
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                value={spendInput}
                onChange={(e: any) => setSpendInput(e.target.value)}
                onBlur={(e: any) =>
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
            </FieldShell>
          </div>

          <div className="sm:col-span-2">
            <Button
              className="h-11 w-full"
              onClick={onFind}
              disabled={isLoading || loadingMerchants || !hasLinkedCards}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finding…
                </>
              ) : (
                "Find best card"
              )}
            </Button>
          </div>
        </div>

        {!hasLinkedCards && (
          <div className="text-xs text-muted-foreground">
            Link a card on the Cards page to unlock tailored picks.
          </div>
        )}

        {filteredSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filteredSuggestions.map((m) => (
              <ChipButton key={m} onClick={() => setMerchant(m)}>
                {m}
              </ChipButton>
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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            <Card className="md:col-span-7 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Best card
                </CardTitle>
                <MetaChips result={result} />
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

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rate</span>
                    <span className="text-sm font-semibold">
                      {pctInt(result.bestCard.percentBack)}% on{" "}
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
                    {pctInt(result.bestCard.percentBack)}% ={" "}
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

                {altCalc.length > 0 && altCalc[0].extra > 0 && (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
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

            <Card className="md:col-span-5 rounded-2xl">
              <CardHeader className="pb-2">
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
                      className="space-y-2 rounded-2xl bg-muted/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-medium text-foreground">
                          {alt.name}
                        </p>
                        <span className="shrink-0 rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs">
                          {pctInt(alt.percentBack)}% vs{" "}
                          {pctInt(result.bestCard.percentBack)}%
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {alt.rewardRateText}
                      </p>

                      {/* When rates tie, surface extra categories first */}
                      {alt.sameRate && alt.extraCats?.length ? (
                        <div className="text-sm">
                          Also good for:{" "}
                          <span className="text-foreground">
                            {alt.extraCats.join(", ")}
                          </span>
                        </div>
                      ) : null}

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
                        {pctInt(alt.percentBack)}% = {usd.format(alt.earn)}
                      </div>

                      {alt.sameRate ? (
                        <div className="text-sm">
                          Same rate as your card.{" "}
                          <span className="text-muted-foreground">
                            Consider it for other perks:
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(alt.benefits && alt.benefits.length > 0
                              ? alt.benefits
                              : alt.extraCats && alt.extraCats.length > 0
                              ? alt.extraCats.map(
                                  (c: string) => `Good for ${c}`
                                )
                              : []
                            )
                              .slice(0, 6)
                              .map((perk: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs"
                                >
                                  {perk}
                                </span>
                              ))}
                            {(!alt.benefits || alt.benefits.length === 0) &&
                              (!alt.extraCats ||
                                alt.extraCats.length === 0) && (
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
                          for {unitLabel}
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
                          {!alt.sameRate ? (
                            <>
                              <div>Rate difference: +{alt.diffPctInt}%</div>
                              <div>
                                Dollar difference: {usd.format(alt.extra)} for{" "}
                                {unitLabel}
                              </div>
                              {alt.benefits?.length ? (
                                <div>
                                  Other benefits: {alt.benefits.join(", ")}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {alt.extraCats?.length ? (
                                <div>
                                  Extra categories beyond{" "}
                                  {result.category ?? "the matched category"}:{" "}
                                  {alt.extraCats.join(", ")}
                                </div>
                              ) : null}
                              {alt.benefits?.length ? (
                                <div>
                                  Different perks: {alt.benefits.join(", ")}
                                </div>
                              ) : null}
                              {!alt.extraCats?.length &&
                              !alt.benefits?.length ? (
                                <div>
                                  Similar earn rate but rules or perks differ
                                  slightly.
                                </div>
                              ) : null}
                            </>
                          )}
                          {result.category ? (
                            <div>Category match: {result.category}</div>
                          ) : null}
                          {!!alt.rewardRateText && (
                            <div>Rule: {alt.rewardRateText}</div>
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

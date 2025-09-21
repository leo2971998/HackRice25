import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { StatTile } from "@/components/cards/StatTile";
import { CardSelector } from "@/components/cards/CardSelector";
import { CreditCardDisplay } from "@/components/cards/CreditCardDisplay";

import { AddCardDialog } from "@/components/cards/AddCardDialog";
import { EditCardDialog } from "@/components/cards/EditCardDialog";

import { useToast } from "@/components/ui/use-toast";

import {
  useCards,
  useCard,
  useDeleteCard,
  useCardCatalog,
  useRewardsEstimate,
} from "@/hooks/useCards";
import { gradientForIssuer } from "@/utils/brand-gradient";
import { createMandate } from "@/lib/mandates";
import {
  FLOW_COACH_MANDATE_RESOLVED_EVENT,
  openFlowCoach,
  pushMandateToFlowCoach,
  type FlowCoachMandateResolvedDetail,
} from "@/lib/flow-coach";
import type {
  CardRow as CardRowType,
  CreditCardProduct,
  MandateAttachment,
} from "@/types/api";

const currency0 = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const currency2 = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const percent1 = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

type CardsTab = "linked" | "catalog";
const TABS: { id: CardsTab; label: string }[] = [
  { id: "linked", label: "Linked cards" },
  { id: "catalog", label: "All cards" },
];

const ANNUAL_FEE_FILTERS = [
  { value: "all", label: "Any annual fee" },
  { value: "0", label: "No annual fee" },
  { value: "low", label: "Up to $99" },
  { value: "mid", label: "$100 – $199" },
  { value: "high", label: "$200+" },
] as const;
type AnnualFeeFilter = (typeof ANNUAL_FEE_FILTERS)[number]["value"];

const APPLIED_FILTERS = [
  { value: "all", label: "All cards" },
  { value: "applied", label: "Applied only" },
  { value: "not-applied", label: "Not applied" },
] as const;
type AppliedFilter = (typeof APPLIED_FILTERS)[number]["value"];

const PAGE_SIZE = 4;

export default function CardsPage() {
  const { toast } = useToast();

  /* =============== LINKED CARDS =============== */

  const cardsQuery = useCards();
  const cards = cardsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const cardDetails = useCard(selectedId);

  const deleteCard = useDeleteCard({
    onSuccess: () =>
      toast({
        title: "Card removed",
        description: "We’ll tidy up your stats.",
      }),
    onError: (error) =>
      toast({ title: "Unable to remove card", description: error.message }),
  });

  const [linkedAppliedFilter, setLinkedAppliedFilter] =
    useState<AppliedFilter>("all");
  const [catalogAppliedFilter, setCatalogAppliedFilter] =
    useState<AppliedFilter>("all");
  const [optimisticAppliedSlugs, setOptimisticAppliedSlugs] = useState<
    Set<string>
  >(new Set());
  const [mandateSlugById, setMandateSlugById] = useState<Map<string, string>>(
    new Map()
  );
  const pendingMandateSlugs = useMemo(
    () => new Set(mandateSlugById.values()),
    [mandateSlugById]
  );
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const filteredLinkedCards = useMemo(() => {
    return cards.filter((card) => {
      const slug = normalizeSlug(
        (card as any).cardProductSlug ?? (card as any).productSlug
      );
      const awaiting = slug ? pendingMandateSlugs.has(slug) : false;
      const optimistic = slug ? optimisticAppliedSlugs.has(slug) : false;
      const applied =
        card.status === "Applied" ||
        Boolean(card.appliedAt) ||
        awaiting ||
        optimistic;
      if (linkedAppliedFilter === "applied") return applied;
      if (linkedAppliedFilter === "not-applied") return !applied;
      return true;
    });
  }, [cards, linkedAppliedFilter, optimisticAppliedSlugs, pendingMandateSlugs]);

  useEffect(() => {
    if (!filteredLinkedCards.length) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !filteredLinkedCards.some((c) => c.id === selectedId)) {
      setSelectedId(filteredLinkedCards[0].id);
    }
  }, [filteredLinkedCards, selectedId]);

  useEffect(() => {
    setOptimisticAppliedSlugs((prev) => {
      if (!prev.size) return prev;
      const actualSlugs = new Set<string>();
      for (const card of cards) {
        const slug = normalizeSlug(
          (card as any).cardProductSlug ?? (card as any).productSlug
        );
        if (slug) actualSlugs.add(slug);
      }
      if (!actualSlugs.size) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const slug of prev) {
        if (actualSlugs.has(slug)) {
          next.delete(slug);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cards]);

  useEffect(() => {
    const handleResolved = (event: Event) => {
      const detail = (event as CustomEvent<FlowCoachMandateResolvedDetail>)
        .detail;
      if (!detail?.id) return;
      let slug: string | undefined;
      setMandateSlugById((prev) => {
        if (!prev.has(detail.id)) return prev;
        const next = new Map(prev);
        slug = next.get(detail.id) ?? undefined;
        next.delete(detail.id);
        return next;
      });
      if (slug && detail.status === "declined") {
        setOptimisticAppliedSlugs((prev) => {
          if (!prev.has(slug!)) return prev;
          const next = new Set(prev);
          next.delete(slug!);
          return next;
        });
      }
    };
    window.addEventListener(
      FLOW_COACH_MANDATE_RESOLVED_EVENT,
      handleResolved as EventListener
    );
    return () =>
      window.removeEventListener(
        FLOW_COACH_MANDATE_RESOLVED_EVENT,
        handleResolved as EventListener
      );
  }, []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardRowType | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null
  );

  const slugForEstimate = normalizeSlug(
    (cardDetails.data as any)?.cardProductSlug ??
      (cardDetails.data as any)?.productSlug
  );
  const rewardsEstimate = useRewardsEstimate(
    selectedId
      ? { cardId: selectedId, cardSlug: slugForEstimate ?? undefined }
      : undefined,
    { enabled: Boolean(selectedId) }
  );

  const scenarioCount = cardDetails.data?.cashbackScenarios?.length ?? 0;
  useEffect(() => {
    const scenarios = cardDetails.data?.cashbackScenarios ?? [];
    if (!scenarios.length) {
      setSelectedScenarioId(null);
      return;
    }
    setSelectedScenarioId((current) => {
      if (current && scenarios.some((scenario) => scenario.id === current)) {
        return current;
      }
      return scenarios[0].id;
    });
  }, [cardDetails.data?.id, scenarioCount]);

  const scenarioList = cardDetails.data?.cashbackScenarios ?? [];
  const selectedScenario =
    scenarioList.find((scenario) => scenario.id === selectedScenarioId) ??
    (scenarioList.length ? scenarioList[0] : null);

  const effectiveLabel = rewardsEstimate.data
    ? `${percent1.format(rewardsEstimate.data.effectiveRate)} effective`
    : undefined;
  const lastSyncedLabel = cardDetails.data?.lastSynced
    ? `Synced ${new Date(cardDetails.data.lastSynced).toLocaleDateString()}`
    : undefined;
  const cashbackCaption =
    [effectiveLabel, lastSyncedLabel].filter(Boolean).join(" • ") || undefined;

  const handleDelete = (id: string) => deleteCard.mutate(id);
  const handleEdit = (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (card) {
      setEditingCard(card);
      setEditDialogOpen(true);
    }
  };

  const optimisticSlugList = useMemo(
    () => Array.from(optimisticAppliedSlugs),
    [optimisticAppliedSlugs]
  );
  const pendingSlugList = useMemo(
    () => Array.from(pendingMandateSlugs),
    [pendingMandateSlugs]
  );

  // already-linked/applied matcher
  const appliedMatcher = useMemo(
    () =>
      buildAppliedMatcher(cards, [...optimisticSlugList, ...pendingSlugList]),
    [cards, optimisticSlugList, pendingSlugList]
  );

  /* =============== CATALOG =============== */
  const catalogQuery = useCardCatalog({ active: true });
  const rawCatalog = catalogQuery.data as any;
  const catalogCards: CreditCardProduct[] = useMemo(
    () => extractCatalogCards(rawCatalog),
    [rawCatalog]
  );

  const issuers = useMemo(() => {
    const s = new Set<string>();
    for (const card of catalogCards) if (card?.issuer) s.add(card.issuer);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [catalogCards]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const card of catalogCards)
      for (const r of card?.rewards ?? []) if (r?.category) s.add(r.category);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [catalogCards]);

  const [issuerFilter, setIssuerFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [annualFeeFilter, setAnnualFeeFilter] =
    useState<AnnualFeeFilter>("all");

  const filteredCatalog = useMemo(() => {
    return catalogCards.filter((card) => {
      const matchesIssuer =
        issuerFilter === "all" || card.issuer === issuerFilter;
      const matchesCategory =
        categoryFilter === "all" ||
        (card.rewards ?? []).some((r) => r.category === categoryFilter);
      const matchesFee = matchesAnnualFee(card.annual_fee, annualFeeFilter);
      const slugValue = normalizeSlug(card.slug);
      const applied = slugValue ? appliedMatcher(card) : false;
      const awaitingApproval = slugValue
        ? pendingMandateSlugs.has(slugValue)
        : false;
      const matchesAppliedState =
        catalogAppliedFilter === "all"
          ? true
          : catalogAppliedFilter === "applied"
          ? applied || awaitingApproval
          : !(applied || awaitingApproval);
      return (
        matchesIssuer && matchesCategory && matchesFee && matchesAppliedState
      );
    });
  }, [
    catalogCards,
    issuerFilter,
    categoryFilter,
    annualFeeFilter,
    catalogAppliedFilter,
    appliedMatcher,
    pendingMandateSlugs,
  ]);

  // pagination
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [
    issuerFilter,
    categoryFilter,
    annualFeeFilter,
    catalogAppliedFilter,
    catalogCards.length,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filteredCatalog.slice(start, end);

  const [activeTab, setActiveTab] = useState<CardsTab>("linked");

  const onApply = async (product: CreditCardProduct) => {
    if (!product.slug) {
      toast({
        title: "Missing product slug",
        description: "Unable to start this application.",
      });
      return;
    }
    const slugValue = normalizeSlug(product.slug);
    if (!slugValue) {
      toast({
        title: "Missing product slug",
        description: "Unable to start this application.",
      });
      return;
    }
    if (pendingSlug && pendingSlug === slugValue) {
      return;
    }
    if (
      pendingMandateSlugs.has(slugValue) ||
      optimisticAppliedSlugs.has(slugValue)
    ) {
      openFlowCoach();
      return;
    }
    if (appliedMatcher(product)) {
      toast({
        title: "Already applied",
        description: "This card already appears in your linked list.",
      });
      return;
    }
    setPendingSlug(slugValue);
    try {
      const mandate = await createMandate({
        type: "intent",
        data: {
          intent: "apply_card",
          product_slug: slugValue,
          product_name: product.product_name,
          issuer: product.issuer,
        },
      });
      const attachment: MandateAttachment = {
        ...mandate,
        context: {
          productName: product.product_name,
          issuer: product.issuer,
          slug: slugValue,
        },
      };
      setOptimisticAppliedSlugs((prev) => {
        if (prev.has(slugValue)) return prev;
        const next = new Set(prev);
        next.add(slugValue);
        return next;
      });
      setMandateSlugById((prev) => {
        const next = new Map(prev);
        next.set(attachment.id, slugValue);
        return next;
      });
      pushMandateToFlowCoach({
        message: `Approve applying for the ${product.product_name}?`,
        mandate: attachment,
      });
      openFlowCoach();
      toast({
        title: "Finish in Flow Coach",
        description: "Approve the mandate to complete your application.",
      });
    } catch (error) {
      toast({
        title: "Couldn’t start application",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setPendingSlug(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 md:px-6 lg:px-8">
      {/* Tabs header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 rounded-full border border-border/60 bg-white/80 p-1 text-sm shadow-sm backdrop-blur dark:bg-zinc-900/60">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            const base =
              "rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none";
            const active = "bg-primary text-primary-foreground shadow-soft";
            const inactive = "text-muted-foreground hover:text-foreground";
            return (
              <button
                key={tab.id}
                type="button"
                className={`${base} ${isActive ? active : inactive}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Linked cards */}
      {activeTab === "linked" ? (
        cards.length === 0 ? (
          // ---------- SINGLE empty state with ONE CTA ----------
          <div className="space-y-6">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  No cards yet
                </CardTitle>
                <CardDescription>
                  Add your first card to unlock tailored coaching and spend
                  insights.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="w-full sm:w-auto"
                >
                  Add card
                </Button>
              </CardContent>
            </Card>

            <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
          </div>
        ) : (
          // ---------- Two-column view only AFTER you have at least one card ----------
          <div className="space-y-6">
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="md:w-5/12 space-y-4">
                <CardSelector
                  cards={filteredLinkedCards}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onAdd={() => setDialogOpen(true)}
                  isLoading={cardsQuery.isLoading}
                  heightClass="max-h-[780px]"
                  headerActions={
                    <Select
                      value={linkedAppliedFilter}
                      onValueChange={(value) =>
                        setLinkedAppliedFilter(value as AppliedFilter)
                      }
                    >
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        {APPLIED_FILTERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              </div>

              <div className="md:w-7/12 space-y-4">
                {cardDetails.isLoading ? (
                  <Card className="rounded-3xl">
                    <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      Loading card details…
                    </CardContent>
                  </Card>
                ) : cardDetails.data ? (
                  <>
                    <CreditCardDisplay card={cardDetails.data} />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
                      <StatTile
                        label="Base cash-back rate"
                        value={percent1.format(
                          rewardsEstimate.data?.baseRate ?? 0
                        )}
                        caption="Applies when no bonus category matches"
                      />
                      <StatTile
                        label={`${
                          rewardsEstimate.data?.windowDays ?? 30
                        }-day cash-back`}
                        value={
                          rewardsEstimate.isLoading
                            ? "…"
                            : currency2.format(
                                rewardsEstimate.data?.totalCashback ?? 0
                              )
                        }
                        caption={cashbackCaption}
                      />
                    </div>

                    {rewardsEstimate.data?.byCategory?.length ? (
                      <Card className="rounded-3xl">
                        <CardHeader>
                          <CardTitle className="text-lg font-semibold">
                            Cash-back highlights
                          </CardTitle>
                          <CardDescription>
                            Last {rewardsEstimate.data.windowDays} days
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {rewardsEstimate.data.byCategory
                            .slice(0, 4)
                            .map((entry) => (
                              <Badge
                                key={entry.category}
                                variant="secondary"
                                className="rounded-full px-3 py-1"
                              >
                                {entry.category}:{" "}
                                {currency2.format(entry.cashback)} (
                                {percent1.format(entry.rate)})
                              </Badge>
                            ))}
                          {rewardsEstimate.data.byCategory.length > 4 ? (
                            <span className="text-xs text-muted-foreground">
                              +{rewardsEstimate.data.byCategory.length - 4} more
                              categories earning rewards.
                            </span>
                          ) : null}
                        </CardContent>
                      </Card>
                    ) : null}

                    {cardDetails.data.features?.length ? (
                      <Card className="rounded-3xl">
                        <CardHeader>
                          <CardTitle className="text-lg font-semibold">
                            {cardDetails.data.productName ?? "Card benefits"}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                            {cardDetails.data.features.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ) : null}
                  </>
                ) : (
                  <Card className="rounded-3xl">
                    <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      Select a card to see its details.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <AddCardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            <EditCardDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              card={editingCard}
            />
          </div>
        )
      ) : (
        /* =============== CATALOG: glossy cards + pagination (4 per page) =============== */
        <div className="space-y-6">
          <Card className="rounded-3xl p-0">
            <CardHeader className="p-6 md:p-8 pb-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl font-semibold">
                    All cards
                  </CardTitle>
                  <CardDescription>
                    Deterministic catalog data — no PII, no surprises.
                  </CardDescription>
                </div>
                <span className="text-xs text-muted-foreground">
                  {catalogQuery.isLoading
                    ? "…"
                    : `${filteredCatalog.length} items`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-6 md:p-8 pt-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Select
                  value={catalogAppliedFilter}
                  onValueChange={(value) =>
                    setCatalogAppliedFilter(value as AppliedFilter)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Applied status" />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIED_FILTERS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={issuerFilter} onValueChange={setIssuerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by issuer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All issuers</SelectItem>
                    {issuers.map((issuer) => (
                      <SelectItem key={issuer} value={issuer}>
                        {issuer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={annualFeeFilter}
                  onValueChange={(v) =>
                    setAnnualFeeFilter(v as AnnualFeeFilter)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Annual fee" />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNUAL_FEE_FILTERS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Bonus category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {catalogQuery.isLoading ? (
            <Card className="rounded-3xl p-0">
              <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Loading catalog…
              </CardContent>
            </Card>
          ) : filteredCatalog.length === 0 ? (
            <Card className="rounded-3xl p-0">
              <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No cards match the selected filters.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {pageItems.map((product) => {
                  const slugValue = normalizeSlug(product.slug);
                  const applied = appliedMatcher(product);
                  const awaitingApproval = slugValue
                    ? pendingMandateSlugs.has(slugValue)
                    : false;
                  return (
                    <CatalogCreditCard
                      key={product.slug ?? product.product_name}
                      product={product}
                      applied={applied}
                      awaitingApproval={awaitingApproval}
                      onApply={() => onApply(product)}
                      isPending={pendingSlug === slugValue}
                    />
                  );
                })}
              </div>

              {filteredCatalog.length > PAGE_SIZE && (
                <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                  <div className="text-xs text-muted-foreground">
                    Showing <b>{start + 1}</b>–
                    <b>{Math.min(end, filteredCatalog.length)}</b> of{" "}
                    <b>{filteredCatalog.length}</b>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPage(p)}
                            className={[
                              "h-8 w-8 rounded-full text-xs",
                              p === page
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted",
                            ].join(" ")}
                            aria-label={`Go to page ${p}`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ===================== helpers ===================== */

function matchesAnnualFee(
  fee: number | null | undefined,
  filter: AnnualFeeFilter
) {
  if (filter === "all") return true;
  if (fee == null) return false;
  if (filter === "0") return fee === 0;
  if (filter === "low") return fee > 0 && fee < 100;
  if (filter === "mid") return fee >= 100 && fee < 200;
  if (filter === "high") return fee >= 200;
  return true;
}

function formatAnnualFee(fee: number | null | undefined) {
  if (fee == null) return "—";
  if (fee === 0) return "$0";
  return currency0.format(fee);
}

function normalizeSlug(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
function extractCatalogCards(raw: any): CreditCardProduct[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [
    "items",
    "results",
    "data",
    "cards",
    "products",
    "catalog",
    "rows",
    "list",
  ];
  for (const k of keys) {
    const v = raw?.[k];
    if (Array.isArray(v)) return v;
  }
  if (raw.data && typeof raw.data === "object") {
    for (const k of keys) {
      const v = raw.data[k];
      if (Array.isArray(v)) return v;
    }
    if (Array.isArray(raw.data)) return raw.data;
  }
  for (const v of Object.values(raw)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      const obj = v[0] as any;
      if ("product_name" in obj || "issuer" in obj || "rewards" in obj)
        return v as any;
    }
  }
  return [];
}

function buildAppliedMatcher(
  cards: CardRowType[],
  extraSlugs: Iterable<string> = []
) {
  const norm = (s?: string | null) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[®™]/g, "")
      .replace(/\b(card|credit|preferred|gold|x)\b/g, "")
      .replace(/[^\w]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const nameSet = new Set<string>();
  const issuerNameSet = new Set<string>();
  const slugSet = new Set<string>();

  for (const c of cards) {
    const n1 = norm((c as any).productName);
    const n2 = norm((c as any).nickname);
    if (n1) nameSet.add(n1);
    if (n2) nameSet.add(n2);

    const issuer = norm((c as any).issuer);
    const joined = `${issuer} ${n1 || n2}`.trim();
    if (issuer && (n1 || n2)) issuerNameSet.add(joined);

    const pslug = normalizeSlug(
      (c as any).cardProductSlug ?? (c as any).productSlug
    );
    if (pslug) slugSet.add(pslug);
  }

  for (const slug of extraSlugs) {
    const normalized = normalizeSlug(slug);
    if (normalized) slugSet.add(normalized);
  }

  return (p: CreditCardProduct) => {
    const pName = norm(p.product_name);
    const pIssuer = norm(p.issuer);
    const pJoined = `${pIssuer} ${pName}`.trim();
    const normalizedSlug = normalizeSlug(p.slug);
    const slugMatch = normalizedSlug ? slugSet.has(normalizedSlug) : false;
    const nameMatch = pName ? nameSet.has(pName) : false;
    const issuerMatch = pIssuer && pName ? issuerNameSet.has(pJoined) : false;
    return slugMatch || nameMatch || issuerMatch;
  };
}

/* ===================== glossy catalog card ===================== */

type CatalogCreditCardProps = {
  product: CreditCardProduct;
  applied: boolean;
  awaitingApproval?: boolean;
  onApply: () => void;
  isPending?: boolean;
};

function CatalogCreditCard({
  product,
  applied,
  awaitingApproval = false,
  onApply,
  isPending = false,
}: CatalogCreditCardProps) {
  const gradient = gradientForIssuer(
    product.slug,
    product.issuer,
    product.network,
    product.product_name
  );
  const issuer = (product.issuer ?? "").toUpperCase();
  const name = product.product_name;
  const annual = formatAnnualFee(product.annual_fee);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl">
        <div
          className={`relative h-40 w-full rounded-3xl bg-gradient-to-br ${gradient} p-5 text-white`}
        >
          <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-[220%] w-[150%] rotate-12 bg-white/10 blur-2xl" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.18em] opacity-90">
                {issuer || "CARD ISSUER"}
              </div>
              {applied ? (
                <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">
                  Applied
                </div>
              ) : awaitingApproval ? (
                <div className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-semibold">
                  Awaiting approval
                </div>
              ) : null}
            </div>

            <div className="mt-1 text-xl font-semibold leading-6">{name}</div>

            <div className="mt-auto flex items-end justify-between text-xs">
              <div className="space-x-2 opacity-90">
                <span>•••• •••• •••• 0000</span>
                <span className="hidden sm:inline">SWIPE COACH MEMBER</span>
              </div>
              <div className="text-right opacity-90">
                <div className="uppercase tracking-wide">Annual fee</div>
                <div className="font-semibold">{annual}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Base: {percent1.format(product.base_cashback ?? 0)}</span>
          {product.rewards?.slice(0, 2).map((r, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="rounded-full px-3 py-1"
            >
              {r.category}: {percent1.format(r.rate ?? 0)}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onApply} disabled={applied || isPending}>
            {applied
              ? "Applied"
              : awaitingApproval
              ? "Open chat"
              : isPending
              ? "Applying…"
              : "Apply"}
          </Button>
          {product.link_url ? (
            <Button asChild variant="ghost" size="sm">
              <a href={product.link_url} target="_blank" rel="noreferrer">
                Details
              </a>
            </Button>
          ) : null}
        </div>
        {awaitingApproval && !applied ? (
          <p className="text-xs text-muted-foreground">
            Approve in Flow Coach to finish this application.
          </p>
        ) : null}
      </div>
    </div>
  );
}

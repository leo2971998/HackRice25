import * as React from "react";
import { Plus, CreditCard, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
// If you use Auth0, you can later import useAuth0 and call getAccessTokenSilently for API calls.

type CardOnFile = {
  id: string;
  product: string; // "Amex Platinum"
  issuer: string; // "American Express"
  network: string; // "Amex" | "Visa" | "Mastercard"
  last4: string; // "1234"
  expires: string; // "03/29"
};

const ISSUERS = [
  "American Express",
  "Chase",
  "Capital One",
  "Citi",
  "Bank of America",
  "Discover",
];
const NETWORKS = ["Amex", "Visa", "Mastercard", "Discover"];

// mock initial card
const INITIAL: CardOnFile[] = [
  {
    id: crypto.randomUUID(),
    product: "Amex Platinum",
    issuer: "American Express",
    network: "Amex",
    last4: "1234",
    expires: "03/29",
  },
];

export default function CardsPage() {
  const [cards, setCards] = React.useState<CardOnFile[]>(INITIAL);

  // dialog state
  const [open, setOpen] = React.useState(false);
  const [product, setProduct] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [network, setNetwork] = React.useState("");
  const [last4, setLast4] = React.useState("");
  const [expMM, setExpMM] = React.useState("");
  const [expYY, setExpYY] = React.useState("");

  const resetForm = () => {
    setProduct("");
    setIssuer("");
    setNetwork("");
    setLast4("");
    setExpMM("");
    setExpYY("");
  };

  const addCard = async () => {
    // simple validation
    if (
      !product ||
      !issuer ||
      !network ||
      last4.length !== 4 ||
      expMM.length !== 2 ||
      expYY.length !== 2
    )
      return;
    const newCard: CardOnFile = {
      id: crypto.randomUUID(),
      product: product.trim(),
      issuer,
      network,
      last4,
      expires: `${expMM}/${expYY}`,
    };

    // TODO: replace with API call
    // const token = await getAccessTokenSilently();
    // await fetch("/api/cards", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify(newCard) });

    setCards((c) => [newCard, ...c]);
    setOpen(false);
    resetForm();
  };

  const removeCard = (id: string) =>
    setCards((c) => c.filter((x) => x.id !== id));

  return (
    <div className="container max-w-[960px] lg:max-w-[1080px] space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Your Cards</h1>
          <p className="text-sm text-muted-foreground">
            Manage your connected payment cards.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Connect a New Card</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="issuer">Issuer</Label>
                  <Select value={issuer} onValueChange={setIssuer}>
                    <SelectTrigger id="issuer">
                      <SelectValue placeholder="Select issuer" />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUERS.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="network">Network</Label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger id="network">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product">Card product</Label>
                <Input
                  id="product"
                  placeholder="e.g., Sapphire Preferred"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="last4">Last 4</Label>
                  <Input
                    id="last4"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="1234"
                    value={last4}
                    onChange={(e) =>
                      setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expMM">Exp. MM</Label>
                  <Input
                    id="expMM"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="03"
                    value={expMM}
                    onChange={(e) =>
                      setExpMM(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expYY">Exp. YY</Label>
                  <Input
                    id="expYY"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="29"
                    value={expYY}
                    onChange={(e) =>
                      setExpYY(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={addCard} className="gap-2">
                <Plus className="h-4 w-4" /> Add card
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Card list */}
      <div className="space-y-4">
        {cards.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{c.product}</p>
                    <Badge variant="outline" className="text-xs">
                      {c.network}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.issuer} • Credit Card • Expires {c.expires} • ••••{" "}
                    {c.last4}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCard(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Connect a New Card — inline action (matches your reference screenshot) */}
        <Card className="border-dashed">
          <CardContent className="p-3 sm:p-4">
            <Button
              variant="outline"
              className="w-full justify-center gap-2 rounded-xl"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-4 w-4" /> Connect a New Card
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

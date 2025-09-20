import * as React from "react";
import { MessageCircle, Sparkles, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { ChatMessage } from "@/types/api";

const suggestionChips = ["Why this card?", "3 quick wins", "Summarize 30 days"];

export function ChatDock() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome",
      author: "assistant",
      content:
        "Hi! I’m your spending coach. Ask for insights or try a quick win.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close on outside click
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      const launcher = document.getElementById("chat-launcher-btn");
      if (launcher?.contains(t)) return;
      if (panelRef.current && !panelRef.current.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Esc
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      author: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const assistantReply: ChatMessage = {
      id: crypto.randomUUID(),
      author: "assistant",
      content:
        "Great question! I’ll personalize this soon—quick highlight: dining spend is up 8% month-over-month.",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage, assistantReply]);
    toast({
      title: "Assistant drafting",
      description: "Smart responses will plug into real data shortly.",
    });
  };

  return (
    <>
      {/* Launcher button */}
      <button
        id="chat-launcher-btn"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-primary text-primary-foreground shadow-card hover:opacity-90 transition p-4 md:p-5"
      >
        <MessageCircle className="h-5 w-5 md:h-6 md:w-6" />
        <span className="sr-only">Open chat</span>
      </button>

      {/* Floating panel */}
      <div
        id="chat-panel"
        role="dialog"
        aria-modal="false"
        className={[
          "fixed z-50 bottom-20 right-4 md:bottom-24 md:right-6",
          open ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
      >
        <Card
          ref={panelRef}
          className={[
            "w-[92vw] max-w-[380px] md:max-w-[420px]",
            "rounded-2xl shadow-xl border bg-card text-card-foreground",
            "transition-all duration-200",
            open
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 scale-[0.98]",
          ].join(" ")}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <MessageCircle className="h-4 w-4" />
              </span>
              <CardTitle className="text-base font-semibold">
                Flow Coach
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Beta
              </Badge>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 hover:bg-muted"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {suggestionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => sendMessage(chip)}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.author === "assistant"
                      ? "glass-panel bg-primary/5 text-sm"
                      : "ml-auto max-w-[80%] rounded-2xl bg-primary text-sm text-primary-foreground shadow-soft"
                  }
                >
                  <p className="p-3 leading-relaxed">{message.content}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
                setInput("");
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your money story"
                className="flex-1"
              />
              <Button type="submit" size="icon" className="h-11 w-11">
                <Send className="h-4 w-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

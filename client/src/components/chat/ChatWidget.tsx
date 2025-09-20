import { useEffect, useRef, useState } from "react"
import { MessageCircle, Send, Sparkles } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import { MandateCard } from "@/components/chat/MandateCard"
import { useChat } from "@/hooks/useChat"
import { approveMandate, declineMandate, executeMandate } from "@/lib/mandates"
import {
  FLOW_COACH_MANDATE_EVENT,
  FLOW_COACH_OPEN_EVENT,
  notifyMandateResolved,
  type FlowCoachMandateEventDetail,
} from "@/lib/flow-coach"
import type { ChatMessage, MandateAttachment, Mandate } from "@/types/api"

const suggestionChips = [
  "Suggest a monthly budget",
  "Why did spending rise?",
  "Find subscriptions",
]

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const initialMessage: ChatMessage = {
  id: "welcome",
  author: "assistant",
  content:
    "Hey there! I can spot rising spend, draft budgets, or track down subscriptions. Want to try one?",
  timestamp: new Date().toISOString(),
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: generateId(),
    author: "user",
    content,
    timestamp: new Date().toISOString(),
  }
}

function createAssistantMessage(content: string, timestamp?: string): ChatMessage {
  return {
    id: generateId(),
    author: "assistant",
    content,
    timestamp: timestamp ?? new Date().toISOString(),
  }
}

export function ChatWidget() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const listRef = useRef<HTMLDivElement | null>(null)

  const chatMutation = useChat()
  const queryClient = useQueryClient()
  const [actionState, setActionState] = useState<{ id: string; action: "approve" | "decline" } | null>(null)

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, open])

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    const handleMandate = (event: Event) => {
      const detail = (event as CustomEvent<FlowCoachMandateEventDetail>).detail
      if (!detail?.mandate) {
        return
      }
      const productName =
        (detail.mandate.context?.productName as string) ||
        (detail.mandate.data?.product_name as string) ||
        (detail.mandate.data?.productName as string) ||
        "this card"
      const messageText =
        detail.message ||
        `Approve the mandate to apply for ${productName}.`
      const assistantMessage: ChatMessage = {
        ...createAssistantMessage(messageText),
        mandate: detail.mandate,
      }
      setMessages((prev) => [...prev, assistantMessage])
      setOpen(true)
    }

    window.addEventListener(FLOW_COACH_OPEN_EVENT, handleOpen)
    window.addEventListener(FLOW_COACH_MANDATE_EVENT, handleMandate as EventListener)

    return () => {
      window.removeEventListener(FLOW_COACH_OPEN_EVENT, handleOpen)
      window.removeEventListener(FLOW_COACH_MANDATE_EVENT, handleMandate as EventListener)
    }
  }, [])

  const updateMandateOnMessage = (mandateId: string, updater: (mandate: MandateAttachment) => MandateAttachment) => {
    setMessages((prev) =>
      prev.map((message) => {
        if (!message.mandate || message.mandate.id !== mandateId) {
          return message
        }
        return { ...message, mandate: updater(message.mandate) }
      }),
    )
  }

  const isThinking = chatMutation.isPending

  const handleSend = (raw: string) => {
    const text = raw.trim()
    if (!text || isThinking) return

    const userMessage = createUserMessage(text)
    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    setInput("")

    chatMutation.mutate(
      { history: nextHistory, message: userMessage },
      {
        onSuccess: (data) => {
          const reply = data.reply?.trim()
          const assistantMessage = createAssistantMessage(
            reply && reply.length > 0 ? reply : "Flow Coach is still thinking—try asking again in a moment.",
            data.timestamp,
          )
          setMessages((prev) => [...prev, assistantMessage])
        },
        onError: (error) => {
          toast({
            title: "Flow Coach is offline",
            description: error.message || "Please try again shortly.",
          })
          setMessages((prev) => [
            ...prev,
            createAssistantMessage("Flow Coach ran into a hiccup. Please try again shortly."),
          ])
        },
      },
    )
  }

  const handleApprove = async (mandate: MandateAttachment) => {
    if (actionState) return
    setActionState({ id: mandate.id, action: "approve" })
    const originalStatus = mandate.status
    try {
      updateMandateOnMessage(mandate.id, (prev) => ({ ...prev, status: "approved" }))
      await approveMandate(mandate.id, mandate as Mandate)
      const executed = await executeMandate(mandate.id)
      updateMandateOnMessage(mandate.id, (prev) => ({
        ...prev,
        status: executed.status ?? "executed",
        updatedAt: executed.updated_at ?? prev.updatedAt ?? null,
      }))
      queryClient.invalidateQueries({ queryKey: ["cards"] })
      toast({
        title: "Application submitted",
        description: "We’ll refresh your linked cards shortly.",
      })
      setMessages((prev) => [
        ...prev,
        createAssistantMessage(
          `Done! ${mandate.context?.productName ?? "Your application"} is marked as applied.`,
        ),
      ])
      notifyMandateResolved({ id: mandate.id, status: "executed" })
    } catch (error) {
      updateMandateOnMessage(mandate.id, (prev) => ({ ...prev, status: originalStatus }))
      toast({
        title: "Unable to complete mandate",
        description: error instanceof Error ? error.message : "Please try again shortly.",
      })
    } finally {
      setActionState(null)
    }
  }

  const handleDecline = async (mandate: MandateAttachment) => {
    if (actionState) return
    setActionState({ id: mandate.id, action: "decline" })
    try {
      const declined = await declineMandate(mandate.id, mandate as Mandate)
      updateMandateOnMessage(mandate.id, () => ({ ...mandate, status: declined.status }))
      toast({
        title: "Mandate declined",
        description: "Flow Coach will skip this request.",
      })
      setMessages((prev) => [...prev, createAssistantMessage("Got it—no action taken." )])
      notifyMandateResolved({ id: mandate.id, status: "declined" })
    } catch (error) {
      updateMandateOnMessage(mandate.id, () => mandate)
      toast({
        title: "Unable to decline",
        description: error instanceof Error ? error.message : "Please try again shortly.",
      })
    } finally {
      setActionState(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="fixed bottom-6 right-6 z-40 h-12 rounded-full px-5 shadow-xl" size="lg">
          <MessageCircle className="mr-2 h-5 w-5" />
          Flow Coach
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-xl">
        <div className="flex h-full flex-col gap-4">
          <Card className="flex h-full flex-col rounded-3xl shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <CardTitle className="text-lg font-semibold">Flow Coach</CardTitle>
              </div>
              <Badge variant="outline">Always learning</Badge>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setInput(chip)
                      handleSend(chip)
                    }}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div
                ref={listRef}
                className="glass-panel flex-1 space-y-4 overflow-y-auto rounded-3xl border border-border/60 bg-white/70 p-6 dark:bg-zinc-900/60"
              >
                {messages.map((message) => {
                  if (message.mandate) {
                    return (
                      <div key={message.id} className="flex flex-col items-start gap-3">
                        {message.content ? (
                          <div className="max-w-[80%] rounded-3xl bg-primary/10 p-4 text-sm">
                            {message.content}
                          </div>
                        ) : null}
                        <MandateCard
                          mandate={message.mandate}
                          onApprove={() => handleApprove(message.mandate!)}
                          onDecline={() => handleDecline(message.mandate!)}
                          isProcessing={actionState?.id === message.mandate.id}
                        />
                      </div>
                    )
                  }

                  return (
                    <div
                      key={message.id}
                      className={
                        message.author === "assistant"
                          ? "max-w-[80%] rounded-3xl bg-primary/10 p-4 text-sm"
                          : "ml-auto max-w-[80%] rounded-3xl bg-primary p-4 text-sm text-primary-foreground shadow-soft"
                      }
                    >
                      {message.content}
                    </div>
                  )
                })}
                {isThinking ? (
                  <div className="max-w-[80%] rounded-3xl bg-primary/10 p-4 text-xs text-muted-foreground">
                    Flow Coach is thinking…
                  </div>
                ) : null}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSend(input)
                }}
              >
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Flow Coach anything"
                  disabled={isThinking}
                />
                <Button type="submit" size="icon" className="h-11 w-11" disabled={isThinking}>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="success" className="gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Beta
            </Badge>
            <span>Gemini-powered responses grounded in your Swipe Coach data.</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

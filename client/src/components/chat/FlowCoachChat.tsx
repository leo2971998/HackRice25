import { useEffect, useRef, useState } from "react"
import { MessageCircle, Send, Sparkles } from "lucide-react"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { useChat } from "@/hooks/useChat"
import type { ChatMessage } from "@/types/api"

const suggestionChips = ["Why this card?", "3 quick wins", "Summarize 30 days", "How do I lower travel?"]

const initialMessage: ChatMessage = {
  id: "welcome",
  author: "assistant",
  content: "Hey Avery! Curious about your subscriptions or want three quick wins?",
  timestamp: new Date().toISOString(),
}

export function FlowCoachChatWidget() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const listRef = useRef<HTMLDivElement | null>(null)

  const chat = useChat()
  const isSending = chat.isPending

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, open])

  const appendAssistantMessage = (message: ChatMessage | undefined) => {
    if (!message) {
      return
    }
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: message.id ?? crypto.randomUUID(),
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
    ])
  }

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      author: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    toast({
      title: "Flow Coach is thinking",
      description: "Live Gemini-powered responses are on the way.",
    })

    const history = messages.map(({ author, content, timestamp }) => ({ author, content, timestamp }))

    chat.mutate(
      { history, newMessage: trimmed },
      {
        onSuccess: (data) => {
          appendAssistantMessage(data?.message)
        },
        onError: (error) => {
          toast({
            title: "Chat is unavailable",
            description: error.message,
          })
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-primary-foreground shadow-soft hover:bg-primary/90"
        >
          <MessageCircle className="h-4 w-4" />
          Flow Coach
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col bg-gradient-to-b from-background/95 to-background sm:max-w-md">
        <div className="flex h-full flex-col gap-6">
          <Card className="flex h-full flex-col rounded-3xl shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <CardTitle className="text-lg font-semibold">Flow Coach</CardTitle>
              </div>
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Beta
              </Badge>
            </CardHeader>
            <CardContent className="flex h-full flex-col space-y-4">
              <div className="flex flex-wrap gap-2">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80"
                    onClick={() => sendMessage(chip)}
                    disabled={isSending}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div
                ref={listRef}
                className="glass-panel flex-1 space-y-4 overflow-y-auto rounded-3xl bg-white/70 p-6 dark:bg-zinc-900/50"
              >
                {messages.map((message) => (
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
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendMessage(input)
                }}
              >
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Flow Coach anything"
                  disabled={isSending}
                />
                <Button type="submit" size="icon" className="h-11 w-11" disabled={isSending}>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}

import * as React from "react"
import { MessageCircle, Sparkles, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { PageSection } from "@/components/layout/PageSection"
import { useToast } from "@/components/ui/use-toast"
import type { ChatMessage } from "@/types/api"

const suggestionChips = [
  "Why this card?",
  "3 quick wins",
  "Summarize 30 days",
  "How do I lower travel?",
]

export function ChatPage() {
  const { toast } = useToast()
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome",
      author: "assistant",
      content: "Hey Avery! Curious about your subscriptions or want three quick wins?",
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = React.useState("")
  const listRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim()) return
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      author: "user",
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    toast({
      title: "Flow Coach is thinking",
      description: "Live data responses are coming soon."
    })
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "assistant",
          content: "Here’s a teaser: Grocery rewards could earn you an extra $22 this month.",
          timestamp: new Date().toISOString(),
        },
      ])
    }, 800)
  }

  return (
    <div className="space-y-10">
      <PageSection
        title="Flow Coach chat"
        description="Ask about your spending, upcoming renewals, or request digestible summaries."
        actions={<Badge variant="success" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> Beta</Badge>}
      />
      <Card className="rounded-3xl shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <MessageCircle className="h-4 w-4" />
            </span>
            <CardTitle className="text-lg font-semibold">Flow Coach</CardTitle>
          </div>
          <Badge variant="outline">Always learning</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setInput(chip)
                  sendMessage(chip)
                }}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80"
              >
                {chip}
              </button>
            ))}
          </div>
          <div
            ref={listRef}
            className="glass-panel h-[420px] space-y-4 overflow-y-auto bg-white/70 p-6 dark:bg-zinc-900/50"
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
              setInput("")
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Flow Coach anything"
            />
            <Button type="submit" size="icon" className="h-11 w-11">
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

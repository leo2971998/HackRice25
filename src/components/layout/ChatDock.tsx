import * as React from "react"
import { MessageCircle, Sparkles, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import type { ChatMessage } from "@/types/api"

const suggestionChips = [
  "Why this card?",
  "3 quick wins",
  "Summarize 30 days",
]

export function ChatDock() {
  const { toast } = useToast()
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome",
      author: "assistant",
      content: "Hi! I’m your spending coach. Ask for insights or try a quick win.",
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = React.useState("")
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim()) return
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      author: "user",
      content: text,
      timestamp: new Date().toISOString(),
    }
    const assistantReply: ChatMessage = {
      id: crypto.randomUUID(),
      author: "assistant",
      content: "Great question! I’ll personalize this flow soon—here’s a quick highlight: dining spend is up 8% month-over-month.",
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage, assistantReply])
    toast({
      title: "Assistant drafting",
      description: "Smart responses will plug into the real data shortly.",
    })
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 hidden max-w-sm flex-col gap-3 md:flex">
      <Card className="pointer-events-auto shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <MessageCircle className="h-4 w-4" />
            </span>
            <CardTitle className="text-base font-semibold">Flow Coach</CardTitle>
          </div>
          <Badge variant="success" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Beta
          </Badge>
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
          <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
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
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage(input)
              setInput("")
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
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
  )
}

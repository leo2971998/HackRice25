import { Sparkles, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"

export function WelcomePage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="mx-auto max-w-3xl space-y-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          Meet the lovable money OS
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Flowwise keeps your spending story fresh, friendly, and always in focus.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Connect Auth0 to step into your real dashboard or explore a curated demo journey filled with Money Moments, tailored recommendations, and an AI coach.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" className="w-full sm:w-auto" onClick={() => login().then(() => navigate("/"))}>
            Continue with Auth0
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => navigate("/")}
          >
            Try demo data
          </Button>
        </div>
        <Card className="mx-auto max-w-2xl space-y-3 rounded-3xl bg-white/80 p-6 text-left shadow-xl backdrop-blur dark:bg-zinc-900/60">
          <h2 className="text-lg font-semibold">What’s inside</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Overview of your top categories and Money Moments</li>
            <li>• Guided spending fixes with inline category edits</li>
            <li>• Credit card recommendations with “see why” insights</li>
            <li>• Flow Coach chat with ready-to-go prompts</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

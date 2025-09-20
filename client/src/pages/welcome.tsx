// src/pages/WelcomePage.tsx
import { Sparkles, ArrowRight } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth0 } from "@auth0/auth0-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { authConfig } from "@/lib/env"

export function WelcomePage() {
    const navigate = useNavigate()
    const location = useLocation()
    const { loginWithRedirect, isAuthenticated } = useAuth0()

    const returnTo =
        (location.state as { returnTo?: string } | null)?.returnTo ?? "/"

    const handleContinue = () => {
        const authorizationParams: Record<string, string> = {}
        if (authConfig.audience) authorizationParams.audience = authConfig.audience
        loginWithRedirect({ appState: { returnTo }, authorizationParams })
    }

    return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
            <div className="mx-auto max-w-3xl space-y-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          Swipe Coach
        </span>

                <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                    Your smarter way to spend.
                </h1>
                <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                    Create your profile and open a clean dashboard that shows where your
                    money goes—and which cards could earn you more.
                </p>

                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                    {!isAuthenticated ? (
                        <Button size="lg" className="w-full sm:w-auto" onClick={handleContinue}>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            size="lg"
                            className="w-full sm:w-auto"
                            onClick={() => navigate(returnTo)}
                        >
                            Go to dashboard
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}

                    {isAuthenticated ? (
                        <Button
                            variant="outline"
                            size="lg"
                            className="w-full sm:w-auto"
                            onClick={handleContinue}
                        >
                            Switch account
                        </Button>
                    ) : null}
                </div>

                <p className="text-sm text-muted-foreground">
                    Private, secure sign-in • You control your data
                </p>

                <Card className="mx-auto max-w-2xl space-y-3 rounded-3xl bg-white/80 p-6 text-left shadow-xl backdrop-blur dark:bg-zinc-900/60">
                    <h2 className="text-lg font-semibold">What you’ll get</h2>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• A personal profile to track spending trends</li>
                        <li>• A clean, lovely dashboard for quick insights</li>
                        <li>• Card picks tailored to your habits</li>
                    </ul>
                </Card>
            </div>
        </div>
    )
}

export default WelcomePage

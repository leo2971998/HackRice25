import { MailCheck, MailPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { useResendVerification } from "@/hooks/useApi"

type VerifyEmailBannerProps = {
  email?: string | null
}

export function VerifyEmailBanner({ email }: VerifyEmailBannerProps) {
  const { toast } = useToast()
  const resend = useResendVerification({
    onSuccess: () => {
      toast({
        title: "Verification email sent",
        description: "Check your inbox for a new message to confirm your email.",
      })
    },
    onError: (error) => {
      toast({
        title: "Unable to send email",
        description: error.message || "Please try again in a moment.",
      })
    },
  })

  return (
    <Card className="border-2 border-dashed border-amber-300/70 bg-amber-50/60 p-4 text-amber-900 shadow-none dark:border-amber-400/60 dark:bg-amber-400/10 dark:text-amber-100">
      <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20">
            <MailCheck className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Please verify your email to unlock insights.</p>
            <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
              {email ? (
                <>
                  We’ll send a fresh confirmation link to <span className="font-medium">{email}</span>.
                </>
              ) : (
                "Confirm your address to start syncing spend data."
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="self-start sm:self-auto"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
        >
          <MailPlus className="mr-2 h-4 w-4" /> Resend email
        </Button>
      </CardContent>
    </Card>
  )
}

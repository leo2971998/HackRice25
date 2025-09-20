import * as React from "react"

type PlaidLinkOptions = {
  token?: string
  onSuccess?: () => void
}

type UsePlaidLinkResult = {
  open: () => void
  ready: boolean
}

export function usePlaidLink({ onSuccess }: PlaidLinkOptions = {}): UsePlaidLinkResult {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(() => setReady(true), 600)
    return () => clearTimeout(timeout)
  }, [])

  const open = React.useCallback(() => {
    if (!ready) return
    onSuccess?.()
  }, [onSuccess, ready])

  return { open, ready }
}

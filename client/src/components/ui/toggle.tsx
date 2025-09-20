import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"

import { cn } from "@/lib/utils"

const Toggle = ({ className, ...props }: React.ComponentProps<typeof TogglePrimitive.Root>) => {
  return (
    <TogglePrimitive.Root
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium transition-all data-[state=on]:bg-primary/15 data-[state=on]:text-primary",
        className
      )}
      {...props}
    />
  )
}

Toggle.displayName = "Toggle"

export { Toggle }

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"

import App from "./App"
import { queryClient } from "@/lib/queryClient"
import { ThemeProvider } from "@/lib/theme"
import { Toaster } from "@/components/ui/toaster"
import "./index.css"

const container = document.getElementById("root")

if (!container) {
  throw new Error("Root element not found")
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
          <Toaster />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)

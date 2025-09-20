# Flowwise Finance UI

A Vite + React + TypeScript application styled with Tailwind CSS and shadcn/ui. The project scaffolds the Flowwise Finance experience with a lovable.dev-inspired design system, reusable primitives, and hero screens for onboarding, home, spending insights, recommendations, chat, and settings.

## Getting started

```bash
npm install
npm run dev
```

- `npm run dev` — start the development server on [http://localhost:5173](http://localhost:5173)
- `npm run build` — type-checks the project and creates an optimized production build in `dist/`

## Project structure

```
src/
  components/
    ui/        # shadcn primitives and tokens
    cards/     # stat tiles, cards, tables
    charts/    # Recharts-powered visualizations
    layout/    # App shell, page sections, chat dock
  hooks/       # Auth + Plaid placeholders
  lib/         # API client, design utilities, query client
  pages/       # Welcome, Home, Spending, Recommendations, Chat, Settings
  routes/      # Router configuration and navigation links
  types/       # Shared domain types
```

Global design tokens live in `tailwind.config.ts` and `src/index.css`, mirroring the lovable.dev glass, gradients, and motion specs. The UI primitives (button, card, input, select, badge, dialog, sheet, toast, toggle) match shadcn/ui semantics while leaning into Flowwise’s rounded, optimistic aesthetic.

Environment variables for the client live in `.env` and intentionally exclude secrets:

```
VITE_API_BASE_URL=/api
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
```

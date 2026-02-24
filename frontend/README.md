# FinanceOS — Frontend

React 19 single-page application for FinanceOS. Built with Vite 7, Tailwind CSS 4, and TypeScript.

## Stack

- **React 19** with React Router 7
- **Vite 7** (build + HMR)
- **Tailwind CSS 4** (utility-first styling)
- **Radix UI** (accessible primitives: Dialog, Select, Tabs, Tooltip, Switch, Dropdown, Progress)
- **Recharts** (charts: Area, Pie, Bar)
- **Framer Motion** (animations)
- **Lucide React** (icons)
- **TanStack React Query 5** (server state, caching, polling)
- **Axios** (HTTP client)
- **react-plaid-link** (Plaid Link integration)
- **vite-plugin-pwa + Workbox** (installable PWA with offline shell)

## Scripts

```bash
npm run dev           # Dev server with HMR (port 5173)
npm run build         # Type check + production build
npm run preview       # Preview production build
npm run lint          # ESLint
npm run test          # Run tests (Vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:ui       # Vitest browser UI
```

## Testing

**Vitest 4** with Testing Library and jsdom environment.

- 11 test suites, 188 tests
- Component tests (Button, Badge, StatCard, Card, Modal, ConfirmModal, Toast, Spinner)
- Context tests (ThemeContext dark/light mode)
- API client tests (all endpoint modules)
- Utility function tests

Config: [vitest.config.ts](vitest.config.ts) | Setup: [src/test/setup.ts](src/test/setup.ts)

## Pages

17 authenticated pages + login. See [root README](../README.md#pages--ui) for the full list.

## Production

The Dockerfile uses a multi-stage build:
1. `node:22-alpine` — install deps + `vite build`
2. `nginx:alpine` — serve static files, reverse proxy `/api` to sync-service
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

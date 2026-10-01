# Tik Tik

Tik Tik is a React and Vite productivity application backed by the active Express/TypeScript API in `server.ts`.

## Development

1. Copy `.env.example` to `.env` and provide local PostgreSQL, Redis, JWT, admin bootstrap, and SMTP settings.
2. Install dependencies with `npm ci`.
3. Start the application with `npm run dev`.

The Node backend is the authoritative runtime. It persists application data in PostgreSQL, uses Redis for notification delivery, and starts the scheduler and worker with the API process.

## Verification

```bash
npm run lint
npm run build
npm start
```

Do not use default credentials. Provision an administrator only through `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in the local or deployment environment.

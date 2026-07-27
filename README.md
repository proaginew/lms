# AIM LMS Simple

Simple LMS with Clerk auth, course access requests, and admin approval.

## Flow

1. App lists available courses.
2. Learner requests access → row stored as `PENDING` in Postgres.
3. Admin approves / rejects / revokes in **Access Requests**.
4. Learner can open/watch content only when status is `APPROVED`.

## Setup

```bash
cp .env.example .env
```

Required env:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `ADMIN_EMAILS` (comma-separated)
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`

```bash
npm install
npm run db:push
npm run dev
```

Use another port if needed: `npx next dev -p 3001`

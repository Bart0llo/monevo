# Product Vision

## Purpose

Monevo is a **self-hosted personal finance manager** for people who want full control over their financial data. It records money flowing through the user's own accounts, organizes it with categories and budgets, tracks savings, and projects where the user's finances are heading.

It is built for personal use on a VPS or homelab, but it supports **multiple independent users** on one instance (for example family members or friends, each with a fully private workspace). It is **not** a commercial SaaS product at this stage.

## Positioning

Cashew is the primary UX reference for the general experience, navigation, transaction management, budgets, accounts, categories, savings goals, and visualizations. Monevo should feel familiar to a Cashew user, but it has **its own name, branding, visual identity, and implementation**. It is not a clone: no Cashew assets, names, or copied layouts.

Monevo extends that familiar experience with:

- **Advanced forecasting** of balances based on recurring and planned items.
- **Flexible budgeting** (any number of budgets, any period, manual or automatic limits).
- **Full multi-currency** support with historically stable conversions.
- **Offline-first** operation with reliable multi-device sync.
- **Real-time updates** between devices.
- A **configurable dashboard**.
- A **financial calendar** that merges history and plans.
- **Transaction history and auditing**.
- **Flexible notifications** and gentle anomaly suggestions.
- **Export, import, and backups** under the user's or operator's control.

## Target users

1. **Primary:** a technically capable individual who self-hosts the app (Docker Compose) and uses it daily on desktop and phone (PWA).
2. **Secondary:** other people invited to use the same instance, each with an independent private workspace. They are non-technical users who just use the web app.
3. **Operator / administrator:** usually the primary user. They manage the instance, not other users' finances.

## Product principles

1. **Correctness over cleverness.** Financial numbers must be exact, reproducible, and explainable. A balance must always be traceable to the operations that produced it.
2. **History does not drift.** Past results never change silently because of later rate updates or settings changes.
3. **Actual vs. projected is always explicit.** Forecasts and plans are visually and structurally separate from actual balances.
4. **Privacy by default.** Every user's data is isolated. Administrators operate the instance; they do not browse finances.
5. **Works offline.** The app stays usable without a network and never silently loses changes.
6. **Manual-first.** Transactions are entered by the user, quickly. There is no bank sync, no OCR, and no statement import in the initial version.
7. **The user's own structure.** No predefined categories, no forced budgeting method, no fixed account types.
8. **Simple to host.** One application image and an external PostgreSQL database. Only one public port.
9. **Built to grow, not over-built.** A modular monolith with clear boundaries and an API ready for a future Android client, without speculative infrastructure.

## Non-goals (initial version)

The full list lives in [requirements.md: out of scope](requirements.md#out-of-scope). In short, Monevo does not do bank synchronization, statement imports, OCR, investments, crypto, physical assets, shared or family finances, tags, automation engines, email notifications, local MFA, multiple OIDC providers at once, admin analytics or audit dashboards, self-updating, or AI analysis.

## Success criteria for v1.0

- A user can manage several accounts in different currencies, record income, expenses, and transfers in seconds, and see correct balances in their base currency.
- Budgets, savings goals, recurring payments, the calendar, and forecasts work together coherently.
- Two devices can edit offline and sync without silently losing financial data.
- An operator can deploy with `docker compose up -d`, back up, and restore the whole instance, including attachments.
- Polish and English UIs are complete, with correct local formatting and time-zone handling.

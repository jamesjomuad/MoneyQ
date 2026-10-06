# Budgeting App — AI Project Kickoff Plan

## 1. Project Goal

Build a mobile-first personal budgeting and money-management application using **Expo Go + React Native**.

The first release should focus on a simple, reliable MVP that lets users:

- Track income and expenses
- Manage financial accounts
- Create monthly/category budgets
- View spending and remaining budget
- Work offline
- Synchronize data with a Laravel backend when online

The architecture should allow the app to grow later into a full personal-finance SaaS.

---

## 2. Core Technology Stack

### Mobile

- Expo
- React Native
- Expo Router
- JavaScript / ESM
- Zustand for client state management
- Expo SQLite for local persistence
- NativeWind is optional; use it only if it does not complicate the project
- Expo Go for development and testing

### Architecture

This is intentionally a **simple local-first application**.

There is no backend, Laravel API, cloud database, authentication server, or synchronization layer in the MVP.

All budgeting data is stored locally in SQLite on the user's device.

```text
Expo App
   │
   ├── React Native UI
   ├── Expo Router
   ├── Zustand
   │
   └── Expo SQLite
         ├── Accounts
         ├── Transactions
         ├── Categories
         └── Budgets
```

The application should remain simple and easy to maintain. Do not introduce cloud infrastructure unless it becomes a future product requirement.

## 3. MVP Scope

Keep the initial MVP intentionally small.

### Dashboard

Display:

- Current total balance
- Monthly income
- Monthly expenses
- Remaining budget
- Budget utilization
- Recent transactions
- Basic spending-by-category information

Example:

```text
Balance       ₱25,500
Income        ₱40,000
Expenses      ₱14,500
Budget Left   ₱25,500
```

### Transactions

Support:

- Income
- Expense
- Transfer
- Amount
- Date
- Category
- Account
- Description/notes

Transactions must distinguish between **expenses** and **transfers**.

Moving ₱5,000 from a BDO account to a GCash account must NOT count as a ₱5,000 expense.

### Accounts

Allow users to create accounts such as:

- Cash
- Bank
- E-wallet
- Credit card
- Savings

Example:

```text
BDO          ₱20,000
GCash         ₱3,500
Cash          ₱2,000
Savings      ₱50,000
```

### Budgets

Users should be able to create:

- Monthly overall budget
- Category budgets

Example:

```text
Food
Budget: ₱8,000
Spent:  ₱5,200
Left:   ₱2,800
```

The UI should clearly indicate when a budget is approaching or exceeding its limit.

### Categories

Provide default categories but allow users to create/edit categories later.

Initial examples:

```text
Food
Transportation
Utilities
Shopping
Entertainment
Health
Education
Bills
Other
```

### Settings

Initial settings can include:

- Currency
- Profile
- Account management
- Category management
- Sync status
- Logout

---

## 4. Navigation

Use Expo Router.

Recommended structure:

```text
app/
├── _layout.js
├── index.js
├── transactions/
│   ├── index.js
│   └── create.js
├── budgets/
│   └── index.js
├── accounts/
│   └── index.js
├── settings/
│   └── index.js
└── auth/
    ├── login.js
    └── register.js
```

The exact structure can be adjusted if Expo Router conventions suggest a better organization.

Recommended main navigation:

```text
Home
Transactions
Budgets
Accounts
Settings
```

Prioritize mobile usability over visual complexity.

---

## 5. Local Data Architecture

Use Expo SQLite as the **only persistent data store** for the MVP.

Suggested local tables:

```text
accounts
categories
transactions
budgets
budget_categories
```

No user table, sync queue, server IDs, or cloud synchronization is required.

### Transactions

Suggested fields:

```text
id
account_id
to_account_id
category_id
type
amount
description
transaction_date
created_at
updated_at
```

Where:

```text
type =
    income
    expense
    transfer
```

For transfers:

```text
account_id     = source account
to_account_id  = destination account
```

Do not count transfers as expenses or income.

Use locally generated UUIDs or SQLite-generated IDs consistently throughout the app.

## 6. Local Data Model

Suggested application models:

```text
Account
Category
Transaction
Budget
BudgetCategory
```

Example relationships:

```text
Account
 └── hasMany Transactions

Category
 └── hasMany Transactions

Budget
 └── hasMany BudgetCategories
```

Keep database access separate from UI components using a small repository/data-access layer.

## 7. Local Persistence

The app should work completely without Internet access.

When the user creates a transaction:

```text
User
 ↓
React Native
 ↓
Zustand state
 ↓
SQLite
 ↓
Dashboard updates
```

SQLite is the source of truth for persistent financial data.

The app does not need:

- API calls
- Cloud synchronization
- Network detection
- Sync queues
- Conflict resolution
- Server-side IDs

If cloud synchronization is added in the future, the data layer should be structured so it can be introduced without rewriting the UI.

## 8. Authentication

Authentication is **not required for the MVP**.

The app is a personal local budgeting application.

Do not add:

- Login
- Registration
- Password storage
- User accounts
- Authentication tokens

If authentication becomes necessary in a future version, it can be added later.

## 9. Financial Calculation Rules

Keep calculations centralized.

Examples:

### Balance

```text
Balance =
Initial Balance
+ Income
- Expenses
+ Transfer In
- Transfer Out
```

Transfers should not change the user's total combined wealth.

Example:

```text
BDO → GCash
₱5,000

BDO:   -₱5,000
GCash: +₱5,000

Total assets: unchanged
```

### Monthly expenses

Only transactions where:

```text
type = expense
```

should contribute to expense totals.

### Monthly income

Only:

```text
type = income
```

should contribute to income totals.

### Budget spending

Category budget spending should be calculated from expense transactions belonging to that category and budget period.

Avoid duplicating business calculations across many UI components.

---

## 10. UI/UX Direction

The application should feel:

- Simple
- Clean
- Fast
- Mobile-first
- Financial but not overly corporate
- Easy to use with one hand

The dashboard should make the most important financial information visible immediately.

### Add Transaction UX

Adding an expense should require very few interactions.

Ideal flow:

```text
Tap +
   ↓
Enter amount
   ↓
Select category
   ↓
Select account
   ↓
Save
```

Optional information such as notes and date can be secondary.

---

## 11. Currency

Initial target:

```text
PHP (₱)
```

However, do not hard-code PHP throughout the application.

Create a currency configuration so additional currencies can be supported later.

---

## 12. Project Development Phases

### Phase 1 — Project Setup

AI should:

1. Create Expo project
2. Configure Expo Router
3. Configure JavaScript/ESM
4. Install Zustand
5. Configure Expo SQLite
6. Create basic navigation
7. Create base theme/components
8. Confirm the app runs in Expo Go

Do not introduce unnecessary libraries.

### Phase 2 — Local Database

Implement:

- SQLite initialization
- Database schema/migrations
- Accounts
- Categories
- Transactions
- Budgets

Create a small repository/data-access layer rather than putting SQL directly inside UI components.

### Phase 3 — Core MVP

Implement:

- Dashboard
- Accounts
- Transaction list
- Add transaction
- Edit/delete transaction
- Categories
- Budgets
- Income
- Expenses
- Transfers

Everything must work completely offline.

### Phase 4 — UX and Reliability

Improve:

- Loading states
- Empty states
- Error handling
- Form validation
- Confirmation dialogs
- Accessibility
- Performance
- Currency formatting
- Date formatting

### Phase 5 — Optional Future Features

Only after the local MVP is stable, consider features such as:

- Export/import
- Backup
- Cloud synchronization
- Multi-device support
- Authentication
- AI features

These are not part of the initial project.

## 13. AI Development Rules

When using an AI coding assistant, follow these rules.

### Rule 1 — Understand before changing

Before modifying code:

- Inspect the existing project structure
- Inspect package.json
- Inspect Expo configuration
- Inspect routing
- Inspect database code
- Identify existing patterns

Do not blindly overwrite files.

### Rule 2 — Small changes

Prefer small, testable changes.

After each significant change:

```text
Run the application
Check for errors
Test the affected feature
Then continue
```

### Rule 3 — No unnecessary dependencies

Before adding a package, explain:

- Why it is needed
- Whether Expo Go supports it
- Whether Expo already provides an equivalent
- Whether it increases future maintenance

### Rule 4 — No TypeScript

Use JavaScript unless there is a strong technical reason to reconsider this decision.

Use modern JavaScript and ESM conventions.

### Rule 5 — Mobile-first

Do not design the UI as a desktop web application squeezed into a phone.

### Rule 6 — Business logic separation

Keep financial calculations and data operations outside presentation components.

Recommended separation:

```text
components/
screens/
stores/
services/
repositories/
database/
utils/
constants/
```

### Rule 7 — Security

Never:

- Hard-code API secrets
- Store passwords locally
- Trust client-side authorization
- Trust client-submitted financial totals
- Expose sensitive tokens in logs

The Laravel API must validate and authorize all server-side operations.

---

## 14. Suggested Initial Project Structure

```text
budget-app/
├── app/
│   ├── _layout.js
│   ├── index.js
│   ├── transactions/
│   ├── budgets/
│   ├── accounts/
│   ├── settings/
│   └── auth/
│
├── components/
│   ├── ui/
│   ├── transactions/
│   ├── budgets/
│   └── accounts/
│
├── database/
│   ├── migrations/
│   ├── database.js
│   └── repositories/
│
├── stores/
│   ├── authStore.js
│   ├── accountStore.js
│   ├── transactionStore.js
│   └── budgetStore.js
│
├── utils/
│   ├── currency.js
│   ├── dates.js
│   └── calculations.js
│
├── constants/
│
├── assets/
│
└── package.json
```

The AI may adjust this structure when the project grows, but should avoid premature abstraction.

---

## 15. First AI Prompt

Use the following prompt when starting the project with an AI coding assistant:

> You are the lead React Native/Expo engineer for this project.
>
> We are building a simple personal budgeting application using Expo, React Native, Expo Router, JavaScript/ESM, Zustand, and Expo SQLite.
>
> This is intentionally a **local-only application**. There is no Laravel backend, API, cloud database, authentication server, or synchronization system.
>
> Important constraints:
>
> - Use JavaScript, not TypeScript.
> - The application must initially run in Expo Go.
> - Avoid unnecessary native dependencies.
> - Prefer Expo-supported packages.
> - Use Expo Router for navigation.
> - Use Zustand for client state.
> - Use Expo SQLite for persistent local data.
> - Keep financial business logic separate from UI components.
> - Do not add a backend.
> - Do not add authentication.
> - Do not add cloud synchronization.
> - Do not over-engineer the application.
>
> MVP features:
>
> 1. Dashboard
> 2. Accounts
> 3. Transactions
> 4. Income
> 5. Expenses
> 6. Transfers
> 7. Categories
> 8. Monthly budgets
> 9. Basic settings
>
> Financial rules:
>
> - Transfers must not count as income or expenses.
> - Moving money between accounts must preserve total assets.
> - Expense totals come only from expense transactions.
> - Income totals come only from income transactions.
> - Budget spending is calculated from expense transactions in the relevant category and period.
>
> Before writing code:
>
> 1. Inspect the current project.
> 2. Propose the project structure.
> 3. Propose the SQLite schema.
> 4. Explain the Zustand state-management approach.
> 5. Identify any package that needs to be installed and explain why.
> 6. Break the implementation into small milestones.
>
> Do not make large changes before explaining the approach.
>
> After approval, implement only the first milestone and verify that the project runs successfully in Expo Go.

## 16. Definition of Done for the First Milestone

The first milestone is complete when:

- Expo project starts successfully
- Expo Go can open the application
- Expo Router navigation works
- Home screen exists
- Transactions screen exists
- Budgets screen exists
- Accounts screen exists
- Settings screen exists
- Zustand is configured
- SQLite initializes successfully
- Database migrations/schema execute successfully
- No TypeScript is introduced
- No unnecessary native dependency is introduced
- The project has a clean foundation for the next milestone

---

## 17. Future Features

Do NOT implement these in the initial MVP:

- Bank API integration
- Automatic bank transaction import
- AI financial advisor
- Receipt OCR
- Investment tracking
- Bill payment
- Cryptocurrency
- Multi-user/shared wallets
- Subscription billing
- Advanced analytics
- Notifications
- Cloud backup
- Authentication
- Cloud synchronization

The first goal is a fast, simple, reliable local budgeting app.

## 18. Product Direction

The long-term vision is:

```text
Simple Local Budgeting App
        ↓
Better Budgeting + Analytics
        ↓
Goals + Recurring Bills
        ↓
Optional Backup / Export
        ↓
Optional Cloud Features
        ↓
AI Features
```

Build the MVP so that these future capabilities are possible without adding unnecessary complexity today.

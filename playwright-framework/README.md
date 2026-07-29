# Playwright E2E Automation Framework

E2E test automation framework for Web UI, using **Playwright Test + TypeScript (Strict Mode)**.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

---

## Installation

```bash
cd playwright-framework

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

---

## Environment configuration

Copy the `.env.example` file to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
BASE_URL=http://localhost
ENV=dev
USERNAME=u1
PASSWORD=111111Aa
ALLURE_RESULTS=false
```

> **Note:** The `.env` file must not be committed to the repository.

---

## Running tests

```bash
# Run all tests (headless)
npm test

# Run with a visible browser (headed — debug mode)
npm run test:headed

# Run with Playwright UI Mode
npm run test:ui

# Run with debug inspector
npm run test:debug

# Run only auth tests
npm run test:auth

# Run only dashboard tests
npm run test:dashboard
```

---

## Viewing reports

```bash
# Open the HTML report after running tests
npm run test:report

# Enable Allure: set ALLURE_RESULTS=true in .env, then run tests
npm run allure:serve
```

---

## Project structure

```
playwright-framework/
├── playwright.config.ts        # Playwright configuration
├── package.json
├── tsconfig.json
├── .env.example                # Environment variable template
├── src/
│   ├── pages/                  # Page Object classes
│   │   ├── base.page.ts        # Base page — common methods
│   │   ├── login.page.ts
│   │   └── dashboard.page.ts
│   ├── fixtures/               # Custom test fixtures
│   │   ├── base.fixture.ts     # Page fixtures
│   │   └── auth.fixture.ts     # Authenticated session fixture
│   ├── utils/                  # Helpers & utilities
│   │   ├── env.config.ts       # Reads environment variables
│   │   ├── test-data.ts        # Generates unique test data
│   │   └── helpers.ts          # Helper functions
│   └── tests/                  # Test specs
│       ├── auth/
│       │   └── login.spec.ts
│       └── dashboard/
│           └── dashboard.spec.ts
├── test-data/
│   └── users.json              # External test data (data-driven)
└── .github/
    └── workflows/
        └── playwright.yml      # CI/CD GitHub Actions
```

---

## Conventions

### Naming
| Component | Rule | Example |
|---|---|---|
| Page class | PascalCase + `Page` | `LoginPage`, `DashboardPage` |
| Test file | kebab-case + `.spec.ts` | `login.spec.ts` |
| Fixture | kebab-case + `.fixture.ts` | `auth.fixture.ts` |
| Locator | camelCase private | `loginButton`, `usernameInput` |

### Page Object
- Locators declared as `private readonly` at the top of the class
- Methods describe user behavior, not DOM operations
- No assertions inside Page classes

### Test
- Each test is independent and does not depend on other tests
- Use `test.beforeEach` for navigate/setup
- Assertions have clear, descriptive messages

### Test Data
- Email/username must be unique: use `TestData.generateEmail(prefix)`
- Do not hardcode data in tests — read from `users.json` or use `TestData`

---

## CI/CD

The framework ships with a ready-to-use GitHub Actions workflow at `.github/workflows/playwright.yml`.

**Secrets to configure in GitHub:**
- `TEST_USERNAME` — test account
- `TEST_PASSWORD` — test password

**Variables:**
- `BASE_URL` — application URL (GitHub Variables, not Secrets)

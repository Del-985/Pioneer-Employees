# Pioneer Employees

Mobile-first staff portal for **Pioneer Legacy Works**, connected to the shared API at `api.pioneerlegacyworks.com`. Employees sign in with the same secure staff account created by Pioneer Admin, but the employee website contains **no administrator controls**.

## v0.3.0 — Hours and timekeeping

Pioneer Employees now includes **Hours & Time Clock**. The backend, not the phone,
records clock-in and clock-out timestamps.

- Clock in and out for a selected business unit
- Optionally link the time entry to an accepted shift and/or assigned job
- Start and stop **paid** or **unpaid** breaks; clock-out ends any active break
- See worked time live, plus daily entries and weekly totals
- See approved and pending hours separately and read manager review notes
- Flag open punches exceeding **16 hours** as possible missed clock-outs (do not automatically close them)
- Overnight shifts show their actual start/end instants; daylight saving transitions use real elapsed seconds
- Weeks are **Monday–Sunday in America/Detroit**. Each complete shift is
  attributed to the week in which it started, even if it ends the following day or week.

Management has **Field Operations → Hours & Timesheets** for weekly employee summaries,
manager corrections with required reasons, missing-shift creation, missed-clock-out
closeout, review/approval, and a permanent action history.

An **approved timesheet is not payroll processing or proof of payment**. This
release does not calculate statutory overtime, automate wage payment, or
replace payroll compliance review. Employee time records are scoped to
their active employment; personnel time history is manager-restricted.

## v0.2 features

The employee workspace is now connected to Pioneer Admin's Field Operations tools.

- Acknowledge, start, flag issues, and submit completion reports for assigned jobs
- Manager review and approval (job status remains in progress until approved)
- Record salt use and field completion notes
- Before/after/issue photo uploads using signed object-storage URLs **when object storage is configured**
- Save recurring weekly availability, including overnight ranges
- Review and accept/decline shift offers; accepted shifts appear on Schedule
- See assigned routes, crew members, and ordered stops
- Receive assignment, route, cancellation and shift-offer email notifications
- Existing v0.1 sign-in, dashboard, jobs, schedule, profile, and password management

**Photo uploads:** The API uses its secure PostgreSQL-backed image storage by
default. When S3-compatible object storage is configured, it uses signed
uploads instead. The employee and manager portals work with either option.

## v0.1 foundation (retained)

- Separate employee sign-in, password reset and account recovery screens
- Employee dashboard with assigned-work totals and next assignment
- My Jobs list (active/history), work-order details, service location and map directions
- Read-only assigned-job schedule
- Profile and change-password controls
- Active-employee and assigned-work authorization enforced **by the backend**, not the browser
- Mobile-first navigation and layouts

The portal intentionally excludes payroll processing, customer billing and access to unrelated employee/customer records. Those belong to later milestones.

## Getting started

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

The development server runs at `http://localhost:5174`. Backend CORS must include that origin.

To build:

```sh
npm run build
```

The API origin is controlled by `VITE_API_BASE_URL`. The built-in production default is `https://api.pioneerlegacyworks.com`. Requests include cookies (`credentials: 'include'`) and never store staff passwords or tokens in browser storage.

## Publishing GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. On the first deployment, **enable GitHub Pages manually**:

1. In `Del-985/Pioneer-Employees`, open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** for the source.
3. Re-run the **Deploy Pioneer Employees** workflow in the Actions tab (or push a new commit to `main`).

GitHub's repository token cannot create a Pages site until Pages is enabled in repository settings. The workflow will build successfully but fail at the `Configure GitHub Pages` step otherwise.

The repository's configured custom domain is **employee.pioneeroutdoorservices.com**. GitHub Pages redirects the old `https://del-985.github.io/Pioneer-Employees/` URL to the custom hostname.

The Vite build therefore uses `/` as the asset base path. Building against `/Pioneer-Employees/` breaks the JavaScript and CSS loads at the custom domain and produces a blank page.

The employee portal uses `HashRouter` so internal navigation works without server rewrite rules.

**Authentication security:** Enable and verify GitHub Pages HTTPS for `https://employee.pioneeroutdoorservices.com/` before staff sign in. Never enter account credentials over an `http://` URL.

## Backend and email configuration

The API routes are hosted in **Pioneer-Backend**:

- `GET /api/employee/me` — current user profile and **active** employment records
- `GET /api/employee/jobs` — exclusively this user's assigned jobs
- `GET /api/employee/jobs/:jobId` — details only when still assigned to the active employee
- `POST /api/employee/jobs/:jobId/action` — report job acknowledgment, start, issue or completion
- `GET /api/employee/availability` / `PUT /api/employee/availability` — weekly availability
- `GET /api/employee/shifts` / `POST /api/employee/shifts/:shiftId/respond` — shift offers
- `GET /api/employee/routes` — active crew routes
- `POST /api/employee/jobs/:jobId/photos/upload-intent` — creates a PostgreSQL or S3 photo upload intent
- `POST /api/employee/photos/:photoId/content` — private binary upload when using PostgreSQL
- `POST /api/employee/photos/:photoId/complete` — confirms the completed upload
- `GET /api/employee/time?businessUnitId=…&weekStart=YYYY-MM-DD` — own current punch and weekly hours
- `POST /api/employee/time/clock-in` — server-recorded start (optional assigned job / accepted shift)
- `POST /api/employee/time/break/start` and `POST /api/employee/time/break/end` — paid/unpaid breaks
- `POST /api/employee/time/clock-out` — submit completed time for manager review
- `GET /api/admin/business-units/:businessUnitId/field/time` — permission-scoped management timesheet
- `POST /api/admin/business-units/:businessUnitId/field/time/entries` — add documented missing shift
- `PATCH /api/admin/business-units/:businessUnitId/field/time/entries/:entryId` — correct with reason
- `POST /api/admin/business-units/:businessUnitId/field/time/entries/:entryId/close` — resolve missed clock-out
- `POST /api/admin/business-units/:businessUnitId/field/time/entries/:entryId/review` — approve or return time
- `GET /api/admin/business-units/:businessUnitId/field/time/entries/:entryId/history` — audited actions
- Existing `/api/auth/login`, `/api/auth/logout`, `/api/auth/password/reset/request`, `/api/auth/password/reset`, and `/api/auth/password/change` routes remain the authentication system.

Backend production environment variables:

- `CORS_ORIGINS` must contain the employee origin, either `https://employee.pioneeroutdoorservices.com`, **in addition to** all existing allowed origins.
- `EMPLOYEE_PASSWORD_RESET_URL` must be set to the employee recovery URL after the employee site is published. For the configured custom domain, `https://employee.pioneeroutdoorservices.com/#/reset-password`.
- `PASSWORD_RESET_URL` should continue pointing to the Admin reset route. The backend chooses the employee URL for employee-only accounts or manager-issued employee invitations.

GitHub Pages links use the URL hash for navigation. The backend adds `?token=...` to the URL before the hash, which the employee recovery page supports.

The **Admin** frontend recognizes employee-only sessions and routes them to the employee website instead of opening management navigation.

## Data-access and security boundaries

The backend derives employee identity from the **HTTP-only staff session cookie**. It joins `employees` to `work_orders`, checks the employee is active, and applies business-unit scope. The browser cannot choose a different employee's ID. The jobs API returns the assigned customer's display name and service address but not payment, private account notes, or customer financial data.

An employee without any active employment records receives 403. Deactivating a profile removes access to its assignments immediately on the next API call. The global login credential can still exist; broader account deactivation/session revocation is an independent management policy.

## Next roadmap

v0.3.1–0.3.4: onboarding, safety checklists, incident reports, equipment checkout, and broader personnel management.  
v0.4: payroll calculation and bookkeeping integration from manager-approved time.

For timekeeping and field dispatch management, open **Pioneer Admin → Field Operations → Hours & Timesheets**.

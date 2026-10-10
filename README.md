# Pioneer Employees

Mobile-first staff portal for **Pioneer Legacy Works**, connected to the shared API at `api.pioneerlegacyworks.com`. Employees sign in with the same secure staff account created by Pioneer Admin, but the employee website contains **no administrator controls**.

## v0.4.4 — Internal 2026 withholding review (NOT payroll disbursement)

**Admin:** `https://admin.pioneerlegacyworks.com/payroll/tax`
**Employee:** `https://employee.pioneeroutdoorservices.com/#/pay`

This is a Pioneer-only, first-party **tax estimate preview**. It is not a
tax filing, bank payment, authorized payroll run, or substitute electronic
W-4. The backend uses signed-form transcriptions and document references,
not uploaded SSNs or banking details.

Calculation and verification steps:

1. **Approve a Native Payroll earnings snapshot** under v0.4.3.
2. Enter an employee's signed **2020–2026 federal W-4** fields, Ohio IT-4
   exemption count, verified residential school district, and documented
   Toledo taxability. Use a new effective date to revise an election.
3. For **each employee and payroll run**, reconcile and record prior **2026
   calendar-year-to-date Medicare and Social Security wages paid**, which
   determine Social Security wage-base and Additional Medicare limits.
   Zero prior wages require supporting payroll records too.
4. Prepare an immutable, employee-level tax *draft*. This applies the
   **2026 IRS Pub. 15-T Automated Percentage Method Worksheet 1A**;
   employee/employer Social Security at 6.2%, Medicare at 1.45%, and
   employee Additional Medicare at 0.9% over the $200,000 YTD threshold;
   Ohio's **Optional Computer Formula effective Aug 1, 2026**; Toledo's
   2.5% withholding; and verified earned-income-base school districts.
5. Review gross wages, federal/Ohio/Toledo/district tax, FICA, authorized
   voluntary deductions, reimbursements, and **projected** net.
   Gross wages and voluntary deductions do not automatically establish
   pretax classification; reimbursement tax treatment must be reviewed.
6. Approve the estimate, or void a stale draft and recalculate. The API
   prevents missing or unverified profiles, duplicate opening records,
   stale approvals, cross-employee visibility and editing approved results.
7. Employee **My Pay** displays only their own *approved* tax estimates,
   explicitly marked **not payable** and **not an official pay statement**.

**Deliberate restrictions:** Tax estimates are supported only for weekly or
biweekly payroll ending August 1–December 31, 2026; signed W-4 forms for
2020–2026 that do not claim federal withholding exemption; all wages verified
as Toledo-taxable; and either verified *no school district tax* or a verified
earned-income school district code/rate. Traditional-base school district
withholding, work allocated across other municipalities, missing payroll
history, unsupported dates, and unverified reimbursements block previews.

**Not implemented:** FUTA/SUTA, state unemployment and Ohio workers'
compensation costs, payroll tax remittance/deposits, legal tax filings,
check/direct-deposit initiation, paid status, bank reconciliation,
official pay stubs, and determination of final payable net wages.
The v0.4.5 payments and v0.4.6 filing releases must be independently
reviewed for tax and wage compliance before real use.

Versioned primary calculation sources:

- Federal: https://www.irs.gov/publications/p15t
- Social Security/Medicare: https://www.irs.gov/publications/p15
- Ohio: https://tax.ohio.gov/business/employer-withholding
- Toledo: https://toledo.oh.gov/pay-taxes

Backend migration: `057_payroll_tax_withholding.sql`.
Scopes: `payroll.tax.read`, `payroll.tax.manage`, `payroll.tax.approve`.
Backend routes: `GET/POST /payroll/tax/elections`,
`GET/POST /payroll/runs/:runId/tax/openings`,
`GET /payroll/tax/calculations`,
`POST /payroll/runs/:runId/tax/prepare`,
`GET /payroll/runs/:runId/tax`,
`POST /payroll/runs/:runId/tax/approve`,
`POST /payroll/runs/:runId/tax/void`,
and `GET /api/employee/pay/tax-preview?businessUnitId=…`
(admin paths are prefixed by
`/api/admin/business-units/:businessUnitId`).

## v0.4.3 — Internal native payroll earnings calculation

Pioneer is building payroll for **its own employees only**, not offering payroll
services to third parties. Admin now has **Payroll → Native Payroll** at
`https://admin.pioneerlegacyworks.com/payroll/native`.

- Prepare a versioned, employee-by-employee earnings snapshot from an existing
  gross payroll register built from approved timesheets and effective hourly rates.
- Review regular wages, estimated overtime (40-hour Monday–Sunday threshold,
  attributed to the clock-in week), posted bonuses, retroactive corrections,
  separate expense reimbursements, and documented voluntary deduction estimates.
- Voluntary deductions are *internal review inputs*, entered per pay period with
  an effective date, deduction code, authorization record and manager audit trail.
  The system rejects unauthorised active deductions and deductions exceeding
  an employee's gross wages. Tax characterization is deferred.
- Verify the source digest before approval; if the underlying posted adjustments
  or applicable deductions change, the stale draft cannot be approved.
  Void the draft with a documented reason and prepare a new calculation.
- Approved native earnings snapshots are immutable in PostgreSQL, scoped to a
  legal entity/business unit, and never automatically post a second Pioneer Books
  journal, execute a payment, or change already approved time records.
- Employees can see **only their own approved** internal gross-earnings preview in
  My Pay. Drafts remain hidden and the employee cannot change rates or deductions.

**v0.4.3 is NOT live-payroll capable.** No federal, state, municipal, Social
Security, Medicare, unemployment or employer tax amounts are calculated.
All tax fields and net-pay fields remain **null / not calculated**; amounts
remaining after voluntary deductions are deliberately not called take-home pay.
Neither checks nor direct deposits can be authorized by this release.
Statutory overtime and overnight-shift allocations need independent review before
using these records for actual wages. The planned tax engine is **v0.4.4**.

Backend migration: `055_payroll_native_engine.sql` with the immutable snapshot
hardening in `056_native_calculation_strict_lock.sql`. API endpoints:

- `GET/POST /api/admin/business-units/:businessUnitId/payroll/native/deductions`
- `GET /api/admin/business-units/:businessUnitId/payroll/native/calculations`
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/native/prepare`
- `GET /api/admin/business-units/:businessUnitId/payroll/runs/:runId/native`
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/native/approve`
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/native/void`
- `GET /api/employee/pay/native-preview?businessUnitId=…` — own approved previews only

The v0.4.2 Payroll Provider CSV section remains available only as an optional
fallback/legacy handoff; no vendor is required for the native calculation preview.

## v0.4.2 — Payroll provider export and imported pay records

Pioneer Admin → **Payroll → Payroll Provider (Legacy)** is the optional controlled handoff between
approved Pioneer timekeeping/posted wage estimates and an external payroll service.
This phase implements **manual CSV export/import** and provider-reference tracking,
not a direct vendor API connection or in-app wage disbursement.

1. Complete manager approval and post the gross wage register in Pioneer Books.
2. Select that posted register, identify your external provider and prepare the export.
3. Download a CSV of employee IDs, approved hours and estimated gross wages; transmit
   it to the provider using the provider's own website or secure workflow.
4. Record the **actual provider submission date and unique external reference** in Admin.
   Duplicate references and second submissions for that register are blocked.
5. Download the **Pioneer results CSV template** and fill it from the actual
   finalized provider report: integer-cent gross, federal/state withholding,
   Social Security, Medicare, other deductions, net pay, provider-reported
   payment status, payment date and optional statement reference.
6. Preview the complete, employee-matched import; validate that gross = net +
   deductions; explicitly acknowledge any gross difference; import results once.
7. Employees see only **their own** imported provider pay amounts, withholding
   and provider-reported payment status in **My Pay**, displayed separately from
   the existing unpaid Pioneer Books wage-accrual entries.

The backend stores an immutable import and audit trail with an idempotency key,
payload fingerprint, employee identity checks, business-unit restrictions and
permissions (`payroll.provider.read/manage/import`). An external submission must
be recorded before final provider results can be imported. Imported employee
payment statuses are **provider-reported, not bank-verified**. These summaries
are **not official pay stubs**; obtain formal statements from the payroll provider.

**Excluded from v0.4.2:** automated provider API submissions; actual payment
initiation; payroll-tax calculations/filings; remittance; employer tax liability
posting; bank reconciliation; and settlement of accrued wages in Pioneer Books.
Those accounting steps remain in the v0.4.3 roadmap. No Social Security number,
bank-routing information or direct-deposit details are collected in the CSV
workflow. Independent employer wage/compliance review remains necessary.

Backend migrations: `053_payroll_provider_bridge.sql` and
`054_payroll_provider_import_digest.sql`.
Admin: `https://admin.pioneerlegacyworks.com/payroll/provider`.
Employee: `https://employee.pioneeroutdoorservices.com/#/pay`.

## v0.4.1 — Audited Payroll Adjustments & Reimbursements

Admin now provides **Payroll → Adjustments**.

- Document a bonus, retroactive pay difference, positive/negative gross-wage correction,
  or employee expense reimbursement.
- A negative wage correction must be linked to the employee's original posted payroll run.
  Retroactive wage differences may also link to a previous posted run.
- Every adjustment is **draft → approved → posted**, with permissions checked on the backend.
  Unposted items may be voided; posted entries cannot be edited or deleted.
- Posting creates a **separate balanced Pioneer Books journal** and leaves previous
  payroll runs and their approved clock entries untouched.
- Bonus / retro-pay / wage corrections accrue to **6200 Gross Wage Expense** and
  **2150 Gross Wages Payable** (or selected eligible Books accounts).
- Reimbursements accrue separately to **6210 Employee Reimbursement Expenses** and
  **2160 Employee Reimbursements Payable**. Reimbursements do not change estimated
  gross wages, and their correct tax classification still requires independent review.
- To correct a posted adjustment, use **Reverse Posted Adjustment**. A separate
  opposite-signed accounting journal is created while preserving the original entry,
  reason, actor, timestamp and linked transaction history.
- Employees see only their own **posted** adjustment and reimbursement records,
  clearly labeled *not paid*. Drafts, pending approvals and other employees' amounts
  remain restricted. Audit history is manager-only.
- API supports idempotent creation via a client-generated UUID request key, audited
  approval, reversal, access isolation, and cross-business account validation.
- Admin can export a CSV of gross-pay and reimbursement adjustments. CSV export
  escapes formula-leading employee names.

**Important:** These are bookkeeping accruals, not payroll disbursement or employee
expense payments. No banking, net-pay, tax-withholding, statutory overtime
recalculation or tax filing is performed. Reimbursement tax classification depends on
the applicable accountable plan and payroll provider.

## v0.4.0 — Gross payroll register and Pioneer Books integration

This release adds a **read-only My Gross Pay** page to the employee portal
and **Payroll → Pay Registers** to Pioneer Admin.

- Admin sets hourly rates effective from specified dates, plus a configurable estimated overtime multiplier.
- Managers generate weekly or biweekly **gross payroll estimates** from manager-approved timesheets only.
- Payroll estimates count approved hours across linked employees in the same legal entity when applying a
  Monday–Sunday 40-hour calculation threshold; this remains an estimate because overnight shifts and
  break totals originate from time entries rather than a legally certified payroll engine.
- Payroll must be explicitly **approved** before being posted.
- Posting creates exactly one balanced journal in Pioneer Books:
  debit **6200 Gross Wage Expense** and credit **2150 Gross Wages Payable**
  (or an appropriate selected account pair), scoped to the business unit and legal entity.
- Admin can export a CSV of gross wage estimates and review posted **job-linked gross labor costs**.
- Employees see only their own **posted gross wage accruals**, not other workers' pay data.
- A draft or unposted-approved register can be voided so corrections can be made; posted runs are immutable.
- The backend protects time entries included in payroll and prevents double-posting.

**Important:** This is a gross-wage accrual and bookkeeping workflow, **not** a full payroll processor.
It does **not** calculate employee or employer taxes, legally certify overtime, issue checks, initiate
direct deposit, create final net pay, file returns, or record that anyone has been paid.
Use a compliant payroll provider and verify applicable wage and tax obligations before actual payment.
Posting the journal **does not reduce the business checking account**. Record wage settlement and
withholding separately through a configured payroll process and Pioneer Books.

Configuration: migration `049_payroll_registers.sql` establishes restricted payroll rates and
runs; migration `050_payroll_books_accounts.sql` seeds the two recommended accounts for
existing legal entities. Managers need `payroll.read/manage/approve/post` and
`bookkeeping.post` to post accruals.

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

Management has **Payroll → Hours & Timesheets** for weekly employee summaries,
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

The portal intentionally excludes actual wage disbursement, tax withholding and customer billing, and never gives employees access to unrelated wage or customer records.

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

The API origin is controlled by `VITE_API_BASE_URL` (production: `https://api.pioneerlegacyworks.com`). The employee portal uses a short-lived, revocable opaque bearer session on employee-only API routes because iOS Safari can block third-party cookies. It stores the token only in tab-scoped `sessionStorage` (or memory in restricted browser mode); it does not persist passwords in the browser or expose the token to Admin APIs.

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
- `GET /api/employee/pay/statements?businessUnitId=…` — employee-only posted gross wage accruals
- `GET /api/employee/pay/provider-statements?businessUnitId=…` — employee-only imported provider pay summaries
- `GET /api/admin/business-units/:businessUnitId/payroll/provider-batches` — restricted provider handoff list
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/provider/prepare` — prepare posted register
- `GET /api/admin/business-units/:businessUnitId/payroll/runs/:runId/provider` — source/actual batch detail and audit
- `GET /api/admin/business-units/:businessUnitId/payroll/runs/:runId/provider/export` — sanitized estimated-gross CSV
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/provider/submitted` — record external submission
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/provider/import` — validate and import exact employee results once
- `GET /api/admin/business-units/:businessUnitId/payroll/rates` / `POST /rates` — restricted hourly rates
- `GET /api/admin/business-units/:businessUnitId/payroll/accounts` — eligible Books accounts
- `GET/POST /api/admin/business-units/:businessUnitId/payroll/runs` — list/prepare period registers
- `GET /api/admin/business-units/:businessUnitId/payroll/runs/:runId` — immutable detailed snapshot
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/approve` — manager approval
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/post` — balanced Books wage accrual
- `POST /api/admin/business-units/:businessUnitId/payroll/runs/:runId/void` — release unposted register
- `GET /api/admin/business-units/:businessUnitId/payroll/labor-costs` — posted job-linked gross labor
- Employee-only `/api/employee/session/login`, `/api/employee/session/logout`, and `/api/employee/session/password/change` use a narrowly scoped revocable employee session. Platform auth and password recovery endpoints remain available separately.

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

v0.3.1–0.3.2 were skipped at the operator's request. Equipment/qualifications and supervisor dashboard improvements remain optional.  
v0.4.0: gross wage estimates and accounting accrual integration — complete.  \nv0.4.1: audited bonus, retroactive corrections, separate expense reimbursements, and reversal journals — complete.  
Later: compliant payroll provider integration, verified wage settlement, tax withholding and statutory reports (not implemented).

For timekeeping, dispatch and gross payroll management, open **Pioneer Admin → Field Operations**.

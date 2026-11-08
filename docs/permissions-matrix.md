# Permissions Matrix (RBAC)

**Principle**: role is only one layer; the final decision is `role + ownership + org_id`. Every tenant check runs
before any 403 is returned, so existence is never leaked.

## 1. Roles

| Role | Data scope | Administrative rights |
| --- | --- | --- |
| `ADMIN` | Whole org | Users, pipeline, webhook sources, audit, export, configuration |
| `MANAGER` | Whole org (leads/deals/activities) | Assignment, export, team reports; no user/webhook management |
| `SALES` | Only records with `owner_id = self` or assigned to them | Handles their own leads/deals/tasks |

Notes:

- "Assigned" in the MVP means `owner_id = currentUser`; there is no assignment-history table.
- Contacts without an owner (the webhook has not assigned one) are visible to Manager/Admin only; Sales never see
  them.
- Task: the assignee does the work; Sales only sees tasks assigned to them.
- Manager/Admin can read the activities of any deal in the org; Sales only their own deals.

## 2. Endpoint matrix

Legend: ✅ allowed; ❌ 403; 🔒 own data only; 🧑‍💼 Manager/Admin; 👑 Admin.

| Endpoint / action | Admin | Manager | Sales | Note |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | public | public | public | creates a new org |
| `POST /auth/login`, `/refresh`, `/logout` | ✅ | ✅ | ✅ | token-based |
| `GET /auth/me` | ✅ | ✅ | ✅ | returns role/org |
| `GET /users` | ✅ | ❌ | ❌ | Admin |
| `POST /users` | ✅ | ❌ | ❌ | Admin |
| `PATCH /users/:id` | ✅ | ❌ | ❌ | role/active; last-admin guard |
| `GET /contacts` | ✅ | ✅ | 🔒 | Sales see only owned contacts |
| `POST /contacts` | ✅ | ✅ | ✅ | Sales owner = self |
| `GET /contacts/:id` | ✅ | ✅ | 🔒 | 404 when not owned |
| `PATCH /contacts/:id` | ✅ | ✅ | 🔒 | ownership cannot be moved to someone else |
| `DELETE /contacts/:id` | ✅ | ✅ | 🔒 | soft delete |
| `GET /pipelines` | ✅ | ✅ | ✅ | read-only for Sales |
| `POST /pipelines` | ✅ | ❌ | ❌ | Admin |
| `PATCH /pipelines/:id` | ✅ | ❌ | ❌ | Admin |
| `DELETE /pipelines/:id` | ✅ | ❌ | ❌ | Admin; 409 when deals remain |
| `POST /pipelines/:id/stages` | ✅ | ❌ | ❌ | Admin |
| `PATCH /stages/:id` | ✅ | ❌ | ❌ | Admin; reorder/name/won/lost |
| `DELETE /stages/:id` | ✅ | ❌ | ❌ | Admin; 409 when deals remain |
| `GET /deals` (board/list) | ✅ | ✅ | 🔒 | Sales own |
| `POST /deals` | ✅ | ✅ | ✅ | owner defaults to self; Sales cannot assign others |
| `GET /deals/:id` | ✅ | ✅ | 🔒 | 404 when not owned |
| `PATCH /deals/:id` | ✅ | ✅ | 🔒 | title/value/expectedClose; never owner |
| `PATCH /deals/:id/move` | ✅ | ✅ | 🔒 | `version` required |
| `PATCH /deals/:id/assign` | ✅ | ✅ | ❌ | Manager/Admin |
| `GET /deals/:id/activities` | ✅ | ✅ | 🔒 | Sales only their own deals |
| `POST /deals/:id/activities` | ✅ | ✅ | 🔒 | note/call/task |
| `PATCH /activities/:id` | ✅ | ✅ | 🔒 | creator/assignee; 404 when the deal is not visible |
| `GET /tasks` | ✅ | ✅ | 🔒 | assignee defaults to self; Manager may pass `assigneeId` |
| `PATCH /tasks/:id` | ✅ | ✅ | 🔒 | assignee/creator |
| `GET /reports/summary` | ✅ | ✅ | 🔒 | Sales see their own numbers only |
| `GET /notifications` | ✅ | ✅ | 🔒 | own notifications |
| `PATCH /notifications/:id/read` | ✅ | ✅ | 🔒 | own notifications |
| `POST /notifications/read-all` | ✅ | ✅ | 🔒 | own notifications only |
| `POST /imports/contacts` | ✅ | ✅ | ❌ | Manager/Admin |
| `GET /imports/:id` | ✅ | ✅ | ❌ | job inside the org |
| `GET /imports/:id/errors` | ✅ | ✅ | ❌ | job inside the org |
| `POST /webhooks/leads/:publicKey` | public | public | public | HMAC + idempotency |
| `GET /webhook-sources` | ✅ | ❌ | ❌ | Admin |
| `POST /webhook-sources` | ✅ | ❌ | ❌ | Admin |
| `PATCH /webhook-sources/:id` | ✅ | ❌ | ❌ | Admin |
| `POST /webhook-sources/:id/rotate-secret` | ✅ | ❌ | ❌ | Admin; the secret is returned once |
| `DELETE /webhook-sources/:id` | ✅ | ❌ | ❌ | Admin |
| `GET /audit-logs` | ✅ | ❌ | ❌ | Admin |
| `GET /exports/contacts` | ✅ | ✅ | ❌ | Manager/Admin |
| `GET /exports/deals` | ✅ | ✅ | ❌ | Manager/Admin |
| `POST /ai/deals/:id/summary` | ✅ | ✅ | 🔒 | Sales own deals |
| `POST /ai/deals/:id/follow-up-email` | ✅ | ✅ | 🔒 | never auto-sends |
| `POST /ai/contacts/:id/score` | ✅ | ✅ | 🔒 | Sales own contacts |
| `GET /ai/runs/:id` | ✅ | ✅ | 🔒 | own run / within the org |
| `GET /ai/usage` | ✅ | ✅ | 🔒 | Sales see their own usage only |
| `GET /health/*` | public | public | public | no auth |

## 3. Special rules

1. **Last admin**: the last active Admin of an org cannot be demoted or deactivated (`409 LAST_ADMIN`).
2. **Self**: an Admin cannot deactivate itself (`409 CANNOT_DEACTIVATE_SELF`) but may rename itself.
3. **Assign**: only Manager/Admin may change `owner_id`; a Sales user creating a deal always owns it.
4. **Owner inactive**: never assign a deal/contact/task to an inactive user (`400 INVALID_OWNER`).
5. **Unassigned contact**: visible to Manager/Admin only; Sales cannot see it until it is assigned.
6. **Webhook**: public key + HMAC; no JWT; inactive source → 401; the secret is returned once.
7. **Export**: Manager/Admin; audit `EXPORT`; audit logs themselves cannot be exported through this endpoint.
8. **AI**: Sales may only use it on data they own; quota is counted per user + org.
9. **Audit**: Admin only; there is no API to edit or delete audit rows.
10. **Tenant**: no role of org B sees org A data, not even an Admin of org B.

## 4. Mandatory test table

For every endpoint in the matrix:

| Test | Expectation |
| --- | --- |
| Happy path with an allowed role | 2xx |
| Lower role | 403 (or 404 when existence is hidden) |
| User from another org | 404 |
| Sales accessing another user's record in the same org | 404 (403 only when the record is visible) |
| Sales accessing their own record | 2xx |
| Manager accessing a Sales record | 2xx |
| Admin of another org | 404 |
| Missing/expired token | 401 |

These tests live in `apps/api/test/integration/*.spec.ts` and use the `createUser(role, org)` and `loginAs(user)`
factories.

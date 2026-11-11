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

Legend: `Yes` allowed; `No` 403; `Own` own data only; `public` no authentication.

| Endpoint / action | Admin | Manager | Sales | Note |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | public | public | public | creates a new org |
| `POST /auth/login`, `/refresh`, `/logout` | Yes | Yes | Yes | token-based |
| `GET /auth/me` | Yes | Yes | Yes | returns role/org |
| `GET /users` | Yes | No | No | Admin |
| `POST /users` | Yes | No | No | Admin |
| `PATCH /users/:id` | Yes | No | No | role/active; last-admin guard |
| `GET /contacts` | Yes | Yes | Own | Sales see only owned contacts |
| `POST /contacts` | Yes | Yes | Yes | Sales owner = self |
| `GET /contacts/:id` | Yes | Yes | Own | 404 when not owned |
| `PATCH /contacts/:id` | Yes | Yes | Own | ownership cannot be moved to someone else |
| `DELETE /contacts/:id` | Yes | Yes | Own | soft delete |
| `GET /pipelines` | Yes | Yes | Yes | read-only for Sales |
| `POST /pipelines` | Yes | No | No | Admin |
| `PATCH /pipelines/:id` | Yes | No | No | Admin |
| `DELETE /pipelines/:id` | Yes | No | No | Admin; 409 when deals remain |
| `POST /pipelines/:id/stages` | Yes | No | No | Admin |
| `PATCH /stages/:id` | Yes | No | No | Admin; reorder/name/won/lost |
| `DELETE /stages/:id` | Yes | No | No | Admin; 409 when deals remain |
| `GET /deals` (board/list) | Yes | Yes | Own | Sales own |
| `POST /deals` | Yes | Yes | Yes | owner defaults to self; Sales cannot assign others |
| `GET /deals/:id` | Yes | Yes | Own | 404 when not owned |
| `PATCH /deals/:id` | Yes | Yes | Own | title/value/expectedClose; never owner |
| `PATCH /deals/:id/move` | Yes | Yes | Own | `version` required |
| `PATCH /deals/:id/assign` | Yes | Yes | No | Manager/Admin |
| `GET /deals/:id/activities` | Yes | Yes | Own | Sales only their own deals |
| `POST /deals/:id/activities` | Yes | Yes | Own | note/call/task |
| `PATCH /activities/:id` | Yes | Yes | Own | creator/assignee; 404 when the deal is not visible |
| `GET /tasks` | Yes | Yes | Own | assignee defaults to self; Manager may pass `assigneeId` |
| `PATCH /tasks/:id` | Yes | Yes | Own | assignee/creator |
| `GET /reports/summary` | Yes | Yes | Own | Sales see their own numbers only |
| `GET /notifications` | Yes | Yes | Own | own notifications |
| `PATCH /notifications/:id/read` | Yes | Yes | Own | own notifications |
| `POST /notifications/read-all` | Yes | Yes | Own | own notifications only |
| `POST /imports/contacts` | Yes | Yes | No | Manager/Admin |
| `GET /imports/:id` | Yes | Yes | No | job inside the org |
| `GET /imports/:id/errors` | Yes | Yes | No | job inside the org |
| `POST /webhooks/leads/:publicKey` | public | public | public | HMAC + idempotency |
| `GET /webhook-sources` | Yes | No | No | Admin |
| `POST /webhook-sources` | Yes | No | No | Admin |
| `PATCH /webhook-sources/:id` | Yes | No | No | Admin |
| `POST /webhook-sources/:id/rotate-secret` | Yes | No | No | Admin; the secret is returned once |
| `DELETE /webhook-sources/:id` | Yes | No | No | Admin |
| `GET /audit-logs` | Yes | No | No | Admin |
| `GET /exports/contacts` | Yes | Yes | No | Manager/Admin |
| `GET /exports/deals` | Yes | Yes | No | Manager/Admin |
| `POST /ai/deals/:id/summary` | Yes | Yes | Own | Sales own deals |
| `POST /ai/deals/:id/follow-up-email` | Yes | Yes | Own | never auto-sends |
| `POST /ai/contacts/:id/score` | Yes | Yes | Own | Sales own contacts |
| `GET /ai/runs/:id` | Yes | Yes | Own | own run / within the org |
| `GET /ai/usage` | Yes | Yes | Own | Sales see their own usage only |
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

These tests live in `backend/test/integration/*.spec.ts` and use the `createUser(role, org)` and `loginAs(user)`
factories.

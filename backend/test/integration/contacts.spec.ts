import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { PrincipalService } from '../../src/common/auth/principal.service';
import { loadEnv } from '../../src/common/config/env';
import {
  createContact,
  createOrg,
  createUser,
  disconnect,
  loginAs,
  prisma,
  resetDatabase,
  resetRateLimits,
} from '../factories';

const CONTACTS = '/api/v1/contacts';

interface Actor {
  id: string;
  authorization: string;
}

describe('contacts (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(loadEnv());
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetRateLimits();
    app.get(PrincipalService).clear();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnect();
    await app.close();
  });

  /** One org with Admin/Manager/Sales A/Sales B plus a second org with its own Admin. */
  async function seedTeam(): Promise<{
    orgId: string;
    admin: Actor;
    manager: Actor;
    salesA: Actor;
    salesB: Actor;
    otherAdmin: Actor;
  }> {
    const org = await createOrg({ name: 'Acme' });
    const other = await createOrg({ name: 'Globex' });

    async function actor(orgId: string, role: UserRole): Promise<Actor> {
      const user = await createUser({ orgId, role });
      return { id: user.id, authorization: loginAs(user).authorization };
    }

    return {
      orgId: org.id,
      admin: await actor(org.id, UserRole.ADMIN),
      manager: await actor(org.id, UserRole.MANAGER),
      salesA: await actor(org.id, UserRole.SALES),
      salesB: await actor(org.id, UserRole.SALES),
      otherAdmin: await actor(other.id, UserRole.ADMIN),
    };
  }

  function postContact(authorization: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(CONTACTS).set('Authorization', authorization).send(body);
  }

  function listContacts(authorization: string, query = '') {
    return request(app.getHttpServer()).get(`${CONTACTS}${query}`).set('Authorization', authorization);
  }

  it('POST /contacts creates a contact owned by the caller with a lowercase email and audit (AC-FR03-01)', async () => {
    const team = await seedTeam();

    const response = await postContact(team.salesA.authorization, {
      name: 'Nguyễn Văn An',
      email: 'An.Nguyen@Example.COM',
      phone: '+84 90 123 4567',
      company: 'Acme Corp',
      source: 'manual',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      orgId: team.orgId,
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@example.com',
      phone: '+84 90 123 4567',
      company: 'Acme Corp',
      source: 'manual',
      ownerId: team.salesA.id,
      deletedAt: null,
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('searchText');
    expect(response.body).not.toHaveProperty('search_text');

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Contact', entityId: response.body.id as string, action: 'CONTACT_CREATED' },
    });
    expect(audit?.orgId).toBe(team.orgId);
    expect(audit?.actorId).toBe(team.salesA.id);
    expect(audit?.requestId).toEqual(expect.any(String));
    expect(audit?.after).toMatchObject({ name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' });
  });

  it('lets Manager/Admin assign an active owner but rejects an invalid, inactive or foreign owner (AC-FR03-07)', async () => {
    const team = await seedTeam();

    const assigned = await postContact(team.manager.authorization, {
      name: 'Assigned Lead',
      ownerId: team.salesB.id,
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.ownerId).toBe(team.salesB.id);

    const defaultsToSelf = await postContact(team.manager.authorization, { name: 'Unassigned By Manager' });
    expect(defaultsToSelf.status).toBe(201);
    expect(defaultsToSelf.body.ownerId).toBe(team.manager.id);

    const inactive = await createUser({ orgId: team.orgId, role: UserRole.SALES, active: false });
    const inactiveOwner = await postContact(team.admin.authorization, {
      name: 'Inactive Owner',
      ownerId: inactive.id,
    });
    expect(inactiveOwner.status).toBe(400);
    expect(inactiveOwner.body.code).toBe('INVALID_OWNER');

    const foreignOrg = await createOrg({ name: 'Initech' });
    const foreignOwner = await createUser({ orgId: foreignOrg.id, role: UserRole.SALES });
    const foreign = await postContact(team.admin.authorization, {
      name: 'Foreign Owner',
      ownerId: foreignOwner.id,
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('INVALID_OWNER');

    const salesAssign = await postContact(team.salesA.authorization, {
      name: 'Sales Assignment',
      ownerId: team.salesB.id,
    });
    expect(salesAssign.status).toBe(403);
    expect(salesAssign.body.code).toBe('FORBIDDEN');
    await expect(prisma.contact.count({ where: { name: 'Sales Assignment' } })).resolves.toBe(0);

    const selfAssign = await postContact(team.salesA.authorization, {
      name: 'Self Assignment',
      ownerId: team.salesA.id,
    });
    expect(selfAssign.status).toBe(201);
    expect(selfAssign.body.ownerId).toBe(team.salesA.id);
  });

  it('rejects duplicate emails inside the org but allows the same email in another org (AC-FR03-06)', async () => {
    const team = await seedTeam();
    const otherOrg = await createOrg({ name: 'Initech' });
    const otherSales = await createUser({ orgId: otherOrg.id, role: UserRole.SALES });
    const otherAuthorization = loginAs(otherSales).authorization;

    const first = await postContact(team.salesA.authorization, {
      name: 'First',
      email: 'Dup@Example.com',
    });
    expect(first.status).toBe(201);

    const duplicate = await postContact(team.salesA.authorization, {
      name: 'Second',
      email: 'dup@example.com',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONTACT_EMAIL_EXISTS');
    await expect(prisma.contact.count({ where: { email: 'dup@example.com' } })).resolves.toBe(1);

    const otherOrgContact = await postContact(otherAuthorization, {
      name: 'Other Org',
      email: 'dup@example.com',
    });
    expect(otherOrgContact.status).toBe(201);
    expect(otherOrgContact.body.orgId).toBe(otherOrg.id);
  });

  it('maps a concurrent duplicate insert to one 201 and one 409', async () => {
    const team = await seedTeam();

    const [left, right] = await Promise.all([
      postContact(team.salesA.authorization, { name: 'Race A', email: 'race@example.com' }),
      postContact(team.salesA.authorization, { name: 'Race B', email: 'race@example.com' }),
    ]);

    expect([left.status, right.status].sort()).toEqual([201, 409]);
    const conflict = left.status === 409 ? left : right;
    expect(conflict.body.code).toBe('CONTACT_EMAIL_EXISTS');
    await expect(prisma.contact.count({ where: { email: 'race@example.com' } })).resolves.toBe(1);
  });

  it('scopes lists for Sales while Manager/Admin see owned and unassigned contacts (AC-FR03-03)', async () => {
    const team = await seedTeam();
    const own = await createContact({ orgId: team.orgId, ownerId: team.salesA.id, name: 'Owned by A' });
    const otherOwned = await createContact({
      orgId: team.orgId,
      ownerId: team.salesB.id,
      name: 'Owned by B',
    });
    const unassigned = await createContact({ orgId: team.orgId, ownerId: null, name: 'Nobody owns me' });
    const deleted = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Deleted contact',
      deletedAt: new Date(),
    });

    const salesList = await listContacts(team.salesA.authorization);
    expect(salesList.status).toBe(200);
    expect(salesList.body.data.map((row: { id: string }) => row.id)).toEqual([own.id]);
    expect(salesList.body).toMatchObject({ hasMore: false, nextCursor: null });

    const forcedFilter = await listContacts(team.salesA.authorization, `?ownerId=${team.salesB.id}`);
    expect(forcedFilter.body.data.map((row: { id: string }) => row.id)).toEqual([own.id]);

    const managerList = await listContacts(team.manager.authorization);
    expect(new Set(managerList.body.data.map((row: { id: string }) => row.id))).toEqual(
      new Set([own.id, otherOwned.id, unassigned.id]),
    );

    const adminList = await listContacts(team.admin.authorization);
    expect(adminList.body.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [own.id, otherOwned.id, unassigned.id].sort(),
    );
    expect(adminList.body.data.map((row: { id: string }) => row.id)).not.toContain(deleted.id);

    const ownRead = await request(app.getHttpServer())
      .get(`${CONTACTS}/${own.id}`)
      .set('Authorization', team.salesA.authorization);
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.id).toBe(own.id);

    const unassignedRead = await request(app.getHttpServer())
      .get(`${CONTACTS}/${unassigned.id}`)
      .set('Authorization', team.salesA.authorization);
    expect(unassignedRead.status).toBe(404);
    expect(unassignedRead.body.code).toBe('CONTACT_NOT_FOUND');
  });

  it('searches name/email/company case- and accent-insensitively and escapes wildcards (AC-FR03-02)', async () => {
    const team = await seedTeam();
    const accented = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@acme.test',
      company: 'ACME Software',
    });
    const percent = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Discount Lead',
      company: '100% Real',
    });
    const underscore = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'under_score lead',
      company: 'Other',
    });
    const nameOnly = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Solo Person',
    });
    await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Someone Else',
      email: 'someone@example.test',
      company: 'Globex',
    });

    async function search(term: string): Promise<string[]> {
      const response = await listContacts(team.salesA.authorization, `?search=${encodeURIComponent(term)}`);
      expect(response.status).toBe(200);
      return response.body.data.map((row: { id: string }) => row.id);
    }

    await expect(search('nguyen')).resolves.toEqual([accented.id]);
    await expect(search('NGUYỄN')).resolves.toEqual([accented.id]);
    await expect(search('acme')).resolves.toEqual([accented.id]);
    await expect(search('software')).resolves.toEqual([accented.id]);
    await expect(search('an.nguyen')).resolves.toEqual([accented.id]);
    await expect(search('%')).resolves.toEqual([percent.id]);
    await expect(search('_')).resolves.toEqual([underscore.id]);
    await expect(search('solo')).resolves.toEqual([nameOnly.id]);
    await expect(search('no-such-contact')).resolves.toEqual([]);
  });

  it('filters by source and date range, rejects an inverted range and keeps deleted rows out of search (AC-FR03-02)', async () => {
    const team = await seedTeam();
    const january = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'January Lead',
      source: 'webhook',
      createdAt: new Date('2026-01-05T10:00:00.000Z'),
    });
    const june = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'June Lead',
      source: 'manual',
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    const deleted = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'June Deleted',
      source: 'manual',
      createdAt: new Date('2026-06-11T10:00:00.000Z'),
      deletedAt: new Date('2026-06-12T10:00:00.000Z'),
    });

    const bySource = await listContacts(team.salesA.authorization, '?source=webhook');
    expect(bySource.body.data.map((row: { id: string }) => row.id)).toEqual([january.id]);

    const byRange = await listContacts(
      team.salesA.authorization,
      '?createdFrom=2026-01-01&createdTo=2026-01-31',
    );
    expect(byRange.body.data.map((row: { id: string }) => row.id)).toEqual([january.id]);

    const sameDay = await listContacts(
      team.salesA.authorization,
      '?createdFrom=2026-06-10&createdTo=2026-06-10',
    );
    expect(sameDay.body.data.map((row: { id: string }) => row.id)).toEqual([june.id]);
    expect(sameDay.body.data.map((row: { id: string }) => row.id)).not.toContain(deleted.id);

    const inverted = await listContacts(
      team.salesA.authorization,
      '?createdFrom=2026-06-10&createdTo=2026-01-01',
    );
    expect(inverted.status).toBe(400);
    expect(inverted.body.code).toBe('INVALID_DATE_RANGE');
  });

  it('paginates with an opaque cursor and sorts by name or creation date (AC-FR03-02)', async () => {
    const team = await seedTeam();
    const alpha = await createContact({ orgId: team.orgId, ownerId: team.salesA.id, name: 'alpha' });
    const mike = await createContact({ orgId: team.orgId, ownerId: team.salesA.id, name: 'Mike' });
    const zeta = await createContact({ orgId: team.orgId, ownerId: team.salesA.id, name: 'Zeta' });

    const sorted = await listContacts(team.salesA.authorization, '?sort=name');
    expect(sorted.body.data.map((row: { id: string }) => row.id)).toEqual([alpha.id, mike.id, zeta.id]);

    const firstPage = await listContacts(team.salesA.authorization, '?sort=name&limit=2');
    expect(firstPage.body.data.map((row: { id: string }) => row.id)).toEqual([alpha.id, mike.id]);
    expect(firstPage.body.hasMore).toBe(true);
    expect(typeof firstPage.body.nextCursor).toBe('string');

    const secondPage = await listContacts(
      team.salesA.authorization,
      `?sort=name&limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`,
    );
    expect(secondPage.body.data.map((row: { id: string }) => row.id)).toEqual([zeta.id]);
    expect(secondPage.body.hasMore).toBe(false);
    expect(secondPage.body.nextCursor).toBeNull();

    const newestFirst = await listContacts(team.salesA.authorization, '?sort=-createdAt');
    expect(newestFirst.status).toBe(200);
    expect(newestFirst.body.data).toHaveLength(3);

    const badCursor = await listContacts(team.salesA.authorization, '?cursor=not-a-cursor');
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');

    const tooLarge = await listContacts(team.salesA.authorization, '?limit=101');
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /contacts/:id updates fields, clears with null and audits before/after (AC-FR03-04)', async () => {
    const team = await seedTeam();
    const created = await postContact(team.salesA.authorization, {
      name: 'Original Name',
      phone: '+84 90 000 0000',
      company: 'Original Co',
    });
    const contactId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization)
      .send({ name: 'Renamed Contact', company: 'New Co' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: contactId, name: 'Renamed Contact', company: 'New Co' });

    const updateAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Contact', entityId: contactId, action: 'CONTACT_UPDATED' },
    });
    expect(updateAudit?.actorId).toBe(team.salesA.id);
    expect(updateAudit?.before).toMatchObject({ name: 'Original Name', company: 'Original Co' });
    expect(updateAudit?.after).toMatchObject({ name: 'Renamed Contact', company: 'New Co' });

    const cleared = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization)
      .send({ phone: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.phone).toBeNull();

    const empty = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');

    const duplicateSource = await postContact(team.salesA.authorization, {
      name: 'Other Contact',
      email: 'taken@example.com',
    });
    const takenId = duplicateSource.body.id as string;
    const duplicate = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization)
      .send({ email: 'TAKEN@example.com' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONTACT_EMAIL_EXISTS');

    const ownerIgnored = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${takenId}`)
      .set('Authorization', team.salesA.authorization)
      .send({ name: 'Still Mine', ownerId: team.salesB.id });
    expect(ownerIgnored.status).toBe(200);
    expect(ownerIgnored.body.ownerId).toBe(team.salesA.id);
  });

  it('hides another Sales contact and another org contact as 404 without touching the row (AC-FR03-04, AC-FR03-08)', async () => {
    const team = await seedTeam();
    const created = await createContact({
      orgId: team.orgId,
      ownerId: team.salesA.id,
      name: 'Private Lead',
      email: 'private@example.com',
    });

    const otherSalesGet = await request(app.getHttpServer())
      .get(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.salesB.authorization);
    expect(otherSalesGet.status).toBe(404);
    expect(otherSalesGet.body.code).toBe('CONTACT_NOT_FOUND');

    const otherSalesPatch = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.salesB.authorization)
      .send({ name: 'Hijacked' });
    expect(otherSalesPatch.status).toBe(404);
    expect(otherSalesPatch.body.code).toBe('CONTACT_NOT_FOUND');

    const foreignGet = await request(app.getHttpServer())
      .get(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.otherAdmin.authorization);
    expect(foreignGet.status).toBe(404);

    const foreignPatch = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.otherAdmin.authorization)
      .send({ name: 'Hijacked' });
    expect(foreignPatch.status).toBe(404);

    const foreignDelete = await request(app.getHttpServer())
      .delete(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.otherAdmin.authorization);
    expect(foreignDelete.status).toBe(404);

    const unchanged = await prisma.contact.findUniqueOrThrow({ where: { id: created.id } });
    expect(unchanged).toMatchObject({ name: 'Private Lead', deletedAt: null });
    expect(await prisma.auditLog.count({ where: { entityId: created.id } })).toBe(0);

    const managerPatch = await request(app.getHttpServer())
      .patch(`${CONTACTS}/${created.id}`)
      .set('Authorization', team.manager.authorization)
      .send({ company: 'Manager Edit' });
    expect(managerPatch.status).toBe(200);
    expect(managerPatch.body.company).toBe('Manager Edit');
  });

  it('DELETE /contacts/:id soft-deletes, audits and frees the email for reuse (AC-FR03-05)', async () => {
    const team = await seedTeam();
    const created = await postContact(team.salesA.authorization, {
      name: 'Temporary Lead',
      email: 'reuse@example.com',
    });
    const contactId = created.body.id as string;

    const deleted = await request(app.getHttpServer())
      .delete(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');

    const row = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    expect(row.deletedAt).toBeInstanceOf(Date);

    const deleteAudit = await prisma.auditLog.findFirst({
      where: { entity: 'Contact', entityId: contactId, action: 'CONTACT_DELETED' },
    });
    expect(deleteAudit?.actorId).toBe(team.salesA.id);
    expect(deleteAudit?.before).toMatchObject({ name: 'Temporary Lead', email: 'reuse@example.com' });

    const readAfterDelete = await request(app.getHttpServer())
      .get(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization);
    expect(readAfterDelete.status).toBe(404);
    expect(readAfterDelete.body.code).toBe('CONTACT_NOT_FOUND');

    const listed = await listContacts(team.salesA.authorization, '?search=Temporary');
    expect(listed.body.data).toEqual([]);

    const secondDelete = await request(app.getHttpServer())
      .delete(`${CONTACTS}/${contactId}`)
      .set('Authorization', team.salesA.authorization);
    expect(secondDelete.status).toBe(404);

    const recreated = await postContact(team.salesA.authorization, {
      name: 'Reused Email',
      email: 'reuse@example.com',
    });
    expect(recreated.status).toBe(201);

    const otherSalesDelete = await request(app.getHttpServer())
      .delete(`${CONTACTS}/${recreated.body.id as string}`)
      .set('Authorization', team.salesB.authorization);
    expect(otherSalesDelete.status).toBe(404);
    const stillAlive = await prisma.contact.findUniqueOrThrow({ where: { id: recreated.body.id as string } });
    expect(stillAlive.deletedAt).toBeNull();
  });

  it('validates ids, payloads and search terms and requires authentication', async () => {
    const team = await seedTeam();

    const missingName = await postContact(team.salesA.authorization, { email: 'no-name@example.com' });
    expect(missingName.status).toBe(400);
    expect(missingName.body.code).toBe('VALIDATION_ERROR');
    expect(missingName.body.details.fields.name).toEqual(expect.any(Array));

    const badEmail = await postContact(team.salesA.authorization, { name: 'Bad Email', email: 'nope' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.details.fields.email).toEqual(expect.any(Array));

    const longSearch = await listContacts(team.salesA.authorization, `?search=${'a'.repeat(101)}`);
    expect(longSearch.status).toBe(400);
    expect(longSearch.body.code).toBe('VALIDATION_ERROR');

    const malformedId = await request(app.getHttpServer())
      .get(`${CONTACTS}/not-a-uuid`)
      .set('Authorization', team.salesA.authorization);
    expect(malformedId.status).toBe(400);
    expect(malformedId.body.code).toBe('VALIDATION_ERROR');

    const missing = await request(app.getHttpServer())
      .get(`${CONTACTS}/${randomUUID()}`)
      .set('Authorization', team.salesA.authorization);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CONTACT_NOT_FOUND');

    const unauthenticated = await request(app.getHttpServer()).get(CONTACTS);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe('UNAUTHENTICATED');
  });
});

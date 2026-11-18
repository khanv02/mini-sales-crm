import { expect, test } from '@playwright/test';

/**
 * Core M1 demo (T225, FR-03/FR-05/FR-06): sign in, create a contact, create a deal
 * from it, move the deal to the won stage and confirm the board reflects it.
 *
 * Runs against the seeded dev stack (`pnpm db:seed`); every run uses unique names so
 * repeated executions stay independent.
 */
test('login -> contact -> deal -> move -> won', async ({ page }) => {
  const stamp = Date.now();
  const contactName = `E2E Contact ${stamp}`;
  const contactEmail = `e2e-${stamp}@acme.test`;
  const dealTitle = `E2E Deal ${stamp}`;

  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@acme.test');
  await page.getByLabel('Mật khẩu').fill('Password123!');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();

  await page.getByRole('link', { name: 'Khách hàng' }).click();
  await expect(page.getByRole('heading', { name: 'Khách hàng' })).toBeVisible();

  await page.getByRole('button', { name: 'Thêm khách hàng' }).click();
  const contactDialog = page.getByRole('dialog', { name: 'Thêm khách hàng' });
  await contactDialog.getByLabel('Họ và tên').fill(contactName);
  await contactDialog.getByLabel('Email').fill(contactEmail);
  await contactDialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(contactDialog).toBeHidden();
  await expect(page.getByRole('cell', { name: contactName, exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Cơ hội' }).click();
  await expect(page.getByRole('heading', { name: 'Cơ hội bán hàng' })).toBeVisible();

  await page.getByRole('button', { name: 'Thêm deal' }).click();
  const dealDialog = page.getByRole('dialog', { name: 'Thêm deal' });
  await dealDialog
    .getByLabel('Khách hàng')
    .selectOption({ label: `${contactName} (${contactEmail})` });
  await dealDialog.getByLabel('Tên deal').fill(dealTitle);
  await dealDialog.getByLabel('Giá trị').fill('75000000');
  await dealDialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(dealDialog).toBeHidden();
  await expect(page.getByText(dealTitle, { exact: true })).toBeVisible();

  const moveSelect = page.getByLabel(`Chuyển stage ${dealTitle}`);
  const wonStageId = await moveSelect
    .locator('option', { hasText: /^Won$/ })
    .getAttribute('value');
  expect(wonStageId).toBeTruthy();

  await moveSelect.selectOption({ label: 'Won' });
  await expect(
    page.getByTestId(`column-${wonStageId}`).getByText(dealTitle, { exact: true }),
  ).toBeVisible();
  await expect(moveSelect).toHaveValue(wonStageId ?? '');
});

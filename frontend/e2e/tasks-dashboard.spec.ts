import { expect, test } from '@playwright/test';

/**
 * Tasks + dashboard flow (T319, FR-07/FR-08): log an overdue task from the deal timeline, see it in
 * the Overdue tab, mark it done and confirm the Done tab, then read the seeded October figures on
 * the dashboard.
 *
 * Runs against the seeded dev stack (`pnpm db:seed`); the task content carries a timestamp so
 * repeated executions stay independent.
 */
test('overdue task -> done, then dashboard figures', async ({ page }) => {
  const stamp = Date.now();
  const taskContent = `E2E gọi lại khách ${stamp}`;

  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@acme.test');
  await page.getByLabel('Mật khẩu').fill('Password123!');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();

  await page.getByRole('link', { name: 'Cơ hội' }).click();
  await expect(page.getByRole('heading', { name: 'Cơ hội bán hàng' })).toBeVisible();
  await page.getByRole('button', { name: 'Lịch sử Acme pilot' }).click();

  const dialog = page.getByRole('dialog', { name: 'Lịch sử deal' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Loại').selectOption('TASK');
  await dialog.getByLabel('Nội dung').fill(taskContent);
  await dialog.getByLabel('Hạn hoàn thành').fill('2026-11-01T09:00');
  await dialog.getByRole('button', { name: 'Tạo công việc' }).click();
  await expect(dialog.getByText(taskContent)).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng' }).click();

  await page.getByRole('link', { name: 'Công việc' }).click();
  await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible();
  await page.getByRole('button', { name: 'Quá hạn' }).click();

  const taskRow = page.locator('li').filter({ hasText: taskContent });
  await expect(page.getByText(taskContent)).toBeVisible();
  await expect(taskRow.getByText('Quá hạn')).toBeVisible();

  await page.getByRole('button', { name: `Đánh dấu xong: ${taskContent}` }).click();
  await expect(page.getByText(taskContent)).toBeHidden();

  await page.getByRole('button', { name: 'Đã xong' }).click();
  await expect(page.getByText(taskContent)).toBeVisible();

  await page.getByRole('link', { name: 'Báo cáo' }).click();
  await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();

  // The seed deals are dated October 2026, so this range isolates deterministic figures.
  await page.getByLabel('Từ ngày').fill('2026-10-01');
  await page.getByLabel('Đến ngày').fill('2026-10-31');

  await expect(page.getByText(/120\.000\.000/).first()).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  await expect(page.getByText('New', { exact: true })).toBeVisible();
});

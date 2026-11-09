import { expect, test } from '@playwright/test';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

test('foundation shell renders and the API is healthy', async ({ page, request }) => {
  const health = await request.get(`${apiUrl}/health/live`);
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: 'ok' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await expect(page.getByText('Chưa có dữ liệu')).toBeVisible();
  await expect(page.getByText('Máy chủ: Sẵn sàng')).toBeVisible();
});

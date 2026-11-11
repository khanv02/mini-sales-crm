import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
  },
  // `@pulse/shared` is a linked workspace package that compiles to CommonJS.
  // Vite only converts CJS inside node_modules by default, so name it explicitly
  // - otherwise importing a runtime value (not just a type) fails at build time.
  build: {
    commonjsOptions: { include: [/node_modules/, /packages[\\/]+shared/] },
  },
  optimizeDeps: {
    include: ['@pulse/shared'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

import { QueryClient } from '@tanstack/react-query';

/** Shared cache for the app shell; tests clear it between cases to avoid cross-test data. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

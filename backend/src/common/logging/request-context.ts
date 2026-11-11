import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  orgId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function updateRequestContext(patch: Partial<Omit<RequestContext, 'requestId'>>): void {
  const current = storage.getStore();
  if (!current) {
    return;
  }
  if (patch.userId !== undefined) {
    current.userId = patch.userId;
  }
  if (patch.orgId !== undefined) {
    current.orgId = patch.orgId;
  }
}

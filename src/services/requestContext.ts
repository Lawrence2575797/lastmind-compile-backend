import { AsyncLocalStorage } from 'async_hooks';

// Who the current HTTP request belongs to, carried through every await it
// makes. requireAuth opens the context; claudeClient reads it, so any AI call
// made while serving a signed-in student's request is charged to THAT
// student's Locks even where the call site never passed a userId along.
interface RequestContext { userId: string }
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}
export function currentUserId(): string | undefined {
  return storage.getStore()?.userId;
}

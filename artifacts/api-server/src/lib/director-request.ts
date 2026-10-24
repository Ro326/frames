import { setTimeout as delay } from "node:timers/promises";

export type DirectorRequestScope = {
  userId: number;
  projectId: number;
  fingerprint: string;
  revision: string;
  inputSummary: string;
};
export type DirectorRequestData = {
  state: "running" | "uncertain" | "succeeded" | "failed";
  project_id: number;
  input_fingerprint: string;
  revision: string;
  saved_revision?: string;
  result_response?: unknown;
  failure?: { status: number; message: string };
};
export type DirectorRequest = { id: number; data: DirectorRequestData };
export interface DirectorRequestStore {
  claim(scope: DirectorRequestScope): Promise<{ request: DirectorRequest; owner: boolean }>;
  read(id: number, userId: number): Promise<DirectorRequest>;
  write(request: DirectorRequest): Promise<void>;
}

// Unresolved dispatches never expire into a fresh paid call. Even a revision
// change cannot establish that the provider stopped running the same input.
export function matchesDirectorRequest(data: DirectorRequestData, scope: DirectorRequestScope) {
  return data.project_id === scope.projectId && data.input_fingerprint === scope.fingerprint &&
    (data.state === "running" || data.state === "uncertain" ||
      (data.state === "succeeded" && [data.revision, data.saved_revision].includes(scope.revision)));
}

function pending(): never {
  throw Object.assign(new Error(
    "A matching Director run is still processing or its outcome is unconfirmed. No new run was started. Check AgenticOrg run history before trying again.",
  ), { status: 409 });
}

/**
 * Database reservation, not a process-local promise, owns the paid execution.
 * Followers only observe it; they never take over an old/uncertain dispatch.
 */
export async function sharedDirectorRequest<T>(options: {
  scope: DirectorRequestScope;
  store: DirectorRequestStore;
  execute: (request: DirectorRequest) => Promise<T>;
  result: (request: DirectorRequest) => Promise<T>;
  waitMs?: number;
  pollMs?: number;
}): Promise<T> {
  const claimed = await options.store.claim(options.scope);
  if (claimed.owner) return options.execute(claimed.request);
  let request = claimed.request;
  const deadline = Date.now() + (options.waitMs ?? 25_000);
  while (request.data.state === "running" && Date.now() < deadline) {
    if (request.data.result_response !== undefined) return options.result(request);
    await delay(Math.min(options.pollMs ?? 250, Math.max(0, deadline - Date.now())));
    request = await options.store.read(request.id, options.scope.userId);
  }
  if (request.data.state === "succeeded" || request.data.result_response !== undefined) return options.result(request);
  if (request.data.state === "failed" && request.data.failure) {
    throw Object.assign(new Error(request.data.failure.message), { status: request.data.failure.status });
  }
  return pending();
}

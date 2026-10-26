/** Single-process MVP limits. These apply equally to manual and scheduled work. */
export const scanPolicy = Object.freeze({
  intervalMs: 86400000,
  requestTimeoutMs: 15000,
  attemptTimeoutMs: 60000,
  leaseMs: 65000,
  pauseMs: 5000,
  maxRetries: 2,
  retryBaseMs: [5000, 15000] as readonly number[],
  domainConcurrency: 1,
  parallelDomains: 4,
});

/** New store domains may override pacing here without changing the engine. */
export const domainPolicies: Readonly<Record<string, { pauseMs: number; maxRetries: number }>> = Object.freeze({
  'nike.com': { pauseMs: 5000, maxRetries: 2 },
  'adidas.com': { pauseMs: 5000, maxRetries: 2 },
});
export const policyFor = (domain: string) => domainPolicies[domain.replace(/^www\./, '')] ?? scanPolicy;

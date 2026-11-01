type ApplicationEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

/** Keep host-only auth cookies on the exact trusted host used by the visitor. */
export function resolveApplicationOrigin(requestUrl: string, environment: ApplicationEnvironment) {
  if (environment.VERCEL_ENV && environment.VERCEL_ENV !== "production" && environment.VERCEL_URL) {
    const deploymentOrigin = new URL(`https://${environment.VERCEL_URL}`).origin;
    const branchOrigin = environment.VERCEL_BRANCH_URL
      ? new URL(`https://${environment.VERCEL_BRANCH_URL}`).origin : null;
    const requestOrigin = new URL(requestUrl).origin;
    // Never trust an arbitrary Host / forwarded host or another Vercel project.
    return requestOrigin === deploymentOrigin || requestOrigin === branchOrigin
      ? requestOrigin : deploymentOrigin;
  }
  return environment.NEXT_PUBLIC_APP_URL ?? new URL(requestUrl).origin;
}

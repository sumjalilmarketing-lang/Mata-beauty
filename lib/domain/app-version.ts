export function shouldOfferAppUpdate(current: string | undefined, incoming: unknown): boolean {
  return typeof incoming === "string" && /^[0-9a-f]{40}$/i.test(incoming) && typeof current === "string" && /^[0-9a-f]{40}$/i.test(current) && incoming !== current;
}

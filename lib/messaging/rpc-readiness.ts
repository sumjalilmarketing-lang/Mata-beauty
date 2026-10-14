export type RpcReadiness = "missing" | "denied" | "error";

export function classifyRpcReadiness(code: string | undefined): RpcReadiness {
  if (code === "PGRST202" || code === "42883") return "missing";
  if (code === "42501") return "denied";
  return "error";
}

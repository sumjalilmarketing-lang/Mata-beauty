export type ThreadComment = { id: string; parent_id: string | null; created_at: string };

/** Keep replies beside their parent without dropping a reply whose parent is not loaded. */
export function orderCommentThreads<T extends ThreadComment>(comments: readonly T[]): Array<{ comment: T; depth: number }> {
  const byId = new Map(comments.map(comment => [comment.id, comment]));
  const children = new Map<string, T[]>();
  for (const comment of comments) {
    if (!comment.parent_id || !byId.has(comment.parent_id) || comment.parent_id === comment.id) continue;
    const replies = children.get(comment.parent_id) ?? [];
    replies.push(comment);
    children.set(comment.parent_id, replies);
  }
  const visited = new Set<string>();
  const ordered: Array<{ comment: T; depth: number }> = [];
  function visit(comment: T, depth: number) {
    if (visited.has(comment.id)) return;
    visited.add(comment.id);
    ordered.push({ comment, depth });
    for (const child of (children.get(comment.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))) visit(child, depth + 1);
  }
  for (const comment of comments) if (!comment.parent_id || !byId.has(comment.parent_id)) visit(comment, 0);
  // Malformed legacy cycles cannot hide otherwise visible comments.
  for (const comment of comments) if (!visited.has(comment.id)) visit(comment, 0);
  return ordered;
}

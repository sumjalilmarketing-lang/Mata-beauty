export function feedProfilePath(post: { authorId: string; slug?: string | null; businessSlug?: string | null }) {
  return post.businessSlug
    ? "/salons/" + encodeURIComponent(post.businessSlug)
    : "/professional/" + encodeURIComponent(post.slug || post.authorId);
}

export const salonInvitationPath = "/salon/invitation/accept";
export const salonInvitationTokenKey = "mata.salon.invitation.pending";
export function pendingSalonInvitation(fromLink: string | null, saved: string | null): string | null {
  // An invalid new link must never silently accept a different stored invitation.
  const candidate = fromLink === null ? saved : fromLink;
  return candidate && /^[A-Za-z0-9_-]{40,60}$/.test(candidate) ? candidate : null;
}

export function shouldResumeSalonInvitation(token: string | null, acceptedToken: string | null): boolean {
  return Boolean(token && pendingSalonInvitation(token, null) && token === acceptedToken);
}

export type TeamMemberState = { is_active: boolean; archived_at: string | null };
export type TeamAccountState = { revoked_at: string | null; permissions: string[] };
export function teamAccessLabel(member: TeamMemberState | undefined, account: TeamAccountState | undefined) {
  if (!account) return "Fiche seule · invitation à accepter";
  if (account.revoked_at) return "Accès révoqué";
  if (!member || member.archived_at || !member.is_active) return "Accès suspendu · fiche inactive";
  if (!account.permissions.length) return "Accès sans permission";
  return "Espace collaborateur actif";
}
export function acceptedInvitationMember(invitationId: string, events: { invitation_id: string | null; collaborator_id: string | null; event_type: string }[]) {
  return events.find(event=>event.invitation_id===invitationId && event.event_type==="accepted" && event.collaborator_id)?.collaborator_id ?? null;
}

begin;

create or replace function public.notify_provider_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_title text;
  notification_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  notification_title := case new.status
    when 'approved' then 'Votre profil est publié'
    when 'rejected' then 'Votre profil doit être corrigé'
    when 'suspended' then 'Votre profil a été suspendu'
    when 'pending_review' then 'Votre dossier est en validation'
    else 'Statut du profil mis à jour'
  end;

  notification_body := case new.status
    when 'approved' then 'Votre espace professionnel est validé et peut maintenant apparaître dans le catalogue Mata Beauty.'
    when 'rejected' then 'Mettez à jour les informations de votre profil puis envoyez-le à nouveau pour validation.'
    when 'suspended' then 'Contactez l’équipe Mata Beauty si vous avez besoin d’informations complémentaires.'
    when 'pending_review' then 'L’équipe Mata Beauty va examiner votre profil professionnel.'
    else 'Le statut de votre profil professionnel a changé.'
  end;

  insert into public.notifications (profile_id, kind, title, body, data)
  values (
    new.profile_id,
    'provider_status',
    notification_title,
    notification_body,
    jsonb_build_object('status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists provider_status_notification on public.provider_profiles;
create trigger provider_status_notification
after update of status on public.provider_profiles
for each row
execute function public.notify_provider_status_change();

commit;

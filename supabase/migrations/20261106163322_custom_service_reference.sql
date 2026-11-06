begin;
insert into public.categories(name,slug,description,icon,sort_order)
values('Prestations personnalisées','prestations-personnalisees','Prestations librement renseignées par les professionnels.','✦',999)
on conflict(slug) do nothing;
insert into public.services(category_id,name,slug,description)
select id,'Prestation personnalisée','prestation-personnalisee','Référence neutre pour les prestations saisies librement.' from public.categories where slug='prestations-personnalisees'
on conflict(category_id,slug) do nothing;
commit;

begin;

-- Add broad, non-medical beauty and aesthetic service families only. Concrete
-- service offers remain administrator-managed in the existing catalog.
insert into public.categories(name,slug,description,icon,sort_order,is_active)
values
  ('Soins esthétiques', 'soins-esthetiques', 'Soins de beauté et d’esthétique non médicaux proposés par des professionnels qualifiés.', '✦', 70, true),
  ('Sourcils et cils', 'sourcils-cils', 'Mise en beauté des sourcils et des cils.', '◉', 72, true),
  ('Épilation esthétique', 'epilation-esthetique', 'Prestations d’épilation esthétique selon les règles applicables dans le pays.', '◇', 74, true),
  ('Massages bien-être', 'massages-bien-etre', 'Massages de confort et de bien-être, hors actes médicaux.', '○', 76, true),
  ('Spa et bien-être esthétique', 'spa-bien-etre-esthetique', 'Soins de spa et rituels de détente liés à la beauté.', '♨', 78, true)
on conflict(slug) do nothing;

commit;

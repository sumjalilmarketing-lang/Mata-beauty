-- Données non sensibles et idempotentes. Les comptes de démonstration doivent
-- être créés via Supabase Auth dans un environnement local uniquement.
insert into public.categories (name, slug, sort_order) values
  ('Coiffure femme', 'coiffure-femme', 10),
  ('Coiffure homme', 'coiffure-homme', 20),
  ('Tresses africaines', 'tresses-africaines', 30),
  ('Locks', 'locks', 40),
  ('Perruques et lace wigs', 'perruques-lace-wigs', 50),
  ('Maquillage', 'maquillage', 60),
  ('Maquillage de mariage', 'maquillage-mariage', 70),
  ('Onglerie', 'onglerie', 80),
  ('Manucure et pédicure', 'manucure-pedicure', 90),
  ('Extension de cils', 'extension-cils', 100),
  ('Sourcils', 'sourcils', 110),
  ('Barbier', 'barbier', 120),
  ('Soins du visage', 'soins-visage', 130),
  ('Épilation', 'epilation', 140),
  ('Esthétique à domicile', 'esthetique-domicile', 150)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

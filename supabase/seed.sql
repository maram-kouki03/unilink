-- ════════════════════════════════════════════════════════════════
-- Seed data: folder tree + a few events.
-- Subject names are examples — edit them to match the official SUP'COM programme.
-- ════════════════════════════════════════════════════════════════

insert into public.levels (id, code, name, short_name, sort) values
  (1, '1A',       '1ère année Ingénierie', '1ère année', 1),
  (2, '2A',       '2ème année Ingénierie', '2ème année', 2),
  (3, '3A',       '3ème année Ingénierie', '3ème année', 3),
  (4, 'MASTERE',  'Mastère',               'Mastère',    4),
  (5, 'DOCTORAT', 'Doctorat',              'Doctorat',   5)
on conflict (id) do nothing;

-- Periods: 1A & 2A → P1..P4, 3A → P1..P2, Mastère → M1/M2, Doctorat → years
insert into public.periods (level_id, name, label, months, sort) values
  (1, 'P1', 'Période 1', 'Sept – Oct', 1), (1, 'P2', 'Période 2', 'Nov – Dec', 2),
  (1, 'P3', 'Période 3', 'Feb – Mar', 3),  (1, 'P4', 'Période 4', 'Apr – May', 4),
  (2, 'P1', 'Période 1', 'Sept – Oct', 1), (2, 'P2', 'Période 2', 'Nov – Dec', 2),
  (2, 'P3', 'Période 3', 'Feb – Mar', 3),  (2, 'P4', 'Période 4', 'Apr – May', 4),
  (3, 'P1', 'Période 1', 'Sept – Dec', 1), (3, 'P2', 'Période 2', 'Jan – Mar', 2),
  (4, 'M1', 'Mastère 1', null, 1),         (4, 'M2', 'Mastère 2', null, 2),
  (5, 'Y1', 'Année 1', null, 1), (5, 'Y2', 'Année 2', null, 2), (5, 'Y3', 'Année 3', null, 3)
on conflict (level_id, name) do nothing;

-- Example subjects for every engineering period (rename freely)
with subj(name, color) as (
  values ('Mathématiques', '#3D3FD9'), ('Réseaux', '#7C5CF2'), ('Programmation', '#141A4F'),
         ('Signal & Télécom', '#4B7BEC'), ('Électronique', '#A24CE0'), ('Anglais & Communication', '#5D62C9')
)
insert into public.subjects (period_id, name, color)
select p.id, s.name, s.color
from public.periods p cross join subj s
where p.level_id in (1, 2, 3)
on conflict (period_id, name) do nothing;

with subj(name, color) as (
  values ('Réseaux & Cloud', '#3D3FD9'), ('IA & Data Science', '#7C5CF2'), ('Sécurité', '#141A4F'), ('Méthodologie de recherche', '#4B7BEC')
)
insert into public.subjects (period_id, name, color)
select p.id, s.name, s.color
from public.periods p cross join subj s
where p.level_id in (4, 5)
on conflict (period_id, name) do nothing;

insert into public.events (title, category, organizer, starts_at, ends_at, location, description) values
  ('Tech & Innovation Forum', 'conference', 'SUP''COM Forum', '2026-11-15 09:00+01', '2026-11-15 17:00+01', 'Amphi A',
   'Meet companies hiring in telecom, AI and cloud. Keynotes in the morning, stands and speed-interviews in the afternoon. Bring printed CVs and your student card.'),
  ('Intro to Computer Vision', 'workshop', 'Machine Learning SupCom', '2026-11-20 14:00+01', '2026-11-20 17:00+01', 'Lab Télécom 3',
   'Hands-on workshop: image processing basics, object detection with YOLO and a mini project. Laptop required.'),
  ('Hackathon SUP''COM 2026', 'hackathon', 'IEEE SUP''COM', '2026-11-28 09:00+01', '2026-11-29 18:00+01', 'Main hall',
   '24h challenge in teams of 3–4. Mentors, food and prizes. Themes announced at kick-off.'),
  ('Clubs Day – Meet every club', 'club', 'Bureau des étudiants', '2026-12-03 10:00+01', '2026-12-03 16:00+01', 'Campus garden',
   'Discover every SUP''COM club, sign up and meet the boards.');

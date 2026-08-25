-- Adds full background/text colour control (previously only the accent
-- stripe was customisable), a proper category enum, and a catchment
-- area for local-only offers.
alter table reward_submissions add column background_color text;
alter table reward_submissions add column text_color text;
alter table reward_submissions add column catchment_area text;

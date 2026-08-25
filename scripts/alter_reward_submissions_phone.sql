-- Optional second contact method alongside contact_email, specifically
-- for verifying a submission is a real business before it's published.
alter table reward_submissions add column contact_phone text;

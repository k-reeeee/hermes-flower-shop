-- v3: onboarding state (needs, fit, bots, custom plugin) extends business_profile.
ALTER TABLE business_profile ADD COLUMN needs TEXT NOT NULL DEFAULT '[]';
ALTER TABLE business_profile ADD COLUMN fit TEXT NOT NULL DEFAULT '{}';
ALTER TABLE business_profile ADD COLUMN bots TEXT NOT NULL DEFAULT '[]';
ALTER TABLE business_profile ADD COLUMN custom_plugin TEXT NOT NULL DEFAULT '{}';

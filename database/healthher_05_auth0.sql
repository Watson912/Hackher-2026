-- =====================================================================
-- HealthHer  |  One-off migration: link accounts to Auth0
-- ---------------------------------------------------------------------
-- Only needed if your database was built before Auth0 was added. A fresh
-- install doesn't need this: healthher_01_schema.sql already has it.
--
-- auth0_sub is the `sub` claim from the access token ('auth0|abc123',
-- 'google-oauth2|123...'). It is the only trustworthy link between the
-- person logging in and her rows here, because the API reads it off a
-- signature-checked token rather than off a client header.
--
-- password stops being used: Auth0 holds credentials, we never see them.
-- It stays on the table (nullable) so existing rows still load.
-- =====================================================================

USE herbalance;

ALTER TABLE users
    ADD COLUMN auth0_sub VARCHAR(255) NULL UNIQUE AFTER email,
    MODIFY COLUMN password VARCHAR(255) NULL;

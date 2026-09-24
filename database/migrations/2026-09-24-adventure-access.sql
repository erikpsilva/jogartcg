-- Manual adventure entitlement, independent from payment records.
-- Run once through phpMyAdmin before enabling grants.
ALTER TABLE usuarios
  ADD COLUMN adventure_access TINYINT(1) NOT NULL DEFAULT 0;

-- Grant individual accounts separately after confirming their email.

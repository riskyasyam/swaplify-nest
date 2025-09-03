-- Fix user data manually until PrimeAuth API issue is resolved
-- Run this in PostgreSQL database

UPDATE "User" 
SET 
  email = 'asyam@gmail.com', 
  "displayName" = 'Risky Asyam'
WHERE "authSub" = 'b5a9babd-6e00-4546-88ce-634016820b6f';

-- Also fix admin user if needed
UPDATE "User" 
SET 
  email = 'admin@primeauth.dev', 
  "displayName" = 'Admin'
WHERE "authSub" = '60e9929e-6e30-431c-9f1b-529b618677594';

-- Verify the updates
SELECT id, email, "displayName", "authSub", role 
FROM "User" 
WHERE "authSub" IN (
  'b5a9babd-6e00-4546-88ce-634016820b6f',
  '60e9929e-6e30-431c-9f1b-529b618677594'
);

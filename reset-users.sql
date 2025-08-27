-- Reset users for testing updated userinfo fetch
DELETE FROM "User" WHERE "authSub" IN (
  'e3978dcc-3964-4d9e-8126-ed4669c514f7', -- user biasa
  '60e9929e-6e30-431c-9f1b-529b61867759'  -- admin
);

-- Move existing per-wallet nicknames into the new collectors table. Wallets
-- that happened to share the exact same nickname text are merged into one
-- collector by that match, which is the correct behavior going forward too.
INSERT INTO collectors (name)
SELECT DISTINCT nickname FROM wallets WHERE nickname IS NOT NULL;
--> statement-breakpoint
UPDATE wallets
SET collector_id = collectors.id
FROM collectors
WHERE wallets.nickname = collectors.name;

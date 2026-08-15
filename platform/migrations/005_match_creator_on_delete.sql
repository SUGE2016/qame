-- 删用户时不因 creator_id 卡住；未结束对局须先由应用层 cancel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_creator_id_fkey'
      AND conrelid = 'matches'::regclass
      AND confdeltype = 'n'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'matches_creator_id_fkey'
        AND conrelid = 'matches'::regclass
    ) THEN
      ALTER TABLE matches DROP CONSTRAINT matches_creator_id_fkey;
    END IF;
    ALTER TABLE matches
      ADD CONSTRAINT matches_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

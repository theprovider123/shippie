-- 0014_deploy_csp_header.sql
--
-- Persist the per-deploy CSP header alongside the manifest so rollback
-- can restore the worker's `apps:{slug}:csp` KV entry to the value that
-- matched the target deploy's allowed_connect_domains.
--
-- Before this column existed, rollback left the prior version's CSP in
-- place; apps whose BYO-backend allowlist changed between versions
-- would fail same-origin connect-src after a rollback until the next
-- deploy re-ran the trust pipeline. Rollback now reads this column
-- and writes it back into KV so rollback is self-coherent.
--
-- Nullable — historical deploys (pre-0014) have no stored CSP and
-- leave the KV entry alone on rollback (with a csp_stale flag in the
-- response so callers can surface a redeploy hint).

ALTER TABLE deploys ADD COLUMN csp_header text;

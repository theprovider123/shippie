-- Provenance: pin a tool to an exact source commit, not just a branch/repo.
--
-- `source_repo` already records where a build came from; `source_commit` records
-- *which commit*. Optional and nullable — GitHub deploys (or a maker/CI supplying
-- `source_commit` in shippie.json, e.g. ${{ github.sha }}) populate it; everything
-- else leaves it null. Additive, no backfill required. See docs/contracts/provenance.md.
ALTER TABLE app_lineage ADD COLUMN source_commit text;

# Five Letter — bundled word banks

Each per-language file in this directory ships with the chess showcase
runtime so the daily-puzzle pick + valid-guess check work fully
offline. All banks are common-vocabulary 5-letter words.

| File | Language | Source | License |
|---|---|---|---|
| `en.txt` | English | Curated common 5-letter list (manual) | Public domain |
| `es.txt` | Spanish | Curated common 5-letter list (manual) | Public domain |
| `fr.txt` | French | Curated common 5-letter list (manual) | Public domain |

These starter banks (~200-400 words each) cover at least a year of
daily puzzles per language without repeats. Future revisions can
expand by appending CC0 dictionary corpora — keep the file format
(one word per line, lowercase, UTF-8) and bump the bank version in
`src/wordbank.ts` so historical entries stay attributable.

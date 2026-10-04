# KATMANDU solution archive

[Türkçe](README.tr.md)

When KATMANDU runs with the local development or preview server, each completed
study is saved here as a separate JSON file. The **My Library** panel reads and
updates these files automatically.

The `.json` files are personal study data and are excluded from Git. Close the
application before manually renaming or removing archive files.

This archive lives in `solutions/`. Older `cozumler/` JSON files migrate here
on the first local archive operation. Conflicts are preserved in
`legacy-cozumler/` without overwriting the current file or changing saved IDs.
Backups are excluded from the library list and Git.

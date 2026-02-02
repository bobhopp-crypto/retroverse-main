# RetroVerse Main

This is the single working root for RetroVerse project organization.

## Structure

This folder uses symlinks to existing RetroVerse folders for validation purposes.

**Current symlinks:**
- `docs/config/` → `../../../retroverse/config`
- `docs/docs/` → `../../../retroverse/docs`
- `data/` → `../../retroverse-data/`
- `code/` → `../../retroverse-shared/`
- `sites/app/` → `../../retroverse-app/`
- `sites/site/` → `../../retroverse-site/`
- `sites/wheel/` → `../../retroverse-wheel/`
- `design/` → `../../retroverse-design/`
- `assets/` → `../../retroverse-icons/`
- `exports/` → `../../retroverse-live-download/`
- `archive/` → `../../retroverse-z_cleanup/`

## Validation Phase

This structure is being validated through real use. Once validated, a migration script will move files from the existing folders into this structure.

**Do not delete the original folders yet.**

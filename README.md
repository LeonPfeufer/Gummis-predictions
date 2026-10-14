# Gummi's Picks · Worlds 2026

A GitHub Pages website for friends to predict Worlds matches. Google sign-in and Firestore use the existing `lol-gummis` project. No build is needed: serve `index.html`, `styles.css`, and the JavaScript files together.

## What changed

- Mobile-friendly match schedule, team selection, optional exact scores, saved-pick feedback, and live standings.
- Only 2026 matches and their predictions count. The interface has no 2025 archive; old database records are not deleted by deployment.
- One point for the winning team, two total for the exact series score. Canceled matches award zero points.
- Google sign-in is needed to save, but anyone with the link can view matches and standings. Friends' picks are displayed after locking (the database still permits public pick reads; this is not a secret-ballot system).
- Daily match imports via PandaScore and GitHub Actions. No browser needs to stay open.

## Activate Firebase access first

1. Community management is enabled: every Google-signed-in visitor can add matches and enter or correct results. No admin UID setup is needed. Only share the site with people you trust; this is not an invitation-restricted group.
2. Deploy `firestore.rules` to the existing project using Firebase Console → Firestore → Rules, or `firebase deploy --only firestore:rules --project lol-gummis` with an authenticated Firebase CLI. Review existing rules before replacing them if other apps share this database. The rules enforce ownership, valid exact scores, and deadlines using server time.
3. Keep Google sign-in enabled and the GitHub Pages hostname in Authentication → Settings → Authorized domains. Use `localhost` there if testing authentication locally.

Existing users retain their profile documents. New profile writes do not add email addresses. Existing 2025 matches and predictions are excluded automatically. To physically remove those records, first export a backup, then delete only matches whose startTime is in 2025 and picks whose matchId references those matches. Do not delete users or the whole matches/picks collections.

## Preview without setup

Open `?demo=1` on the website for a labelled, interactive preview with fictional matchups and sample standings. Click “Try as a player” to test predictions and manual match entry. Preview changes live in memory in the current tab, disappear on refresh, and never contact Firebase. The normal website continues using the real database.

Manual matches and results need no PandaScore account. The new Firebase rules must still be deployed for all friends to have write access; publishing HTML cannot change existing database permissions.

## Optional: activate automatic matches and results

Use a [PandaScore API account](https://developers.pandascore.co/reference/get_lol_matches) with access to LoL fixtures/results. Check the provider's current plan and permitted usage; the integration does not assume a particular price. Add these in GitHub → repository Settings → Secrets and variables → Actions:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `PANDASCORE_TOKEN` | Your PandaScore API bearer token |
| Secret | `FIREBASE_SERVICE_ACCOUNT` | The complete service account JSON for `lol-gummis`, with Firestore read/write access |
| Variable | `PANDASCORE_TOURNAMENT_IDS` | Comma-separated PandaScore tournament IDs for **Worlds 2026**, including all stages |
| Variable | `WORLDS_SYNC_ENABLED` | `true`, once configuration is complete |

Get the tournament IDs from PandaScore's LoL tournament listing (`GET https://api.pandascore.co/lol/tournaments`, using bearer authentication); confirm the league, series year, and each Worlds stage. IDs are deliberately not guessed. Add newly announced stages as needed. Never paste provider tokens or service account JSON into source files, public issues, or chat.

After merging the branch into `main`, open Actions → Update Worlds matches → Run workflow. Verify the success log and the site's “Schedule checked” time. The scheduled job runs daily at **05:17 UTC** (06:17 Berlin winter / 07:17 summer). For more frequent updates, change the cron to `17 */2 * * *` (every two hours). GitHub scheduled jobs can be delayed and can be disabled after repository inactivity; they run from the default branch. See [GitHub scheduling documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

The import fetches all configured tournaments with pagination, validates the entire response, and writes atomically. It never deletes matches or predictions. Stable `pandascore_<id>` IDs prevent duplicate imports. Missing teams/dates wait for a later sync. Provider opponent reordering preserves existing A/B picks. Changed participants/series cause a failure for manual review. Already locked matches do not reopen when a later start is received. Walkovers award the winner without inventing an exact score. Failed runs leave the previous schedule and last-success time intact.

Manual result edits set `manualOverride: true`; the importer then leaves that match alone. To resume syncing it, set that field to `false` in Firestore. Avoid manually adding a match that the importer will provide: manual records cannot be safely auto-matched to provider records. If a duplicate exists, reconcile it before people make predictions.

## Development and publishing

```sh
npm ci
npm run check
```

Serve this directory using a local static web server, for example `python -m http.server 8000`, then visit `http://localhost:8000`. Opening the HTML via `file://` does not support the module imports. A live preview connects to the real Firebase project; use an emulator or separate Firebase project for test predictions.

`npm test` tests deadlines, scoring, season isolation, provider conversion, and safe repeat imports. `npm run test:browser` uses an installed Chrome (or set `BROWSER_CHANNEL=msedge`) to check Google sign-in UI, saving, mobile overflow, timed locks, and result scoring with isolated Firebase mocks. Screenshots are saved in ignored `test-results/`. These tests do not verify deployed Firebase rules or live provider credentials. The GitHub check workflow also checks JavaScript syntax.

For GitHub Pages, merge the reviewed branch into `main` and retain the existing Pages publishing source (normally `main` / root). No HTML copy-and-paste is needed. The sync workflow updates Firestore directly and does not commit data to Git. Rule deployment and GitHub Secrets are separate from publishing the static site.

## Files

- `app.js`: Firebase subscriptions, sign-in, prediction forms, admin controls.
- `domain.js`: scoring, locks, and standings.
- `config.js`: public Firebase configuration and season.
- `scripts/sync-matches.js`: unattended importer.
- `scripts/normalize-match.js`: provider conversion and reconciliation.
- `firestore.rules`: server-side authorization and prediction validation.

This project is for friendly predictions, not monetary betting, and is not affiliated with Riot Games.

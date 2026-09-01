# Keeping the apps current

`desktop/src/update.ts`.

An updater is the same program in every app — check a feed, download in the background,
install on quit — and it is the kind of program you want to write once and fix once. It
is also the clearest case for this package existing at all: the third app gets it by
calling `updates(app)`, and the fourth gets it by existing.

## It is off, and that is a gap rather than an omission

Four things have to be true before an app can update itself, and only the first two are
code:

1. a `publish:` block in `desktop/electron-builder.base.yml` naming the GitHub repo —
   that is what writes `app-update.yml` into the bundle, and its absence is what
   `updates()` checks for on its first line;
2. `zip` alongside `dmg` in the mac targets, because Squirrel.Mac updates from a zip and
   cannot read a disk image;
3. `latest-mac.yml` attached to the release, which electron-builder emits beside the
   artifacts once (1) is set;
4. a **published** release — and `release.yml` creates drafts on purpose, so the notes
   get one last human read. A draft is invisible to the feed.

(4) is a decision about how this project releases, not a line of code, which is why the
switch is documented here rather than thrown. Until it is, `updates()` returns on its
first line and costs nothing but the bundle it is compiled into.

Wiring it now is the point. Switching it on later is a config change in one file rather
than a feature in three apps.

## What it does when it is on

Downloaded quietly, installed on quit — `autoDownload` and `autoInstallOnAppQuit`. An
app that interrupts a set to ask about a new version is worse than one that never
updates; the whole design is that you find out you were behind the next time you launch.

Re-checked every six hours, for an app that stays open across a working day, and the
interval is cleared on `before-quit`.

A failed check is a line in a log and nothing else. A machine with no network is the
ordinary case on a stage.

## What it does not do

No dialogs, no restart prompt, no "downloading 43%" in a corner. If an app ever wants to
*say* something about an update, that is the app's UI and the app's decision — the
events are already there to hang it on.

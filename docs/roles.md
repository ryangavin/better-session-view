# Roles

A role is what a scene is *for* — `intro`, `verse`, `chorus`, `jam`, `ending`. One role
per scene, written into the scene's own name as a bracketed tag:

```
[CHORUS] @128-Bm NIGHTFALL
```

The set is the storage. That means a role travels with your `.als`, shows up in Live's
own scene column, and survives anything — there's no sidecar file to lose or to fall out
of sync.

## Tagging a scene

Two ways in, and they write immediately.

**From the grid.** Every scene row carries a role chip ahead of its name — a real role,
or a quieter `no role` pill. Click it and the role menu opens right there. That matters
because tagging is a pass *down* the grid: the chip you're reading is the chip you
press, with no trip to the rail and back.

- **Scope is that scene** — unless it's already part of your scene selection, in which
  case it's the whole selection. The menu header says the count out loud either way, so
  it's never inferred.
- Esc closes the menu. It won't also stop your clips.

**From the rail.** Select scenes, and the scene panel's role chips do the same job.

Either way, **clicking a role writes it straight away.** That only looks like it breaks
the rule that naming needs a button. A role tag is *additive* — it goes on the front and
leaves the rest of the name untouched — and the result is visible as a chip the moment
it lands. There's nothing to preview. A title edit genuinely overwrites, which is why
that half keeps its preview and its button.

To remove one, pick **take the role tag off** from the same menu.

## The vocabulary

Your roles and their colors live in `bsv.json` beside your `.als`, so the vocabulary
travels with the set.

Open it with **Manage roles**, from the rail or from the bottom of the role menu.

The list you see is your configured vocabulary **unioned with every role actually tagged
in the set**. So a role someone typed straight into Live shows up here uncolored, rather
than being invisible and then mysteriously coloring nothing.

`[Chorus]` and `[chorus]` are one role — case is folded, so a tag typed by hand in Live
and one written by the app don't become two entries with two colors.

**Deleting a role only forgets its color.** The scenes keep their tags, so it reappears
in the list uncolored. The manager says so rather than letting you think it removed
anything from your set.

## Coloring clips by role

With scenes selected, **Color clips** paints every clip in those scenes with **its own
scene's role color**. One press works across a selection spanning several roles.

Role color reaches **clips only**. It deliberately does not paint scene rows: scene rows
carry the *song's* color, and painting them per role would stripe a song into as many
colors as it has sections — which is exactly what stops a hundred-song set being
navigable. See [Color](color.md).

Inside the band, role color reads as structure. That's the division of labour: the song
is the block of color you find in Live's session view, and the roles are the shape
inside it.

## Where roles show up

- **A chip on every scene row**, ahead of the name, on its own vertical line so a column
  of roles reads as a column.
- **On a folded song header**, as one small square per section each track plays — color
  only, with the names and counts on hover. At a hundred folded songs, a word per role
  would turn a table of contents into a wall of text.
- **In Live**, as `[CHORUS]` at the front of the scene name.

A role with no color assigned draws as a hollow square rather than a dashed one, and an
untagged scene's clips get a neutral grey mark rather than nothing — a set mid-mapping
is mostly untagged, and a track used only there still has to read as used.

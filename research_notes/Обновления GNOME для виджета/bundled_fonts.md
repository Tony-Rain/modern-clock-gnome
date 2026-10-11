# Bundled fonts without installing them (GNOME 46–51)

Research date: 2026-10-11. Status labels used below: **CONFIRMED** means read in upstream source, docs or a package index this session. **INFERRED** means reasoned from that source but not run. **UNCERTAIN** means not verified.

Local test machine: Ubuntu 24.04.5, GNOME Shell 46.0, `libpango-1.0-0 1.52.1+ds-1build1`. Under GJS, `Pango.FontMap.prototype.add_font_file` is `undefined` here, which is the expected result for Pango 1.52 (CONFIRMED locally with `gjs -c`).

Note on the repo: `src/extension.js` `_installFonts()` no longer runs `fc-cache`. It copies the files with `Gio.File.copy` and shows a "Log out and back in" notification. The `fc-cache` / `config_changed()` description in CLAUDE.md is out of date. `src/lib/utils.js` `loadFont()` checks font support through `PangoCairo.FontMap.get_default()`, which matters for the font map issue in Q3.

## Q1. `pango_font_map_add_font_file()`: support in the fontconfig backend, GJS access, known issues

### Takeaway
`pango_font_map_add_font_file(fontmap, filename, error)` first shipped in Pango 1.55 (dev, 26-11-2024) and is documented "Since: 1.56". The fontconfig backend (`PangoFcFontMap`, the parent of `PangoCairoFcFontMap`, the map gnome-shell and GTK use on Linux) implements it. It is a normal introspectable method, so GJS can call it as `fontMap.add_font_file(path)` (it throws on error). The implementation was rewritten in 1.56.4. In 1.56.4 and later, the added fonts live only in the font map object, so any later `config_changed()` / cache clear on that map silently drops them.

### Cited Findings
- Docs: `gboolean pango_font_map_add_font_file (PangoFontMap*, const char* filename, GError**)`. "Available since 1.56". "The added fonts will take precedence over preexisting fonts with the same name." — [docs.gtk.org Pango.FontMap.add_font_file](https://docs.gtk.org/Pango/method.FontMap.add_font_file.html)
- GIR annotations at the 1.56.0 tag: `@filename: (type filename)`, `@error`. No `(skip)`, so it is introspectable. The base class default returns `G_IO_ERROR_NOT_SUPPORTED` ("Adding font files not supported for %s") for backends that do not implement it. — [pango 1.56.0 pango-fontmap.c](https://gitlab.gnome.org/GNOME/pango/-/raw/1.56.0/pango/pango-fontmap.c)
- NEWS 1.55: "Add pango_font_map_add_font_file". NEWS 1.56.1: "fontconfig: Prefer application fonts even if they are older". NEWS 1.56.4 (27-06-2025): "fontconfig: Improve the add_font_file implementation" and "fontconfig: Make sure font faces stay alive". — [pango NEWS](https://gitlab.gnome.org/GNOME/pango/-/raw/main/NEWS)
- First fontconfig implementation (commit 096c1e8c, 2024-11-09, in 1.55.0 through 1.56.3): calls `FcConfigAppFontAddFile()` on the map's FcConfig, or on `FcConfigGetCurrent()` when the map has none, then runs `pango_fc_font_map_config_changed()`. This adds the font to the process-wide fontconfig application set and clears that font map's caches. — [commit 096c1e8c](https://gitlab.gnome.org/GNOME/pango/-/commit/096c1e8c.diff)
- Rewrite (commit 5ad59992 "fc: Implement add_font_file more carefully", 2025-06-17, released in 1.56.4): `FcFreeTypeQueryAll(filename)` loads the file into a private FcFontSet, and each pattern is inserted with `pango_fc_font_map_add_pattern()` into `priv->fonts` and the family/face lists. The insert emits `GListModel::items-changed`. It no longer touches FcConfig and does not call `pango_font_map_changed()`. — [commit 5ad59992](https://gitlab.gnome.org/GNOME/pango/-/commit/5ad59992.diff); [pangofc-fontmap.c main](https://gitlab.gnome.org/GNOME/pango/-/raw/main/pango/pangofc-fontmap.c)
- In current main, `pango_fc_font_map_config_changed()` calls `pango_fc_font_map_cache_clear()`, which runs `pango_fc_font_map_fini()`. That function does `g_clear_pointer(&priv->fonts, FcFontSetDestroy)` and rebuilds the font list from FcConfig. Fonts added with the 1.56.4+ `add_font_file` are not in FcConfig, so this wipes them. — [pangofc-fontmap.c main](https://gitlab.gnome.org/GNOME/pango/-/raw/main/pango/pangofc-fontmap.c)
- GTK still calls `pango_fc_font_map_config_changed()` on its font map when `gtk-fontconfig-timestamp` changes and `!FcConfigUptoDate(NULL)` (`gtksettings.c`, "bug 547680"). — [gtk main gtksettings.c](https://gitlab.gnome.org/GNOME/gtk/-/raw/main/gtk/gtksettings.c)
- NEWS 1.57.1 lists bug "#867 Bad font substitution causes application crashes". It is unclear from NEWS whether this is related to app fonts. — [pango NEWS](https://gitlab.gnome.org/GNOME/pango/-/raw/main/NEWS)

### Inferences
- With Pango 1.56.0–1.56.3 (Ubuntu 25.04/25.10), the font goes into fontconfig's process-global app set and survives later cache clears. With 1.56.4+ (GNOME 48 SDK, 49, 50, 51, Ubuntu 26.04 with 1.57.0), it survives only until the next `config_changed()` on that map. So:
  1. Do **not** call `config_changed()` after `add_font_file()`. The old "refresh" habit now erases the fonts you just added.
  2. Make the call idempotent and re-run it when needed, for example on each `enable()`. Optionally listen for the font map's `items-changed` and re-add the font if its family disappears.
- The 1.56.4+ path does not clear the fontset cache and does not bump the font map serial (only `items-changed`). If Pango already resolved "Anurati" to a substitute before the file was added, that cached fontset may keep being used. Call `add_font_file` **before** any label is created and before any `load_font()` support check. (INFERRED from source, not tested.)
- Feature-detect in JS with `typeof fontMap.add_font_file === 'function'`, plus try/catch, instead of checking GNOME version numbers. Arch on GNOME 47 got Pango 1.56 while the GNOME 47 SDK has 1.54.

### Gaps
- Not tested at runtime. The test machine has Pango 1.52, and no 1.56+ gnome-shell was available.
- No upstream issue found that reports `add_font_file` + `config_changed` losing fonts. This is source analysis only.

## Q2. Pango version per GNOME release and per Ubuntu release

### Takeaway
GNOME 46 and 47 have Pango older than 1.56, so no `add_font_file`. GNOME 48+ have it. Ubuntu 24.04 (GNOME 46) and 24.10 (GNOME 47) cannot use it. Ubuntu 25.04, 25.10 and 26.04 can.

### Cited Findings
GNOME SDK / gnome-build-meta `elements/sdk/pango.bst`, current head of each stable branch:
| GNOME | Pango in gnome-build-meta | add_font_file? |
|---|---|---|
| 46 | 1.52.2 | no |
| 47 | 1.54.0 | no |
| 48 | 1.56.4 | yes (new impl) |
| 49 | 1.57.1 | yes |
| 50 | 1.57.1 | yes |
| 51 | 1.58.2 | yes |
Sources: [gnome-46](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-46/elements/sdk/pango.bst), [gnome-47](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-47/elements/sdk/pango.bst), [gnome-48](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-48/elements/sdk/pango.bst), [gnome-49](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-49/elements/sdk/pango.bst), [gnome-50](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-50/elements/sdk/pango.bst), [gnome-51](https://gitlab.gnome.org/GNOME/gnome-build-meta/-/raw/gnome-51/elements/sdk/pango.bst). These are branch heads, which may be later than what shipped at .0.

Ubuntu (Launchpad `pango1.0` / `mutter` source publications):
| Ubuntu | mutter | pango1.0 | add_font_file? |
|---|---|---|---|
| 24.04 noble | 46.2 | 1.52.1 | no |
| 24.10 oracular (EOL) | 47 | 1.54.0 (last published) | no |
| 25.04 plucky | 48.1 | 1.56.3 | yes (old FcConfigAppFontAddFile impl) |
| 25.10 questing | 49.0 | 1.56.3 | yes (old impl) |
| 26.04 resolute | (not fetched) | 1.57.0 | yes (new impl) |
Source: [Launchpad API getPublishedSources pango1.0](https://api.launchpad.net/1.0/ubuntu/+archive/primary?ws.op=getPublishedSources&source_name=pango1.0&exact_match=true)

Pango 1.58.x (06/08-2026) requires glib 2.88 and harfbuzz 11. — [pango NEWS](https://gitlab.gnome.org/GNOME/pango/-/raw/main/NEWS)

### Inferences
- Ubuntu 25.04/25.10 combine GNOME 48/49 with Pango 1.56.3. That is the old implementation (global fontconfig app set + cache clear), so behaviour differs from upstream GNOME 48+ builds. Test both.

### Gaps
- The mutter version for Ubuntu 26.04 was not fetched (likely GNOME 50). Fedora and Arch versions were not checked.

## Q3. Getting gnome-shell's Clutter font map from JS (mutter 46–51), and refresh after adding

### Takeaway
Clutter does **not** use `PangoCairo.FontMap.get_default()`. It creates its own map with `pango_cairo_font_map_new()`, one per `ClutterContext`. `Clutter.get_font_map()` exists only in mutter 46 and was removed in 47. `clutter_context_get_pango_fontmap` is not introspectable. The path that works on every version 46–51 is `actor.get_pango_context().get_font_map()`, for example `global.stage.get_pango_context().get_font_map()` or `label.clutter_text.get_pango_context().get_font_map()`.

### Cited Findings
- mutter 46: `clutter_get_font_map()` is public in `clutter-main.h` and returns `clutter_context_get_pango_fontmap(ClutterCntx)`. `clutter_context_get_pango_fontmap` is marked `(skip)`. The map comes from `cogl_pango_font_map_new()`. — [mutter 46.0 clutter-main.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/46.0/clutter/clutter/clutter-main.c), [46.0 clutter-context.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/46.0/clutter/clutter/clutter-context.c)
- mutter 47: `clutter-main.h` has no font functions any more, so `clutter_get_font_map` is gone. `cogl_pango_font_map_new()` internally calls `pango_cairo_font_map_new()`. — [mutter 47.0 clutter-main.h](https://gitlab.gnome.org/GNOME/mutter/-/raw/47.0/clutter/clutter/clutter-main.h), [47.0 cogl-pango-fontmap.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/47.0/cogl/cogl-pango/cogl-pango-fontmap.c)
- mutter 48, 49, 50, 51.0 and main: `clutter_context_get_pango_fontmap()` returns a plain `PangoFontMap` from `pango_cairo_font_map_new()`, with resolution set from the backend. cogl-pango was dropped. — [mutter 51.0 clutter-context.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/51.0/clutter/clutter/clutter-context.c), [main clutter-context.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/clutter/clutter/clutter-context.c)
- `clutter_actor_get_pango_context()` → `clutter_actor_create_pango_context()` → `pango_font_map_create_context(clutter_context_get_pango_fontmap(context))`. Its contexts are updated on backend `font-changed` and `resolution-changed`. — [mutter main clutter-actor.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/clutter/clutter/clutter-actor.c)
- mutter 51.0 `clutter-backend.c` no longer contains `clutter_get_default_backend` (46–50 have it). — [mutter 51.0 clutter-backend.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/51.0/clutter/clutter/clutter-backend.c)
- mutter 46 `ClutterSettings` handles `fontconfig-timestamp`. When `!FcConfigUptoDate(NULL)` it runs `pango_fc_font_map_cache_clear()` + `FcInitReinitialize()` on the Clutter map and emits `font-changed`. In mutter 47 only the struct field remains, and main/50 have no fontconfig reload code. — [mutter 46.0 clutter-settings.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/46.0/clutter/clutter/clutter-settings.c), [mutter main clutter-settings.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/clutter/clutter/clutter-settings.c)
- gnome-shell main `st-theme-context.c` has no font map / `config_changed` handling. — [st-theme-context.c](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/src/st/st-theme-context.c)

### Inferences
- The current `utils.js` support check (`PangoCairo.FontMap.get_default().create_context().load_font()`) asks a different map than the one that renders St labels. After switching to `add_font_file`, both adding and checking must use the Clutter map, e.g. `global.stage.get_pango_context()`. Otherwise the check reports "unsupported" for the bundled font even though it renders.
- On mutter 47+, gnome-shell never reloads fontconfig at runtime. That explains why fonts copied into `~/.local/share/fonts` need a re-login, as the current notification says. With `add_font_file` on the Clutter map (Pango ≥1.56), no re-login is needed.
- Because mutter 47+ never clears its own font map, fonts added with the 1.56.4+ implementation should persist for the whole shell session, unless another extension calls `config_changed()` on that map.
- Refresh: St/ClutterText caches layouts. If labels already exist, re-apply `set_style()` (the font-family is inline CSS) or recreate the labels after adding the font. Simplest approach: add the fonts at the top of `enable()`, before building widgets. (INFERRED)

Sketch (shell side, not tested):
```js
const fm = global.stage.get_pango_context().get_font_map();
if (typeof fm.add_font_file === 'function') {
    for (const f of FONT_FILES) {
        try { fm.add_font_file(GLib.build_filenamev([this.path, 'fonts', f])); }
        catch (e) { this._logger.warn(`add_font_file ${f}:`, e); }
    }
} else { /* Pango < 1.56 (GNOME 46/47): fall back, see Q5 */ }
```

### Gaps
- Not verified whether `PangoCairo.FontMap` from `actor.get_pango_context().get_font_map()` arrives in GJS with a usable class (it should be `PangoCairoFcFontMap`, a `PangoFcFontMap` subclass).
- Not checked whether any mutter 48–51 code path calls `pango_fc_font_map_config_changed` elsewhere, e.g. in `meta-settings` or the X11 backend.

## Q4. GTK4/libadwaita prefs (GTK 4.14–4.2x)

### Takeaway
In prefs, either call `PangoCairo.FontMap.get_default().add_font_file()` (Pango ≥1.56), or create a separate `PangoCairo.FontMap.new()`, add the files to it, then call `window.set_font_map(map)` and give it to `new Gtk.FontDialog({font_map: map})`. Both APIs exist for the whole GTK 4.14+ range. Prefs run in the host process (the Extensions app / `gnome-extensions prefs`), so their Pango is the system Pango. The same 1.56 requirement applies.

### Cited Findings
- `Gtk.FontDialog:font-map` is available since GTK 4.10: "A custom font map can be used to present application-specific fonts instead of or in addition to the normal system fonts." — [docs.gtk.org FontDialog:font-map](https://docs.gtk.org/gtk4/property.FontDialog.font-map.html)
- `gtk_widget_set_font_map(widget, font_map)`: "Sets the font map to use for text rendering in the widget". A widget without one inherits its parent's map. — [docs.gtk.org Widget.set_font_map](https://docs.gtk.org/gtk4/method.Widget.set_font_map.html)
- GTK calls `pango_fc_font_map_config_changed()` on its font map when the fontconfig timestamp changes. — [gtksettings.c](https://gitlab.gnome.org/GNOME/gtk/-/raw/main/gtk/gtksettings.c)
- The current prefs (`src/prefsModules/labelPage.js`) list families with `PangoCairo.FontMap.get_default().list_families()` and use a plain `Gtk.FontDialog`. (Repo code.)

### Inferences
- Prefer a private `PangoCairo.FontMap.new()` set on the prefs window (`Adw.PreferencesWindow` from `fillPreferencesWindow`) plus `FontDialog.font_map`. The Extensions app hosts prefs for all extensions in one process, and adding to the default map affects every extension in it. GTK's fontconfig-timestamp handler also clears the font map it watches; on 1.56.4+ that would drop fonts added to the default map. (INFERRED)
- `list_families()` on the custom map returns system fonts plus the bundled ones, so the existing "bundled default font, but not yet registered" branch becomes unnecessary on Pango ≥1.56.

### Gaps
- Not confirmed which map GTK's `settings_update_fontconfig` uses (default vs. per-display). Not tested on GTK 4.14/4.16 at runtime.

## Q5. Fallback for GNOME 46/47 (Pango < 1.56)

### Takeaway
GJS has no in-process way to register an app font on Pango < 1.56. The system `fontconfig-2.0` typelib exposes only `FcInit` (no `FcConfigAppFontAddFile`, no `FcConfig` constructor), and `pango_fc_font_map_get_config` is `(skip)`. The practical fallback is the current approach: an async `Gio.File.copy` into `~/.local/share/fonts/modernclock/`, without `fc-cache`, plus a re-login prompt.

### Cited Findings
- Local `/usr/lib/x86_64-linux-gnu/girepository-1.0/fontconfig-2.0.typelib` (gir1.2-freedesktop 1.80.1) contains only `Pattern`, `CharSet`, `Config` and `init`/`FcInit` symbols. (CONFIRMED locally with `strings`.)
- `pango_fc_font_map_get_config: (skip)`. `pango_fc_font_map_set_config(fcfontmap, FcConfig*)` exists since 1.38, but needs an FcConfig that GJS cannot build. — [pangofc-fontmap.c](https://gitlab.gnome.org/GNOME/pango/-/raw/main/pango/pangofc-fontmap.c)
- mutter 46 reloads fontconfig on a `fontconfig-timestamp` change (code in Q3), so GNOME 46 may pick up a newly copied font without re-login if something bumps the timestamp. mutter 47 dropped this. — [mutter 46.0 clutter-settings.c](https://gitlab.gnome.org/GNOME/mutter/-/raw/46.0/clutter/clutter/clutter-settings.c)

### Inferences
- `fc-cache` is not required. When fontconfig sees a directory whose mtime is newer than its cache, it scans it at the next config load. Dropping the subprocess loses nothing except a slower first scan. (UNCERTAIN, standard fontconfig behaviour, not re-verified this session.)
- Recommended hybrid: use `add_font_file` on the Clutter map when available (GNOME 48+ / Pango ≥1.56, no files written). Otherwise do the async copy into the user font dir and show the re-login notification (GNOME 46/47). On the add_font_file path, consider removing a previously installed `~/.local/share/fonts/modernclock` copy. Duplicates are harmless, because app fonts take precedence since 1.56.1.
- Other possible routes: St CSS `@font-face` (no references found in `st-theme.c`, so presumably unsupported), and `FONTCONFIG_FILE` (only read at process start, so it cannot work inside a running shell). Neither is viable.

### Gaps
- Not verified whether gsd-xsettings or mutter 46 on Wayland actually bumps/propagates the fontconfig timestamp after a user font dir change.

## Q6. EGO usage and reviewer guidance

### Takeaway
No GNOME Shell extension using `add_font_file` was found. The official review guidelines say nothing about fonts or about writing to `~/.local/share/fonts`. They require processes to be "spawned carefully and exit cleanly", which discourages `fc-cache` without forbidding it.

### Cited Findings
- Review guidelines: extensions "MUST NOT include binary executables or libraries". "Processes MUST be spawned carefully and exit cleanly". "Scripts MUST be written in GJS, unless absolutely necessary". Privileged subprocesses need `pkexec`. Nothing about fonts or files written to home. — [gjs.guide Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- A GitHub code search for `add_font_file` (JavaScript) returned only gjsify (a GJS/Node runtime that loads bundled fonts through `add_font_file` because `FONTCONFIG_FILE` does not affect non-fontconfig maps) and unrelated web projects. No `metadata.json` co-hits, so no extension uses it. — [gjsify gtk-runtime.js](https://github.com/gjsify/gjsify/blob/main/packages/node-gi/node-gi/gtk-runtime.js)

### Inferences
- `add_font_file` writes nothing to disk, spawns nothing, and is undone by a shell restart. That fits EGO expectations better than copying into the user's font dir. One caveat: the font stays registered after `disable()`, because Pango has no `remove_font_file` API. Reviewers are unlikely to object, but mention it in the review notes.

### Gaps
- No discourse/EGO review-thread statements about font installation found (search returned nothing relevant).

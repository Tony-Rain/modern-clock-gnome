# GNOME Shell extension API changes and new features, GNOME 47–51 (for the Modern Clock desktop widget)

Scope: GNOME 46–51, with emphasis on what affects an extension that renders St.Label/St.BoxLayout clock widgets in `Main.layoutManager._backgroundGroup`, uses inline CSS, `GnomeDesktop.WallClock`/GLib timeouts, GSettings, and Adw/GTK4 prefs.
Local check (2026-10-09): the repo's `src/extension.js` already uses `GnomeDesktop.WallClock` (line ~174) and switches between `set_orientation(Clutter.Orientation.VERTICAL)` (>= 48) and `set_vertical(true)` (< 48) (lines 261-262). `metadata.json` lists shell-version 46-51. The dev machine runs GNOME Shell 46.0 and gjs 1.80.2.

## 1. gjs.guide porting guides 47/48/49/50/51: what changed and what matters to us

### Takeaway
A porting guide exists for every version including **GNOME 51**. For this widget the changes that matter are: Clutter.Color removed (**47**, not 50), prefs callbacks awaited (47), St `vertical` deprecated (48) and **removed (51)**, `getLogger()` (48), `Meta.Rectangle`→`Mtk.Rectangle` (49), GLib `*_once` timeout helpers (50), `disable()` must not be async (51), `St.Settings.reducedMotion` (51), and `Clutter.get_default_backend()` removed (51). Nothing changes in `metadata.json` or the extension/prefs entry points beyond that.

### Cited Findings
**GNOME 47** — [gjs.guide 47](https://gjs.guide/extensions/upgrading/gnome-shell-47.html)
- `getPreferencesWidget` and `fillPreferencesWindow` in `prefs.js` are now **awaited**, so they can be `async`.
- `Clutter.Color` "has been removed from the API"; use `Cogl.Color()` instead (or CSS colors, as this extension does).
- Accent colors: Shell CSS gains `-st-accent-color` and `-st-accent-fg-color` variables that extensions can use in stylesheets.
- `PopupBaseMenuItem` uses the `:selected` pseudo-class instead of a `selected` style class. `_fixMarkup()` moved to `misc/util.js/fixMarkup()`. Not relevant to the widget.

**GNOME 48** — [gjs.guide 48](https://gjs.guide/extensions/upgrading/gnome-shell-48.html)
- St widgets: the `vertical` property is **deprecated**. Use `orientation: Clutter.Orientation.VERTICAL`.
- New `ExtensionBase.getLogger()` returns an extension-prefixed logger with `log/warn/error/info/debug/assert/trace/group/groupEnd`.
- `Clutter.Image` removed; use `St.ImageContent`. Its `set_bytes()`/`set_data()` now take a `Cogl.Context` as the first argument.
- `Clutter.Stage.get_key_focus()` returns `null` instead of the stage when nothing has focus.
- `Meta` functions moved to `Meta.Compositor`: `get_window_group`, `get_top_window_group`, `get_window_actors`, `disable_unredirect`, `enable_unredirect`. `Meta.CursorTracker.get_for_display()` becomes `global.backend.get_cursor_tracker()`.
- `Cogl.SnippetHook.FRAGMENT` replaces `Shell.SnippetHook.FRAGMENT`.
- New `Main.breakManager` and `Main.timeLimitsManager` (wellbeing).

**GNOME 49** — [gjs.guide 49](https://gjs.guide/extensions/upgrading/gnome-shell-49.html)
- `Meta.Rectangle` removed; use `Mtk.Rectangle`. This only matters if the code builds rectangles. Monitor geometry from `layoutManager.monitors` is unaffected.
- New `Meta.LogicalMonitor`/`Meta.Monitor` classes, plus `Meta.Backlight` and `Main.brightnessManager`.
- `Meta.Window.get_maximized()` removed (use `is_maximized()`). `Clutter.ClickAction`/`TapAction` removed (use `ClickGesture`/`LongPressGesture`). The widget is non-reactive, so neither applies.
- Nested mode removed. Test with `dbus-run-session gnome-shell --devkit --wayland`.
- New `gnome-extensions upload` command for uploading to EGO.

**GNOME 50** — [gjs.guide 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- No changes to metadata, `extension.js` or `prefs.js` entry points.
- New `easeAsync()` returns a promise. New `logErrorUnlessCancelled()` in `misc/errorUtils.js`.
- `show-restart-message` and `restart` signals are no longer emitted from `global.display`, and `RunDialog._restart()` is removed. This means no Alt+F2 `r` (consistent with X11 removal).
- New `org.gnome.desktop.calendar.week-start-day` setting and `_getWeekStartDay()` in `ui/calendar.js`.
- GLib one-shot helpers are now usable: `GLib.idle_add_once()`, `GLib.timeout_add_once()`, `GLib.timeout_add_seconds_once()`.
- `gnome-extensions install` gains a `print-uuid` flag. `gnome-shell-test-tool` gains `--extension`.

**GNOME 51** — [gjs.guide 51](https://gjs.guide/extensions/upgrading/gnome-shell-51.html) (**the guide exists**)
- `disable()` **cannot be async**. GNOME Shell throws if it is.
- St: the `vertical` property is **removed** (deprecated since 48).
- New `St.ReducedMotion.REDUCE`/`NO_PREFERENCE`, read through `St.Settings.get().reducedMotion`.
- `St.ButtonMask` constants renamed: `ONE/TWO/THREE` become `PRIMARY/MIDDLE/SECONDARY`.
- Background: `_loadImage()` is now async, and there is a new `BackgroundTextureCache` class.
- `Clutter.get_default_backend()` removed; use `global.stage.context.get_backend()`.
- `Shell.GLSLEffect` removed; use `Clutter.ShaderEffect` with `vfunc_get_static_snippet()`.
- `Gio.DBus.makeProxyWrapper()` now returns a class that should be called with `new`.
- The `pointerWatcher` module is removed; use `global.backend.get_cursor_tracker()`.
- PopupMenu `open()`/`close()` take a params object `{animate, fadeOnly}`. New `NoGrabPopup` and `SearchEntry`.
- Upstream `background.js` (main branch) now loads images through `BackgroundTextureCache.load()` / `_loadGlycinFrame()`, an async Glycin-based path ([background.js](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/js/ui/background.js)).

### Inferences
- The project's CLAUDE.md says "Clutter.Color was removed in GNOME 50". Per gjs.guide it was removed in **47**. The CSS-color approach is correct for all of 47–51, so only the documentation is wrong.
- The current `_shellVersion >= 48 ? set_orientation : set_vertical` branch is correct. On 51, `set_vertical`/`vertical:` would break, so that branch must never run there. Gating on `>= 48` handles this.
- Make sure `disable()` is synchronous (no `async`, no awaits) for 51. Async cleanup such as font install must not live in `disable()`.
- If the clock tick uses chained `GLib.timeout_add` with `return GLib.SOURCE_REMOVE`, `timeout_add_once` is a cleaner option on ≥50. It still returns a source ID, which must be removed in `disable()`. It is not available on 46–49 (see GJS 1.87.1), so a version check or fallback is needed.
- `St.Settings.get().reducedMotion` (51) could be used to skip any fade or ease animation on reposition.

### Gaps
- I did not fetch gjs.guide 46 (baseline). The 47 guide lists no changes to `Main.layoutManager._backgroundGroup` or `monitors-changed`. Neither do 48–51, so no known break, but this rests on the guides' silence rather than an explicit statement.

## 2. Clutter/St/Cogl API details relevant to the widget

### Takeaway
Clutter.Color is gone since 47 (Cogl.Color or CSS replace it). St.BoxLayout `vertical` was deprecated in 48 and removed in 51. Accent-color CSS variables arrived in 47. Reduced-motion arrived in St in 51. I found no documented changes to St.Label, ClutterText ellipsize or `get_transformed_*`.

### Cited Findings
- Clutter.Color was removed in 47; use `Cogl.Color()` — [gjs.guide 47](https://gjs.guide/extensions/upgrading/gnome-shell-47.html)
- The `-st-accent-color` and `-st-accent-fg-color` CSS variables are available to extensions from 47 — [gjs.guide 47](https://gjs.guide/extensions/upgrading/gnome-shell-47.html)
- St `vertical` was deprecated in 48 in favor of `orientation: Clutter.Orientation.VERTICAL` — [gjs.guide 48](https://gjs.guide/extensions/upgrading/gnome-shell-48.html). It was removed in 51 — [gjs.guide 51](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)
- `Clutter.Image` was removed in 48 (use `St.ImageContent` with a Cogl.Context argument) — [gjs.guide 48](https://gjs.guide/extensions/upgrading/gnome-shell-48.html)
- `Clutter.get_default_backend()` was removed in 51 (use `global.stage.context.get_backend()`) — [gjs.guide 51](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)
- `St.Settings.get().reducedMotion` and the `St.ReducedMotion` enum were added in 51 — [gjs.guide 51](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)
- Libadwaita 1.6 (GNOME 47) adds `AdwStyleManager.get_accent_color()` and `get_accent_color_rgba()`, with accent options blue, teal, green, yellow, orange, red, pink, purple and slate — [libadwaita docs](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.5/method.StyleManager.get_accent_color.html)

### Inferences
- An "use system accent color" option is possible in two ways. In the Shell process, use `-st-accent-color` in `stylesheet.css` (inline `set_style` can likely reference it too, but this is unverified). Alternatively, read the `org.gnome.desktop.interface accent-color` GSetting (my assumption about the key name; not verified in this session).

### Gaps
- I found no explicit statement on whether CSS variables such as `-st-accent-color` resolve inside **inline** `set_style()` strings. This needs a test.
- I found no documented changes to `St.Label`, `ClutterText.ellipsize`, `Clutter.Actor.get_transformed_position/size`, `Main.layoutManager._backgroundGroup` or the `monitors-changed` signal across 47–51.

## 3. Clock-related APIs: WallClock, minute alignment, locale/Intl, SpiderMonkey versions

### Takeaway
GNOME Shell's own top-bar clock still uses `GnomeDesktop.WallClock` (its `notify::clock` signal fires on minute boundaries, or on second boundaries when seconds are shown). That is the recommended tick source, and this extension already imports it. GJS moved from SpiderMonkey 115 (GNOME 46) to 128 (47/48) to 140 (49+). SM140 brings `Temporal` and `Intl.DurationFormat`. `Intl.DateTimeFormat` is available throughout.

### Cited Findings
- Upstream `js/ui/dateMenu.js` (main) does `import GnomeDesktop from 'gi://GnomeDesktop'`, `this._clock = new GnomeDesktop.WallClock()` and `this._clock.connect('notify::clock', ...)` — [dateMenu.js](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/js/ui/dateMenu.js)
- GJS 1.81.2 (GNOME 47 cycle) is based on **SpiderMonkey 128**, up from 115. It adds `Intl.Segmenter`, `Intl.NumberFormat.formatRange()` and `Intl.PluralRules.selectRange()` — [GJS NEWS](https://gitlab.gnome.org/GNOME/gjs/-/raw/master/NEWS)
- GJS 1.85.2 (GNOME 49 cycle) is based on **SpiderMonkey 140**, up from 128. It adds `Intl.DurationFormat` and the **Temporal API** (`Temporal.ZonedDateTime`, `Temporal.PlainTime`, `Temporal.Now`, and others) — [GJS NEWS](https://gitlab.gnome.org/GNOME/gjs/-/raw/master/NEWS)
- GJS 1.80 (GNOME 46) is based on SpiderMonkey 115 — [GJS NEWS](https://gitlab.gnome.org/GNOME/gjs/-/raw/master/NEWS)
- GJS 1.87.1 (GNOME 50 cycle) makes `GLib.idle_add_once()`, `GLib.timeout_add_once()` and `GLib.timeout_add_seconds_once()` introspectable — [GJS NEWS](https://gitlab.gnome.org/GNOME/gjs/-/raw/master/NEWS)
- GNOME 50 adds the `org.gnome.desktop.calendar.week-start-day` setting — [gjs.guide 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html). Settings gains a "first day of week" option — [GNOME 50 release notes](https://release.gnome.org/50/)

Mapping of GNOME, GJS and SpiderMonkey versions (from NEWS):

| GNOME | GJS | SpiderMonkey |
|---|---|---|
| 46 | 1.80 | 115 |
| 47 | 1.82 | 128 |
| 48 | 1.84 | 128 |
| 49 | 1.86 | 140 |
| 50 | 1.88 | 140 |
| 51 | 1.90 (1.89.90 is the RC) | 140 (no new ESR announced) |

### Inferences
- `Temporal` is only available on 49+. With a 46–51 support range, the extension cannot rely on it. Keep `GLib.DateTime` or `Intl.DateTimeFormat`.
- Using `WallClock` `notify::clock` (already present) to trigger redraws aligns updates to minute boundaries without a periodic `GLib.timeout_add`. WallClock also follows the system `clock-format` setting and timezone changes.

### Gaps
- I did not confirm whether GJS 1.90.0 final shipped, or with which SpiderMonkey. The master NEWS stops at 1.89.90 (RC). No SpiderMonkey bump is mentioned for 1.89.x, so 140 is inferred.
- I found no new Shell-level clock or timezone API in 47–51 beyond WallClock.

## 4. GJS 1.82–1.90 changes

### Takeaway
These are incremental releases with no ESM or extension-loading breaks. The relevant items are the SM128 and SM140 language features, the `*_once` timeout helpers (1.88/GNOME 50), and two small breaking changes in 1.89 (GNOME 51).

### Cited Findings (all from [GJS NEWS](https://gitlab.gnome.org/GNOME/gjs/-/raw/master/NEWS))
- **1.82 (GNOME 47):** SpiderMonkey 128, new Intl features (see section 3).
- **1.83.3/1.84 (GNOME 48):** the REPL becomes async, and `new GObject.Value(String, 'a string')` gives one-line construction.
- **1.85.2/1.86 (GNOME 49):** SpiderMonkey 140, with `Temporal`, `Intl.DurationFormat`, iterator helpers, `Promise.try`, `RegExp.escape` and more. 1.86 requires GLib 2.86. Platform-specific symbols (GLibUnix/GioUnix) are mapped.
- **1.87.x/1.88 (GNOME 50):** `GLib.*_once` timeout/idle helpers. `Gtk.Builder` gains JS conveniences (`data`, `resource`, `filename`, `callbacks`, `objects` construct properties). `add_action_entries` accepts GLib.Variant types.
- **1.89.x (GNOME 51):** `Gtk.Widget.add_binding*()` static methods (GTK4). Cairo gains `fontExtents()` and `textPath()`. **Breaking:** `GObject.Interface` methods are no longer installed as static methods. **Breaking/deprecation:** `Gio.DBus.makeProxyWrapper()` should be called with `new`; calling without it prints a warning.

### Inferences
- None of these break typical clock-widget code. The `makeProxyWrapper` change matters only if the extension uses D-Bus proxies.

### Gaps
- The NEWS file has no explicit `console` or `Gio._promisify` changes for 1.82–1.89.

## 5. GNOME 50/51 platform features that affect or could benefit a desktop widget

### Takeaway
GNOME 50 removed the X11 session completely (Wayland only, XWayland for apps). The "X11 support" claim and the Alt+F2 `r` restart are therefore obsolete on 50+. Other relevant 50/51 features are better fractional scaling (125%/150% selectable), Reduced Motion (50, extended to Shell animations in 51), new default wallpapers, async/Glycin background loading (51), and smoother frame scheduling (51). I found no "desktop widgets" feature upstream.

### Cited Findings
- The X11 code was removed from Mutter and GNOME Shell in GNOME 50, leaving Wayland as the only session. XWayland remains for X11 apps — [Phoronix](https://www.phoronix.com/news/GNOME-Mutter-Shell-50-Alpha), [Linuxiac](https://linuxiac.com/gnome-50-ends-the-x11-era-after-decades/)
- In GNOME 49 the X11 session was disabled by default in gnome-session, gdm, mutter and gnome-shell — [GNOME 49 developers](https://release.gnome.org/49/developers/)
- Mutter could be built Wayland-only from GNOME 47, with the Shell detecting X11/Xwayland availability — [GNOME 47 developers](https://release.gnome.org/47/developers/)
- GNOME 50 brings improved VRR and fractional scaling (125%/150% natively selectable), Wayland color-management protocol v2, HDR screen sharing, a Reduced Motion accessibility option and six new wallpapers — [GNOME 50 release notes](https://release.gnome.org/50/)
- GNOME 50 removed the `restart` signals and `RunDialog._restart()` — [gjs.guide 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- GNOME 51 brings frame-scheduling improvements ("animations will run more smoothly"), brightness that persists across HDR toggling, Reduced Motion applied to more Shell animations, three new wallpapers (Roundhex is the default), SVG cursors, removal of legacy NVIDIA driver support and the new web-login GDM — [GNOME 51 release notes](https://release.gnome.org/51/)
- The Mutter devkit (GNOME 50) can emulate HiDPI, fractional scaling (125%/200%) and multi-monitor virtual displays. This is useful for testing per-monitor scaling of the clock — [GNOME 50 developers](https://release.gnome.org/50/developers/)

### Inferences
- On 50+, CLAUDE.md's "On X11 you can use Alt+F2 → r" no longer applies. For testing, use `dbus-run-session gnome-shell --devkit --wayland` (49+) or log out and back in.
- With fractional scaling, label sizes computed from `monitor.height` (logical pixels in `layoutManager.monitors`) should stay consistent. Test with devkit emulated monitors.
- A wallpaper that differs between light and dark mode means the clock text color may need a "follow dark/light" option. This is an idea, not a documented API.
- HDR: Shell actors are color-managed by Mutter. I found no documentation saying CSS colors in St behave differently with HDR on.

### Gaps
- I found no reliable source on upstream "desktop widgets" proposals for GNOME 50/51.
- I found no documentation on how HDR affects St text color rendering.

## 6. Libadwaita/GTK versions per GNOME release and useful prefs widgets

### Takeaway
GNOME 46 ships Adw 1.5 / GTK 4.14, 47 ships Adw 1.6, 48 Adw 1.7, 49 Adw 1.8 / GTK 4.20, 50 Adw 1.9 / GTK 4.22, and 51 Adw 1.10 / GTK 4.23. Because the minimum is 46, prefs can use Adw 1.5 widgets (`AdwSpinRow`, `AdwSwitchRow`, `AdwComboRow`, `AdwPreferencesDialog`) without checks. `AdwButtonRow` (1.6) and `AdwToggleGroup` (1.7) need version guards. Libadwaita has no color row; `Gtk.ColorDialogButton` inside an `AdwActionRow` remains the way to pick colors.

### Cited Findings
- **GNOME 46:** GTK 4.14 and Libadwaita 1.5, with `AdwDialog`, `AdwAlertDialog`, `AdwPreferencesDialog` and `AdwAboutDialog` — [GNOME 46 developers](https://release.gnome.org/46/developers/)
- **GNOME 47:** new Libadwaita widgets `AdwButtonRow`, `AdwSpinner`/`AdwSpinnerPaintable`, `AdwBottomSheet` and `AdwMultiLayoutView`. GTK gains CSS variables, relative colors, `color-mix()`, `GdkColorState` and the Vulkan renderer by default — [GNOME 47 developers](https://release.gnome.org/47/developers/). Accent color APIs in `AdwStyleManager` since 1.6 — [libadwaita docs](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.5/method.StyleManager.get_accent_color.html)
- **GNOME 48:** Libadwaita 1.7 with `AdwToggleGroup`, `AdwInlineViewSwitcher`, `AdwWrapBox` and document/monospace font APIs — [GNOME 48 developers](https://release.gnome.org/48/developers/)
- **GNOME 49:** Libadwaita 1.8 with `AdwShortcutsDialog`, `AdwShortcutLabel` and the `.document` style class. GTK 4.20 adds CSS media queries for accessibility preferences — [GNOME 49 developers](https://release.gnome.org/49/developers/)
- **GNOME 50:** Libadwaita 1.9 with `AdwSidebar` and `AdwViewSwitcherSidebar`. GTK 4.22 adds GtkSvg — [GNOME 50 developers](https://release.gnome.org/50/developers/)
- **GNOME 51:** Libadwaita 1.10 with `AdwCssClassBinding` and `:prefix`/`:suffix` on sidebar widgets; `AdwEnumListModel` is deprecated in favor of `GtkEnumList`. GTK 4.23 adds `GtkEnumList` and respects reduced motion in Spinner/Stack/Revealer — [GNOME 51 developers](https://release.gnome.org/51/developers/)
- Since 47, prefs callbacks may be async because they are awaited — [gjs.guide 47](https://gjs.guide/extensions/upgrading/gnome-shell-47.html)

### Inferences
- `AdwToggleGroup` (48+) would suit the 12h/24h or position selector, but it needs a `ComboRow` fallback on 46–47. Check this with `Adw.ToggleGroup !== undefined`.
- On GNOME 51, prefer `Gtk.EnumList` over `Adw.EnumListModel` only if an enum model is used; ComboRow with a `Gtk.StringList` is unaffected.
- Async `fillPreferencesWindow` is safe only on 47+. On 46 it is not awaited, so avoid relying on it while 46 is supported.

### Gaps
- The GNOME 47 developer page does not state the Libadwaita version number. "1.6" is inferred from the libadwaita docs ("since 1.6" for accent APIs) and release order.
- I found no Libadwaita color-picker row in any release up to 1.10.

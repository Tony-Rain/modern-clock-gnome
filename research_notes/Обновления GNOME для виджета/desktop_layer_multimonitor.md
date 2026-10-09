# GNOME Shell / Mutter 46 → 51: desktop-layer widgets and multi-monitor painting under Wayland

Scope: GNOME 46–51 (2024 – Oct 2026). Local test machine: GNOME Shell 46.0 (`gnome-shell --version`), mutter Clutter-14 typelibs. Current extension code (`src/extension.js:254-279`) builds an `St.BoxLayout` with `style: 'background: transparent;'` per monitor and adds it to `Main.layoutManager._backgroundGroup`. The `rgba(0,0,0,0.01)` workaround was added in commit `bc2ada6` (Tony-Rain, 2026-06-18) and dropped in the rewrite `8acd79b` (Djinn Alexio, 2026-09-13, "started as just adding GNOME 51 support").

## 1. Is there a new public/supported API for desktop-layer widgets in GNOME Shell 47–51?

### Takeaway
No. Through GNOME 51 there is still no public "desktop layer" / "background chrome" API in gnome-shell. `_backgroundGroup` is unchanged: a private `Meta.BackgroundGroup` placed at the bottom of `global.window_group`. Mutter has not implemented layer-shell. The only new supported path is for **client windows**: since GNOME 49, an extension can spawn a Wayland client and mark its window as DESKTOP type (`Meta.Window.set_type()`). DING-style extensions use that; it is heavyweight for a clock.

### Cited Findings
- Current gnome-shell `main` `js/ui/layout.js` still does `this._backgroundGroup = new Meta.BackgroundGroup(); global.window_group.add_child(this._backgroundGroup); global.window_group.set_child_below_sibling(this._backgroundGroup, null);`. Per-monitor wallpapers are `BackgroundManager({container: this._backgroundGroup, monitorIndex})`. No new public method for adding desktop-level chrome was found (only the existing `addChrome` / `addTopChrome`) — [gnome-shell layout.js (main)](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/js/ui/layout.js)
- The gnome-shell NEWS for 46 → 51.0 has no entry about a desktop-widget/background-chrome API. Related entries are "Adapt to removal of X11 mutter backend [!3768]", "Use glycin to load and cache background images [!4134]", "Fix misplaced background menu [!3863]" and "Transition to new BoxLayout.orientation property" (48) — [gnome-shell NEWS](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/NEWS)
- GNOME 49 porting guide: "Meta.WaylandClient was redesigned and now exists for all wayland clients". Use `Meta.WaylandClient.new_subprocess` to spawn a client. "Meta.Window.set_type, Meta.Window.hide_from_window_list and Meta.Window.show_in_window_list were added which replaces functionality previously existing on Meta.WaylandClient". GNOME 49 also exposes `Meta.LogicalMonitor` / `Meta.Monitor` — [gjs.guide: Port to GNOME Shell 49](https://gjs.guide/extensions/upgrading/gnome-shell-49.html)
- A third-party extension (LiveEngine, live wallpapers for GNOME 49/50) uses `Meta.WaylandClient.new_subprocess(global.context, launcher, argv)` and then `Meta.Window.set_type(DESKTOP)` + `hide_from_window_list()` — [LiveEngine on GitHub](https://github.com/gurmeetgupta22/LiveEngine)
- mutter 51.alpha: "De-prioritize focusing desktop windows [Marco; !5016]". This shows that DESKTOP-type windows are still a maintained concept — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)
- Layer-shell (`wlr_layer_shell_unstable_v1`) for mutter is requested in issue #973. No implementation appears in mutter NEWS 46–51 — [mutter #973](https://gitlab.gnome.org/GNOME/mutter/-/issues/973); [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)
- The GNOME Shell & Mutter dev blog (2024–2026: Kiosk 49/50 posts, "GNOME Shell Design Dreams" Aug 2026) has no post on desktop widgets or a desktop-layer API — [blogs.gnome.org/shell-dev](https://blogs.gnome.org/shell-dev/)
- GNOME 50 and 51 porting guides have no layoutManager/background API changes. GNOME 51 removes the deprecated `St.BoxLayout` `vertical` property (deprecated in 48), `Shell.GLSLEffect`, `Clutter.get_default_backend()` and `ui/pointerWatcher.js`, and requires a synchronous `disable()` — [gjs.guide: GNOME Shell 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html); [gjs.guide: GNOME Shell 51](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)

### Inferences
- `Main.layoutManager._backgroundGroup` is still the de-facto method (AzClock uses it too, see section 4). It is private, but it has been stable since well before 46 and is unchanged on `main`.
- The current code already avoids `vertical` on ≥48 (`set_orientation(Clutter.Orientation.VERTICAL)`, with `set_vertical(true)` only for 46/47). So it is compatible with the GNOME 51 removal, as long as the `_shellVersion` gate is correct.
- `CLAUDE.md` in the repo is stale. It still describes `_container` / `_extraWidgets` / `St.Widget` + `BinLayout` + `rgba(0,0,0,0.01)`, which no longer matches `src/extension.js` after `8acd79b`.

### Gaps
- I could not read the full comment thread of mutter #973 (WebFetch got only the description), so the maintainers' latest stance on layer-shell is unverified.
- I did not find an upstream gnome-shell issue or MR proposing a public "desktop widgets" API in 47–51. No source either confirms or rules out an unpublicised proposal.

## 2. Did Meta.BackgroundGroup / Meta.Cullable / culling change in mutter 47–51?

### Takeaway
MetaCullable still exists on mutter `main` and MetaBackgroundGroup still implements it. Most importantly, the culling helpers **skip children that are not MetaCullable**, so a plain `St.BoxLayout` inside `_backgroundGroup` is never culled by this mechanism. Culling is therefore very unlikely to be the cause of "not painted on secondary monitor".

### Cited Findings
- `meta-background-group.c` (main) implements the MetaCullable interface with two vfuncs. `cull_unobscured` calls `meta_cullable_cull_unobscured_children(...)` and `cull_redraw_clip` calls `meta_cullable_cull_redraw_clip_children(...)`. The old single `cull_out` has been split into these two — [meta-background-group.c (main)](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/src/compositor/meta-background-group.c)
- `meta-cullable.c` (main): both helpers go through `cull_out_children_common()`, which contains `if (!META_IS_CULLABLE (child)) continue;`. Non-cullable children are skipped. Cullable children are checked for visibility, effects and transforms, and children with active effects get a NULL region (no culling) — [meta-cullable.c (main)](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/src/compositor/meta-cullable.c)
- mutter NEWS 46–51 has no entry that removes or reworks MetaCullable or BackgroundGroup culling. The nearest entries are "Fix invalid redraw clips on rotated monitors [Marco; !5203]" (51.beta), "Only queue clipped redraws when mapped [Sebastian; !4990]" (50.1) and "Fix background blur in offscreen and clone paints [!5220]" / "Add background effect policy [!5160]" (51) — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)

### Inferences
- An St widget in `_backgroundGroup` does not take part in unobscured/redraw-clip culling at all. The commit message of `bc2ada6` credits MetaCullable for the result ("Combined with parenting to _backgroundGroup (MetaBackgroundGroup, which implements MetaCullable)"), but that explanation does not hold for the St container itself.
- Background actors (`MetaBackgroundActor`) *are* cullable and are culled by windows above them. The St clock is not. When windows cover the clock it is still painted and then overdrawn, which is harmless.

### Gaps
- I did not diff `meta-cullable.c` between 46 and 51 tags, so I cannot exclude a subtle behaviour change. NEWS shows none.

## 3. Mutter/Clutter fixes for actors not painting on non-primary monitors / stage views

### Takeaway
I found **no upstream mutter/gnome-shell issue or MR** that describes or fixes "St actor with transparent background not painted on secondary stage view", in any release 46–51. The only public description of the problem is the project owner's own Discourse post, which got no developer reply. The stated root cause ("Clutter skips assigning allocation in the secondary stage view") does not match how Clutter works: allocation is not per stage view. Whether `background: transparent` is safe today is **unverified**. It must be tested on real multi-monitor Wayland hardware.

### Cited Findings
- Discourse post "Rendering a Shell extension widget on secondary monitors in Wayland — undocumented fix", author **Tony-Rain** (the repo owner). It claims that "Without visible content to paint, Clutter skips assigning a layout allocation to the actor in the secondary monitor's stage view" and gives the fix `background-color: rgba(0, 0, 0, 0.01)`, "Tested on GNOME 46–50, Wayland only". There were no replies from GNOME developers, and the topic auto-closed. The fetched page shows inconsistent dates (posted June 28, 2026; closure message dated June 26, 2026). Treat it as a self-report, not an authoritative diagnosis — [GNOME Discourse #35924](https://discourse.gnome.org/t/rendering-a-shell-extension-widget-on-secondary-monitors-in-wayland-undocumented-fix/35924)
- Clutter tracks which stage views an actor is on (the `stage-views-changed` signal, added in 2020) and only allocates mapped actors. Stage-view tracking is derived from the actor's allocation/transformed extents, not from whether it paints a background — [commits-list: emit signal when stage-views change (2020)](https://mail.gnome.org/archives/commits-list/2020-June/msg04087.html); [commits-list: only allocate when actor is mapped (2020)](https://mail.gnome.org/archives/commits-list/2020-October/msg07047.html); [Clutter.Actor docs](https://gnome.pages.gitlab.gnome.org/mutter/clutter/class.Actor.html)
- There is a related older class of bug where paint volumes/redraws of unmapped actors were wrong: "[mutter/gnome-40] clutter/stage: Only add paint volumes of mapped actors" — [commits-list Nov 2021](https://mail.gnome.org/archives/commits-list/2021-November/msg00647.html)
- Redraw/clip fixes that landed in the window:
  - 50.1: "Only queue clipped redraws when mapped [!4990]"
  - 51.beta: "Fix invalid redraw clips on rotated monitors [!5203]"
  - 51: "Fix offscreen effect glitches on resource scale changes [!5233]"
  - 51: "Fix multiple monitors being reported as primary [!5228]"
  - 51: "Fix hang on external monitor hotplug [!5255]"

  None of them names the extension-actor-on-secondary-monitor symptom — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)
- mutter 50.1 "Allow setting paint debug flags from environment [Jonas; !4973]" makes paint debugging (e.g. paint-volume / redraw visualisation) easier for diagnosing this — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)

### Inferences
- In Clutter, layout allocation is computed once for the whole stage, not per `ClutterStageView`. Each view then paints the actor tree clipped to its region. An `St.BoxLayout` holding non-empty `St.Label`s has a non-zero preferred size and a paint volume equal to its allocation, with or without a background. So "zero allocation in the secondary view" is unlikely to be the literal mechanism.
- More plausible causes of the original symptom:
  1. Positioning/geometry timing. The old code positioned the secondary widget from `_repositionAll()` timeouts, so a widget could be placed or sized before fonts or monitors settled.
  2. Stale redraw clips. On a label text change, Clutter queues a clipped redraw of the label's paint volume. If that clip was computed or applied wrongly for the secondary view, the area would not repaint. Giving the container a painted background changes its paint volume and redraw behaviour, which could mask this.
  3. The old `St.Widget` + `BinLayout` structure itself.

  All three are unconfirmed hypotheses.
- The rewrite (`8acd79b`) creates every per-monitor clock the same way, positions it via `global.compositor.get_laters()` plus `notify::allocation`, and uses `background: transparent`. It was authored while porting to GNOME 51, so it may have been tested on 51. The commit message does not say multi-monitor was verified.
- Practical recommendation (inference): keep `background: transparent` only if a two-monitor Wayland test on the lowest supported version (46) and on 50/51 shows the clock on the secondary monitor, both after login and after hotplug. Otherwise restore `background-color: rgba(0,0,0,0.01)`. It costs effectively nothing: one nearly invisible quad, and alpha 0.01 rounds to about 3/255 per channel, so it is not fully invisible on pure-white wallpaper only in theory. To diagnose, run with `MUTTER_DEBUG_PAINT=...` (50.1+, !4973) or Looking Glass, and check `container.get_allocation_box()` / `container.get_stage_views()` on the secondary widget.

### Gaps
- I found no mutter/gnome-shell GitLab issue that reproduces this exact symptom. GitLab issue search was not reachable through the tools, so an unindexed issue may exist.
- Whether the bug reproduces on 51 with the rewritten code is untested. I have no multi-monitor test result from either author besides the Discourse self-report.

## 4. How other desktop-widget extensions place widgets (47–51) and whether they hit the same issue

### Takeaway
AzClock ("Desktop Widgets", azclock@azclock.gitlab.com) uses the same method: it adds widgets to `Main.layoutManager._backgroundGroup` by default, or to `addTopChrome` for "always on top", and positions per monitor with relative coordinates. I found no AzClock code comment or public issue about the transparent-background secondary-monitor problem. DING / Gtk4-DING use a separate GTK client window marked as a desktop window instead.

### Cited Findings
- AzClock source (`src/extension.js`, main): default parent is `Main.layoutManager._backgroundGroup.add_child(this)`. With the `always-on-top` setting it uses `Main.layoutManager.addTopChrome(this)`. Location is stored as `monitorIndex` + `relativeX/relativeY` with a fallback to the primary monitor, and widgets are repositioned on `monitors-changed` — [AzClock extension.js](https://gitlab.com/AndrewZaech/azclock/-/raw/main/src/extension.js)
- AzClock reviews on EGO for v16.x (GNOME 46–50 era) mention that Desktop Icons may interfere with moving widgets. The snippets surfaced no multi-monitor rendering complaint — [EGO review 75151](https://extensions.gnome.org/review/75151); [EGO review 69082](https://extensions.gnome.org/review/69082)
- Gtk4 Desktop Icons NG (DING) is still on EGO and is a GTK app run as a Wayland client by the extension. In 49+ this goes through `Meta.WaylandClient.new_subprocess` + `Meta.Window.set_type` — [EGO: Gtk4 DING](https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding/); [gjs.guide 49](https://gjs.guide/extensions/upgrading/gnome-shell-49.html)
- Other "Desktop Widgets" extensions exist for 46–50 (e.g. EGO extension 9071, "a modular widget system ... on your desktop background") — [EGO: Desktop Widgets 9071](https://extensions.gnome.org/extension/9071/desktop-widgets/)

### Inferences
- AzClock widgets typically have a themed background (cards). That alone could explain why AzClock users would not hit a "transparent container" issue, if the issue is real. This is unverified. Comparing with AzClock's transparent-background mode on a second monitor would be a useful A/B test.

### Gaps
- I did not inspect the AzClock issue tracker or the DING source/issues in detail (tool-call budget). I also did not check the source of EGO 9071 or the "gridgets" GitHub project.

## 5. X11 removal, fractional scaling and per-monitor scale

### Takeaway
The X11 session was disabled by default in GNOME 49 (mutter 49.alpha, !4454), and the X11 backend was dropped in mutter 50.alpha (!4505), so GNOME 50+ is Wayland-only. The "Alt+F2 → r" restart path and `Meta.is_wayland_compositor()` are gone. On per-monitor scale, St/Clutter text is rendered at each stage view's resource scale, but font sizes in CSS are logical px. Any manual height-based scaling must use logical monitor geometry.

### Cited Findings
- mutter NEWS: "Disable X11 backend by default [Jordan; !4454]" (49.alpha.0), "Drop x11 session restore [!4438]", "Drop the X11 backend [Bilal; !4505]" (50.alpha) — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)
- gnome-shell: "Adapt to removal of X11 mutter backend [Bilal; !3768]" — [gnome-shell NEWS](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/NEWS)
- GNOME 49 guide: X11 disabled by default, nested mode gone. Test nested with `dbus-run-session gnome-shell --devkit --wayland`. mutter 49/50 added multi-monitor and HiDPI emulation to devkit (!4828 "Add multi monitor support to devkit", !4727 "HiDPI and monitor mode emulation", !4975 "Allow creating Devkit monitors from the command line" in 51) — [gjs.guide 49](https://gjs.guide/extensions/upgrading/gnome-shell-49.html); [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)
- GNOME 50 guide: restart "is only available on X11 and GNOME Shell 50 removed X11 support" (`RunDialog._restart()` and the `restart` signals removed) — [gjs.guide 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- `Meta.is_wayland_compositor()` was removed in GNOME 50. A third-party extension broke on it — [Nouuu/forge issue #2](https://github.com/Nouuu/forge/issues/2)
- Scale-related mutter fixes:
  - 51: "Fix offscreen effect glitches on resource scale changes [!5233]"
  - 51.beta: "Fix blurred rendering with non-pixel-aligned monitors [!5115]"
  - 50.1: "Fix applying pango scale attributes to text [!4964]"
  - 48: "Fix misplaced windows and random resizes on scaled monitors [!4041]"

  — [mutter NEWS](https://gitlab.gnome.org/GNOME/mutter/-/raw/main/NEWS)

### Inferences
- `CLAUDE.md`'s "On X11 you can use Alt+F2 → r" applies only to 46–48 X11 sessions. For 49+ testing, use `gnome-shell --devkit --wayland`. On 51 the devkit can emulate multiple monitors (!4975), which may allow reproducing the secondary-monitor bug without hardware.
- `Main.layoutManager.monitors[i].width/height` are in logical pixels. With mixed scales (e.g. 1.0 + 2.0), scaling fonts off `monitor.height / 1080` already gives the same physical proportion per monitor. Text crispness on a fractional-scale secondary monitor depends on Clutter resource scale, not on extension code. Labels whose paint box is not pixel-aligned may look slightly blurry (cf. !5115). These are inferences, not tested.

### Gaps
- I did not verify whether `Main.layoutManager.monitors` geometry semantics changed with the new `Meta.LogicalMonitor` API in 49. The guide says the classes were added "for future-proofing", with no stated behaviour change.

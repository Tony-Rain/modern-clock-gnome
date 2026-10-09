# GNOME Shell extension dev workflow and EGO review requirements (GNOME 49–51, through Oct 2026)

Research date: 2026-10-09. "CONFIRMED" means the source was fetched directly. "UNCERTAIN" means it came only from a search-engine summary or from inference.

## (a) Testing on Wayland without logging out: --devkit, packages, multi-monitor, reload

### Takeaway
On GNOME 49 and later, `--nested` is gone. Run `dbus-run-session gnome-shell --devkit --wayland`. This needs the separate mutter devkit viewer binary: `mutter-dev-bin` on Ubuntu, and `mutter-devel` or `mutter-devkit` on Fedora. The command did not change in 50 or 51. No source shows a way to emulate multiple monitors inside devkit, and none shows a way to hot-reload an extension on Wayland. A nested or devkit session is still the only way to test without logging out.

### Cited Findings
- CONFIRMED: gjs.guide gives `dbus-run-session gnome-shell --devkit --wayland` for GNOME 49+ and `dbus-run-session gnome-shell --nested --wayland` for 48 and earlier. It also gives a script that picks one by checking `gnome-shell --version` (>= 49), with `G_MESSAGES_DEBUG=all` and `SHELL_DEBUG=all` set. It warns that a nested instance is "not fully isolated" and does not protect against data loss. — [gjs.guide Debugging](https://gjs.guide/extensions/development/debugging.html)
- CONFIRMED: mutter's own docs describe `dbus-run-session mutter --wayland --devkit`, which shows the session through a dedicated GTK app, and `dbus-run-session gnome-shell --wayland --devkit`. Apps can be launched inside with `-- vte-2.91` or via `WAYLAND_DISPLAY`. Keyboard shortcuts often don't reach the nested compositor; the docs suggest remote-desktop for that case. — [mutter doc/building-and-running.md](https://github.com/GNOME/mutter/blob/main/doc/building-and-running.md)
- CONFIRMED (Fedora): the devkit binary ships in `mutter-devel`. That pulls in about 112 new packages (~160 MB download). Bug 2418788 (filed 2025-12-04) asks for a standalone `mutter-devkit` package; it was still NEW as of 2026-08-17. — [RH Bugzilla 2418788](https://bugzilla.redhat.com/show_bug.cgi?id=2418788)
  - Fedora's package site lists a `mutter-devkit` subpackage, including in fedora-44-updates (50.x) and Rawhide. This may be newer than the bug's last comment. — [Fedora Packages: mutter-devkit](https://packages.fedoraproject.org/pkgs/mutter/mutter-devkit), [F44 updates](https://packages.fedoraproject.org/pkgs/mutter/mutter-devkit/fedora-44-updates.html)
  - Practical advice: try `sudo dnf install mutter-devkit` first and fall back to `mutter-devel`.
- UNCERTAIN (search summary, Launchpad page not fetched): on Ubuntu 25.10 and 26.04 the package is `mutter-dev-bin` (description: "Mutter Development Kit"). It provides `/usr/libexec/mutter-devkit`. Installing `gnome-shell` alone is not enough. — [Launchpad mutter-dev-bin (Questing)](https://launchpad.net/ubuntu/questing/+package/mutter-dev-bin), [example README tdaffin/recent-windows-local](https://github.com/tdaffin/recent-windows-local)
- UNCERTAIN: a search summary said `MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 dbus-run-session mutter --wayland --devkit -- vte-2.91` sets the nested size. It also said `mutter --wayland --headless --virtual-monitor 1280x720 --virtual-monitor 1280x720` creates two virtual monitors, but only in headless mode, with no visible window. The 2018 commit added extra monitor specs via an environment variable to the dummy monitor manager. — [mutter commit 2018](https://mail.gnome.org/archives/commits-list/2018-December/msg01243.html), [mutter MR !1698 headless/virtual monitors](https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/1698). I could not confirm from primary docs that the devkit viewer supports more than one monitor.
- CONFIRMED (negative): gjs.guide Debugging says nothing about virtual monitor or multi-monitor setup. — [gjs.guide Debugging](https://gjs.guide/extensions/development/debugging.html)

### Inferences
- Recommended commands:
  - Ubuntu 25.10/26.04: `sudo apt install mutter-dev-bin`, then `dbus-run-session gnome-shell --devkit --wayland`.
  - Fedora 43/44: `sudo dnf install mutter-devkit` (or `mutter-devel`).
  - Install the extension into `~/.local/share/gnome-shell/extensions/` before starting. Enable it inside the session with `gnome-extensions enable modernclock@gnome-port`, run in the nested session's D-Bus. In practice, launch a terminal with `-- kgx` or `-- vte-2.91` so it shares that session.
- Multi-monitor `_extraWidgets` code: options are (1) `mutter --headless --virtual-monitor ...`/`gnome-shell --headless --virtual-monitor` combined with gnome-remote-desktop/RDP to view it, or (2) testing on real hardware. Both are unverified.
- Hot reload on Wayland: I found no 2025–2026 source describing any mechanism. ES modules cannot be re-imported in a running gnome-shell. The cycle is still: edit, restart the devkit session, which takes seconds and needs no logout.

### Gaps
- No primary source for devkit multi-monitor; the mutter-devkit viewer's UI was not inspected.
- No mutter NEWS entries for 50/51 devkit changes were found. I found nothing indicating the command changed after 49.
- No official statement on extension hot reload on Wayland in 2026.

## (b) EGO review rules and changes in 2025–2026

### Takeaway
The main changes:
1. A rule rejecting AI-generated submissions (Dec 2025).
2. A new gjs.guide "Best Practices" page aimed at LLMs (Jul 2026).
3. The Shexli static analyzer (Apr 2026), whose findings now appear on every EGO review page with codes like EGO-P-006 (don't ship compiled schemas) and EGO-L-004 (main-loop sources must be removed in disable()).

Review throughput was disrupted in March 2026, when the only active reviewer lost internet access in Iran.

### Cited Findings
**AI policy**
- CONFIRMED: the guidelines say: "Submissions with large amounts of unnecessary code, inconsistent code style, imaginary API usage, comments serving as LLM prompts, or other indications of AI-generated output will be rejected." Developers must be able to justify their code. — [gjs.guide Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- CONFIRMED: the rule was announced 2025-12-06 by Javad Rahmatzadeh. The cause was an influx of AI code; on some days he reviewed more than 15,000 lines, with many unnecessary try/catch blocks. AI is still allowed for learning and assistance. — [Blog: AI and GNOME Shell Extensions](https://blogs.gnome.org/jrahmatzadeh/2025/12/06/ai-and-gnome-shell-extensions/), [TWIG #228](https://thisweek.gnome.org/posts/2025/12/twig-228/#shell-extensions), [Linuxiac 2025-12-13](https://linuxiac.com/gnome-will-reject-shell-extensions-with-ai-generated-code/)
- CONFIRMED: on 2026-07-27, "An Open Letter to AI for Generating GNOME Shell Extensions" was published and folded into the new gjs.guide Best Practices page. — [Discourse](https://discourse.gnome.org/t/javad-rahmatzadeh-an-open-letter-to-ai-for-generating-gnome-shell-extensions/37265), [It's FOSS](https://itsfoss.com/news/gnome-shell-extension-instructions-for-bots/)
  - Best Practices covers:
    - No try/catch around destroy(), connect(), disconnect(), or GLib.Source.remove().
    - No defensive `?.()` or `typeof === 'function'` checks for guaranteed APIs.
    - No `_destroyed` flags.
    - Destroy order: remove sources → disconnect signals → drop references → `super.destroy()`.
    - Keep enable() and disable() adjacent, and timeout removal near its creation.
    - Each class owns its own lifecycle.
    - Avoid spawning shell commands; prefer D-Bus.
    - No emoji as icons.
    - Lines of 200 characters or fewer.
    - Use the `settings-schema` key in metadata plus `this.getSettings()` with no argument.
    - AI-generated code for personal use should carry the notice "Generated with AI for personal use. Do NOT upload to EGO…".
    - [gjs.guide Best Practices](https://gjs.guide/extensions/review-guidelines/best-practices.html)

**Core rules (current gjs.guide review-guidelines)** — [gjs.guide Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- CONFIRMED (lifecycle):
  - Nothing is created, connected, or modified at init.
  - Everything created in enable() is destroyed in disable().
  - Signals are disconnected.
  - Main loop sources are removed "even if callbacks return false / SOURCE_REMOVE".
- CONFIRMED (process separation): no Gtk/Gdk/Adw in the shell process; no Clutter/Meta/St/Shell in prefs.
- CONFIRMED (deprecated modules): ByteArray, Lang, and Mainloop are banned. Code must not be minified or obfuscated, and logging must be minimal.
- CONFIRMED (subprocesses and binaries): scripts must be in GJS unless absolutely necessary. Binary executables and libraries are prohibited. Processes must be spawned carefully and exit cleanly. Avoid pkexec.
- CONFIRMED (metadata.json):
  - `shell-version`: stable releases plus at most one development release, with no future versions.
  - Drop `session-modes` if it is only `user`.
  - Drop `donations` if unused.
  - `version` is deprecated and set by EGO.
  - No unnecessary keys.
  - The UUID may not use the gnome.org namespace.
- CONFIRMED (schemas): the ID must be under `org.gnome.shell.extensions` and the path under `/org/gnome/shell/extensions`. The XML file must be included and named `<schema-id>.gschema.xml`.
- CONFIRMED (licensing): GPL-2.0-or-later or a compatible license. Code copied from other extensions needs attribution. Brand names, logos, and artwork need permission from the rights holder.
- CONFIRMED (recommendations): use ESLint; don't ship build scripts, .po/.pot files, or unused media.

**Shexli (static analyzer)**
- CONFIRMED: Shexli was introduced in extensions-web MR !245 by Yuri Konotopov (EGO maintainer) on 2026-04-03, on the `shexli` branch. The MR says it was "written with the help of ChatGPT and Qwen" and that the analyzer logic has not been fully reviewed. It is described as an experiment that may later become a separate EGO service. As fetched, the MR was not merged into master. — [extensions-web MR !245](https://gitlab.gnome.org/Infrastructure/extensions-web/-/merge_requests/245)
- CONFIRMED: Shexli is live on EGO. Review pages have a "Shexli (experimental)" section showing "Shexli did not find any issues" or a list of findings. — [EGO review 72956](https://extensions.gnome.org/review/72956), [EGO review 71294](https://extensions.gnome.org/review/71294)
- CONFIRMED: PyPI `shexli` is described as "Static analyzer for GNOME Shell extension reviews". Version 0.2.1 was released 2026-04-10. Maintainer: nE0sIghT (Yuri Konotopov's handle). Requires Python 3.12 or later; license AGPL-3.0+. Install with `pip install shexli`. — [PyPI shexli](https://pypi.org/project/shexli/)
- CONFIRMED: there is a CI wrapper, `3v1n0/shexli-ci` (Marco Trevisan, Canonical). It installs from `git+https://gitlab.gnome.org/3v1n0/extensions-web.git@51-improvements#subdirectory=shexli`, which is a newer fork branch than PyPI. Features:
  - Baseline file `.shexli-baseline.json` (spec_version "2026-04-02").
  - Inline suppression comment `// shexli-ci: EGO-I-004 - <rationale>`.
  - Usage: `shexli --format json extension.zip`.
  - [GitHub 3v1n0/shexli-ci](https://github.com/3v1n0/shexli-ci)
  - Ubuntu extensions (AppIndicator, Tiling-Assistant) adopted it. Tiling-Assistant PR #473 (2026-09-20) "Handle shexli reports for 51 fixes". — [Tiling-Assistant #473](https://github.com/ubuntu/Tiling-Assistant/pull/473), [AppIndicator #670](https://github.com/ubuntu/gnome-shell-extension-appindicator/pull/670)
- CONFIRMED rule codes, quoted from EGO review pages:
  - EGO-P-006 "unnecessary build and translation artifacts should not be shipped": compiled `schemas/gschemas.compiled` should be removed for GNOME 45+.
  - EGO-P-007 "JavaScript files should be reachable from extension.js or prefs.js".
  - EGO-L-003 "signals connected by extension should be disconnected in disable()".
  - EGO-L-004 "main loop sources should be removed in disable()". Example finding: `GLib.idle_add` not removed.
  - Source: [EGO review 71294](https://extensions.gnome.org/review/71294)
- CONFIRMED: EGO-X-004 is synchronous file I/O, to be replaced with async Gio calls. — [nvme-monitor PR #38](https://github.com/rloutrel/gnome-extension-nvme-monitor/pull/38)
- UNCERTAIN: EGO-I-004 relates to internal/private API usage (Gi symbols, per the shexli-ci example). EGO-M-xxx codes appear to be metadata rules (seen only in a search summary). — [shexli-ci](https://github.com/3v1n0/shexli-ci)
- UNCERTAIN (search-summary claim): "EGO requires the package to pass shexli before upload." Primary sources call Shexli experimental and advisory; review 72956 shows it alongside a human review. Treat it as advisory but expect the reviewer to read it.

**EGO site and process events**
- CONFIRMED (secondary, Russian news site): reviews stopped on 2026-03-08 because of internet blockages in Iran, where the sole active reviewer lives. About 120 extensions were waiting before the GNOME 50 releases (Ubuntu 26.04, Fedora 44). The suggested user workaround was `gsettings set org.gnome.shell disable-extension-version-validation true`. — [comss.ru](https://www.comss.ru/page.php?id=20111)
- CONFIRMED: reviews were happening again by July 2026 (a JustPerfection review dated 2026-07-26 cited "EGO Review Guidelines: AI"). — [EGO review 72956](https://extensions.gnome.org/review/72956)

### Inferences (applied to Modern Clock)
- **Compiled schemas:** CLAUDE.md says to commit `gschemas.compiled` and that it "must be present in the zip". That is outdated. For 45+, ship only the XML; Shexli flags the compiled file as EGO-P-006. `gnome-extensions pack` already compiles schemas only if asked, so remove it from the zip.
- **Font install with `fc-cache` subprocess and writes to `~/.local/share/fonts`:** this conflicts with the "avoid spawning commands" best practice and the "Python/HTML modules require explicit user action to install" spirit. Expect reviewer pushback.
  - Safer option: load fonts without installing them. For example, call `Pango.FontMap`/fontconfig `FcConfigAppFontAddFile` via GI if available. Or make installation an explicit button in prefs, with async Gio file copies (EGO-X-004) and `Gio.Subprocess` cleanup.
  - No explicit rule about fonts was found, so this is an inference.
- **`Main.layoutManager._backgroundGroup` (private API):** no explicit ban. Expect a possible EGO-I-xxx advisory finding. Add a short justification in the submission notes, or use a shexli-ci inline directive locally.
- **Timeouts (the 50 ms and 500 ms repositions):** they must be removed in disable(), even if the callbacks already returned SOURCE_REMOVE (EGO-L-004).
- **metadata.json:**
  - Drop `version` (EGO sets it).
  - Drop `session-modes` if it is only `user`, and drop an empty `donations`.
  - `shell-version` may list 46–50 plus 51 only once 51 is stable. GNOME 51 was released around September 2026, so listing "51" should be fine; this is inferred and the exact release date was not verified.
  - Consider `settings-schema` in metadata.
- **AI-code risk:** the user's code was partly AI-assisted (CLAUDE.md exists). Remove defensive try/catch, `?.()` guards, and LLM-style comments before submitting.

### Gaps
- No full public list of Shexli rule codes was found. The rules live in the gitlab.gnome.org extensions-web `shexli` / `51-improvements` branch, which was not fetched.
- I found no official statement on whether Shexli findings block upload; primary sources call it "experimental".
- `version-name` rules: the guidelines page I fetched does not mention it. It is presumably still allowed as a free-text key, but this is unverified.
- No 2025–2026 changes to the EGO upload UI or queue policy were found beyond the Shexli section and the reviewer-availability incident.
- I found no information on `gnome-extensions-cli` or an official gnome-shell ESLint config update in 2025–2026; gjs.guide still just recommends ESLint.
- I could not confirm whether EGO accepts shell-version "51" (needs a check on the EGO upload page or Discourse).

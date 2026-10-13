// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

// The locale of the date and time names (LC_TIME, which GLib.DateTime.format() follows), as a
// BCP 47 tag, e.g. "tr_TR.UTF-8" -> "tr-TR". `undefined` (the JS default locale) if it has none,
// e.g. "C".
const TIME_LOCALE = GLib.get_language_names_with_category('LC_TIME')
    .map(name => name.replace(/[.@].*$/, '').replace('_', '-'))
    .find(tag => {
        try {
            Intl.getCanonicalLocales(tag);
            return true;
        } catch {
            return false;
        }
    });

const WEEKDAY_NAMES = {
    long: namesFor(7, '%A', d => GLib.DateTime.new_local(2024, 1, d, 0, 0, 0)),
    short: namesFor(7, '%a', d => GLib.DateTime.new_local(2024, 1, d, 0, 0, 0)),
};
const MONTH_NAMES = {
    long: namesFor(12, '%B', m => GLib.DateTime.new_local(2024, m, 1, 0, 0, 0)),
    short: namesFor(12, '%b', m => GLib.DateTime.new_local(2024, m, 1, 0, 0, 0)),
};
// Spaces, format/control characters (bidi marks, zero-width, soft hyphen), and the
// punctuation that appears in locale month/weekday names (e.g. "SEPT.", "D’ABRIL").
const IGNORED_RE = /[\p{Z}\p{Cf}.\-'\u02bc\u2018\u2019]/u;

/** Bundled font files in the extension's `fonts` folder, with the family each one provides. */
export const FONT_FILES = { 'Anurati.otf': 'Anurati', 'Poppins.ttf': 'Poppins' };

function namesFor(count, format, makeDate) {
    return Array.from({ length: count }, (v_, i) =>
        toTimeLocaleUpperCase(makeDate(i + 1).format(format))
    ).join('');
}
/**
 * Converts date or time text to uppercase following the rules of its language, e.g. Turkish
 * "pazartesi" -> "PAZARTESİ" (a plain toUpperCase() gives "PAZARTESI").
 *
 * @param {string} text - Text formatted by GLib.DateTime.format().
 * @returns {string} The text in uppercase.
 */
export function toTimeLocaleUpperCase(text) {
    return text.toLocaleUpperCase(TIME_LOCALE);
}

/**
 * Removes the characters that could break out of a quoted CSS font-family value.
 *
 * @param {string} fontFamily - The font family name from the settings.
 * @returns {string} The safe font family name.
 */
export function sanitizeFontFamily(fontFamily) {
    return fontFamily.replace(/['"\\;{}]/g, '').trim();
}

/**
 * Strips the trailing comma that version 3.0 left in the font settings keys.
 *
 * Version 3.0 saved Pango font descriptions, which end with a comma for families ending in a style
 * word (e.g. "Open Sans Condensed,"). Both the shell and the preferences migrate the keys, since
 * after an update on Wayland the preferences run the new code before the shell does.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {string} key - The font settings key.
 */
export function migrateFontKey(settings, key) {
    const font = settings.get_string(key);
    if (font.endsWith(',')) settings.set_string(key, font.slice(0, -1).trim());
}

// Returns the requested font, or `null` if it is not installed (or not loaded yet), instead of
// the substitute that Pango would silently pick.
function loadFont(fontFamily) {
    const family = sanitizeFontFamily(fontFamily);
    const fontMap = PangoCairo.FontMap.get_default();
    const context = fontMap.create_context();
    const desc = new Pango.FontDescription();
    desc.set_family(family);
    desc.set_size(12 * Pango.SCALE);
    const font = context.load_font(desc);
    if (!font) return null;

    // Generic families such as "Sans" or "Monospace" load a font with another name, but they are
    // listed by the font map (and the font dialog), unlike a missing font
    const loadedFamily = font.describe().get_family();
    if (loadedFamily.toLowerCase() !== family.toLowerCase() && !fontMap.get_family(family))
        return null;
    return font;
}
function coversText(font, text) {
    return [...text].every(ch => IGNORED_RE.test(ch) || font.has_char(ch));
}
function getSupport(fontFamily, names) {
    const font = loadFont(fontFamily);
    if (!font) return { long: false, short: false };
    return { long: coversText(font, names.long), short: coversText(font, names.short) };
}

// Font maps the bundled fonts were loaded into. The module lives as long as the process, so
// this keeps every enable (e.g. after each screen unlock) from loading them again.
const fontMapsWithBundledFonts = new WeakSet();

/**
 * Loads the bundled fonts straight from their files into the given font maps, so they can be used
 * right away without being installed. Each map is only loaded once per process, unless it lost
 * them since: GTK clears its font map when fonts are installed or removed
 * (`pango_fc_font_map_config_changed()`), which also drops the loaded files.
 *
 * The fonts are loaded even when a map already provides their family, e.g. from copies made by an
 * older version: from Pango 1.56.4, loaded faces replace the existing ones with the same name.
 *
 * Needs `Pango.FontMap.add_font_file()`, added in Pango 1.56 (GNOME 48).
 *
 * @param {string} fontsDir - The path of the folder holding the bundled fonts.
 * @param {Pango.FontMap[]} fontMaps - The font maps to load the fonts into.
 * @returns {boolean} `false` if Pango is too old to load font files, `true` otherwise.
 * @throws {GLib.Error} If a font file can't be loaded.
 */
export function registerBundledFonts(fontsDir, fontMaps) {
    if (!fontMaps.every(fontMap => typeof fontMap.add_font_file === 'function')) return false;

    new Set(fontMaps).forEach(fontMap => {
        if (
            fontMapsWithBundledFonts.has(fontMap) &&
            Object.values(FONT_FILES).every(family => fontMap.get_family(family))
        )
            return;
        Object.keys(FONT_FILES).forEach(fileName =>
            fontMap.add_font_file(GLib.build_filenamev([fontsDir, fileName]))
        );
        fontMapsWithBundledFonts.add(fontMap);
    });
    return true;
}

/**
 * Checks whether loading a font file replaces the faces a font map already has with the same name.
 * Before Pango 1.56.4, the file is added next to them and either one may be used.
 *
 * @returns {boolean} `true` if loaded fonts replace the existing ones.
 */
export function loadedFontsReplaceExisting() {
    return Pango.version_check(1, 56, 4) === null;
}

/**
 * Returns the text to use when showing a font family name in that font.
 *
 * Display fonts such as Anurati often have no lowercase glyphs, so the uppercase name is tried
 * next. Returns `null` if the font cannot render its own name, or is not available.
 *
 * @param {string} fontFamily - The font family name.
 * @returns {string|null} The name as given, the name in uppercase, or `null`.
 */
export function getFontPreviewText(fontFamily) {
    const font = loadFont(fontFamily);
    if (!font) return null;
    if (coversText(font, fontFamily)) return fontFamily;
    if (coversText(font, fontFamily.toUpperCase())) return fontFamily.toUpperCase();
    return null;
}

/**
 * Checks whether a font can render every weekday name in the current locale.
 *
 * The check is done against uppercase names, matching how the extension displays them.
 * Spaces, periods, hyphens, and apostrophes are ignored. Returns `false` for both formats if the
 * font can't be loaded.
 *
 * @param {string} fontFamily - The font family name.
 * @returns {{long: boolean, short: boolean}} The object holding the results on whether the font
 * covers the weekday names full (`%A`, e.g. "MONDAY") and abbreviated (`%a`, e.g. "MON").
 */
export function getWeekdayFontSupport(fontFamily) {
    return getSupport(fontFamily, WEEKDAY_NAMES);
}

/**
 * Checks whether a font can render every month name in the current locale.
 *
 * The check is done against uppercase names, matching how the extension displays them.
 * Spaces, periods, hyphens, and apostrophes are ignored. Returns `false` for both formats if the
 * font can't be loaded.
 *
 * @param {string} fontFamily - The font family name.
 * @returns {{long: boolean, short: boolean}} The object holding the results on whether the font
 * covers the month names full (`%B`, e.g. "JANUARY") and abbreviated (`%b`, e.g. "JAN").
 */
export function getMonthFontSupport(fontFamily) {
    return getSupport(fontFamily, MONTH_NAMES);
}

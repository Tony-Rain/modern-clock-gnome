// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

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
        makeDate(i + 1)
            .format(format)
            .toUpperCase()
    ).join('');
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

// Returns the requested font, or `null` if it is not installed (or not loaded yet), instead of
// the substitute that Pango would silently pick.
function loadFont(fontFamily) {
    const family = sanitizeFontFamily(fontFamily);
    const context = PangoCairo.FontMap.get_default().create_context();
    const desc = new Pango.FontDescription();
    desc.set_family(family);
    desc.set_size(12 * Pango.SCALE);
    const font = context.load_font(desc);
    if (!font || font.describe().get_family().toLowerCase() !== family.toLowerCase()) return null;
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

/**
 * Loads the bundled fonts straight from their files into the given font maps, so they can be used
 * right away without being installed. Fonts a map already provides are skipped, so calling this
 * again (e.g. on every enable) doesn't add them twice.
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

    new Set(fontMaps).forEach(fontMap =>
        Object.entries(FONT_FILES).forEach(([fileName, family]) => {
            if (!fontMap.get_family(family))
                fontMap.add_font_file(GLib.build_filenamev([fontsDir, fileName]));
        })
    );
    return true;
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

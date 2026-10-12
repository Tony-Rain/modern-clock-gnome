// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { getFontPreviewText, migrateFontKey } from '../lib/utils.js';
import { createColorButton } from './colorButton.js';
import { createScaleRow } from './scaleRow.js';
import { connectSetting } from './settingsHandlers.js';

/**
 * Creates a preferences page for a clock label (weekday, date or time).
 *
 * The page contains an "Appearance" group with rows for visibility, size, letter spacing, color and
 * decoration. Each row is bound to the GSettings key `<keyPrefix>-<suffix>`.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {object} options - The page configuration.
 * @param {string} options.pageTitle - The page title.
 * @param {string} options.pageIcon - The icon name for the page.
 * @param {string} options.keyPrefix - The prefix of the settings keys the page controls.
 * @returns {Adw.PreferencesPage} The page ready to be added to the preferences window.
 */
export function createLabelPage(settings, { pageTitle, pageIcon, keyPrefix }) {
    const page = new Adw.PreferencesPage({
        title: pageTitle,
        icon_name: pageIcon,
    });

    const keys = {
        enabled: `${keyPrefix}-enabled`,
        font: `${keyPrefix}-font`,
        sizeScale: `${keyPrefix}-size-scale`,
        trackingScale: `${keyPrefix}-tracking-scale`,
        color: `${keyPrefix}-color`,
        colorEnabled: `${keyPrefix}-color-enabled`,
        deco: `${keyPrefix}-decorations`,
    };

    const appearanceGroup = new Adw.PreferencesGroup({ title: _('Appearance') });
    page.add(appearanceGroup);

    //#region Show
    const enabledRow = new Adw.SwitchRow({ title: _('Show') });
    settings.bind(keys.enabled, enabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    appearanceGroup.add(enabledRow);
    //#endregion

    //#region Font
    const fontRow = new Adw.ActionRow({ title: _('Font') });

    // A plain button instead of Gtk.FontDialogButton, so the name can be shown in its own font
    // even for display fonts without lowercase glyphs (see getFontPreviewText)
    const fontLabel = new Gtk.Label({ ellipsize: Pango.EllipsizeMode.END, max_width_chars: 16 });
    const fontButton = new Gtk.Button({ child: fontLabel, valign: Gtk.Align.CENTER });
    const fontDialog = new Gtk.FontDialog({ modal: true });
    const fontResetButton = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: _('Reset to default'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });

    const defaultFont = settings.get_default_value(keys.font).deep_unpack();
    const fontFamilies = PangoCairo.FontMap.get_default().list_families();
    const findFontFamily = family =>
        family
            ? (fontFamilies.find(font => font.get_name().toLowerCase() === family.toLowerCase()) ??
              null)
            : null;

    const showFont = family => {
        const previewText = getFontPreviewText(family);
        const attributes = new Pango.AttrList();
        if (previewText) attributes.insert(Pango.attr_family_new(family));
        fontLabel.set_attributes(attributes);
        fontLabel.set_label(previewText ?? family);
    };

    const syncFontFromSettings = () => {
        // The key holds a family name, not a font description: parsing it with
        // Pango.FontDescription.from_string() would strip words such as "Condensed" or "Light"
        // (e.g. "Open Sans Condensed" -> "Open Sans")
        const family = settings.get_string(keys.font);

        // - if the font is registered: display it
        // - else if it is not the bundled default font: a genuinely invalid value, so reset the key
        // - else: this is the bundled default font, not yet registered in the font map. Display
        //   its name in the default font.
        if (!findFontFamily(family) && family !== defaultFont) {
            settings.reset(keys.font);
            return;
        }
        showFont(family);
        fontResetButton.set_visible(family !== defaultFont);
    };
    migrateFontKey(settings, keys.font);
    syncFontFromSettings();

    fontButton.connect('clicked', () => {
        fontDialog.choose_family(
            fontButton.get_root(),
            findFontFamily(settings.get_string(keys.font)),
            null,
            (dialog, result) => {
                let chosen;
                try {
                    chosen = dialog.choose_family_finish(result);
                } catch {
                    return; // dialog dismissed
                }
                settings.set_string(keys.font, chosen.get_name());
            }
        );
    });
    fontResetButton.connect('clicked', () => settings.reset(keys.font));
    connectSetting(settings, keys.font, syncFontFromSettings);

    const fontBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    fontBox.append(fontResetButton);
    fontBox.append(fontButton);
    fontRow.add_suffix(fontBox);
    appearanceGroup.add(fontRow);
    //#endregion

    //#region Size
    const sizeScaleRow = createScaleRow(settings, {
        title: _('Size'),
        key: keys.sizeScale,
        marks: [_('Small'), _('Large')],
    });
    appearanceGroup.add(sizeScaleRow);
    //#endregion

    //#region Letter spacing
    const trackingScaleRow = createScaleRow(settings, {
        title: _('Letter Spacing'),
        key: keys.trackingScale,
        marks: [_('Narrow'), _('Wide')],
    });
    appearanceGroup.add(trackingScaleRow);
    //#endregion

    //#region Color
    const colorRow = new Adw.ActionRow({ title: _('Color') });

    const colorButton = createColorButton(settings, keys.color);

    const toggle = new Gtk.CheckButton({
        tooltip_text: _('Use custom color'),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(keys.colorEnabled, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind(keys.colorEnabled, colorButton, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

    const colorBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    colorBox.append(toggle);
    colorBox.append(colorButton);
    colorRow.add_suffix(colorBox);
    appearanceGroup.add(colorRow);
    //#endregion

    //#region Decoration
    const decoRow = new Adw.PreferencesRow({ title: _('Decoration'), activatable: false });

    const decoEntries = ['left', 'right'].map(
        side =>
            new Gtk.Entry({
                placeholder_text: side === 'left' ? _('Prefix') : _('Suffix'),
                valign: Gtk.Align.CENTER,
                hexpand: true,
                xalign: side === 'left' ? 1 : 0,
            })
    );

    let syncingDeco = false;
    const syncDecoFromSettings = () => {
        const stored = settings.get_strv(keys.deco);
        syncingDeco = true;
        decoEntries.forEach((entry, i) => {
            const value = typeof stored[i] === 'string' ? stored[i] : '';
            if (entry.get_text() !== value) entry.set_text(value);
        });
        syncingDeco = false;
    };
    syncDecoFromSettings();

    decoEntries.forEach(entry =>
        entry.connect('notify::text', () => {
            // syncing from a settings change: writing back would store the entries half-updated,
            // and turn a reset key into a set one
            if (syncingDeco) return;
            settings.set_strv(
                keys.deco,
                decoEntries.map(e => e.get_text())
            );
        })
    );
    connectSetting(settings, keys.deco, syncDecoFromSettings);

    const decoBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_start: 12,
        margin_end: 12,
        margin_top: 8,
        margin_bottom: 8,
    });
    decoBox.append(decoEntries[0]);
    decoBox.append(decoEntries[1]);
    decoRow.set_child(decoBox);
    appearanceGroup.add(decoRow);
    //#endregion

    return page;
}

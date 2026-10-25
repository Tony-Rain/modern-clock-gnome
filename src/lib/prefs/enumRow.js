// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { connectSetting } from './settingsHandlers.js';

/**
 * Creates a row to pick the value of an enum settings key.
 *
 * The row uses an Adw.ToggleGroup when the system libadwaita has it (1.7+), and an Adw.ComboRow
 * otherwise. The availability of the widget is checked rather than the GNOME Shell version, since
 * the preferences run with the system libadwaita.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {object} options - The row configuration.
 * @param {string} options.title - The row title.
 * @param {string} options.key - The enum settings key to bind.
 * @param {string[]} options.labels - The label of each enum value, in the order of their numeric
 * values in the schema (0, 1, 2...).
 * @param {boolean} [options.wide=false] - Whether the toggles span the whole row instead of sitting
 * next to the title. The title is then only used for search.
 * @returns {Adw.PreferencesRow} The row ready to add to a preferences group.
 */
export function createEnumRow(settings, { title, key, labels, wide = false }) {
    let row;
    let setIndex;

    // Skips the write when the row only follows a settings change, so that a reset key stays reset
    const setEnum = index => {
        if (settings.get_enum(key) !== index) settings.set_enum(key, index);
    };

    if ('ToggleGroup' in Adw) {
        const toggleGroup = new Adw.ToggleGroup({
            valign: Gtk.Align.CENTER,
            homogeneous: true,
            ...(wide && { margin_start: 12, margin_end: 12, margin_top: 8, margin_bottom: 8 }),
        });
        labels.forEach(label => toggleGroup.add(new Adw.Toggle({ label })));

        if (wide) {
            row = new Adw.PreferencesRow({ title, activatable: false });
            row.set_child(toggleGroup);
        } else {
            row = new Adw.ActionRow({ title });
            row.add_suffix(toggleGroup);
        }

        setIndex = index => toggleGroup.set_active(index);
        setIndex(settings.get_enum(key));
        toggleGroup.connect('notify::active', () => setEnum(toggleGroup.get_active()));
    } else {
        row = new Adw.ComboRow({
            title,
            model: Gtk.StringList.new(labels),
            selected: settings.get_enum(key),
        });

        setIndex = index => row.set_selected(index);
        row.connect('notify::selected', () => setEnum(row.get_selected()));
    }

    connectSetting(settings, key, () => setIndex(settings.get_enum(key)));

    return row;
}

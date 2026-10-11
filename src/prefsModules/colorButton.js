// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SWATCH_WIDTH = 32;
const SWATCH_HEIGHT = 20;
const SWATCH_RADIUS = 4;
const CHECKER_SIZE = 5;

/**
 * Creates a button showing a color swatch that opens a color picker.
 *
 * Unlike Gtk.ColorDialogButton, the picker writes every change to the settings key immediately, so
 * the clock previews the color while it is being picked. Cancelling the picker restores the color
 * it was opened with.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {string} key - The settings key holding the color as a CSS color string.
 * @returns {Gtk.Button} The button ready to add to a row.
 */
export function createColorButton(settings, key) {
    let rgba = new Gdk.RGBA();

    const swatch = new Gtk.DrawingArea({
        content_width: SWATCH_WIDTH,
        content_height: SWATCH_HEIGHT,
    });
    swatch.set_draw_func((_area, cr, width, height) => {
        roundedRect(cr, width, height, SWATCH_RADIUS);
        cr.clip();

        // checkerboard under translucent colors, like Gtk.ColorDialogButton
        if (rgba.alpha < 1) {
            cr.setSourceRGB(0.8, 0.8, 0.8);
            cr.paint();
            cr.setSourceRGB(0.6, 0.6, 0.6);
            for (let y = 0; y < height; y += CHECKER_SIZE) {
                for (
                    let x = (y / CHECKER_SIZE) % 2 ? CHECKER_SIZE : 0;
                    x < width;
                    x += 2 * CHECKER_SIZE
                )
                    cr.rectangle(x, y, CHECKER_SIZE, CHECKER_SIZE);
            }
            cr.fill();
        }

        Gdk.cairo_set_source_rgba(cr, rgba);
        cr.paint();
        cr.$dispose();
    });

    const button = new Gtk.Button({ child: swatch, valign: Gtk.Align.CENTER });

    const syncFromSettings = () => {
        const parsed = new Gdk.RGBA();
        if (!parsed.parse(settings.get_string(key))) {
            settings.reset(key);
            return;
        }
        rgba = parsed;
        swatch.queue_draw();
    };
    syncFromSettings();
    settings.connect(`changed::${key}`, syncFromSettings);

    button.connect('clicked', () => openPicker(button, settings, key, rgba));

    return button;
}

/**
 * Opens a color picker dialog that writes every color change to the settings key immediately.
 *
 * @param {Gtk.Widget} parent - The widget the dialog is presented for.
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {string} key - The settings key holding the color.
 * @param {Gdk.RGBA} initialRgba - The color to start from.
 */
function openPicker(parent, settings, key, initialRgba) {
    const initialColor = settings.get_string(key);
    let confirmed = false;

    // Gtk.ColorChooserWidget is deprecated since GTK 4.10, but Gtk.ColorDialog has no way to
    // report the color before it is confirmed
    const chooser = new Gtk.ColorChooserWidget({
        use_alpha: true,
        rgba: initialRgba,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });
    // fires on every palette click and while dragging in the custom color editor
    chooser.connect('notify::rgba', () => {
        settings.set_string(key, chooser.get_rgba().to_string());
    });

    const dialog = new Adw.Dialog({ title: _('Color') });

    const cancelButton = new Gtk.Button({ label: _('Cancel') });
    cancelButton.connect('clicked', () => dialog.close());

    const selectButton = new Gtk.Button({ label: _('Select'), css_classes: ['suggested-action'] });
    selectButton.connect('clicked', () => {
        confirmed = true;
        dialog.close();
    });

    const header = new Adw.HeaderBar({
        show_start_title_buttons: false,
        show_end_title_buttons: false,
    });
    header.pack_start(cancelButton);
    header.pack_end(selectButton);

    const toolbarView = new Adw.ToolbarView({ content: chooser });
    toolbarView.add_top_bar(header);
    dialog.set_child(toolbarView);
    dialog.set_default_widget(selectButton);

    // Escape and the Cancel button both end up here
    dialog.connect('closed', () => {
        if (!confirmed) settings.set_string(key, initialColor);
    });

    dialog.present(parent);
}

/**
 * Adds a rounded rectangle covering the whole area to the cairo path.
 *
 * @param {object} cr - The cairo context.
 * @param {number} width - The rectangle width.
 * @param {number} height - The rectangle height.
 * @param {number} radius - The corner radius.
 */
function roundedRect(cr, width, height, radius) {
    cr.newSubPath();
    cr.arc(width - radius, radius, radius, -Math.PI / 2, 0);
    cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
    cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(radius, radius, radius, Math.PI, (3 * Math.PI) / 2);
    cr.closePath();
}

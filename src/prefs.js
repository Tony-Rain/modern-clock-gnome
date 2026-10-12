// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import PangoCairo from 'gi://PangoCairo';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { createEnumRow } from './prefsModules/enumRow.js';
import { createLabelPage } from './prefsModules/labelPage.js';
import { createMainPage } from './prefsModules/mainPage.js';
import { connectSetting, disconnectSettings } from './prefsModules/settingsHandlers.js';
import { getMonthFontSupport, registerBundledFonts } from './lib/utils.js';

export default class ModernClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.default_width = 600;
        window.default_height = 720;

        // Add paths for custom icons:
        // - 'assets' for the logo
        // - 'assets/icons' for the symbolic icons, which GTK only recolors to match the theme
        //   when they follow the icon theme layout (hicolor/scalable/actions)
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        [['assets'], ['assets', 'icons']].forEach(dirs => {
            const iconThemePath = GLib.build_filenamev([this.path, ...dirs]);
            if (!iconTheme.get_search_path().includes(iconThemePath))
                iconTheme.add_search_path(iconThemePath);
        });

        // Load the bundled fonts so they can be previewed and picked before they are installed
        // (Pango 1.56+ only, see registerBundledFonts)
        try {
            registerBundledFonts(GLib.build_filenamev([this.path, 'fonts']), [
                PangoCairo.FontMap.get_default(),
            ]);
        } catch (e) {
            console.warn(`[${this.metadata.name}] failed to load the bundled fonts:`, e);
        }

        const settings = this.getSettings();

        // The preferences process can outlive the window (see connectSetting)
        window.connect('close-request', () => {
            disconnectSettings(settings);
            return false;
        });

        //#region Main page
        window.add(
            createMainPage(settings, this.metadata, {
                pageTitle: _('General'),
                pageIcon: 'org.gnome.Settings-symbolic',
            })
        );
        //#endregion

        //#region Label pages
        const weekdayPage = createLabelPage(settings, {
            pageTitle: _('Weekday'),
            pageIcon: 'today-alt2-symbolic',
            keyPrefix: 'weekday',
        });

        const datePage = createLabelPage(settings, {
            pageTitle: _('Date'),
            pageIcon: 'month-symbolic',
            keyPrefix: 'date',
        });
        const timePage = createLabelPage(settings, {
            pageTitle: _('Time'),
            pageIcon: 'preferences-system-time-symbolic',
            keyPrefix: 'time',
        });
        [weekdayPage, datePage, timePage].forEach(page => window.add(page));
        //#endregion

        //#region Weekday format row
        const weekdayFormatGroup = new Adw.PreferencesGroup();
        weekdayPage.add(weekdayFormatGroup);
        weekdayFormatGroup.add(
            createEnumRow(settings, {
                title: _('Format'),
                key: 'weekday-format', // 0 = 'long', 1 = 'short'
                labels: [_('Full'), _('Abbreviated')],
            })
        );
        //#endregion

        //#region Date format row
        const dateFormatGroup = new Adw.PreferencesGroup();
        datePage.add(dateFormatGroup);

        const dateFormatRow = new Adw.ComboRow({
            title: _('Format'),
            model: Gtk.StringList.new([]),
        });

        const updateFormatExampleList = () => {
            const exampleDate = GLib.DateTime.new_local(2026, 9, 1, 0, 0, 0);
            const mode = settings.get_string('language-mode');
            const en = mode === 'english';
            const auto = mode === 'auto';
            const mfs = getMonthFontSupport(settings.get_string('date-font'));

            // date-format: 0 = 'numeric', 1 = 'numeric-us', 2 = 'text', 3 = 'long'
            const strings = [
                exampleDate.format('%d.%m.%Y'),
                exampleDate.format('%m/%d/%Y'),
                en || (auto && !mfs.short)
                    ? '01 SEP 2026'
                    : exampleDate.format('%d %b %Y').toUpperCase(),
                en || (auto && !mfs.long)
                    ? '01 SEPTEMBER 2026'
                    : exampleDate.format('%d %B %Y').toUpperCase(),
            ];
            dateFormatRow.model.splice(0, dateFormatRow.model.get_n_items(), strings);
        };
        updateFormatExampleList();

        dateFormatRow.set_selected(settings.get_enum('date-format'));
        dateFormatRow.connect('notify::selected', () =>
            settings.set_enum('date-format', dateFormatRow.get_selected())
        );
        ['language-mode', 'date-font'].forEach(key =>
            connectSetting(settings, key, () => updateFormatExampleList())
        );
        connectSetting(settings, 'date-format', () =>
            dateFormatRow.set_selected(settings.get_enum('date-format'))
        );

        dateFormatGroup.add(dateFormatRow);
        //#endregion

        //#region Time format row
        const timeFormatGroup = new Adw.PreferencesGroup();
        timePage.add(timeFormatGroup);
        timeFormatGroup.add(
            createEnumRow(settings, {
                title: _('Format'),
                key: 'time-format', // 0 = '24h', 1 = '12h'
                labels: [_('24-hour'), _('12-hour')],
            })
        );
        //#endregion
    }
}

// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {
    gettext as _,
    pgettext,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { createAboutRow } from './aboutRow.js';
import { createEnumRow } from './enumRow.js';
import { createScaleRow } from './scaleRow.js';
import { connectSetting } from './settingsHandlers.js';

/**
 * Creates the main preferences page with the layout, language, reset and information groups.
 *
 * The language group is left out when the LC_TIME language is already English, since all
 * three modes behave the same there.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {ExtensionMetadata} metadata - The metadata object from metadata.json.
 * @param {object} options - The page configuration.
 * @param {string} options.pageTitle - The page title.
 * @param {string} options.pageIcon - The icon name for the page.
 * @returns {Adw.PreferencesPage} The page ready to add to the preferences window.
 */
export function createMainPage(settings, metadata, { pageTitle, pageIcon }) {
    const page = new Adw.PreferencesPage({
        title: pageTitle,
        icon_name: pageIcon,
    });

    //#region Layout
    const layoutGroup = new Adw.PreferencesGroup({ title: _('Layout') });
    page.add(layoutGroup);

    const horizontalAxisRow = createScaleRow(settings, {
        title: _('Horizontal'),
        key: 'position-x',
        marks: [_('Left'), _('Right')],
    });
    layoutGroup.add(horizontalAxisRow);
    const verticalAxisRow = createScaleRow(settings, {
        title: _('Vertical'),
        key: 'position-y',
        marks: [_('Top'), _('Bottom')],
        inverted: true,
    });
    layoutGroup.add(verticalAxisRow);
    //#endregion

    //#region Find format language
    const systemLocaleSettings = new Gio.Settings({ schema_id: 'org.gnome.system.locale' });
    // Explicit "Formats" override, otherwise the process's LC_TIME
    const regionOverride = systemLocaleSettings.get_string('region');
    const lcTime =
        regionOverride !== ''
            ? regionOverride
            : GLib.get_language_names_with_category('LC_TIME')[0];
    const lcTimeLang = lcTime.split(/[_.@]/)[0];
    const isLcTimeEnglish = ['en', 'C', 'POSIX'].includes(lcTimeLang);
    //#endregion

    //#region Language
    // only relevant if the time format language isn't already in English
    if (!isLcTimeEnglish) {
        const langGroup = new Adw.PreferencesGroup({ title: _('Language') });
        page.add(langGroup);

        // language-mode: 'system'=0, 'auto'=1, 'english'=2
        const langModes = [
            {
                label: _('System'),
                hint: _(
                    'Use your time format language. Some characters may appear in a different font.'
                ),
            },
            {
                label: _('Auto'),
                hint: _(
                    'Use your time format language, falling back to English if the font does not support it.'
                ),
            },
            {
                label: _('English'),
                hint: _('Use English.'),
            },
        ];

        // Subtitle/Hint
        const langSubRow = new Adw.PreferencesRow({ activatable: false });
        const langSubLabel = new Gtk.Label({
            wrap: true,
            justify: Gtk.Justification.CENTER,
            hexpand: true,
            margin_start: 12,
            margin_end: 12,
            margin_top: 8,
            margin_bottom: 8,
            css_classes: ['subtitle'],
        });
        const updateLangSub = () =>
            langSubLabel.set_label(langModes[settings.get_enum('language-mode')].hint);
        updateLangSub();
        connectSetting(settings, 'language-mode', updateLangSub);
        langSubRow.set_child(langSubLabel);

        // Language Toggle
        const langRow = createEnumRow(settings, {
            title: _('Mode'),
            key: 'language-mode',
            labels: langModes.map(mode => mode.label),
            wide: true,
        });

        langGroup.add(langRow);
        langGroup.add(langSubRow);
    }
    //#endregion

    //#region Reset
    const resetGroup = new Adw.PreferencesGroup({
        title: pgettext('preferences group title', 'Reset'),
    });
    page.add(resetGroup);

    const resetRow = new Adw.ActionRow({
        title: _('All Settings'),
        subtitle: _('Restore every setting to its default value'),
    });
    const resetButton = new Gtk.Button({
        label: _('Reset'),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
    });
    resetRow.add_suffix(resetButton);
    resetGroup.add(resetRow);

    resetButton.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset All Settings?'),
            body: _('Every setting of Modern Clock will be restored to its default value.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (dialog_, response) => {
            if (response !== 'reset') return;

            // Reset every key in a single write, so the shell never redraws the clock with half
            // of the settings reset. A separate object is used because delay() can't be undone.
            const batch = new Gio.Settings({ settings_schema: settings.settings_schema });
            batch.delay();
            batch.settings_schema.list_keys().forEach(key => batch.reset(key));
            batch.apply();
        });
        dialog.present(resetRow);
    });
    //#endregion

    //#region About
    const aboutGroup = new Adw.PreferencesGroup({ title: _('Information') });
    page.add(aboutGroup);

    const aboutRow = createAboutRow(metadata);
    aboutGroup.add(aboutRow);
    //#endregion

    return page;
}

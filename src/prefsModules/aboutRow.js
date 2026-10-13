// SPDX-FileCopyrightText: 2024-2026 Djinn Alexio
// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

// CONTRIBUTORS: To be credited in the About dialog, add your name(s) to the matching property
// (artists, designers, developers, documenters) in the AboutDialog below, optionally followed
// by an <email> or a URL.

/**
 * Creates a row that opens an AboutDialog window with information about the extension.
 *
 * @param {ExtensionMetadata} metadata - The metadata object from metadata.json.
 * @returns {Adw.ActionRow} The activatable row that opens the AboutDialog.
 */
export function createAboutRow(metadata) {
    const row = new Adw.ActionRow({
        title: _('About Modern Clock'),
        activatable: true,
    });
    row.add_prefix(new Gtk.Image({ icon_name: 'help-about-symbolic' }));
    row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));

    const version = metadata['version-name'] ?? '';
    const getDebugInfo = () => {
        const build = metadata.version ? ` (${metadata.version})` : '';
        const gtkVersion = `${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`;
        const adwVersion = `${Adw.get_major_version()}.${Adw.get_minor_version()}.${Adw.get_micro_version()}`;
        const sessionType = GLib.getenv('XDG_SESSION_TYPE') ?? 'Unknown';
        const system = GLib.get_os_info('NAME') ?? 'Unknown';
        const systemVersion =
            GLib.get_os_info('VERSION') ??
            GLib.get_os_info('VERSION_ID') ??
            GLib.get_os_info('BUILD_ID') ??
            '';

        return `- ${metadata.name} version: ${version}${build}
- GNOME version: ${Config.PACKAGE_VERSION}
- GTK version: ${gtkVersion}
- Libadwaita version: ${adwVersion}

- Session type: ${sessionType}
- System: ${system} ${systemVersion}`.trim();
    };

    //#region About dialog
    row.connect('activated', () => {
        const aboutWindow = new Adw.AboutDialog({
            application_icon: 'modern-clock-gnome-logo',
            application_name: metadata.name,
            artists: [],
            comments: metadata.description,
            copyright: '© 2026 Modern Clock for GNOME Contributors',
            debug_info: getDebugInfo(),
            designers: [],
            developer_name: 'Tony Rain',
            developers: [
                'Tony Rain https://github.com/Tony-Rain',
                'Djinn Alexio https://gitlab.gnome.org/DjinnAlexio',
            ],
            documenters: [],
            issue_url: 'https://github.com/Tony-Rain/modern-clock-gnome/issues',
            license_type: Gtk.License.GPL_3_0,
            release_notes_version: version,
            // The `release_notes` string uses HTML format and supports paragraphs <p>,
            // emphasis (italics) <em>, code <code>, and ordered <ol> and unordered <ul> lists
            // with <li> list items.
            release_notes: '',
            support_url: '',
            // Translators: To be credited in the "About" dialog, put your name(s) here, optionally
            // followed by an <email> or a URL. One translator per line.
            translator_credits: _('translator_credits'),
            version,
            website: metadata.url,
        });
        aboutWindow.add_link(
            _('Extension Page'),
            'https://extensions.gnome.org/extension/9882/modern-clock/'
        );
        aboutWindow.add_acknowledgement_section(_('Based on'), [
            'Modern Clock for KDE https://github.com/Prayag2/kde_modernclock',
        ]);
        aboutWindow.add_acknowledgement_section(_('Fonts'), [
            'Anurati https://www.behance.net/gallery/33704618/ANURATI-Free-font',
            'Poppins https://github.com/itfoundry/poppins',
        ]);
        aboutWindow.present(row);
    });
    //#endregion
    return row;
}

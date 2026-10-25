// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Handler IDs connected through connectSetting, per settings object
const handlerIds = new WeakMap();

/**
 * Connects a handler to the changes of a settings key, keeping its ID so that
 * disconnectSettings() can disconnect it.
 *
 * The preferences process can outlive its window, so handlers left connected would keep the closed
 * window alive and keep updating it.
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 * @param {string} key - The settings key to watch.
 * @param {Function} handler - The function called when the key changes.
 */
export function connectSetting(settings, key, handler) {
    if (!handlerIds.has(settings)) handlerIds.set(settings, []);
    handlerIds.get(settings).push(settings.connect(`changed::${key}`, handler));
}

/**
 * Disconnects every handler connected to a settings object through connectSetting().
 *
 * @param {Gio.Settings} settings - The settings object for this extension.
 */
export function disconnectSettings(settings) {
    handlerIds.get(settings)?.forEach(id => settings.disconnect(id));
    handlerIds.delete(settings);
}

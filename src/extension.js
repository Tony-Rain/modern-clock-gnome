// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {
    FONT_FILES,
    getMonthFontSupport,
    getWeekdayFontSupport,
    registerBundledFonts,
    sanitizeFontFamily,
} from './lib/utils.js';

//#region Constants
// -- Base dimensions for 1080p ------------------------------------------------
const BASE_HEIGHT = 1080;
// Size, letter spacing and top padding of each line in px, with the sliders in their default
// middle position (scale 1.0)
const BASE_DIMENSIONS = {
    weekday: { size: 96, letterSpacing: 21, paddingTop: 0 },
    date: { size: 24, letterSpacing: 4, paddingTop: 1 },
    time: { size: 24, letterSpacing: 4, paddingTop: 0.5 },
};
// SCALE_MIN * SCALE_MAX = 1 so that slider=0.5 can give scale=1.0
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;
// -- English ------------------------------------------------------------------
const EN_WEEKDAYS_LONG = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];
const EN_MONTH_LONG = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
];
const EN_WEEKDAY_NAMES = {
    long: EN_WEEKDAYS_LONG,
    short: EN_WEEKDAYS_LONG.map(m => m.slice(0, 3)),
};
const EN_MONTH_NAMES = { long: EN_MONTH_LONG, short: EN_MONTH_LONG.map(m => m.slice(0, 3)) };
// -- Color --------------------------------------------------------------------
const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;
const FALLBACK_COLOR = 'rgba(255,255,255,1)'; // white
//#endregion

//#region ClockLayout
// Places the clock inside its holder, which covers the monitor's work area. Doing it in the
// layout pass itself means a size change (fonts loading, a new letter spacing...) is never drawn
// for a frame at the old position.
const ClockLayout = GObject.registerClass(
    { GTypeName: 'ModernClockLayout' },
    class extends Clutter.LayoutManager {
        constructor() {
            super();
            this._factorX = 0.5;
            this._factorY = 0.5;
        }

        setFactors(factorX, factorY) {
            if (this._factorX === factorX && this._factorY === factorY) return;
            this._factorX = factorX;
            this._factorY = factorY;
            this.layout_changed();
        }

        vfunc_get_preferred_width(_container, _forHeight) {
            return [0, 0];
        }

        vfunc_get_preferred_height(_container, _forWidth) {
            return [0, 0];
        }

        vfunc_allocate(container, box) {
            const [width, height] = box.get_size();
            container.get_children().forEach(child => {
                // The clock spans the whole width of the holder, and its lines are centered inside
                // it. That way, the position of a line never depends on the width of another one
                // (e.g. the date doesn't move when the weekday letter spacing changes), and it is
                // rounded only once. Off-center positions shift the whole span, still with a
                // single rounding.
                const [, blockWidth] = child.get_preferred_width(-1);
                const [, blockHeight] = child.get_preferred_height(width);
                const center = this._factorX * width + (0.5 - this._factorX) * blockWidth;
                const x = Math.round(center - width / 2);
                const y = Math.round(this._factorY * (height - blockHeight));
                child.allocate(
                    new Clutter.ActorBox({ x1: x, y1: y, x2: x + width, y2: y + blockHeight })
                );
            });
        }
    }
);
//#endregion

export default class ModernClockExtension extends Extension {
    //#region enable
    enable() {
        // -- Version check ----------------------------------------------------
        this._shellVersion = parseFloat(Config.PACKAGE_VERSION);

        // -- Custom extension logger ------------------------------------------
        const prefix = `[${this.metadata.name}]`;
        // prettier-ignore
        this._logger =
            this._shellVersion >= 48
                ? this.getLogger()
                : Object.fromEntries(['log', 'warn', 'error', 'debug'].map(
                    level => [level, (...args) => console[level](prefix, ...args)]
                ));

        // -- Get settings -----------------------------------------------------
        this._settings = this.getSettings();

        // Version 3.0 saved Pango font descriptions, which end with a comma for families ending
        // in a style word (e.g. "Open Sans Condensed,"). Keep the family name only.
        ['weekday-font', 'date-font', 'time-font'].forEach(key => {
            const font = this._settings.get_string(key);
            if (font.endsWith(',')) this._settings.set_string(key, font.slice(0, -1).trim());
        });

        // -- Get theme -------------------------------------------------
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeColor = this._getThemeColor();

        // -- Install fonts ----------------------------------------------------
        this._fontNotification = { source: null, notification: null };
        this._installFonts();
        this._fontsSupport = {
            weekday: getWeekdayFontSupport(this._settings.get_string('weekday-font')),
            date: getMonthFontSupport(this._settings.get_string('date-font')),
        };

        // -- Build clocks when the layout is ready ----------------------------
        this._clockWidgets = [];
        this._lastMonitorSnapshot = null;
        this._startupToken = { ready: false };

        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject(
                'startup-complete',
                () => {
                    Main.layoutManager.disconnectObject(this._startupToken);
                    this._startupToken.ready = true;
                    this._buildAllClocks();
                },
                this._startupToken
            );
        } else {
            this._startupToken.ready = true;
            this._buildAllClocks();
        }

        // -- Connect to settings changes --------------------------------------
        this._settings.connectObject('changed', (s_, key) => this._onSettingChanged(key), this);

        // -- Connect to theme changes -----------------------------------------
        this._themeContext.connectObject(
            'changed',
            () => {
                this._themeColor = this._getThemeColor();
                this._clockWidgets.forEach(clockWidget => this._updateClockStyle(clockWidget));
            },
            'notify::scale-factor',
            () => this._clockWidgets.forEach(clockWidget => this._updateClockStyle(clockWidget)),
            this
        );

        // -- Connect to monitor changes ---------------------------------------
        Main.layoutManager.connectObject(
            'monitors-changed',
            () => {
                if (this._lastMonitorSnapshot !== this._snapshotMonitor()) this._buildAllClocks();
            },
            this
        );

        // -- Connect to work areas changes ------------------------------------
        global.display.connectObject(
            'workareas-changed',
            () => this._clockWidgets.forEach(clockWidget => this._updateClockPosition(clockWidget)),
            this
        );

        // -- Connect to GNOME Clock -------------------------------------------
        this._wallClock = new GnomeDesktop.WallClock();
        this._lastMinute = null;
        this._wallClock.connectObject(
            'notify::clock',
            () => {
                const now = GLib.DateTime.new_now_local();
                const minute = now.get_hour() * 60 + now.get_minute();
                if (this._lastMinute === minute) return;

                this._lastMinute = minute;
                this._clockWidgets.forEach(clockWidget => this._updateClockText(clockWidget));
            },
            this
        );
    }
    //#endregion

    //#region disable
    disable() {
        this._wallClock.disconnectObject(this);
        this._wallClock = null;

        global.display.disconnectObject(this);

        Main.layoutManager.disconnectObject(this);
        Main.layoutManager.disconnectObject(this._startupToken);
        this._startupToken = null;

        this._themeContext.disconnectObject(this);
        this._themeContext = null;
        this._themeColor = null;

        if (this._fontNotification.source) this._fontNotification.source.destroy();
        this._fontNotification = null;

        this._settings.disconnectObject(this);
        this._settings = null;

        this._destroyAllClocks();
        this._clockWidgets = [];
        this._fontsSupport = null;
        this._lastMonitorSnapshot = null;
        this._lastMinute = null;
        this._logger = null;
    }
    //#endregion

    //#region onSettingChanged
    // Only updates what depends on the key, so that e.g. dragging a position slider doesn't
    // rebuild the text and style of every line on every step
    _onSettingChanged(key) {
        // Keys of a line are '<line>-<suffix>', e.g. 'weekday-font'
        const suffix = key.replace(/^(weekday|date|time)-/, '');

        let update;
        switch (suffix) {
            case 'position-x':
            case 'position-y':
                update = clockWidget => this._updateClockPosition(clockWidget);
                break;
            case 'language-mode':
            case 'format':
            case 'decorations':
                update = clockWidget => this._updateClockText(clockWidget);
                break;
            case 'font':
                // The font decides whether 'auto' language mode falls back to English
                if (key === 'weekday-font')
                    this._fontsSupport.weekday = getWeekdayFontSupport(
                        this._settings.get_string(key)
                    );
                if (key === 'date-font')
                    this._fontsSupport.date = getMonthFontSupport(this._settings.get_string(key));
                update = clockWidget => {
                    this._updateClockText(clockWidget);
                    this._updateClockStyle(clockWidget);
                };
                break;
            case 'enabled':
            case 'size-scale':
            case 'tracking-scale':
            case 'color':
            case 'color-enabled':
                update = clockWidget => this._updateClockStyle(clockWidget);
                break;
            default:
                // A key not listed above: update everything to be safe
                update = clockWidget => {
                    this._updateClockText(clockWidget);
                    this._updateClockStyle(clockWidget);
                    this._updateClockPosition(clockWidget);
                };
        }
        this._clockWidgets.forEach(update);
    }
    //#endregion

    //#region buildAllClocks
    _buildAllClocks() {
        if (!this._startupToken.ready) return;

        // Remove old clocks
        this._destroyAllClocks();
        this._clockWidgets = [];

        const monitors = Main.layoutManager.monitors;
        this._lastMonitorSnapshot = this._snapshotMonitor();
        this._clockWidgets = monitors.map(monitor => this._buildClock(monitor));
    }
    //#endregion

    //#region destroyAllClocks
    _destroyAllClocks() {
        // Destroying the holder also destroys the clock inside it
        this._clockWidgets.forEach(clockWidget => clockWidget.holder.destroy());
    }
    //#endregion

    //#region buildClock
    _buildClock(monitor) {
        // Build widget
        const container = new St.BoxLayout({
            name: `ModernClockWidget-${monitor.index}`,
            style: 'background: transparent;',
            can_focus: false,
            reactive: false,
            track_hover: false,
        });
        if (this._shellVersion >= 48) container.set_orientation(Clutter.Orientation.VERTICAL);
        else container.set_vertical(true);
        container.monitor = monitor;

        // Build labels
        container.weekdayLabel = new St.Label();
        container.dateLabel = new St.Label();
        container.timeLabel = new St.Label();

        [container.weekdayLabel, container.dateLabel, container.timeLabel].forEach(label => {
            label.set_x_align(Clutter.ActorAlign.CENTER);
            label.set_x_expand(true);
            label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            container.add_child(label);
        });

        // Add to layout, inside a holder covering the work area (see ClockLayout)
        container.holder = new St.Widget({
            name: `ModernClockHolder-${monitor.index}`,
            layout_manager: new ClockLayout(),
            can_focus: false,
            reactive: false,
            track_hover: false,
        });
        container.holder.add_child(container);
        Main.layoutManager._backgroundGroup.add_child(container.holder);

        // Setup widget
        this._updateClockText(container);
        this._updateClockStyle(container);
        this._updateClockPosition(container);

        return container;
    }
    //#endregion

    //#region snapshotMonitor
    _snapshotMonitor() {
        return Main.layoutManager.monitors
            .map(m => `${m.index}:${m.x},${m.y},${m.width}x${m.height}`)
            .join('|');
    }
    //#endregion

    //#region updateClockText
    _updateClockText(clockWidget) {
        const now = GLib.DateTime.new_now_local();
        const weekdayFormat = this._settings.get_string('weekday-format');
        const dateFormat = this._settings.get_string('date-format');
        const mode = this._settings.get_string('language-mode');

        // Weekday
        let weekday;
        const useEnglishWeekday =
            mode === 'english' ||
            (mode === 'auto' &&
                !(weekdayFormat === 'long'
                    ? this._fontsSupport.weekday.long
                    : this._fontsSupport.weekday.short));
        if (weekdayFormat === 'long') {
            weekday = useEnglishWeekday
                ? EN_WEEKDAY_NAMES.long[now.get_day_of_week() - 1]
                : now.format('%A').toUpperCase();
        } else {
            weekday = useEnglishWeekday
                ? EN_WEEKDAY_NAMES.short[now.get_day_of_week() - 1]
                : now.format('%a').toUpperCase();
        }

        // Date
        let date;
        const useEnglishDate =
            mode === 'english' ||
            (mode === 'auto' &&
                !(dateFormat === 'long'
                    ? this._fontsSupport.date.long
                    : this._fontsSupport.date.short));
        switch (dateFormat) {
            case 'long':
                date = useEnglishDate
                    ? now.format(`%d ${EN_MONTH_NAMES.long[now.get_month() - 1]} %Y`)
                    : now.format('%d %B %Y').toUpperCase();
                break;
            case 'numeric':
                date = now.format('%d.%m.%Y');
                break;
            case 'numeric-us':
                date = now.format('%m/%d/%Y');
                break;
            case 'text':
            default:
                date = useEnglishDate
                    ? now.format(`%d ${EN_MONTH_NAMES.short[now.get_month() - 1]} %Y`)
                    : now.format('%d %b %Y').toUpperCase();
                break;
        }

        // Time
        let time;
        if (this._settings.get_string('time-format') === '24h') {
            time = `${now.format('%H:%M')}`;
        } else {
            // Manually calculate AM/PM format because some locales don't support it
            const hours = now.get_hour();
            const h12 = hours % 12 || 12;
            const ampm = hours < 12 ? 'AM' : 'PM';
            time = `${now.format(`${h12.toString().padStart(2, '0')}:%M ${ampm}`)}`;
        }

        // Decorations are [prefix, suffix]; empty or missing ones are skipped
        const decorate = (text, [prefix, suffix]) =>
            [prefix, text, suffix].filter(Boolean).join(' ');
        clockWidget.weekdayLabel.set_text(
            decorate(weekday, this._settings.get_strv('weekday-decorations'))
        );
        clockWidget.dateLabel.set_text(decorate(date, this._settings.get_strv('date-decorations')));
        clockWidget.timeLabel.set_text(decorate(time, this._settings.get_strv('time-decorations')));
    }
    //#endregion

    //#region updateClockStyle
    _updateClockStyle(clockWidget) {
        // Update the monitor
        const monitor = Main.layoutManager.monitors[clockWidget.monitor.index];
        if (!monitor) return;
        clockWidget.monitor = monitor;

        // St multiplies CSS px by its scale factor. In the physical layout mode (X11, or Wayland
        // without fractional scaling), the monitor size is in physical pixels and already includes
        // that scale, so it has to be taken out. In the logical layout mode, the scale factor is 1.
        const referenceDimension = Math.min(clockWidget.monitor.width, clockWidget.monitor.height);
        const monitorScale = referenceDimension / BASE_HEIGHT / this._themeContext.scale_factor;

        ['weekday', 'date', 'time'].forEach(line => {
            const label = clockWidget[`${line}Label`];
            label.visible = this._settings.get_boolean(`${line}-enabled`);
            if (!label.visible) return;

            label.set_style(
                this._createLabelStyle(monitorScale, {
                    fontFace: this._settings.get_string(`${line}-font`),
                    sizeScale: this._settings.get_double(`${line}-size-scale`),
                    letterSpacingScale: this._settings.get_double(`${line}-tracking-scale`),
                    base: BASE_DIMENSIONS[line],
                    color: this._settings.get_string(`${line}-color`),
                    colorEnabled: this._settings.get_boolean(`${line}-color-enabled`),
                })
            );
        });
    }
    //#endregion

    //#region createLabelStyle
    _createLabelStyle(
        monitorScale,
        { fontFace, sizeScale, letterSpacingScale, base, color, colorEnabled }
    ) {
        const safeFontFace = sanitizeFontFamily(fontFace);

        const computePx = (px, sliderValue) => {
            const userScale = SCALE_MIN * Math.pow(SCALE_MAX / SCALE_MIN, sliderValue);
            const scale = monitorScale * userScale;
            return Math.round(px * scale);
        };
        const fontSize = computePx(base.size, sizeScale);
        const letterSpacing = computePx(base.letterSpacing, letterSpacingScale);
        const paddingTop = computePx(base.paddingTop, sizeScale);

        const sanitizeColor = value => {
            if (typeof value !== 'string') return FALLBACK_COLOR;
            const v = value.trim();

            // test HEX format
            if (HEX_RE.test(v)) return v.toLowerCase();

            // sanitize RGB format
            const match = RGB_RE.exec(v);
            if (match) {
                const clamp = (n, max) => Math.min(Math.max(Number(n), 0), max);
                const r = Math.round(clamp(match[1], 255));
                const g = Math.round(clamp(match[2], 255));
                const b = Math.round(clamp(match[3], 255));
                const a = match[4] === undefined ? 1 : clamp(match[4], 1);
                return `rgba(${r},${g},${b},${a})`;
            }

            return FALLBACK_COLOR;
        };
        const styleColor = colorEnabled ? sanitizeColor(color) : this._themeColor;

        return (
            `font-family: '${safeFontFace}', sans-serif;` +
            `font-size: ${fontSize}px;` +
            `letter-spacing: ${letterSpacing}px;` +
            `padding-top: ${paddingTop}px;` +
            `color: ${styleColor};`
        );
    }
    //#endregion

    //#region getThemeColor
    _getThemeColor() {
        // Items that commonly get an accent color from custom themes, each given as the chain of
        // style classes from the outermost ancestor down, so that descendant selectors such as
        // `.calendar .calendar-day.calendar-today` match the probe as they match the real widget
        // - calendar-today: highlight for the current day in the GNOME calendar
        // - button default: default action button
        // - osd-monitor-label: number overlaid on each display when rearranging them in Settings;
        //   rarely overridden, so usually still carries '-st-accent-color' as a fallback
        const candidates = [
            ['calendar', 'calendar-day calendar-today'],
            ['button default'],
            ['osd-monitor-label'],
        ];

        let color = null;
        let found = false;
        for (const styleClasses of candidates) {
            const probes = styleClasses.map(
                styleClass => new St.Widget({ style_class: styleClass })
            );
            for (let i = 1; i < probes.length; i++) probes[i - 1].add_child(probes[i]);
            global.stage.add_child(probes[0]);
            color = probes.at(-1).get_theme_node().get_background_color();
            global.stage.remove_child(probes[0]);
            probes[0].destroy(); // also destroys the nested probes

            if (
                color.alpha > 0 && // Color is visible
                !(color.red === color.green && color.green === color.blue) // Color isn't black or grey
            ) {
                found = true;
                break;
            }
        }

        if (found) return `rgb(${color.red},${color.green},${color.blue})`;
        else return FALLBACK_COLOR;
    }
    //#endregion

    //#region updateClockPosition
    _updateClockPosition(clockWidget) {
        // When a monitor is unplugged, 'workareas-changed' can come before the clocks are rebuilt
        // on 'monitors-changed', while the clock still has the index of a monitor that is gone.
        // The check uses Mutter's count, since Main.layoutManager.monitors is not updated yet.
        if (clockWidget.monitor.index >= global.display.get_n_monitors()) return;

        const workArea = Main.layoutManager.getWorkAreaForMonitor(clockWidget.monitor.index);
        clockWidget.holder.set_position(workArea.x, workArea.y);
        clockWidget.holder.set_size(workArea.width, workArea.height);
        clockWidget.holder.layout_manager.setFactors(
            this._settings.get_double('position-x'),
            this._settings.get_double('position-y')
        );
    }
    //#endregion

    //#region installFonts
    // Makes the bundled fonts available. With Pango 1.56+ (GNOME 48+), they are loaded straight
    // from the extension folder: they work right away and leave nothing behind on uninstall.
    // Older versions get a copy in the user font folder, which only loads next session.
    _installFonts() {
        const bundledDir = Gio.File.new_for_path(GLib.build_filenamev([this.path, 'fonts']));
        const userDir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'modernclock'])
        );

        try {
            const fontMaps = [
                global.stage.get_pango_context().get_font_map(), // draws the clock labels
                PangoCairo.FontMap.get_default(), // used by the font support checks
            ];
            if (registerBundledFonts(bundledDir.get_path(), fontMaps)) {
                this._removeCopiedFonts(userDir);
                return;
            }
        } catch (e) {
            this._logger.warn('failed to load the bundled fonts, copying them instead:', e);
        }
        this._copyFonts(bundledDir, userDir);
    }
    //#endregion

    //#region copyFonts
    _copyFonts(bundledDir, userDir) {
        const checksum = file =>
            GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, file.load_bytes(null)[0]);

        try {
            // Missing fonts, or outdated ones after an extension update
            const outdated = Object.keys(FONT_FILES).filter(fileName => {
                const copy = userDir.get_child(fileName);
                return (
                    !copy.query_exists(null) ||
                    checksum(copy) !== checksum(bundledDir.get_child(fileName))
                );
            });
            if (outdated.length === 0) return;

            // prettier-ignore
            this._logger.log(
                `Installing Modern Clock fonts at ${userDir.get_path()}: ${outdated.join(', ')}. ` +
                'Takes effect next session.'
            );
            if (!userDir.query_exists(null)) userDir.make_directory_with_parents(null);
            outdated.forEach(fileName =>
                bundledDir
                    .get_child(fileName)
                    .copy(userDir.get_child(fileName), Gio.FileCopyFlags.OVERWRITE, null, null)
            );
            this._notifyFontsInstalled();
        } catch (e) {
            this._logger.warn('failed to install fonts:', e);
        }
    }
    //#endregion

    //#region removeCopiedFonts
    // Removes the copies made on an older GNOME version, so they don't shadow the bundled fonts
    // once they get outdated
    _removeCopiedFonts(userDir) {
        [...Object.keys(FONT_FILES).map(fileName => userDir.get_child(fileName)), userDir].forEach(
            file => {
                try {
                    file.delete(null);
                } catch {
                    // missing, or the folder holds other files
                }
            }
        );
    }
    //#endregion

    //#region notifyFontsInstalled
    _notifyFontsInstalled() {
        this._fontNotification.source = new MessageTray.Source({
            title: this.metadata.name,
            iconName: 'dialog-information', // or extension icon
        });
        this._fontNotification.source.connectObject(
            'destroy',
            () => (this._fontNotification.source = null),
            this
        );
        Main.messageTray.add(this._fontNotification.source);

        this._fontNotification.notification = new MessageTray.Notification({
            source: this._fontNotification.source,
            title: _('Modern Clock Fonts Installed'),
            body: _('Log out and back in for the new fonts to take effect.'),
            iconName: 'font-x-generic-symbolic',
        });
        this._fontNotification.notification.connectObject(
            'activated',
            () => this.openPreferences(),
            this
        );
        this._fontNotification.source.addNotification(this._fontNotification.notification);
    }
    //#endregion
}

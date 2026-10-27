# SPDX-License-Identifier: CC0-1.0
# SPDX-FileCopyrightText: No rights reserved

.PHONY: check clean disable enable fix format format-fix info install lint lint-fix logs \
		logs-prefs pack po-check po-stats po-update pot prefs reset schemas shexli test \
		test-legacy test-settings uninstall

UUID := $(shell jq -r ".uuid" src/metadata.json)
ZIP := dist/modernclock@gnome.shell-extension.zip
POT := $(UUID).pot

XDG_DATA_HOME ?= $(HOME)/.local/share
DCONF_DIR := /org/gnome/shell/extensions/modernclock/
FONTS_DIR := $(XDG_DATA_HOME)/fonts/modernclock

VERSION := $(shell jq -r '.["version-name"]' src/metadata.json)
PACKAGE_NAME := "Modern Clock for GNOME"
COPYRIGHT_HOLDER := "Modern Clock for GNOME Contributors"
ISSUES_URL := https://github.com/Tony-Rain/modern-clock-gnome/issues/


NODE_MODULES_STAMP := node_modules/.install-stamp

# ---- Build ---------------------------------------------------------------

pack:
	@mkdir -p dist
	gnome-extensions pack ./src --force --extra-source=../LICENSE --extra-source=assets \
		--extra-source=fonts --extra-source=lib --out-dir=dist
	@mv -f dist/$(UUID).shell-extension.zip $(ZIP)
	@echo "✓ Extension bundle: $(ZIP)"

clean:
	rm -rf dist
	@echo "✓ Removed dist/."

# ---- Install / run -------------------------------------------------------

install: pack
	gnome-extensions install --force $(ZIP)
	@echo "✓ Installed the extension. Log out and back in to load the new version."

uninstall: disable
	gnome-extensions uninstall $(UUID)
	rm -rf $(FONTS_DIR)
	@echo "✓ Uninstalled the extension and removed bundled fonts."

enable:
	gnome-extensions enable $(UUID)
	@echo "✓ Enabled the extension."

disable:
	gnome-extensions disable $(UUID)
	@echo "✓ Disabled the extension."

info:
	gnome-extensions info $(UUID)

prefs: install
	gnome-extensions prefs $(UUID)
	@echo "✓ Opened the preferences window."

reset:
	dconf reset -f $(DCONF_DIR)
	@echo "✓ Reset extension settings."

# ---- Testing -------------------------------------------------------------

# requires the mutter-devkit package
test: install
	@echo "Launching nested shell..."
	G_MESSAGES_DEBUG="GNOME Shell" dbus-run-session -- gnome-shell --devkit

test-legacy: install
	@echo "Launching nested shell (GNOME <49)..."
	G_MESSAGES_DEBUG="GNOME Shell" dbus-run-session -- gnome-shell --nested

test-settings: prefs
	@echo "Watching settings changes for the extension..."
	dconf watch $(DCONF_DIR)

logs:
	journalctl -f -n 50 -o cat /usr/bin/gnome-shell

logs-prefs: prefs
	journalctl -f -n 50 -o cat /usr/bin/gjs

# ---- Quality -------------------------------------------------------------

$(NODE_MODULES_STAMP): package.json package-lock.json
	npm ci
	@touch $@

lint: $(NODE_MODULES_STAMP)
	npm run lint

lint-fix: $(NODE_MODULES_STAMP)
	npm run lint:fix

format: $(NODE_MODULES_STAMP)
	npm run format

format-fix: $(NODE_MODULES_STAMP)
	npm run format:fix

schemas:
	glib-compile-schemas --strict --dry-run src/schemas

check: lint format schemas po-check
	@echo "✓ All file checks done."

fix: lint-fix format-fix

shexli: pack
	@echo "Running the Shexli static analyzer..."
	shexli $(ZIP)

# ---- Translations --------------------------------------------------------

pot:
	@mkdir -p src/po
	@find src -name "*.js" | sort | xgettext --files-from=- --sort-by-file --from-code=UTF-8 \
		--output=src/po/$(POT) --package-name=$(PACKAGE_NAME) --package-version=$(VERSION) \
		--copyright-holder=$(COPYRIGHT_HOLDER) --msgid-bugs-address=$(ISSUES_URL) \
		--add-comments=Translators:
	@echo "✓ Updated "$(POT)" for translations."

po-update: pot
	@for po in src/po/*.po; do \
		msgmerge --update --backup=none "$$po" src/po/$(POT); \
	done
	@echo "✓ Merged new strings into '.po' files."

po-check:
	@for po in src/po/*.po; do \
		msgfmt --check -o /dev/null "$$po" || exit 1; \
	done
	@echo "✓ Verified '.po' files."

po-stats:
	@for po in src/po/*.po; do \
		printf '%s: ' "$$(basename "$$po" .po)"; \
		msgfmt --check --statistics -o /dev/null "$$po" 2>&1 || exit 1; \
	done

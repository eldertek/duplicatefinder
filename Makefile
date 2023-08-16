# SPDX-FileCopyrightText: Bernhard Posselt <dev@bernhard-posselt.com>
# SPDX-License-Identifier: AGPL-3.0-or-later

# Generic Makefile for building and packaging a Nextcloud app which uses npm and
#
app_name=$(notdir $(CURDIR))
project_dir=$(CURDIR)/../$(app_name)
build_tools_directory=$(CURDIR)/build/tools
source_build_directory=$(CURDIR)/build/artifacts/source
build_dir=$(CURDIR)/build/artifacts
cert_dir=$(HOME)/.nextcloud/certificates
sign_dir=$(source_build_directory)/sign
source_package_name=$(source_build_directory)/$(app_name)
appstore_build_directory=$(CURDIR)/build/artifacts/appstore
appstore_package_name=$(appstore_build_directory)/$(app_name)
npm=$(shell which npm 2> /dev/null)

all: build

# Installs npm dependencies
.PHONY: npm
npm:
	npm install
	npm run build

# Builds the depencies for the app
.PHONY: build
build:
	make npm

# Removes the appstore build
.PHONY: clean
clean:
	rm -rf ./build

# Same as clean but also removes dependencies installed by npm
.PHONY: distclean
distclean: clean
	rm -rf node_modules
	rm -rf js/node_modules

# Builds the source and appstore package
.PHONY: dist
dist:
	make source
	make appstore

# Builds the source package
.PHONY: source
source:
	rm -rf $(source_build_directory)
	mkdir -p $(source_build_directory)
	tar cvzf $(source_package_name).tar.gz ../$(app_name) \
	--exclude-vcs \
	--exclude="/build" \
	--exclude="/js/node_modules" \
	--exclude="/node_modules" \
	--exclude="/*.log" \
	--exclude="/js/*.log" \

# Builds the source package for the app store, ignores php and js tests
.PHONY: appstore
appstore:
	rm -rf $(source_build_directory)
	mkdir -p $(sign_dir)
	rsync -a \
	--exclude="/.git" \
	--exclude="/build" \
	--exclude="/tests" \
	--exclude="Makefile" \
	--exclude="/*.log" \
	--exclude="phpunit*xml" \
	--exclude="/node_modules" \
	--exclude="/package-lock.json" \
	--exclude="/package.json" \
	--exclude="webpack.config.js" \
	--exclude="stylelint.config.js" \
	--exclude="babel.config.js" \
	--exclude="psalm.xml" \
	--exclude="/bower.json" \
	--exclude="/karma.*" \
	--exclude="/protractor\.*" \
	--exclude="/.*" \
	--exclude="/js/.*" \
	$(project_dir)/  $(sign_dir)/$(app_name)
	@if [ -f $(cert_dir)/$(app_name).key ]; then \
		echo "Signing app files…"; \
		php ../../occ integrity:sign-app \
			--privateKey=$(cert_dir)/$(app_name).key\
			--certificate=$(cert_dir)/$(app_name).crt\
			--path=$(sign_dir)/$(app_name); \
	fi
	tar -czf $(build_dir)/$(app_name).tar.gz \
		-C $(sign_dir) $(app_name)
	@if [ -f $(cert_dir)/$(app_name).key ]; then \
		echo "Signing package…"; \
		openssl dgst -sha512 -sign $(cert_dir)/$(app_name).key $(build_dir)/$(app_name).tar.gz | openssl base64; \
	fi
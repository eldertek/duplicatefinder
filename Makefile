# SPDX-FileCopyrightText: Bernhard Posselt <dev@bernhard-posselt.com>
# SPDX-License-Identifier: AGPL-3.0-or-later

# Generic Makefile for building and packaging a Nextcloud app which uses npm and
# Composer.
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
composer=$(shell which composer 2> /dev/null)

all: build

# Installs npm dependencies
.PHONY: npm
npm:
	npm install
	npm run build

# Installs and updates the composer dependencies. If composer is not installed
# a copy is fetched from the web
.PHONY: composer
composer:
ifeq (, $(composer))
	@echo "No composer command available, downloading a copy from the web"
	mkdir -p $(build_tools_directory)
	curl -sS https://getcomposer.org/installer | php
	mv composer.phar $(build_tools_directory)
	php $(build_tools_directory)/composer.phar install --prefer-dist
else
	composer install --prefer-dist
endif

# Builds the depencies for the app. If a composer.json or package.json is present
.PHONY: build
build:
ifneq (,$(wildcard $(CURDIR)/composer.json))
	make composer
endif
ifneq (,$(wildcard $(CURDIR)/package.json))
	make npm
endif

# Removes the appstore build
.PHONY: clean
clean:
	rm -rf ./build

# Same as clean but also removes dependencies installed by composer, bower and
# npm
.PHONY: distclean
distclean: clean
	rm -rf vendor
	rm -rf node_modules
	rm -rf js/vendor
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
	--exclude="/composer.*" \
	--exclude="/js/node_modules" \
	--exclude="/js/tests" \
	--exclude="/js/test" \
	--exclude="/js/*.log" \
	--exclude="/js/package.json" \
	--exclude="/js/bower.json" \
	--exclude="/js/karma.*" \
	--exclude="/js/protractor.*" \
	--exclude="/package.json" \
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

.PHONY: test
test: composer
	$(CURDIR)/vendor/phpunit/phpunit/phpunit -c phpunit.xml
	$(CURDIR)/vendor/phpunit/phpunit/phpunit -c phpunit.integration.xml

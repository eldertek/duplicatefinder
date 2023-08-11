# Makefile for building the project

app_name=duplicatefinder

project_dir=$(CURDIR)/../$(app_name)
build_dir=$(CURDIR)/build/artifacts
appstore_dir=$(build_dir)/appstore
source_dir=$(build_dir)/source
sign_dir=$(build_dir)/sign
package_name=$(app_name)
cert_dir=$(HOME)/.nextcloud/certificates
version+=master

all: dev-setup build-production

dev-setup: clean-dev npm-init build-dev

production-setup: clean-dev npm-init build-production

release: appstore create-tag

build-dev: composer-install-dev build-js

build-production: composer-install-production build-js-production

composer-install-dev:
	composer install

composer-install-production:
	composer install --no-dev --classmap-authoritative

build-js:
	npm run dev

build-js-production:
	npm run build

watch-js:
	npm run watch

test:
	npm run test

lint:
	npm run lint

lint-fix:
	npm run lint:fix

npm-init:
	npm ci

npm-update:
	npm update

clean:
	rm -rf js/*
	rm -rf $(build_dir)

clean-dev: clean
	rm -rf node_modules
	rm -rf vendor

create-tag:
	git tag -a v$(version) -m "Tagging the $(version) release."
	git push origin v$(version)

appstore:
	rm -rf $(build_dir)
	mkdir -p $(sign_dir)
	rsync -a \
	--exclude=babel.config.js \
	--exclude=/build \
	--exclude=composer.json \
	--exclude=composer.lock \
	--exclude=docs \
	--exclude=.drone.jsonnet \
	--exclude=.drone.yml \
	--exclude=.editorconfig \
	--exclude=.eslintignore \
	--exclude=.eslintrc.js \
	--exclude=.git \
	--exclude=.gitattributes \
	--exclude=.github \
	--exclude=.gitignore \
	--exclude=jest.config.js \
	--exclude=jest.global.setup.js \
	--exclude=.l10nignore \
	--exclude=mkdocs.yml \
	--exclude=Makefile \
	--exclude=node_modules \
	--exclude=package.json \
	--exclude=package-lock.json \
	--exclude=.php-cs-fixer.cache \
	--exclude=.php-cs-fixer.dist.php \
	--exclude=.php_cs.cache \
	--exclude=.php_cs.dist \
	--exclude=psalm.xml \
	--exclude=README.md \
	--exclude=/recording \
	--exclude=/site \
	--exclude=/src \
	--exclude=.stylelintignore \
	--exclude=stylelint.config.js \
	--exclude=.tx \
	--exclude=tests \
	--exclude=tsconfig.json \
	--exclude=vendor/bamarni \
	--exclude=vendor/bin \
	--exclude=vendor-bin \
	--exclude=webpack.common.config.js \
	--exclude=webpack.config.js \
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
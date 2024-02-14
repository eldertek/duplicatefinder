app_name=$(notdir $(CURDIR))
source_build_directory=$(CURDIR)/build/artifacts/source
build_dir=$(CURDIR)/build/artifacts
sign_dir=$(source_build_directory)/sign
npm=$(shell which npm 2> /dev/null)
composer=$(shell which composer 2> /dev/null)
EXCLUDES=--exclude="/.git" \
	--exclude="/build" \
	--exclude="Makefile" \
	--exclude="/*.log" \
	--exclude="composer.json" \
	--exclude="composer.lock" \
	--exclude="/vendor" \
	--exclude="/node_modules" \
	--exclude="/package-lock.json" \
	--exclude="/package.json" \
	--exclude="*.config.js" \
	--exclude="psalm.xml" \
	--exclude="/.*" \
	--exclude="/js/.*"

all: build

# Installs npm dependencies and builds the app
.PHONY: build
build:
ifeq ($(composer),)
	$(error "composer is not installed. Please install composer to proceed.")
endif
	composer install
ifeq ($(npm),)
	$(error "npm is not installed. Please install npm to proceed.")
endif
	npm install
	npm run build

# Removes the build directory
.PHONY: clean
clean:
	rm -rf ./build ./vendor

# Builds the source package for the app store
.PHONY: appstore
appstore:
	rm -rf $(source_build_directory)
	mkdir -p $(sign_dir)
	rsync -a $(EXCLUDES) $(CURDIR)/  $(sign_dir)/$(app_name)
	tar -czf $(build_dir)/$(app_name).tar.gz -C $(sign_dir) $(app_name)

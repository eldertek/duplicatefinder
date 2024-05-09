app_name := $(notdir $(CURDIR))
source_build_directory := $(CURDIR)/build/artifacts/source
build_dir := $(CURDIR)/build/artifacts
sign_dir := $(source_build_directory)/sign
EXCLUDES := --exclude="/.git" \
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
	composer install
	npm install
	npm run build

# Removes the build directory
.PHONY: clean
clean:
	if exist "./build" rd /s /q "./build"
	if exist "./vendor" rd /s /q "./vendor"

# Builds the source package for the app store
.PHONY: appstore
appstore:
	if exist "$(source_build_directory)" rd /s /q "$(source_build_directory)"
	mkdir -p "$(sign_dir)"
	xcopy "$(CURDIR)\*" "$(sign_dir)\$(app_name)" /E /H /C /I /Q /Y
	cd "$(sign_dir)" && tar -czf "$(build_dir)\$(app_name).tar.gz" "$(app_name)"

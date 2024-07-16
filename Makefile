# Detect OS
ifeq ($(OS),Windows_NT)
    detected_OS := Windows
else
    detected_OS := $(shell uname)
endif

# App and build directories
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

.PHONY: build
build:
ifeq ($(detected_OS),Windows)
	composer install
	npm install
	npm run build
else
	composer install
	npm install
	npm run build
endif

.PHONY: clean
clean:
ifeq ($(detected_OS),Windows)
	if exist "./build" rd /s /q "./build"
	if exist "./vendor" rd /s /q "./vendor"
else
	rm -rf ./build
	rm -rf ./vendor
endif

.PHONY: appstore
appstore:
ifeq ($(detected_OS),Windows)
	if exist "$(source_build_directory)" rd /s /q "$(source_build_directory)"
	mkdir "$(sign_dir)" -p
	xcopy "$(CURDIR)\\*" "$(sign_dir)\\$(app_name)" /E /H /C /I /Q /Y
	cd "$(sign_dir)" && tar -czf "$(build_dir)\\$(app_name).tar.gz" "$(app_name)"
else
	rm -rf "$(source_build_directory)"
	mkdir -p "$(sign_dir)"
	rsync -a $(EXCLUDES) $(CURDIR)/  $(sign_dir)/$(app_name)
	tar -czf $(build_dir)/$(app_name).tar.gz -C $(sign_dir) $(app_name)
endif

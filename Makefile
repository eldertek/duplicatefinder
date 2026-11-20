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
    --exclude="/docker-compose.yaml" \
    --exclude="/.devcontainer" \
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
    --exclude="/js/.*" \
    --exclude="/l10n-fallback" \
    --exclude="/scripts"

all: build

.PHONY: test
test:
	composer test

.PHONY: test-unit
test-unit:
	composer test:unit

.PHONY: test-integration
test-integration:
	composer test:integration

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
	if exist "$(sign_dir)\\$(app_name)\\docker-compose.yaml" del /Q "$(sign_dir)\\$(app_name)\\docker-compose.yaml"
	if exist "$(sign_dir)\\$(app_name)\\.devcontainer" rd /s /q "$(sign_dir)\\$(app_name)\\.devcontainer"
	python "$(CURDIR)\\scripts\\merge_l10n_fallback.py" --target-dir "$(sign_dir)\\$(app_name)\\l10n" --fallback-dir "$(CURDIR)\\l10n-fallback"
	if exist "$(sign_dir)\\$(app_name)\\l10n-fallback" rd /s /q "$(sign_dir)\\$(app_name)\\l10n-fallback"
	if exist "$(sign_dir)\\$(app_name)\\scripts" rd /s /q "$(sign_dir)\\$(app_name)\\scripts"
	cd "$(sign_dir)" && tar -czf "$(build_dir)\\$(app_name).tar.gz" "$(app_name)"
else
	rm -rf "$(source_build_directory)"
	mkdir -p "$(sign_dir)"
	rsync -a $(EXCLUDES) $(CURDIR)/  $(sign_dir)/$(app_name)
	python3 "$(CURDIR)/scripts/merge_l10n_fallback.py" --target-dir "$(sign_dir)/$(app_name)/l10n" --fallback-dir "$(CURDIR)/l10n-fallback"
	tar -czf $(build_dir)/$(app_name).tar.gz -C $(sign_dir) $(app_name)
endif

publish:
	@if [ -z "$(version)" ]; then \
		echo "Please provide a version number: make publish version=X.X.X"; \
		exit 1; \
	fi
	@echo "Updating version to $(version)"
	@sed -i 's/<version>[0-9]*\.[0-9]*\.[0-9]*<\/version>/<version>$(version)<\/version>/' appinfo/info.xml
	@sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*"/"version": "$(version)"/' package.json
	@echo "Version updated to $(version)"

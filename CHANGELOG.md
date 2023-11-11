## 1.1.2 - xxxxx-xx-xx
### Added
- Auto-fetch duplicates again when reaching the end of the list
### Removed
- Nextcloud 26 is no longer supported (DuplicateFinder will always be updated for the 2 last versions)

## 1.1.1 - 2023-11-10
### Fixed
- Fix [#24](https://github.com/eldertek/duplicatefinder/issues/24)

## 1.1.0 - 2023-11-04
### Fixed
- Fix [#19](https://github.com/eldertek/duplicatefinder/issues/19)
- Fix [#22](https://github.com/eldertek/duplicatefinder/issues/22)
- FindDuplicates background job is now correctly executed

## 1.0.9 - 2023-11-01
### Fixed
- Fix [#18](https://github.com/eldertek/duplicatefinder/issues/18)

## 1.0.8 - 2023-10-30
### Added 
- In settings, you can now directly clear all and find all duplicates.
### Changed
- Updated translations
- Make the code more readable

## 1.0.7 - 2023-10-28
### Added 
- Add a new acknowledge feature to avoid to display the same duplicate again and again.

## 1.0.6 - 2023-10-24
### Fixed
- Fix [#10](https://github.com/eldertek/duplicatefinder/issues/10)

## 1.0.5 - 2023-08-26
### Added
- Composer support
### Changed
- Clean up somes code
### Fixed
- Fix [#7](https://github.com/eldertek/duplicatefinder/issues/7)

## 1.0.4 - 2023-08-23
### Added
- French description now available in appinfo/info.xml.
- Easily ignore all duplicates inside a specific folder. Simply add a .nodupefinder file inside the relevant folder.

## 1.0.3 - 2023-08-22
### Changed
- Updated translations

## 1.0.2 - 2023-08-17
### Added
- Mobile responsive design
- Duplicate thumbnail in navigation
### Changed
- Updated screenshot
### Fixed
- Wrong container for App.vue
- No navigation button in administration section
- Navigation button not working (issue with @nextcloud/vue 8)
### Removed
- Source from appstore package

## 1.0.1 - 2023-08-16
### Added
- New preview in appstore
- New user interface and administration section
- Translation support (english, french)
### Changed
- Updated dependencies
### Removed
- Removed ignored file configuration from web interface

## 1.0.0 - 2023-08-11
### Added
- Added the first version of the app which is able to find duplicates. Working on NC26, NC27, NC28
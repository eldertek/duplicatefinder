## 1.5.3 - 2024-12-31
### Added
- Improved duplicate display: show filename instead of hash when all duplicates share the same name
- Shortened hash display (8 characters) for better readability when files have different names
### Fixed
- Further reduced folder path column lengths to 700 characters to ensure compatibility with MariaDB/MySQL UTF8MB4 encoding and key length limits
- Fix [#112](https://github.com/eldertek/duplicatefinder/issues/112)

## 1.5.2 - 2024-12-29
### Added
- Advanced search functionality with three modes:
  - Simple search: Basic text search in file names
  - Wildcard search: Support for * and ? patterns (e.g., IMG*.jpg)
  - Regular expression search: Full regex pattern support

## 1.5.1 - 2024-12-29
### Fixed
- Fix database installation issue on MariaDB/MySQL when column length exceeded maximum key length (3072 bytes)
- Reduce folder path column lengths to be compatible with all database configurations

## 1.5.0 - 2024-12-28
### Added
- Open folder/file in new window from duplicate details page
### Fixed
- Fix an issue with user context not being set correctly in command line

## 1.4.1 - 2024-12-27
### Added
- Added a help tooltip to explain how to use the app
- Added an onboarding guide to help users get started
- Added a FAQ section to help users

## 1.4.0 - 2024-12-27
### Added
- Added ability to exclude specific folders from duplicate scanning via settings page
### Fixed
- Handle when there is no file to delete in bulk deletion
- Fix an issue where the same file was displayed multiple times in duplicate

## 1.3.1 - 2024-12-26
### Added
- New bulk deletion feature allowing users to delete multiple duplicates at once
### Changed
- Improved documentation for the cleanup background job to clarify it only affects the database
- Updated settings interface with clearer descriptions about database cleanup operations
- Enhanced README documentation about background job behaviors

## 1.3.0 - 2024-12-18
### Fixed
- Error during occ update:check when no user context is available
- Database migration issue with MySQL when column length exceeded maximum key length

## 1.2.9 - 2024-12-17
### Added
- Origin folders configuration to protect files from deletion
- Backend API for file deletion with improved error handling
- Detailed error messages for file operations
### Changed
- File deletion now uses backend API instead of FileClient
- Improved error handling in frontend with specific error messages
### Fixed
- Better handling of protected files in origin folders
- More informative error messages when file deletion fails

## 1.2.8 - 2024-12-16
### Fixed
- Revert back to v1.2.5 lib

## 1.2.7 - 2024-12-16
### Fixed
- Fix POSTGRESQL issues

## 1.2.6 - 2024-08-07
### Added
- Support for Nextcloud 30

## 1.2.5 - 2024-08-06
### Changed
- Confirm box to prevent deleting all files of a duplicate
- Userid is now automatically set when inserting or updating an entity

## 1.2.4 - 2024-07-24
### Added
- Loading indicator while fetching duplicates
### Fixed
- Screen responsiveness

## 1.2.3 - 2024-07-16
### Added
- Parallel processing of duplicates

## 1.2.2 - 2024-07-16
### Added
- Select all files in duplicate

## 1.2.1 - 2024-07-16
### Fixed
- Line endings from CRLF to LF

## 1.2.0 - 2024-07-09
### Fixed
- File locking when interupting the scan
- Fix an issue where the same duplicate was displayed multiple times

## 1.1.11 - 2024-07-05
### Added
- Multi-select feature for duplicates
- "Delete Selected" button to remove multiple duplicates at once
- Search and filter functionality for duplicates by file path or name

### Fixed
- Improved error handling for batch deletion of duplicates

## 1.1.10 - 2024-05-21
### Added
- Support for Nextcloud 29

## 1.1.9 - 2024-05-09
### Fixed
- Fix [#57](https://github.com/eldertek/duplicatefinder/issues/57)

## 1.1.8 - 2024-02-21
### Fixed
- Fix [#52](https://github.com/eldertek/duplicatefinder/issues/52)

## 1.1.7 - 2024-02-20
### Fixed
- Refactor the code to use components

## 1.1.6 - 2024-02-17
### Fixed
- Fix an issue where the same duplicate was displayed multiple times

## 1.1.5 - 2024-02-12
### Added
- Limit number of errors/success messages to 2
- Limit number of fetched duplicates to 50
### Fixed
- Fix an issue where limit passed to the api was limiting files not entities.
- Fix an issue where nodeid was not corectly returned by the api
- Fix an issue where duplicates returned was not the user's one
- Fix [#45](https://github.com/eldertek/duplicatefinder/issues/45)
- Fix [#44](https://github.com/eldertek/duplicatefinder/issues/44)
- Fix [#43](https://github.com/eldertek/duplicatefinder/issues/43)
- Fix [#41](https://github.com/eldertek/duplicatefinder/issues/41)
- Fix [#40](https://github.com/eldertek/duplicatefinder/issues/40)
- Fix [#38](https://github.com/eldertek/duplicatefinder/issues/38)
- Fix [#37](https://github.com/eldertek/duplicatefinder/issues/37)
### Changed
- Show preview now relies on the file preview app
- Updated translations
- Updated dependencies
### Removed
- Remove support for Nextcloud 27

## 1.1.4 - 2023-11-19
### Added
- When clicking 'Acknowledge it', select the next unacknowledged entry automatically.
- Add a preview link to open the file in a new tab.
### Fixed
- Fix [#32](https://github.com/eldertek/duplicatefinder/issues/32)
- Fix [#33](https://github.com/eldertek/duplicatefinder/issues/33)

## 1.1.3 - 2023-11-12
### Added
- Paging of duplicates to avoid to load all duplicates at once
- Infinite-scrolling to load all duplicates in background

## 1.1.2 - 2023-11-11
### Added
- Auto-fetch duplicates again when reaching the end of the list
- Loading animation when fetching duplicates
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

## 1.5.4 - 2024-01-07
### Fixed
- Further reduced folder path column lengths to 700 characters to ensure compatibility with MariaDB/MySQL UTF8MB4 encoding and key length limits

## 1.8.5 - 2026-10-06
### Fixed
- **`occ app:enable duplicatefinder` and `occ upgrade` could be killed for lack of memory, and leave Nextcloud in maintenance mode, on a server that had indexed a million files or more** (Fix [#182](https://github.com/eldertek/duplicatefinder/issues/182), second report). Nextcloud runs the post-migration repair steps of an app each time the app is updated and each time it is enabled again. The step "Repair FileInfo objects" loaded the whole table of indexed files in memory, one object per row (about 2.5 KB each), to give a path hash to the rows that had none and to remove the rows that share a path and an owner. That is 3.8 GB for 1.5 million rows, so the kernel killed `occ` on a server with less free memory than that. Measured on Nextcloud 35.0.1 with 1.5 million rows and a memory limit of 1 GB, `occ app:enable` was killed after 9 to 14 seconds on SQLite, MariaDB 12.3 and PostgreSQL 18, and `occ upgrade` was killed on SQLite and left the server in maintenance mode. The step now walks the table by windows of 5 000 ids and never holds more than one window in memory. It gives the work 20 seconds at most, the clean-up background job goes on from where the step stopped (the position is kept in the app configuration), and a table that has been repaired costs a fraction of a second. With the same 1.5 million rows and the same memory limit, `occ app:enable` takes 5 to 14 seconds with about 80 MB of memory on the three databases, `occ upgrade` goes through and turns maintenance mode off, and a second activation takes 0.2 seconds. On a MariaDB server with a small buffer pool (128 MB) and a cold cache the step used its 20 seconds for the first 300 000 rows and the clean-up job did the rest in about a minute. If your server is still in maintenance mode, run `occ maintenance:mode --off`, update the app to 1.8.5 and enable it again with `occ app:enable duplicatefinder`.
- The clean-up background job also read the whole table of indexed files in memory before checking it (3.2 GB for 1.5 million rows). It now reads the table by batches of 1 000 rows (85 MB).
- While it recalculated a missing path hash, the repair step deleted the row when it could not find the file. It now only recalculates the path hash, and the clean-up job removes the rows of files that are really gone.

### Added
- Unit tests of the repair of the file info table (windows of ids, time budget, position kept between runs) and of the batch reading of the clean-up job

## 1.8.4 - 2026-10-06
### Fixed
- **The upgrade of Nextcloud could hang, end in maintenance mode or be killed after updating to 1.8.3** (Fix [#182](https://github.com/eldertek/duplicatefinder/issues/182)). The repair step added in 1.8.3 to merge the surplus rows of the duplicate groups loaded every group in memory and deleted the surplus rows one group at a time. On a table with hundreds of thousands of groups it ran for many minutes (540 s for 200 000 groups on SQLite, a deletion rate that puts it above 15 minutes on MariaDB and PostgreSQL) and used memory in proportion to the number of groups (143 MB for 200 000), so `occ upgrade` and `occ app:enable duplicatefinder` did not finish and could be killed. The surplus rows are now deleted by batches of 1 000 rows in id order, with a constant memory use (42 MB in the same test). The repair step gives this work at most 20 seconds and a table that is already clean costs a fraction of a second; whatever is left is removed by the clean-up background job, which goes on from where the step stopped. Measured with 200 000 groups of three rows, the table is cleaned in 11 seconds on SQLite and on MariaDB and in 42 seconds on PostgreSQL, and with 1 million groups in about 85 seconds on SQLite. If your server stayed in maintenance mode after the update: run `occ maintenance:mode --off`, disable the app with `occ app:disable duplicatefinder`, update the app to 1.8.4, then enable it again.

### Added
- Unit tests of the repair step and of the batch merging of the surplus rows

## 1.8.3 - 2026-10-03
### Fixed
- **Data loss risk when deleting duplicates** (Fix [#180](https://github.com/eldertek/duplicatefinder/issues/180)). In the details view of a project every file had a null id and the screen removed a deleted file from the list by id, so it always removed the first row: the copy that should be kept disappeared from the screen while the file that had just been deleted stayed listed, and further clicks removed copies that were meant to stay. The files of a project now carry their id (PR [#188](https://github.com/eldertek/duplicatefinder/pull/188) by kagithd) and the screen matches files by path when an id is missing. The checkboxes of the details view also toggled the selection twice: a file unticked after "Select All" was still deleted by "Delete Selected", and a file ticked on its own was not selected. A selection no longer follows you to another duplicate either. Reproduced on Nextcloud 35.0.1 before the fix, with a regression test for each case
- The server now refuses to delete the last remaining copy of a duplicate group, whatever the screen shows (HTTP 409, `LAST_COPY_PROTECTED`). Deleting every copy on purpose still works after the confirmation of the dialog
- Fixed "File not found" when deleting a file that belongs to another user (a share, or a file inside a shared folder mounted under another name): the interface now sends the node id of the file and the server looks it up for the current user instead of reusing the path of the owner (Fix [#177](https://github.com/eldertek/duplicatefinder/issues/177))
- Fixed deleted files and folders still being listed as duplicates that could not be deleted (Fix [#183](https://github.com/eldertek/duplicatefinder/issues/183)). The clean up job waited for an exception that is never thrown for a missing file, so these entries were never removed. It now removes the entries of files that are gone (and the duplicate group when no second file is left) and keeps those of nodes it cannot resolve, such as group folders of a missing user. Entries of files that cannot be found are also left out of the lists at once. After a whole folder was deleted the lists are correct at once and the clean up job removes its entries
- Fixed the rows of a duplicate group multiplying when several rows already existed for one hash, which logged `MultipleObjectsReturnedException` on every scan and made the table grow with every scan (Fix [#178](https://github.com/eldertek/duplicatefinder/issues/178), PR [#179](https://github.com/eldertek/duplicatefinder/pull/179) by JPP1). The existing surplus rows are merged when the app is updated, and a group made of several rows can be removed again
- A file that changed but kept the same size as another file is checked again instead of keeping its old duplicate group (PR [#184](https://github.com/eldertek/duplicatefinder/pull/184) by kagithd), and the previous duplicate group is refreshed after a hash change (PR [#186](https://github.com/eldertek/duplicatefinder/pull/186) by kagithd)

### Changed
- Listing duplicates by status no longer looks up the files of the groups that the status filter excludes (PR [#185](https://github.com/eldertek/duplicatefinder/pull/185) by kagithd)

### Added
- Frontend tests that render the settings page and the details view of a duplicate with jsdom (`npm run test:frontend`), thanks to the setup of PR [#187](https://github.com/eldertek/duplicatefinder/pull/187) by kagithd

## 1.8.2 - 2026-10-02
### Fixed
- Added support for Nextcloud 35. The supported range is now Nextcloud 28 to 35, so the app can be installed from the App Store and enabled again after upgrading to Nextcloud 35 (Fix [#189](https://github.com/eldertek/duplicatefinder/issues/189)). The backend needed no change: verified on real Nextcloud 35.0.1 (PHP 8.5, PostgreSQL 18 and MariaDB 12.3) and on Nextcloud 28.0.14 (PHP 8.2, MariaDB 10.11), with a fresh install, an upgrade from Nextcloud 34 to 35 that kept the app's data, duplicate scans, the REST API and the background jobs
- Fixed the blank admin settings page on Nextcloud 34 and 35 (Fix [#176](https://github.com/eldertek/duplicatefinder/issues/176), [#181](https://github.com/eldertek/duplicatefinder/issues/181)). Two causes: the page threw `Cannot read properties of undefined (reading 'toString')` because the text fields were rendered before the settings had been fetched, and the settings page of recent Nextcloud versions no longer provides the `#app-content` element that the app used as its mount point, so the app now mounts on an element of its own. Checked on Nextcloud 28 (old page layout), 34 and 35

## 1.8.1 - 2026-07-03
### Fixed
- **Critical**: Fixed duplicate detection being completely broken on Nextcloud 28-32. Version 1.8.0 used `fetchAssociative()`/`fetchAllAssociative()` on query results, but these methods only exist in the `OCP\DB\IResult` interface since Nextcloud 33, so every file event failed with "Call to undefined method OC\DB\ResultAdapter::fetchAllAssociative()" and no duplicates were found. Reverted to `fetch()`/`fetchAll()` which are available on all supported versions. Verified against real Nextcloud 30.0.14, 31.0.7, 32.0.0 (PostgreSQL), 33.0.6 and 34.0.1 instances
- Fixed `duplicates:find-all` crashing on PHP installations without the pcntl extension (signal handler is now only registered when pcntl is available)
- The scanner now sets up the scanned user's filesystem mounts explicitly, like the old storage scanner did. This makes background scans over several users reliable (user mounts no longer depend on lazy initialization order)
- Stopped calling `getUserFolder()` for file owners that do not exist as regular users (group folders, deleted accounts): Nextcloud core logged "Backends provided no user object" errors on every such file even though the app handled the failure (#158)
- The `.nodupefinder` ancestor lookup now stops at the virtual root instead of doing one extra mount lookup per scanned file

## 1.8.0 - 2026-07-03
### Fixed
- Stopped rescanning the file storage during duplicate scans. The app now walks the already indexed file tree instead of `OC\Files\Utils\Scanner`, which used to rewrite `mtime`/`etag` for the whole `oc_filecache` table and caused massive database load, lock wait timeouts and deadlocks on large instances (Fix [#160](https://github.com/eldertek/duplicatefinder/issues/160), [#164](https://github.com/eldertek/duplicatefinder/issues/164))
- Stopped logging "Failed to handle file info event" as an error for files that are simply unreachable (deleted files, group folders, vanished users). These cases are now handled gracefully and logged at debug level only (Fix [#154](https://github.com/eldertek/duplicatefinder/issues/154), [#158](https://github.com/eldertek/duplicatefinder/issues/158))
- Removed the extremely verbose per-file debug logging that could grow Nextcloud logs by gigabytes during scans (Fix [#156](https://github.com/eldertek/duplicatefinder/issues/156))
- Fixed crashes when a file node cannot be resolved (null node) during hash calculation or metadata update

### Changed
- Renamed the confusing "Merge selected files" button to "Delete selected files" and aligned the bulk deletion wording with what it actually does (Fix [#159](https://github.com/eldertek/duplicatefinder/issues/159))
- Extended the supported Nextcloud range to 34 (Fix [#173](https://github.com/eldertek/duplicatefinder/issues/173))

### Added
- New "Smart select" options in bulk deletion: select all files except the first (or last) of each duplicate group (Fix [#170](https://github.com/eldertek/duplicatefinder/issues/170))

## 1.7.5 - 2026-05-25
### Fixed
- Fixed checkbox array error in bulk delete by keeping `NcCheckboxRadioSwitch` boolean checkboxes out of checkbox-group mode (Fix [#145](https://github.com/eldertek/duplicatefinder/issues/145))
- Return a `FILE_LOCKED` API error and a clear notification when a locked file cannot be deleted (Fix [#161](https://github.com/eldertek/duplicatefinder/issues/161))
- Fixed compatibility with Nextcloud 32 and 33 by replacing deprecated QueryBuilder `execute()` calls, replacing deprecated `fetch()`/`fetchAll()` with `fetchAssociative()`/`fetchAllAssociative()`, replacing deprecated `PostgreSQL94Platform` with `PostgreSQLPlatform`, and extending the supported Nextcloud range to 33 (Fix [#168](https://github.com/eldertek/duplicatefinder/issues/168), [#166](https://github.com/eldertek/duplicatefinder/issues/166), [#171](https://github.com/eldertek/duplicatefinder/issues/171), PR [#169](https://github.com/eldertek/duplicatefinder/pull/169))
- Fixed project migration installation when legacy duplicate tables are missing (Fix [#157](https://github.com/eldertek/duplicatefinder/issues/157))

## 1.7.4 - 2025-01-11
### Critical Security Fix
- **CRITICAL**: Fixed automatic file deletion bug that could cause permanent data loss (Fix [#153](https://github.com/eldertek/duplicatefinder/issues/153))
- Files are no longer automatically deleted when temporarily inaccessible (network issues, permission changes, unmounted drives)
- Removed dangerous auto-deletion logic from `FileInfoService::enrich()` method
- Database entries for inaccessible files are now marked as stale instead of being deleted
- Physical file deletion now requires explicit user action with proper safeguards

### Fixed
- Fixed bulk delete not working properly with origin folders (Fix [#152](https://github.com/eldertek/duplicatefinder/issues/152))
- Bulk delete now shows the count of protected files in origin folders
- Allow deletion of non-protected duplicates even when only one non-protected copy exists (if protected copies exist)
- Improved UI to clearly indicate which files are protected and why some groups cannot be fully deleted
- Added visual indicators and explanatory messages for better user understanding
- Fixed Team Folders/Group Folders compatibility (Fix [#149](https://github.com/eldertek/duplicatefinder/issues/149))
- Handle files owned by non-existent system users (e.g., 'admin' in Team Folders)
- Gracefully handle `NoUserException` when accessing Team/Group folder files
- Fixed checkbox array error in bulk delete (Fix [#145](https://github.com/eldertek/duplicatefinder/issues/145))
- Made checkbox names unique to prevent NcCheckboxRadioSwitch from treating them as groups

### Added
- Added sort by size option in bulk delete (Fix [#151](https://github.com/eldertek/duplicatefinder/issues/151))
- Sort duplicates by size (largest or smallest first) in bulk delete preview
- Consistent sorting behavior with the main duplicate view

### Security Improvements
- Added safety checks to prevent accidental file deletion
- Improved handling of shared folders and external storage
- Better error handling for temporary file access issues

## 1.7.3 - 2025-01-05
### Fixed
- Fixed duplicate selection after deletion not respecting the current sort order
- When sorting by size (largest or smallest first), the next duplicate is now correctly selected based on the sort order
- Improved duplicate navigation to properly handle filtered and sorted lists

## 1.7.2 - 2025-04-27
### Fixed
- Fixed integration tests to work properly in the devcontainer environment
- Fixed deprecated method usage in `jsonSerialize()` methods by adding proper return types
- Fixed deprecated constant usage by replacing `ISO8601` with `DateTimeInterface::ATOM`
- Removed obsolete test files for commands that have been integrated into main commands

### Added
- Added comprehensive documentation for running tests in the devcontainer environment
- Added script to automate test setup and execution (`run-tests.sh`)
- Added `TestHelper` class to simplify writing new tests
- Updated README with detailed information about project features and command usage
- Added examples for CLI commands in the documentation

## 1.7.1 - 2025-04-20
### Added
- Comprehensive test suite for unit testing and integration testing
  - Added tests for command-line interfaces (FindDuplicates, ListDuplicates)
  - Added integration tests for duplicate detection
  - Added tests to verify user isolation (user A can't see user B's duplicates)
  - Added tests for API controllers
  - Improved integration tests to automatically create test users
  - Added tests for sorting duplicates by size (largest first or smallest first)
  - Added tests for merge functionality with origin folder protection
  - Added tests for custom filters (hash filters and name pattern filters)

### Changed
- Consolidated CLI commands for better usability:
  - Improved `duplicates:find-all` to include project scanning functionality
  - Enhanced `duplicates:list` with better formatting and readability
  - Updated `duplicates:clear` with clearer user feedback
  - Removed redundant commands by integrating their functionality into the main commands
- Improved CLI output format with better organization and readability

## 1.7.0 - 2025-04-13
### Added
- New Projects feature to scan specific folders for duplicates (Fix [#123](https://github.com/eldertek/duplicatefinder/issues/123))
- New sorting feature to sort duplicates by size (largest first or smallest first) to help regain disk space
- Improved duplicate management with "Merge" functionality that ensures at least one copy is preserved
- Added preview buttons to show file previews before merging duplicates
- Always show settings and navigation even when no duplicates are found (Fix [#125](https://github.com/eldertek/duplicatefinder/issues/125))
### Fixed
- Fix [#140](https://github.com/eldertek/duplicatefinder/issues/140): Ensure duplicate finder only scans files from the current user and not files from other users that don't exist for the current user
- Fix [#133](https://github.com/eldertek/duplicatefinder/issues/133): Fix database error "null value in column 'type' violates not-null constraint" that prevented duplicate detection
- Fix [#130](https://github.com/eldertek/duplicatefinder/issues/130): Properly skip directories with .nodupefinder files before scanning them
- Fix [#120](https://github.com/eldertek/duplicatefinder/issues/120): Properly handle Talk room shares to prevent "Backends provided no user object" errors
- Fix [#129](https://github.com/eldertek/duplicatefinder/issues/129): Properly handle user context in background jobs to prevent "User context required for this operation" errors

## 1.6.1 - 2025-04-13
### Added
- Support for Nextcloud 31

## 1.6.0 - 2025-01-03
### Added
- New filtering system to ignore files during scan:
  - Filter by file hash to ignore specific files
  - Filter by file name pattern with wildcard support (e.g., *.tmp, backup_*)
  - User-specific filters management through settings
  - Persistent filters stored in database
### Changed
- Enhanced logging throughout the application with detailed debug information
### Fixed
- Fix an issue where deleted files were still displayed in the duplicates list

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

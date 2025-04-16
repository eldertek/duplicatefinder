<!--
SPDX-FileCopyrightText: André Théo LAURET <andrelauret@eclipse-technology.eu>
SPDX-License-Identifier: CC0-1.0
-->

# Duplicate Finder
Install app using the Nextcloud App Store inside your Nextcloud. See https://apps.nextcloud.com/apps/duplicatefinder

Click on the icon and find if you have duplicate files.

You can either use the command or the cron job to do a full scan.
Each time a new file is uploaded or a file is changed the app automatically checks if a duplicate of this file exists.

## Usage
There are three possible ways duplicates can be detected.
1. Event-based-detection
   For every new or changed file, Nextcloud creates an internal event. The app is listening to these and analyse if the file has a duplicate
2. Background-job-based-detection
   With an interval of 5 days a background job is executed, if you have enabled either cron, web cron or ajax based background jobs. This is only for events that have not been processed for any reason or a file was added manually.
3. Command-based-detection
   A scan for duplicates can be forced by using the occ-command (please see #Command usage)

Normally the detection methods should be used in the order as listed, but if you are installing the app on an existing installation it can be quite useful to start with a full scan by using command-based detection.

## Ignoring Duplicates
To prevent a folder from being scanned for duplicates, place a `.nodupefinder` file inside it. Any files in this folder will be excluded from the duplicate detection process.

## Protected Files in Origin Folders
You can configure "Origin Folders" to protect specific files from accidental deletion. Files located in these designated folders cannot be deleted through the duplicate finder interface, ensuring that original files are preserved. This is particularly useful when you want to:
- Keep original files in specific directories
- Prevent accidental deletion of important files
- Maintain a source of truth for your files

You can configure Origin Folders in the app settings. Files in these folders will be marked as "Protected" in the interface instead of showing a delete button.

## Search and Filter Duplicates
You can search and filter duplicates by file path or name using the search input at the top of the "Unacknowledged" and "Acknowledged" sections.

- To include files containing a specific term, simply type the term (e.g., `.png` to show all PNG files).
- To exclude files containing a specific term, prefix the term with an exclamation mark (e.g., `!.ptx` to exclude all PTX files).

## Projects

Projects allow you to organize and scan for duplicates within specific folders. You can create projects through the web interface or using the command line.

### Creating Projects

To create a project:
1. Go to the Duplicate Finder app in Nextcloud
2. Click on the "Projects" tab
3. Click "Create New Project"
4. Enter a name for your project and select the folders you want to include
5. Click "Create"

### Scanning Projects

You can scan projects for duplicates either through the web interface or using the command line (see Command Usage below).

## Command usage

  `occ [-v] duplicates:ACTION [options]`

Depending on your Nextcloud setup, the `occ` command may need to be called differently, such as `sudo php occ duplicates:find-all [options]` or `nextcloud.occ duplicates:find-all [options]`. Please refer to the [occ documentation](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/occ_command.html) for more details

If you increase the verbosity of the occ command, the output shows a little bit more (e.g. what file is currently scanned).

    ACTION
    find-all    The command scans the files for duplicates. By using the options the scan can be limited
      options
        -u, --user scan files of the specified user (-u admin)
        -p, --path limit scan to this path (--path="./Photos"). The path is relative to the root of each user or the specified user.
        --project scan files for a specific project ID (requires --user option)
    list        The command lists all duplicates that have been found yet. If no option is given duplicates across users are shown.
      options
        -u, --user list only duplicates of the specified user (-u admin)
    clear       The command will clear all information that has been stored in the database
      options
        -f, --force the flag forces to do the cleanup. _attention_ you will not be asked any questions

### Examples

```bash
# Scan all files for all users
occ duplicates:find-all

# Scan files for a specific user
occ duplicates:find-all --user="admin"

# Scan files in a specific path for a user
occ duplicates:find-all --user="admin" --path="./Documents"

# Scan files for a specific project
occ duplicates:find-all --user="admin" --project=1

# List all duplicates
occ duplicates:list

# List duplicates for a specific user
occ duplicates:list --user="admin"
```

## Config

The app depends on the following settings.
All settings should be modified only through UI. If this doesn't work for you, you can apply them via the [occ-command](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/occ_command.html?highlight=occ#config-commands-label).

| Setting | Type | Default | Effect |
|---|---|---|---|
| ignore_mounted_files | boolean | false | When true, files mounted on external storage will be ignored.<br>Computing the hash for an external file may require transferring the whole file to the Nextcloud server.<br>So, this setting can be useful when you need to reduce traffic e.g if you need to pay for the traffic. |
| disable_filesystem_events | boolean | false | When true, the event-based detection will be disabled.<br>This gives you more control when the hashes are generated. |
| backgroundjob_interval_cleanup | integer | 432000 | Interval in seconds between database cleanup operations. This job only cleans the database records and does not delete any actual files from your storage. It helps maintain database performance by removing outdated duplicate entries. |
| backgroundjob_interval_find | integer | 172800 | Interval in seconds in which the background job, to find duplicates, will be run |

## Preview

![Preview of the GUI](https://raw.githubusercontent.com/eldertek/duplicatefinder/master/img/preview.png)

## Development

### Testing

The app includes a comprehensive test suite to ensure proper functionality. To run the tests:

```bash
# Install development dependencies
composer install

# Run all tests
vendor/bin/phpunit

# Run only unit tests
vendor/bin/phpunit --testsuite unit

# Run only integration tests
vendor/bin/phpunit --testsuite integration

# Run a specific test file
vendor/bin/phpunit tests/Integration/CompleteWorkflowTest.php

# Run tests with verbose output
vendor/bin/phpunit -v
```

#### Testing in the Devcontainer

When running tests in the devcontainer environment:

1. The devcontainer includes a complete Nextcloud installation at `/var/www/nextcloud`
2. MariaDB is available and configured for Nextcloud
3. Integration tests can access the Nextcloud environment and database
4. Make sure services are running before testing:
   ```bash
   service mariadb start
   service apache2 start
   ```

For more information about the tests, see the [tests/README.md](tests/README.md) file.

## Special thanks

Big thanks to @PaulLereverend @chrros95 @Routhinator

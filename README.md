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

## Web Interface Usage
The application is fully configurable and usable from the Nextcloud web interface without the command line. All duplicate finder settings can be edited from the settings page in the web interface. The duplicate detection and management features are accessible through the web interface.

### Accessing Duplicate Finder Settings
1. Navigate to the settings page in the Nextcloud web interface.
2. Locate the "Duplicate Finder" section.
3. Edit the settings as needed.

### Managing Duplicates
The application provides a user-friendly interface for managing duplicates, including acknowledging, unacknowledging, and deleting duplicates.

#### Acknowledging Duplicates
1. Open the Duplicate Finder app in the Nextcloud web interface.
2. Locate the duplicate you want to acknowledge.
3. Click the "Acknowledge" button.

#### Unacknowledging Duplicates
1. Open the Duplicate Finder app in the Nextcloud web interface.
2. Locate the duplicate you want to unacknowledge.
3. Click the "Unacknowledge" button.

#### Deleting Duplicates
1. Open the Duplicate Finder app in the Nextcloud web interface.
2. Locate the duplicate you want to delete.
3. Select the files you want to delete.
4. Click the "Delete Selected" button.

## Ignoring Duplicates
To prevent a folder from being scanned for duplicates, place a `.nodupefinder` file inside it. Any files in this folder will be excluded from the duplicate detection process.

## Search and Filter Duplicates
You can search and filter duplicates by file path or name using the search input at the top of the "Unacknowledged" and "Acknowledged" sections. 

- To include files containing a specific term, simply type the term (e.g., `.png` to show all PNG files).
- To exclude files containing a specific term, prefix the term with an exclamation mark (e.g., `!.ptx` to exclude all PTX files).

## Command usage

  `occ [-v] duplicates:ACTION [options]`

Depending on your Nextcloud setup, the `occ` command may need to be called differently, such as `sudo php occ duplicates:find-all [options]` or `nextcloud.occ duplicates:find-all [options]`. Please refer to the [occ documentation](https://docs.nextcloud.com/server/15/admin_manual/configuration_server/occ_command.html) for more details

If you increase the verbosity of the occ command, the output shows a little bit more (e.g. what file is currently scanned).

    ACTION
    find-all    The command scans the files for duplicates. By using the options the scan can be limited
      options
        -u, --user scan files of the specified user (-u admin)
        -p, --path limit scan to this path (--path="./Photos"). The path is relative to the root of each user or the specified user.
    list        The command lists all duplicates that have been found yet. If no option is given duplicates across users are shown.
      options
        -u, --user list only duplicates of the specified user (-u admin)
    clear       The command will clear all information that has been stored in the database
      options
        -f, --force the flag forces to do the cleanup. _attention_ you will not be asked any questions

## Config

The app depends on the following settings.
All settings should be modified only through UI. If this doesn't work for you, you can apply them via the [occ-command](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/occ_command.html?highlight=occ#config-commands-label).

| Setting | Type | Default | Effect |
|---|---|---|---|
| ignore_mounted_files | boolean | false | When true, files mounted on external storage will be ignored.<br>Computing the hash for an external file may require transferring the whole file to the Nextcloud server.<br>So, this setting can be useful when you need to reduce traffic e.g if you need to pay for the traffic. |
| disable_filesystem_events | boolean | false | When true, the event-based detection will be disabled.<br>This gives you more control when the hashes are generated. |
| backgroundjob_interval_cleanup | integer | 432000 | Interval in seconds in which the clean-up background job will be run |
| backgroundjob_interval_find | integer | 172800 | Interval in seconds in which the background job, to find duplicates, will be run |

## Preview

![Preview of the GUI](https://raw.githubusercontent.com/eldertek/duplicatefinder/master/img/preview.png)

## Special thanks

Big thanks to @PaulLereverend @chrros95 @Routhinator

## New Optimizations

The `duplicates:find-all` command has been optimized to handle large Nextcloud installations more efficiently. The following improvements have been made:

1. **Parallel Processing**: The scan now uses parallel processing to scan files concurrently, significantly reducing the time required for large datasets.
2. **Progress Indicator**: A progress indicator has been added to the `duplicates:find-all` command to provide real-time feedback on the scan progress.

### Usage Instructions

To use the optimized `duplicates:find-all` command, follow these steps:

1. **Run the Command**: Execute the `occ duplicates:find-all` command with the desired options. For example:
   ```
   sudo -u www-data php /var/www/nextcloud/occ -v duplicates:find-all
   ```

2. **Monitor Progress**: The progress indicator will display the current progress of the scan, allowing you to monitor its status in real-time.

3. **Parallel Processing**: The scan will automatically utilize parallel processing to speed up the scan for large datasets. No additional configuration is required.

These optimizations ensure that the `duplicates:find-all` command completes the scan in a reasonable time, even for large Nextcloud installations.

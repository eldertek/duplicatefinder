<template>
    <SettingsFrame>
        <SettingsPageTitle :help="'https://github.com/eldertek/duplicatefinder'"
            :label="'(' + gettext('Version: ') + (settings.installed_version || 'n.a.') + ')'"
            :description="gettext('Adjust these settings to make the process of finding duplicates your own.')">
            {{ gettext('Duplicate Finder') }}
        </SettingsPageTitle>
        <SettingsGrid>
            <Setting setting="ignore_mounted_files" type="checkbox"
                :hint="gettext('When true, files mounted on external storage will be ignored...')"
                :value="settings.ignore_mounted_files">
                {{ gettext('Ignore Mounted Files') }}
            </Setting>

            <Setting setting="disable_filesystem_events" type="checkbox"
                :hint="gettext('When true, the event-based detection will be disabled...')"
                :value="settings.disable_filesystem_events">
                {{ gettext('Disable event-based detection') }}
            </Setting>

            <Setting setting="backgroundjob_interval_cleanup" type="text"
                :hint="gettext('Interval in seconds in which the clean-up background job will be run')"
                :value="settings.backgroundjob_interval_cleanup">
                {{ gettext('Background Job Interval (Cleanup)') }}
            </Setting>

            <Setting setting="backgroundjob_interval_find" type="text"
                :hint="gettext('Interval in seconds in which the background job, to find duplicates, will be run')"
                :value="settings.backgroundjob_interval_find">
                {{ gettext('Background Job Interval (Find Duplicates)') }}
            </Setting>
        </SettingsGrid>
    </SettingsFrame>
</template>
  
<script>
export default {
    name: 'Settings',
    data() {
        return {
            settings: {},
            filter: {},
        };
    },
    created() {
        const viewData = this.$store.state.SettingsView;
        if (viewData && viewData.settings) {
            this.settings = viewData.settings;
            this.filter = viewData.filter;
        }
    },
    methods: {
        gettext(message) {
            return message;
        },
    },
};
</script>
  
<style scoped></style>
  
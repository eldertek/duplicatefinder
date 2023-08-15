<template>
    <NcAppSettingsSection :title="gettext('Duplicate Finder')">
        <NcCheckboxRadioSwitch :label="gettext('Ignore Mounted Files')" :value="settings.ignore_mounted_files"
            @input="updateSetting('ignore_mounted_files', $event)">
            <template #hint>{ gettext('When true, files mounted on external storage will be ignored...') }</template>
        </NcCheckboxRadioSwitch>

        <NcCheckboxRadioSwitch :label="gettext('Disable event-based detection')" :value="settings.disable_filesystem_events"
            @input="updateSetting('disable_filesystem_events', $event)">
            <template #hint>{ gettext('When true, the event-based detection will be disabled...') }</template>
        </NcCheckboxRadioSwitch>

        <NcInputField :label="gettext('Background Job Interval (Cleanup)')"
            :value="settings.backgroundjob_interval_cleanup" @input="updateSetting('backgroundjob_interval_cleanup', $event)">
            <template #hint>{ gettext('Interval in seconds in which the clean-up background job will be run...') }</template>
        </NcInputField>

        <NcInputField :label="gettext('Background Job Interval (Find Duplicates)')"
            :value="settings.backgroundjob_interval_find" @input="updateSetting('backgroundjob_interval_find', $event)">
            <template #hint>{ gettext('Interval in seconds in which the background job, to find duplicates, will be run...') }</template>
        </NcInputField>
    </NcAppSettingsSection>
</template>
  
<script>
import { NcCheckboxRadioSwitch, NcAppSettingsSection, NcInputField } from '@nextcloud/vue'

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
  
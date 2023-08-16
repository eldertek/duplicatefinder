<template>
  <div id="duplicatefinder_settings_form">
    <NcSettingsSection name="Ignore Mounted Files"
      description="When true, files mounted on external storage will be ignored..." :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.ignore_mounted_files">Ignore mounted file</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="Disable Filesystem Events"
      description="When true, the event-based detection will be disabled..." :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.disable_filesystem_events">Disable filesystem events</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Cleanup Interval (seconds)"
      description="The interval in seconds for the cleanup background job..." :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_cleanup"></NcTextField>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Find Duplicates Interval (seconds)"
      description="The interval in seconds for the find duplicates background job..." :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_find"></NcTextField>
    </NcSettingsSection>
  </div>
</template>
  
<script>
import { NcSettingsSection, NcCheckboxRadioSwitch, NcTextField } from '@nextcloud/vue'

export default {
  components: {
    NcSettingsSection,
    NcCheckboxRadioSwitch,
    NcTextField
  },
  data() {
    return {
      settings: {
        ignore_mounted_files: false,
        disable_filesystem_events: false,
        backgroundjob_interval_cleanup: 432000,
        backgroundjob_interval_find: 172800,
        ignored_files: "[]"
      }
    }
  },
  methods: {
    saveSettings() {
      // Logic to save the settings data
    }
  }
}
</script>

<style scoped>
#duplicatefinder_settings_form {
  background-color: var(--color-main-background);
  width: 100%;
  overflow-y: auto;
}
</style>
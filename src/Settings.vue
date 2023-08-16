<template>
  <div id="duplicatefinder_settings_form">
    <NcSettingsSection name="Ignore Mounted Files"
      description="When true, files mounted on external storage will be ignored..." :limit-width="true">
      <p>Your settings here</p>
    </NcSettingsSection>

    <NcSettingsSection name="Disable Filesystem Events"
      description="When true, the event-based detection will be disabled..." :limit-width="true">
      <p>Your settings here</p>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Cleanup Interval (seconds)"
      description="The interval in seconds for the cleanup background job..." :limit-width="true">
      <p>Your settings here</p>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Find Duplicates Interval (seconds)"
      description="The interval in seconds for the find duplicates background job..." :limit-width="true">
      <p>Your settings here</p>
    </NcSettingsSection>

    <NcSettingsSection name="Ignored Files (JSON Array)" description="Files to ignore..." :limit-width="true">
      <p>Your settings here</p>
    </NcSettingsSection>
  </div>
</template>
  
<script>
import { NcSettingsSection } from '@nextcloud/vue'

export default {
  components: {
    NcSettingsSection
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
	overflow-y: auto;
}
</style>
<template>
  <div id="duplicatefinder_settings_form">
    <h2>Duplicate Finder Settings</h2>
    <NcSettingsSection name="Ignore Mounted Files"
      description="When true, files mounted on external storage will be ignored..." :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.ignore_mounted_files" @input="saveSettings">Ignore mounted file</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="Disable Filesystem Events"
      description="When true, the event-based detection will be disabled..." :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.disable_filesystem_events" @input="saveSettings">Disable filesystem events</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Cleanup Interval (seconds)"
      description="The interval in seconds for the cleanup background job..." :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_cleanup" @input="saveSettings"></NcTextField>
    </NcSettingsSection>

    <NcSettingsSection name="Background Job Find Duplicates Interval (seconds)"
      description="The interval in seconds for the find duplicates background job..." :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_find" @input="saveSettings"></NcTextField>
    </NcSettingsSection>
  </div>
</template>
  
<script>
import { NcSettingsSection, NcCheckboxRadioSwitch, NcTextField } from '@nextcloud/vue'

export default {
  async mounted() {
    try {
      const response = await this.$axios.get('/apps/duplicatefinder/api/v1/settings');
      this.settings = response.data.data;
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  },
  components: {
    NcSettingsSection,
    NcCheckboxRadioSwitch,
    NcTextField
  },
  data() {
    return {
      settings: {}
    }
  },
  methods: {
    saveSettings() {
      this.$axios.post('/apps/duplicatefinder/api/v1/settings', this.settings).then(response => {
        console.log("Settings saved successfully:", response.data);
      }).catch(error => {
        console.error("Error saving settings:", error);
      });
    },
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
<template>
  <div id="duplicatefinder_settings_form">
    <NcSettingsSection name="{{ t('duplicatefinder', 'Duplicate Finder Settings') }}"
      description="{{ t('duplicatefinder', 'All general settings to modify Duplicate Finder behaviors.') }}"
      :limit-width="true">
    </NcSettingsSection>

    <NcSettingsSection name="{{ t('duplicatefinder', 'Ignore Mounted Files') }}"
      description="{{ t('duplicatefinder', 'When true, files mounted on external storage will be ignored...') }}"
      :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.ignore_mounted_files" @input="saveSettings">{{ t('duplicatefinder',
        'Ignore mounted file') }}</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="{{ t('duplicatefinder', 'Disable Filesystem Events') }}"
      description="{{ t('duplicatefinder', 'When true, the event-based detection will be disabled...') }}"
      :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.disable_filesystem_events" @input="saveSettings">{{
        t('duplicatefinder', 'Disable filesystem events') }}</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection name="{{ t('duplicatefinder', 'Background Job Cleanup Interval (seconds)') }}"
      description="{{ t('duplicatefinder', 'The interval in seconds for the cleanup background job...') }}"
      :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_cleanup" @input="saveSettings"></NcTextField>
    </NcSettingsSection>

    <NcSettingsSection name="{{ t('duplicatefinder', 'Background Job Find Duplicates Interval (seconds)') }}"
      description="{{ t('duplicatefinder', 'The interval in seconds for the find duplicates background job...') }}"
      :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_find" @input="saveSettings"></NcTextField>
    </NcSettingsSection>
  </div>
</template>
      
<script>
import { NcSettingsSection, NcCheckboxRadioSwitch, NcTextField } from '@nextcloud/vue'

export default {
  async mounted() {
    try {
      const response = await axios.get(generateUrl('/apps/duplicatefinder/api/v1/settings'))
      this.settings = response.data;
      console.error(response.data)
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


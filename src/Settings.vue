<template>
  <div id="duplicatefinder_settings_form">
    <NcSettingsSection :name="t('duplicatefinder', 'Duplicate Finder Settings')"
      :description="t('duplicatefinder', 'All general settings to modify Duplicate Finder behaviors.')"
      :limit-width="true">
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Ignore Mounted Files')"
      :description="t('duplicatefinder', 'When true, files mounted on external storage will be ignored.')"
      :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.ignore_mounted_files">{{ t('duplicatefinder',
        'Ignore mounted file') }}</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Disable Filesystem Events')"
      :description="t('duplicatefinder', 'When true, the event-based detection will be disabled.')" :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.disable_filesystem_events">{{ t('duplicatefinder',
        'Disable filesystem events') }}</NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Background Job Cleanup Interval (seconds)')"
      :description="t('duplicatefinder', 'The interval in seconds for the cleanup background job.')" :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_cleanup"></NcTextField>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Background Job Find Duplicates Interval (seconds)')"
      :description="t('duplicatefinder', 'The interval in seconds for the find duplicates background job.')"
      :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_find"></NcTextField>
    </NcSettingsSection>

    <NcButton @click="saveSettings" type="primary">{{ t('duplicatefinder', 'Save') }}</NcButton>
  </div>
</template>
      
<script>
import { generateUrl } from '@nextcloud/router'
import { NcButton, NcSettingsSection, NcCheckboxRadioSwitch, NcTextField } from '@nextcloud/vue'
import { showError, showSuccess } from '@nextcloud/dialogs'
import axios from '@nextcloud/axios'

export default {
  async mounted() {
    try {
      const response = await axios.get(generateUrl('/apps/duplicatefinder/api/v1/settings'))
      this.settings = response.data.data;
    } catch (e) {
      console.error(e)
      showError(t('duplicatefinder', 'Could not fetch settings'))
    }
  },
  components: {
    NcButton,
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
      const config = {
        ignored_files: "",
        backgroundjob_interval_find: this.settings.backgroundjob_interval_find,
        backgroundjob_interval_cleanup: this.settings.backgroundjob_interval_cleanup,
        disable_filesystem_events: this.settings.disable_filesystem_events,
        ignore_mounted_files: this.settings.ignore_mounted_files
      };

      axios.post(generateUrl('/apps/duplicatefinder/api/v1/settings'), { config: this.settings })
        .then(response => {
          showSuccess(t('duplicatefinder', 'Settings saved'));
        })
        .catch(error => {
          showError(t('duplicatefinder', 'Could not save settings'));
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


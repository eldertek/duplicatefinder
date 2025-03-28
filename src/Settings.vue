<template>
  <div id="app-content">
    <NcSettingsSection :name="t('duplicatefinder', 'Duplicate Finder Settings')"
      :description="t('duplicatefinder', 'All general settings to modify Duplicate Finder behaviors.')"
      :limit-width="true">
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Ignore Mounted Files')"
      :description="t('duplicatefinder', 'When true, files mounted on external storage will be ignored.')"
      :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.ignore_mounted_files"
        @update:checked="saveSettings('ignore_mounted_files', settings.ignore_mounted_files)">
        {{ t('duplicatefinder', 'Ignore mounted file') }}
      </NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Disable Filesystem Events')"
      :description="t('duplicatefinder', 'When true, the event-based detection will be disabled.')" :limit-width="true">
      <NcCheckboxRadioSwitch :checked.sync="settings.disable_filesystem_events"
        @update:checked="saveSettings('disable_filesystem_events', settings.disable_filesystem_events)">
        {{ t('duplicatefinder', 'Disable filesystem events') }}
      </NcCheckboxRadioSwitch>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Background Job Cleanup Interval (seconds)')"
      :description="t('duplicatefinder', 'The interval in seconds between database cleanup operations. This job only maintains the database and does not delete any files from your storage. It helps keep the app running smoothly by removing outdated database entries.')" :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_cleanup"
        @update:value="saveSettings('backgroundjob_interval_cleanup', settings.backgroundjob_interval_cleanup)">
      </NcTextField>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Background Job Find Duplicates Interval (seconds)')"
      :description="t('duplicatefinder', 'The interval in seconds for the find duplicates background job.')"
      :limit-width="true">
      <NcTextField :value.sync="settings.backgroundjob_interval_find"
        @update:value="saveSettings('backgroundjob_interval_find', settings.backgroundjob_interval_find)"></NcTextField>
    </NcSettingsSection>

    <NcSettingsSection :name="t('duplicatefinder', 'Advanced settings (be cautious)')" 
      :description="t('duplicatefinder', 'These settings are for advanced users only. If you are not sure what you are doing, please do not change them.')"
      :limit-width="true">
      <div class="buttons-container">
        <NcButton @click="clearAllDuplicates">{{ t('duplicatefinder', 'Clear all duplicates') }}</NcButton>
        <NcButton @click="findAllDuplicates">{{ t('duplicatefinder', 'Find all duplicates') }}</NcButton>
      </div>
    </NcSettingsSection>
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
      const response = await axios.get(generateUrl('/apps/duplicatefinder/api/settings'))
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
    saveSettings(key, value) {
      axios.post(generateUrl(`/apps/duplicatefinder/api/settings/${key}/${value}`))
        .then(response => {
          showSuccess(t('duplicatefinder', 'Settings saved'));
        })
        .catch(error => {
          showError(t('duplicatefinder', 'Could not save settings'));
        });
    },
    clearAllDuplicates() {
      axios.post(generateUrl('/apps/duplicatefinder/api/duplicates/clear'))
        .then(response => {
          showSuccess(t('duplicatefinder', 'All duplicates cleared'));
        })
        .catch(error => {
          showError(t('duplicatefinder', 'Could not clear duplicates'));
        });
    },
    findAllDuplicates() {
      showSuccess(t('duplicatefinder', 'Duplicates search initiated (this may take a while)'));
      axios.post(generateUrl('/apps/duplicatefinder/api/duplicates/find'))
        .then(response => {
          showSuccess(t('duplicatefinder', 'All duplicates found'));
        })
        .catch(error => {
          showError(t('duplicatefinder', 'Could not initiate duplicate search'));
        });
    }
  }
}
</script>

<style scoped>
.app-content {
  background-color: var(--color-main-background);
  width: 100%;
  overflow-y: auto;
}
.buttons-container {
  display: flex;
  gap: 10px;
}

</style>


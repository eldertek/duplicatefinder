<template>
  <NcSettingsSection :title="t('duplicatefinder', 'Duplicate Finder')" class="duplicatefinder-settings">
    <NcActions>
      <NcActionCheckbox :checked="settings.ignore_mounted_files" @change="settings.ignore_mounted_files = $event"
        id="ignore_mounted_files">
        Ignore Mounted Files
      </NcActionCheckbox>
      <p>When true, files mounted on external storage will be ignored...</p>

      <NcActionCheckbox :checked="settings.disable_filesystem_events"
        @change="settings.disable_filesystem_events = $event" id="disable_filesystem_events">
        Disable Filesystem Events
      </NcActionCheckbox>
      <p>When true, the event-based detection will be disabled.</p>

      <NcActionInput type="number" v-model="settings.backgroundjob_interval_cleanup"
        label="Background Job Cleanup Interval (seconds)" id="backgroundjob_interval_cleanup">
      </NcActionInput>

      <NcActionInput type="number" v-model="settings.backgroundjob_interval_find"
        label="Background Job Find Duplicates Interval (seconds)" id="backgroundjob_interval_find">
      </NcActionInput>

      <NcActionTextEditable v-model="settings.ignored_files" label="Ignored Files (JSON Array)" id="ignored_files"
        placeholder='Example: [[{"attribute":"filename","operator":"=","value":"1_1.txt"}]]'>
      </NcActionTextEditable>
    </NcActions>

    <NcActionButton @click="saveSettings" icon="icon-confirm">Save Settings</NcActionButton>
  </NcSettingsSection>
</template>
  
<script>
import {
  NcActions,
  NcActionCheckbox,
  NcActionInput,
  NcActionTextEditable,
  NcActionButton,
  NcSettingsSection
} from '@nextcloud/vue'

export default {
  components: {
    NcActions,
    NcActionCheckbox,
    NcActionInput,
    NcActionTextEditable,
    NcActionButton
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
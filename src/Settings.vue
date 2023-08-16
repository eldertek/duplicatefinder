<template>
  <div>
    <h2>Duplicate Finder - Settings</h2>

    <div class="actions">
      <input type="checkbox"
        :checked="settings.ignore_mounted_files"
        @change="settings.ignore_mounted_files = $event"
        id="ignore_mounted_files">
        Ignore Mounted Files
      
      <p>When true, files mounted on external storage will be ignored...</p>

      <input type="checkbox"
        :checked="settings.disable_filesystem_events"
        @change="settings.disable_filesystem_events = $event"
        id="disable_filesystem_events">
        Disable Filesystem Events
      
      <p>When true, the event-based detection will be disabled.</p>

      <input
        type="number"
        v-model="settings.backgroundjob_interval_cleanup"
        label="Background Job Cleanup Interval (seconds)"
        id="backgroundjob_interval_cleanup">
      

      <input
        type="number"
        v-model="settings.backgroundjob_interval_find"
        label="Background Job Find Duplicates Interval (seconds)"
        id="backgroundjob_interval_find">
      

      <textarea
        v-model="settings.ignored_files"
        label="Ignored Files (JSON Array)"
        id="ignored_files"
        placeholder='Example: [[{"attribute":"filename","operator":"=","value":"1_1.txt"}]]'>
      </textarea>
    </div>

    <button @click="saveSettings" icon="icon-confirm">Save Settings</button>
  </div>
</template>

<script>

export default {
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
.actions {
    display: flex;
    flex-direction: column;
    gap: 1rem; /* consistent spacing between elements */
}

.actions input[type="checkbox"] {
    margin-right: 0.5rem;
    vertical-align: middle;
}

.actions label {
    font-weight: bold; /* make labels more prominent */
    vertical-align: middle;
}

.actions p {
    margin-top: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.9rem; /* slightly smaller font for descriptions */
    color: #555; /* a neutral color for secondary text */
}

.actions input, .actions textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc; /* neutral border */
    border-radius: 3px; /* subtle rounding for a modern look */
}

button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background-color: #0082FC; /* Nextcloud's primary color */
    color: #fff; /* white text on primary buttons */
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.3s; /* smooth transition for hover effect */
}

button:hover {
    background-color: #005fb4; /* a darker shade for hover */
}
</style>

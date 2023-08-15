<template>
    <div id="duplicatefinder-settings">
        <div class="css-aghwaa">
            <h2>Duplicate Finder<span class="css-simmuk">(Version: 1.0.0)</span><a target="_blank" rel="noreferrer"
                    title="Open Help" href="https://github.com/eldertek/duplicatefinder" class="css-30y6it"></a></h2>
            <div class="css-1a1x5fs">Adjust these settings to make the process of finding duplicates your own.</div>
            <div class="css-x4n4mc">
                <div class="css-1u655lp">
                    <input id="setting_2" type="checkbox" class="css-1itpjs6">
                    <div class="css-1jbng5z"><label for="setting_2" class="css-s7lnbf">Ignore Mounted Files</label>
                        <div class="css-1g7fhnh">When true, files mounted on external storage will be ignored. Computing the
                            hash for an external file may require transferring the whole file to the Nextcloud server. So,
                            this setting can be useful when you need to reduce traffic e.g if you need to pay for the
                            traffic.</div>
                    </div>
                </div>
                <div class="css-1u655lp">
                    <input id="setting_4" type="checkbox" class="css-1itpjs6">
                    <div class="css-1jbng5z"><label for="setting_4" class="css-s7lnbf">Disable event-based detection</label>
                        <div class="css-1g7fhnh">When true, the event-based detection will be disabled. This gives you more
                            control when the hashes are generated.</div>
                    </div>
                </div>
                <div class="css-rwkpl7">
                    <div class="css-1jbng5z"><label for="setting_6" class="css-s7lnbf">Detection Interval</label>
                        <div class="css-1g7fhnh">Interval in seconds in which the clean-up background job will be run.</div>
                    </div>
                    <div class="css-1eyazhx">
                        <input id="setting_6" type="number" variant="conversion" class="css-qjp5a6"
                            value="<?php echo $detectionInterval; ?>">
                    </div>
                </div>
                <div class="css-rwkpl7">
                    <div class="css-1jbng5z"><label for="setting_8" class="css-s7lnbf">Cleanup Interval</label>
                        <div class="css-1g7fhnh">Interval in seconds in which the background job, to find duplicates, will
                            be run.</div>
                    </div>
                    <div class="css-1eyazhx">
                        <input id="setting_8" type="number" variant="conversion" class="css-qjp5a6"
                            value="<?php echo $cleanupInterval; ?>">
                    </div>
                </div>
            </div>
            <h3 style="font-weight: bold;">Ignored Files</h3><button>Add Condition</button>
            <div class="css-d5kv4l" @click="saveSettings">Save</div>
        </div>
        <div class="css-7jxi8x"></div>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    data() {
        return {
            ignoreMountedFiles: false,
            disableEventBasedDetection: false,
            detectionInterval: '',
            cleanupInterval: '',
        };
    },
    methods: {
        saveSettings() {
            axios.patch('/apps/duplicatefinder/api/v1/Settings', {
                ignore_mounted_files: this.ignoreMountedFiles,
                disable_filesystem_events: this.disableEventBasedDetection,
                backgroundjob_interval_find: this.detectionInterval,
                backgroundjob_interval_cleanup: this.cleanupInterval,
            })
                .then(response => {
                    alert("Data: " + response.data + "\nStatus: " + response.status);
                })
                .catch(error => {
                    alert(error);
                });
        },
    },
};
</script>
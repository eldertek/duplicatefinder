<?php
// Extract the settings
$ignoreMountedFiles = $settings['ignore_mounted_files'];
$disableEventBasedDetection = $settings['disable_filesystem_events'];
$detectionInterval = $settings['backgroundjob_interval_find'];
$cleanupInterval = $settings['backgroundjob_interval_cleanup'];
?>

<div id="duplicatefinder-settings">
    <div class="css-aghwaa">
        <h2>Duplicate Finder<span class="css-simmuk">(Version: 1.0.0)</span><a target="_blank" rel="noreferrer"
                title="Open Help" href="https://github.com/eldertek/duplicatefinder" class="css-30y6it"></a></h2>
        <div class="css-1a1x5fs">Adjust these settings to make the process of finding duplicates your own.</div>
        <div class="css-x4n4mc">
            <div class="css-1u655lp">
                <input id="setting_2" type="checkbox" class="css-1itpjs6" <?php echo $ignoreMountedFiles ? 'checked' : ''; ?>>
                <div class="css-1jbng5z"><label for="setting_2" class="css-s7lnbf">Ignore Mounted Files</label>
                    <div class="css-1g7fhnh">When true, files mounted on external storage will be ignored. Computing the
                        hash for an external file may require transferring the whole file to the Nextcloud server. So,
                        this setting can be useful when you need to reduce traffic e.g if you need to pay for the
                        traffic.</div>
                </div>
            </div>
            <div class="css-1u655lp">
                <input id="setting_4" type="checkbox" class="css-1itpjs6" <?php echo $disableEventBasedDetection ? 'checked' : ''; ?>>
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
                    <input id="setting_6" type="number" variant="conversion" class="css-qjp5a6" value="<?php echo $detectionInterval; ?>">
                    <select class="css-1ojds2j">
                        <option value="second">second</option>
                        <option value="minute">minute</option>
                        <option value="hour">hour</option>
                        <option value="day">day</option>
                        <option value="week">week</option>
                        <option value="month">month</option>
                    </select><span class="css-1wr6z7j">172800 second</span>
                </div>
            </div>
            <div class="css-rwkpl7">
                <div class="css-1jbng5z"><label for="setting_8" class="css-s7lnbf">Cleanup Interval</label>
                    <div class="css-1g7fhnh">Interval in seconds in which the background job, to find duplicates, will
                        be run.</div>
                </div>
                <div class="css-1eyazhx">
                    <input id="setting_8" type="number" variant="conversion" class="css-qjp5a6" value="<?php echo $cleanupInterval; ?>">
                    <select class="css-1ojds2j">
                        <option value="second">second</option>
                        <option value="minute">minute</option>
                        <option value="hour">hour</option>
                        <option value="day">day</option>
                        <option value="week">week</option>
                        <option value="month">month</option>
                    </select><span class="css-1wr6z7j">86400 second</span>
                </div>
            </div>
        </div>
        <h3 style="font-weight: bold;">Ignored Files</h3><button>Add Condition</button>
        <div class="css-11rkyjh"><button class="css-d5kv4l">Save</button></div>
    </div>
    <div class="css-7jxi8x"></div>
</div>
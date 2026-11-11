import { showErrorNotification } from "./notifications";

/**
 * Normalize the item path to extract the relative path within the user's files.
 *
 * @param {string} path - The full path of the item.
 * @returns {string} The normalized path or an empty string if no match.
 */
export function normalizeItemPath(path) {
    const match = path.match(/\/([^/]*)\/files(\/.*)/);
    return match ? match[2] : ''; // Return the normalized path or an empty string if no match
}

/**
 * Extract the normalized parent folder path of a file (e.g. '/Projects/a' or '/').
 *
 * @param {string} path - Full Nextcloud path or relative path of the file.
 * @returns {string} Parent folder path.
 */
export function getParentFolderPath(path) {
    if (!path || typeof path !== 'string') {
        return '/';
    }
    const relativePath = path.replace(/^\/[^/]+\/files(?=\/|$)/, '');
    const lastSlashIndex = relativePath.lastIndexOf('/');
    if (lastSlashIndex <= 0) {
        return '/';
    }
    return relativePath.substring(0, lastSlashIndex) || '/';
}

/**
 * Generate a URL for a preview image if the item is an image or video,
 * otherwise return the URL for the item's mimetype icon.
 *
 * This function internally uses `normalizeItemPath` to ensure paths are correctly formatted.
 *
 * @param {Object} item - The item for which to generate a preview image URL.
 * @returns {string} The URL to the preview image or mimetype icon.
 */
export function getPreviewImage(item) {
    // Check if the item is either an image or a video
    const isImageOrVideo = ['image', 'video'].includes(item.mimetype.split('/')[0]);
    const normalizedPath = normalizeItemPath(item.path); // Normalize the item path

    if (isImageOrVideo && normalizedPath) {
        // Construct query parameters for generating the preview
        const query = new URLSearchParams({
            file: normalizedPath,
            fileId: item.nodeId,
            x: 500,
            y: 500,
            forceIcon: 0
        });
        // Return the full URL to the preview image
        return OC.generateUrl('/core/preview.png?') + query.toString();
    } else {
        // For non-image/video files, return the URL to the mimetype icon
        return OC.MimeType.getIconUrl(item.mimetype);
    }
}

/**
 * Tell whether two entries of a duplicate describe the same file.
 *
 * Entries are matched on the id of their database row. Two missing ids never match each
 * other: a result without ids (project views before 1.8.3) used to make every file match
 * the first one, so deleting a file removed the wrong row from the screen (issue 180).
 * Without ids the path, which is unique per file, is compared instead.
 *
 * @param {Object} a - First file entry.
 * @param {Object} b - Second file entry.
 * @returns {boolean} True when both entries are the same file.
 */
export function isSameFile(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    const hasIdA = a.id !== null && a.id !== undefined;
    const hasIdB = b.id !== null && b.id !== undefined;
    if (hasIdA && hasIdB) {
        return a.id === b.id;
    }
    return Boolean(a.path) && a.path === b.path;
}

/**
 * Stable key of a file entry for v-for loops (its id, or its path when it has none).
 *
 * @param {Object} file - The file entry.
 * @returns {string|number} The key.
 */
export function fileKey(file) {
    return file.id !== null && file.id !== undefined ? file.id : file.path;
}

/**
 * Remove a file from a list of files.
 *
 * @param {Object} file - The file to remove from the list.
 * @param {Array} list - The list from which to remove the file.
 */
export function removeFileFromList(file, list) {
    const index = list.findIndex(f => isSameFile(f, file));
    if (index !== -1) {
        list.splice(index, 1);
    }
}

/**
 * Remove multiple files from a list of files.
 *
 * @param {Array} files - The files to remove from the list.
 * @param {Array} list - The list from which to remove the files.
 */
export function removeFilesFromList(files, list) {
    files.forEach(file => {
        const index = list.findIndex(f => isSameFile(f, file));
        if (index !== -1) {
            list.splice(index, 1);
        }
    });
}

/**
 * Remove a duplicate from a list of duplicates
 *
 * @param {Object} duplicate - The duplicate to remove from the list.
 * @param {Array} acknowledgedDuplicates - The list of acknowledged duplicates.
 * @param {Array} unacknowledgedDuplicates - The list of unacknowledged duplicates.
 * @returns {Object} Updated lists of duplicates
 */
export function removeDuplicateFromList(duplicate, acknowledgedDuplicates, unacknowledgedDuplicates) {
    console.log('removeDuplicateFromList: Starting with duplicate:', duplicate);
    console.log('removeDuplicateFromList: Initial lists state:', {
        acknowledgedCount: acknowledgedDuplicates.length,
        unacknowledgedCount: unacknowledgedDuplicates.length
    });

    if (duplicate.files.length <= 1) {
        console.log('removeDuplicateFromList: Duplicate has <= 1 files, proceeding with removal');
        // Remove from the appropriate list based on acknowledged status
        if (duplicate.acknowledged) {
            const index = acknowledgedDuplicates.findIndex(d => d.id === duplicate.id);
            console.log('removeDuplicateFromList: Acknowledged duplicate index:', index);
            if (index !== -1) {
                acknowledgedDuplicates.splice(index, 1);
                console.log('removeDuplicateFromList: Removed from acknowledged list');
            }
        } else {
            const index = unacknowledgedDuplicates.findIndex(d => d.id === duplicate.id);
            console.log('removeDuplicateFromList: Unacknowledged duplicate index:', index);
            if (index !== -1) {
                unacknowledgedDuplicates.splice(index, 1);
                console.log('removeDuplicateFromList: Removed from unacknowledged list');
            }
        }
    } else {
        console.log('removeDuplicateFromList: Duplicate has > 1 files, skipping removal');
    }

    console.log('removeDuplicateFromList: Final lists state:', {
        acknowledgedCount: acknowledgedDuplicates.length,
        unacknowledgedCount: unacknowledgedDuplicates.length
    });

    return {
        acknowledgedDuplicates,
        unacknowledgedDuplicates
    };
}

/**
 * Get the total size of a duplicate in bytes.
 *
 * @param {Object} duplicate - The duplicate object.
 * @returns {number} The total size in bytes.
 */
export function getTotalSizeOfDuplicate(duplicate) {
    if (!duplicate || !duplicate.files) {
        return 0;
    }
    return duplicate.files.reduce((acc, file) => acc + file.size, 0);
}

/**
 * Get the formatted size of the current duplicate.
 *
 * @param {Object} currentDuplicate - The current duplicate.
 * @returns {string} The formatted size of the current duplicate.
 */
export function getFormattedSizeOfCurrentDuplicate(currentDuplicate) {
    if (!currentDuplicate) {
        return OC.Util.humanFileSize(0);
    }
    const totalSize = getTotalSizeOfDuplicate(currentDuplicate);
    return OC.Util.humanFileSize(totalSize);
}

/**
 * Open a file in the viewer.
 *
 * @param {Object} file - The file to open in the viewer.
 */
export function openFileInViewer(file) {
    // Ensure the viewer script is loaded and OCA.Viewer is available
    if (OCA && OCA.Viewer) {
        const filePath = normalizeItemPath(file.path);
        // Open the viewer with the fileinfo
        OCA.Viewer.open({
            path: filePath,
        });
    } else {
        showErrorNotification(t('duplicatefinder', 'The viewer is not available'));
        console.error('Viewer is not available');
    }
}

const UI_PREFERENCES_DEFAULTS = {
    acknowledgedOpen: true,
    unacknowledgedOpen: true,
    sortOption: 'none',
    minSizeBytes: 0,
};

/**
 * Compute the per-user localStorage key for persisted UI preferences.
 *
 * @returns {string} Storage key scoped to the active Nextcloud user.
 */
export function getUiPreferencesStorageKey() {
    let uid = 'default';
    try {
        if (typeof window !== 'undefined' && window.OC) {
            if (typeof window.OC.getCurrentUser === 'function') {
                const user = window.OC.getCurrentUser();
                if (user && user.uid) {
                    uid = String(user.uid);
                }
            } else if (window.OC.currentUser) {
                uid = String(window.OC.currentUser);
            }
        }
    } catch (e) {
        // Ignore user lookup errors in test or restricted environments
    }
    return `duplicatefinder:ui-state:${uid}`;
}

/**
 * Load persisted sidebar dropdown and sort preferences from localStorage.
 *
 * @returns {Object} Normalized UI preferences object.
 */
export function loadUiPreferences() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return { ...UI_PREFERENCES_DEFAULTS };
        }
        const raw = window.localStorage.getItem(getUiPreferencesStorageKey());
        if (!raw) {
            return { ...UI_PREFERENCES_DEFAULTS };
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return { ...UI_PREFERENCES_DEFAULTS };
        }
        const validSorts = ['none', 'size-desc', 'size-asc'];
        const parsedMinSize = Number(parsed.minSizeBytes);
        return {
            acknowledgedOpen: typeof parsed.acknowledgedOpen === 'boolean'
                ? parsed.acknowledgedOpen
                : UI_PREFERENCES_DEFAULTS.acknowledgedOpen,
            unacknowledgedOpen: typeof parsed.unacknowledgedOpen === 'boolean'
                ? parsed.unacknowledgedOpen
                : UI_PREFERENCES_DEFAULTS.unacknowledgedOpen,
            sortOption: validSorts.includes(parsed.sortOption)
                ? parsed.sortOption
                : UI_PREFERENCES_DEFAULTS.sortOption,
            minSizeBytes: Number.isFinite(parsedMinSize) && parsedMinSize >= 0
                ? Math.floor(parsedMinSize)
                : UI_PREFERENCES_DEFAULTS.minSizeBytes,
        };
    } catch (e) {
        return { ...UI_PREFERENCES_DEFAULTS };
    }
}

/**
 * Persist updated UI preferences into localStorage, merging with existing values.
 *
 * @param {Object} partial - Partial preferences update.
 */
export function saveUiPreferences(partial) {
    try {
        if (!partial || typeof partial !== 'object' || typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        const next = {
            ...loadUiPreferences(),
        };
        if (typeof partial.acknowledgedOpen === 'boolean') {
            next.acknowledgedOpen = partial.acknowledgedOpen;
        }
        if (typeof partial.unacknowledgedOpen === 'boolean') {
            next.unacknowledgedOpen = partial.unacknowledgedOpen;
        }
        if (['none', 'size-desc', 'size-asc'].includes(partial.sortOption)) {
            next.sortOption = partial.sortOption;
        }
        if (partial.minSizeBytes !== undefined) {
            const parsedMinSize = Number(partial.minSizeBytes);
            next.minSizeBytes = Number.isFinite(parsedMinSize) && parsedMinSize >= 0
                ? Math.floor(parsedMinSize)
                : 0;
        }
        window.localStorage.setItem(getUiPreferencesStorageKey(), JSON.stringify(next));
    } catch (e) {
        // Storage quota or private-mode restrictions must never break navigation
    }
}

/**
 * Format an estimated remaining scan duration in seconds into a concise human string.
 *
 * @param {number|null|undefined} seconds - Remaining seconds.
 * @returns {string} Formatted duration (e.g. '45s', '2m 15s', '1h 10m') or empty string.
 */
export function formatScanEta(seconds) {
    const num = Number(seconds);
    if (!Number.isFinite(num) || num <= 0) {
        return '';
    }
    const totalSec = Math.max(1, Math.round(num));
    if (totalSec < 60) {
        return `${totalSec}s`;
    }
    if (totalSec < 3600) {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.round((totalSec % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

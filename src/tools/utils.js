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
 * Remove a file from a list of files.
 * 
 * @param {Object} file - The file to remove from the list.
 * @param {Array} list - The list from which to remove the file.
 */
export function removeFileFromList(file, list) {
    const index = list.findIndex(f => f.id === file.id);
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
        const index = list.findIndex(f => f.id === file.id);
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
 */
export function removeDuplicateFromList(duplicate, acknowledgedDuplicates, unacknowledgedDuplicates) {
    if (duplicate.acknowledged) {
        const index = acknowledgedDuplicates.findIndex(d => d.id === duplicate.id);
        acknowledgedDuplicates.splice(index, 1);
    } else {
        const index = unacknowledgedDuplicates.findIndex(d => d.id === duplicate.id);
        unacknowledgedDuplicates.splice(index, 1);
    }
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
    const totalSize = currentDuplicate.files.reduce((acc, file) => acc + file.size, 0);
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
import axios from 'axios';
import { showSuccessNotification, showErrorNotification } from '@/tools/notifications';
import { normalizeItemPath } from '@/tools/utils';

// Function to generate the base URL for API endpoints
function generateApiBaseUrl(path) {
    // Assuming 'path' starts with a '/', which is required by OC.generateUrl
    return OC.generateUrl(`/apps/duplicatefinder/api${path}`);
}

/**
 * Fetches lists of duplicates, either acknowledged or unacknowledged.
 * @param {string} type The type of duplicates to fetch ('acknowledged' or 'unacknowledged').
 * @param {number} limit The maximum number of duplicates to return.
 * @param {number} page The page number for pagination.
 * @returns {Promise<Object>} An object containing arrays of duplicates.
 */
export const fetchDuplicates = async (type = 'all', limit = 5, page = 1) => {
    try {
        const url = generateApiBaseUrl(`/duplicates/${type}?limit=${limit}&page=${page}`);
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${type} duplicates:`, error);
        throw error;
    }
};

/**
 * Marks a duplicate as acknowledged.
 * @param {string} hash The hash of the duplicate to acknowledge.
 * @returns {Promise<void>}
 */
export const acknowledgeDuplicate = async (hash) => {
    try {
        const url = generateApiBaseUrl(`/duplicates/acknowledge/${hash}`);
        await axios.post(url);
        showSuccessNotification(t('duplicatefinder', 'Duplicate acknowledged successfully'));
    } catch (error) {
        console.error(`Error acknowledging duplicate with hash ${hash}:`, error);
        showErrorNotification(t('duplicatefinder', 'Error acknowledging duplicate.'));
        throw error;
    }
};

/**
 * Marks a duplicate as unacknowledged.
 * @param {string} hash The hash of the duplicate to unacknowledge.
 * @returns {Promise<void>}
 */
export const unacknowledgeDuplicate = async (hash) => {
    try {
        const url = generateApiBaseUrl(`/duplicates/unacknowledge/${hash}`);
        await axios.post(url);
        showSuccessNotification(t('duplicatefinder', 'Duplicate unacknowledged successfully.'));
    } catch (error) {
        console.error(`Error unacknowledging duplicate with hash ${hash}:`, error);
        showErrorNotification(t('duplicatefinder', 'Error unacknowledging duplicate.'));
        throw error;
    }
};

/**
 * Deletes a file from a duplicate.
 * @param {Object} file The file to delete.
 * @returns {Promise<void>}
 */
export const deleteFile = async (file) => {
    const fileClient = OC.Files.getClient();
    const filePath = normalizeItemPath(file.path);
    try {
        await fileClient.remove(filePath);
        showSuccessNotification(t('duplicatefinder', 'File deleted successfully.'));
    } catch (error) {
        console.error(`Error deleting file with path ${filePath}`, error);
        showErrorNotification(t('duplicatefinder', 'Error deleting file.'));
    }
};

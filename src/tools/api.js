import axios from 'axios';
import { generateUrl } from '@nextcloud/router';
import { showSuccessNotification, showErrorNotification } from '@/tools/notifications';
import { normalizeItemPath } from '@/tools/utils';

// Function to generate the base URL for API endpoints
function generateApiBaseUrl(path) {
    // Assuming 'path' starts with a '/', which is required by OC.generateUrl
    return OC.generateUrl(`/apps/duplicatefinder/api${path}`);
}

// Configure axios defaults for Nextcloud
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.headers.common.requesttoken = OC.requestToken;

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
        showErrorNotification(t('duplicatefinder', 'Error fetching duplicates.'));
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
    try {
        const url = generateApiBaseUrl('/files/delete');
        const filePath = normalizeItemPath(file.path);
        await axios.post(url, { path: filePath });
        showSuccessNotification(t('duplicatefinder', 'File deleted successfully.'));
        return true;
    } catch (error) {
        console.error(`Error deleting file with path ${file.path}:`, error);
        const errorData = error.response?.data;

        switch(errorData?.error) {
            case 'ORIGIN_FOLDER_PROTECTED':
                showErrorNotification(t('duplicatefinder', 'Cannot delete file as it is in an origin folder'));
                break;
            case 'FILE_NOT_FOUND':
                showErrorNotification(t('duplicatefinder', 'File not found'));
                break;
            case 'PERMISSION_DENIED':
                showErrorNotification(t('duplicatefinder', 'Permission denied to delete file'));
                break;
            default:
                showErrorNotification(t('duplicatefinder', 'Error deleting file'));
        }
        throw error;
    }
};

/**
 * Deletes multiple files.
 * @param {Array} files The files to delete.
 * @returns {Promise<void>}
 */
export const deleteFiles = async (files) => {
    const results = [];
    const errors = [];

    for (const file of files) {
        try {
            const success = await deleteFile(file);
            if (success) {
                results.push(file);
            }
        } catch (error) {
            errors.push(file);
        }
    }

    if (results.length > 0) {
        showSuccessNotification(
            t('duplicatefinder', '{count} files deleted successfully.',
            { count: results.length })
        );
    }

    if (errors.length > 0) {
        showErrorNotification(
            t('duplicatefinder', 'Failed to delete {count} files.',
            { count: errors.length })
        );
    }

    return {
        success: results,
        errors: errors
    };
};

/**
 * Loads the list of origin folders.
 * @returns {Promise<Array>} The list of origin folders.
 */
export const loadOriginFolders = async () => {
    try {
        const url = generateApiBaseUrl('/origin-folders');
        const response = await axios.get(url);
        return response.data.folders;
    } catch (error) {
        console.error('Error loading origin folders:', error);
        showErrorNotification(t('duplicatefinder', 'Failed to load origin folders'));
        throw error;
    }
};

/**
 * Saves the list of origin folders.
 * @param {Array} folders The list of folder paths to save.
 * @returns {Promise<void>}
 */
export const saveOriginFolders = async (folders) => {
    try {
        const url = generateApiBaseUrl('/origin-folders');
        const response = await axios.post(url, { folders });

        if (response.data.errors && response.data.errors.length > 0) {
            const errorMessages = response.data.errors
                .map(error => `${error.path}: ${error.error}`)
                .join('\n');
            showErrorNotification(t('duplicatefinder', 'Some folders could not be saved:\n{errors}',
                { errors: errorMessages }));
        } else {
            showSuccessNotification(t('duplicatefinder', 'Origin folders saved successfully'));
        }
    } catch (error) {
        console.error('Error saving origin folders:', error);
        showErrorNotification(t('duplicatefinder', 'Failed to save origin folders'));
        throw error;
    }
};

/**
 * Deletes an origin folder.
 * @param {string} folderId The ID of the folder to delete.
 * @returns {Promise<void>}
 */
export const deleteOriginFolder = async (folderId) => {
    try {
        const url = generateApiBaseUrl(`/origin-folders/${folderId}`);
        await axios.delete(url);
    } catch (error) {
        console.error('Error deleting origin folder:', error);
        showErrorNotification(t('duplicatefinder', 'Failed to delete origin folder'));
        throw error;
    }
};

/**
 * Fetches duplicates for bulk deletion preview.
 * @param {number} limit The maximum number of duplicates to return.
 * @param {number} page The page number for pagination.
 * @returns {Promise<Object>} An object containing arrays of duplicates.
 */
export const fetchDuplicatesForBulk = async (limit = 30, page = 1) => {
    try {
        const url = generateApiBaseUrl('/duplicates/all');
        const response = await axios.get(url, {
            params: {
                onlyNonProtected: true,
                page,
                limit
            }
        });
        return response.data;
    } catch (error) {
        showErrorNotification(t('duplicatefinder', 'Error fetching duplicates for preview.'));
        console.error('Error fetching duplicates for bulk preview:', error);
        throw error;
    }
};

/**
 * Load all excluded folders for the current user
 * @returns {Promise<Array>} Array of excluded folders
 */
export async function loadExcludedFolders() {
    try {
        const url = generateApiBaseUrl('/excluded-folders')
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error loading excluded folders:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to load excluded folders'))
        throw error
    }
}

/**
 * Save a new excluded folder
 * @param {string} path The path to exclude
 * @returns {Promise<Object>} The created excluded folder
 */
export async function saveExcludedFolder(path) {
    try {
        const url = generateApiBaseUrl('/excluded-folders')
        const response = await axios.post(url, { path })
        showSuccessNotification(t('duplicatefinder', 'Folder added to excluded folders'))
        return response.data
    } catch (error) {
        console.error('Error saving excluded folder:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to add folder to excluded folders'))
        throw error
    }
}

/**
 * Delete an excluded folder
 * @param {number} id The ID of the excluded folder to delete
 * @returns {Promise<void>}
 */
export async function deleteExcludedFolder(id) {
    try {
        const url = generateApiBaseUrl(`/excluded-folders/${id}`)
        await axios.delete(url)
        showSuccessNotification(t('duplicatefinder', 'Folder removed from excluded folders'))
    } catch (error) {
        console.error('Error deleting excluded folder:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to remove folder from excluded folders'))
        throw error
    }
}

export async function loadFilters() {
    try {
        const url = generateApiBaseUrl('/filters')
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error loading filters:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to load filters'))
        throw error
    }
}

export async function saveFilter(filter) {
    try {
        const url = generateApiBaseUrl('/filters')
        const response = await axios.post(url, filter)
        showSuccessNotification(t('duplicatefinder', 'Filter added successfully'))
        return response.data
    } catch (error) {
        console.error('Error saving filter:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to add filter'))
        throw error
    }
}

/**
 * Initiates a search for duplicates across the filesystem.
 * @returns {Promise<Object>} The response from the server.
 */
export async function findDuplicates() {
    try {
        const url = generateApiBaseUrl('/duplicates/find');
        const response = await axios.post(url);
        return response.data;
    } catch (error) {
        console.error('Error initiating duplicate search:', error);
        showErrorNotification(t('duplicatefinder', 'Failed to initiate duplicate search'));
        throw error;
    }
}

export async function deleteFilter(id) {
    try {
        const url = generateApiBaseUrl(`/filters/${id}`)
        const response = await axios.delete(url)
        showSuccessNotification(t('duplicatefinder', 'Filter removed successfully'))
        return response.data
    } catch (error) {
        console.error('Error deleting filter:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to remove filter'))
        throw error
    }
}

/**
 * Fetches all projects for the current user
 * @returns {Promise<Array>} Array of projects
 */
export async function fetchProjects() {
    try {
        const url = generateApiBaseUrl('/projects')
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error fetching projects:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to load projects'))
        throw error
    }
}

/**
 * Fetches a specific project by ID
 * @param {number} id The project ID
 * @returns {Promise<Object>} The project
 */
export async function fetchProject(id) {
    try {
        const url = generateApiBaseUrl(`/projects/${id}`)
        const response = await axios.get(url)
        return response.data
    } catch (error) {
        console.error(`Error fetching project ${id}:`, error)
        showErrorNotification(t('duplicatefinder', 'Failed to load project'))
        throw error
    }
}

/**
 * Creates a new project
 * @param {string} name The project name
 * @param {Array} folders Array of folder paths
 * @returns {Promise<Object>} The created project
 */
export async function createProject(name, folders) {
    try {
        const url = generateApiBaseUrl('/projects')
        const response = await axios.post(url, { name, folders })
        showSuccessNotification(t('duplicatefinder', 'Project created successfully'))
        return response.data
    } catch (error) {
        console.error('Error creating project:', error)
        showErrorNotification(t('duplicatefinder', 'Failed to create project'))
        throw error
    }
}

/**
 * Updates an existing project
 * @param {number} id The project ID
 * @param {string} name The new project name
 * @param {Array} folders Array of new folder paths
 * @returns {Promise<Object>} The updated project
 */
export async function updateProject(id, name, folders) {
    try {
        const url = generateApiBaseUrl(`/projects/${id}`)
        const response = await axios.put(url, { name, folders })
        showSuccessNotification(t('duplicatefinder', 'Project updated successfully'))
        return response.data
    } catch (error) {
        console.error(`Error updating project ${id}:`, error)
        showErrorNotification(t('duplicatefinder', 'Failed to update project'))
        throw error
    }
}

/**
 * Deletes a project
 * @param {number} id The project ID
 * @returns {Promise<void>}
 */
export async function deleteProject(id) {
    try {
        const url = generateApiBaseUrl(`/projects/${id}`)
        await axios.delete(url)
        showSuccessNotification(t('duplicatefinder', 'Project deleted successfully'))
    } catch (error) {
        console.error(`Error deleting project ${id}:`, error)
        showErrorNotification(t('duplicatefinder', 'Failed to delete project'))
        throw error
    }
}

/**
 * Initiates a scan for a specific project
 * @param {number} id The project ID
 * @returns {Promise<Object>} The response from the server
 */
export async function scanProject(id) {
    try {
        const url = generateApiBaseUrl(`/projects/${id}/scan`)
        const response = await axios.post(url)
        showSuccessNotification(t('duplicatefinder', 'Project scan initiated'))
        return response.data
    } catch (error) {
        console.error(`Error scanning project ${id}:`, error)
        showErrorNotification(t('duplicatefinder', 'Failed to initiate project scan'))
        throw error
    }
}

/**
 * Fetches duplicates for a specific project
 * @param {number} id The project ID
 * @param {string} type The type of duplicates to fetch ('all', 'acknowledged', 'unacknowledged')
 * @param {number} page The page number
 * @param {number} limit The number of duplicates per page
 * @returns {Promise<Object>} The duplicates and pagination info
 */
export async function fetchProjectDuplicates(id, type = 'all', page = 1, limit = 50) {
    try {
        const url = generateApiBaseUrl(`/projects/${id}/duplicates/${type}`)
        const response = await axios.get(url, {
            params: { page, limit }
        })
        return response.data
    } catch (error) {
        console.error(`Error fetching duplicates for project ${id}:`, error)
        showErrorNotification(t('duplicatefinder', 'Failed to load project duplicates'))
        throw error
    }
}

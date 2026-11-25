import axios from 'axios'
import { generateUrl } from '@nextcloud/router'
import { showSuccessNotification, showErrorNotification } from '@/tools/notifications'
import { normalizeItemPath } from '@/tools/utils'

/**
 * Generate the base URL for DuplicateFinder API endpoints.
 *
 * @param {string} path - API sub-path starting with '/'.
 * @return {string} Resolved Nextcloud URL for the endpoint.
 */
function generateApiBaseUrl(path) {
	return generateUrl(`/apps/duplicatefinder/api${path}`)
}

// Configure axios defaults for Nextcloud
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'
axios.defaults.headers.common.requesttoken = OC.requestToken

/**
 * Fetches lists of duplicates, either acknowledged or unacknowledged.
 *
 * @param {string} type The type of duplicates to fetch ('acknowledged' or 'unacknowledged').
 * @param {number} limit The maximum number of duplicates to return.
 * @param {number} page The page number for pagination.
 * @param {object} [options] Optional query options.
 * @param {string} [options.sortBy] Server sort mode ('default', 'size-desc', 'size-asc').
 * @param {number} [options.minSize] Minimum file size in bytes.
 * @return {Promise<object>} An object containing arrays of duplicates.
 */
export const fetchDuplicates = async (type = 'all', limit = 5, page = 1, options = {}) => {
	try {
		const queryParams = new URLSearchParams({
			limit: String(limit),
			page: String(page),
		})
		if (options.sortBy && options.sortBy !== 'none' && options.sortBy !== 'default') {
			queryParams.set('sortBy', options.sortBy)
		}
		if (Number(options.minSize) > 0) {
			queryParams.set('minSize', String(Math.floor(Number(options.minSize))))
		}
		if (Number.isInteger(options.offset) && options.offset >= 0) {
			queryParams.set('offset', String(options.offset))
		}
		const url = generateApiBaseUrl(`/duplicates/${type}?${queryParams.toString()}`)
		const response = await axios.get(url)
		return response.data
	} catch (error) {
		showErrorNotification(t('duplicatefinder', 'Error fetching duplicates.'))
		console.error(`Error fetching ${type} duplicates:`, error)
		throw error
	}
}

/**
 * Marks a duplicate as acknowledged.
 *
 * @param {string} hash The hash of the duplicate to acknowledge.
 * @return {Promise<void>}
 */
export const acknowledgeDuplicate = async (hash) => {
	try {
		const url = generateApiBaseUrl(`/duplicates/acknowledge/${hash}`)
		await axios.post(url)
		showSuccessNotification(t('duplicatefinder', 'Duplicate acknowledged successfully'))
	} catch (error) {
		console.error(`Error acknowledging duplicate with hash ${hash}:`, error)
		showErrorNotification(t('duplicatefinder', 'Error acknowledging duplicate.'))
		throw error
	}
}

/**
 * Marks a duplicate as unacknowledged.
 *
 * @param {string} hash The hash of the duplicate to unacknowledge.
 * @return {Promise<void>}
 */
export const unacknowledgeDuplicate = async (hash) => {
	try {
		const url = generateApiBaseUrl(`/duplicates/unacknowledge/${hash}`)
		await axios.post(url)
		showSuccessNotification(t('duplicatefinder', 'Duplicate unacknowledged successfully.'))
	} catch (error) {
		console.error(`Error unacknowledging duplicate with hash ${hash}:`, error)
		showErrorNotification(t('duplicatefinder', 'Error unacknowledging duplicate.'))
		throw error
	}
}

/**
 * Deletes a file from a duplicate.
 *
 * The node id identifies the file exactly (a shared file has no path of the current user),
 * and the hash of the group lets the server refuse to delete the last remaining copy.
 *
 * @param {object} file The file to delete.
 * @param {object} [options] Optional deletion flags.
 * @param {boolean} [options.allowLastCopy] Delete the file even if it is the last copy of its group.
 * @param {boolean} [options.allowLivePhotoPair] Confirm deletion of both Live Photo components.
 * @param {Set<number>} [options.deletedNodeIds] Node IDs already deleted during this batch.
 * @return {Promise<boolean>} Whether the file was deleted rather than cancelled.
 */
export const deleteFile = async (file, options = {}) => {
	try {
		const url = generateApiBaseUrl('/files/delete')
		const filePath = normalizeItemPath(file.path)
		const body = { path: filePath }
		if (file.nodeId) {
			body.nodeId = file.nodeId
		}
		if (file.fileHash) {
			body.hash = file.fileHash
		}
		if (options.allowLastCopy) {
			body.allowLastCopy = true
		}
		if (options.allowLivePhotoPair) {
			body.allowLivePhotoPair = true
		}
		const response = await axios.post(url, body)
		for (const nodeId of response.data.deletedNodeIds || []) {
			options.deletedNodeIds?.add(Number(nodeId))
		}
		if (!options.silentSuccess) {
			showSuccessNotification(t('duplicatefinder', 'File deleted successfully.'))
		}
		return true
	} catch (error) {
		const errorData = error.response?.data
		if (errorData?.error === 'LIVE_PHOTO_CONFIRMATION_REQUIRED' && !options.allowLivePhotoPair) {
			if (window.confirm(t('duplicatefinder', 'Delete both the photo and the video of this Live Photo?'))) {
				return deleteFile(file, { ...options, allowLivePhotoPair: true })
			}
			return false
		}
		console.error(`Error deleting file with path ${file.path}:`, error)

		switch (errorData?.error) {
		case 'ORIGIN_FOLDER_PROTECTED':
			showErrorNotification(t('duplicatefinder', 'Cannot delete file as it is in an origin folder'))
			break
		case 'LAST_COPY_PROTECTED':
			showErrorNotification(t('duplicatefinder', 'This is the last remaining copy of this file, it was not deleted'))
			break
		case 'LIVE_PHOTO_VIDEO_PROTECTED':
			showErrorNotification(t('duplicatefinder', 'Cannot delete the video part of a Live Photo directly. Delete the paired photo instead only if both files are redundant.'))
			break
		case 'DELETE_ABORTED':
			showErrorNotification(t('duplicatefinder', 'File deletion was aborted by Nextcloud.'))
			break
		case 'LIVE_PHOTO_PAIR_PROTECTED':
			showErrorNotification(t('duplicatefinder', 'Cannot delete this Live Photo until another complete, identical photo and video pair is confirmed.'))
			break
		case 'FILE_NOT_FOUND':
			showErrorNotification(t('duplicatefinder', 'File not found'))
			break
		case 'PERMISSION_DENIED':
			showErrorNotification(t('duplicatefinder', 'Permission denied to delete file'))
			break
		case 'FILE_LOCKED':
			showErrorNotification(t('duplicatefinder', 'File is currently locked. Please try again later.'))
			break
		default:
			showErrorNotification(t('duplicatefinder', 'Error deleting file'))
		}
		throw error
	}
}

/**
 * Deletes multiple files.
 *
 * @param {Array} files The files to delete.
 * @param {object} [options] Same options as deleteFile.
 * @return {Promise<object>} Object with success, errors, and optional deletedNodeIds arrays.
 */
export const deleteFiles = async (files, options = {}) => {
	const results = []
	const errors = []
	const deletedNodeIds = options.deletedNodeIds || new Set()

	for (const file of files) {
		if (file.nodeId && deletedNodeIds.has(Number(file.nodeId))) {
			results.push(file)
			continue
		}
		try {
			const success = await deleteFile(file, { ...options, silentSuccess: true, deletedNodeIds })
			if (success) {
				results.push(file)
			}
		} catch (error) {
			errors.push(file)
		}
	}

	if (results.length > 0) {
		showSuccessNotification(
			n('duplicatefinder', '%n file deleted', '%n files deleted', results.length)
		)
	}

	if (errors.length > 0) {
		showErrorNotification(
			n('duplicatefinder', 'Failed to delete %n file', 'Failed to delete %n files', errors.length)
		)
	}

	return {
		success: results,
		errors,
		...(deletedNodeIds.size > 1 ? { deletedNodeIds: Array.from(deletedNodeIds) } : {}),
	}
}

/**
 * Loads the list of origin folders.
 *
 * @return {Promise<Array>} The list of origin folders.
 */
export const loadOriginFolders = async () => {
	try {
		const url = generateApiBaseUrl('/origin-folders')
		const response = await axios.get(url)
		return response.data.folders
	} catch (error) {
		console.error('Error loading origin folders:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to load origin folders'))
		throw error
	}
}

/**
 * Saves the list of origin folders.
 *
 * @param {Array} folders The list of folder paths to save.
 * @return {Promise<void>}
 */
export const saveOriginFolders = async (folders) => {
	try {
		const url = generateApiBaseUrl('/origin-folders')
		const response = await axios.post(url, { folders })

		if (response.data.errors && response.data.errors.length > 0) {
			const errorMessages = response.data.errors
				.map(error => `${error.path}: ${error.error}`)
				.join('\n')
			showErrorNotification(t('duplicatefinder', 'Some folders could not be saved:\n{errors}',
				{ errors: errorMessages }))
		} else {
			showSuccessNotification(t('duplicatefinder', 'Origin folders saved successfully'))
		}
	} catch (error) {
		console.error('Error saving origin folders:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to save origin folders'))
		throw error
	}
}

/**
 * Deletes an origin folder.
 *
 * @param {string} folderId The ID of the folder to delete.
 * @return {Promise<void>}
 */
export const deleteOriginFolder = async (folderId) => {
	try {
		const url = generateApiBaseUrl(`/origin-folders/${folderId}`)
		await axios.delete(url)
	} catch (error) {
		console.error('Error deleting origin folder:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to delete origin folder'))
		throw error
	}
}

/**
 * Fetches duplicates for bulk deletion preview.
 *
 * @param {number} limit The maximum number of duplicates to return.
 * @param {number} page The page number for pagination.
 * @param {object} [options] Optional query options.
 * @param {string} [options.sortBy] Server sort mode ('default', 'size-desc', 'size-asc').
 * @param {number} [options.minSize] Minimum file size in bytes.
 * @return {Promise<object>} An object containing arrays of duplicates.
 */
export const fetchDuplicatesForBulk = async (limit = 30, page = 1, options = {}) => {
	try {
		const url = generateApiBaseUrl('/duplicates/all')
		const params = {
			onlyNonProtected: true,
			page,
			limit,
		}
		if (options.sortBy && options.sortBy !== 'none' && options.sortBy !== 'default') {
			params.sortBy = options.sortBy
		}
		if (Number(options.minSize) > 0) {
			params.minSize = Math.floor(Number(options.minSize))
		}
		const response = await axios.get(url, { params })
		return response.data
	} catch (error) {
		showErrorNotification(t('duplicatefinder', 'Error fetching duplicates for preview.'))
		console.error('Error fetching duplicates for bulk preview:', error)
		throw error
	}
}

/**
 * Load all excluded folders for the current user
 *
 * @return {Promise<Array>} Array of excluded folders
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
 *
 * @param {string} path The path to exclude
 * @return {Promise<object>} The created excluded folder
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
 *
 * @param {number} id The ID of the excluded folder to delete
 * @return {Promise<void>}
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

/**
 *
 */
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

/**
 * Save a new filter rule.
 *
 * @param {object} filter Filter rule payload to persist.
 * @return {Promise<object>} Saved filter object returned by the server.
 */
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
 *
 * @return {Promise<object>} The response from the server.
 */
export async function findDuplicates() {
	try {
		const url = generateApiBaseUrl('/duplicates/find')
		const response = await axios.post(url)
		return response.data
	} catch (error) {
		console.error('Error initiating duplicate search:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to initiate duplicate search'))
		throw error
	}
}

/**
 * Fetches live scan status and progress for the current user without showing error notifications on transient polls.
 *
 * @return {Promise<object | null>} Normalized scan state object or null.
 */
export async function fetchScanStatus() {
	const url = generateApiBaseUrl('/scan/status')
	const response = await axios.get(url)
	return response.data?.scan || null
}

/**
 * Starts a duplicate scan for the current user's storage.
 *
 * @return {Promise<object | null>} Final scan state object when the HTTP request finishes.
 */
export async function startUserScan() {
	const url = generateApiBaseUrl('/scan/start')
	const response = await axios.post(url)
	return response.data?.scan || null
}

/**
 *
 */
export function notifyScanStarted() {
	showSuccessNotification(t('duplicatefinder', 'Duplicate scan started'))
}

/**
 *
 */
export function notifyScanCompleted() {
	showSuccessNotification(t('duplicatefinder', 'Duplicate scan completed'))
}

/**
 *
 */
export function notifyScanFailed() {
	showErrorNotification(t('duplicatefinder', 'Failed to initiate duplicate search'))
}

/**
 * Delete an existing filter rule by its ID.
 *
 * @param {number|string} id Filter identifier to delete.
 * @return {Promise<object>} Server response payload.
 */
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
 *
 * @return {Promise<Array>} Array of projects
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
 *
 * @param {number} id The project ID
 * @return {Promise<object>} The project
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
 *
 * @param {string} name The project name
 * @param {Array} folders Array of folder paths
 * @return {Promise<object>} The created project
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
 *
 * @param {number} id The project ID
 * @param {string} name The new project name
 * @param {Array} folders Array of new folder paths
 * @return {Promise<object>} The updated project
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
 *
 * @param {number} id The project ID
 * @return {Promise<void>}
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
 *
 * @param {number} id The project ID
 * @return {Promise<object>} The response from the server
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
 *
 * @param {number} id The project ID
 * @param {string} type The type of duplicates to fetch ('all', 'acknowledged', 'unacknowledged')
 * @param {number} page The page number
 * @param {number} limit The number of duplicates per page
 * @return {Promise<object>} The duplicates and pagination info
 */
export async function fetchProjectDuplicates(id, type = 'all', page = 1, limit = 50) {
	try {
		const url = generateApiBaseUrl(`/projects/${id}/duplicates/${type}`)
		const response = await axios.get(url, {
			params: { page, limit },
		})
		return response.data
	} catch (error) {
		console.error(`Error fetching duplicates for project ${id}:`, error)
		showErrorNotification(t('duplicatefinder', 'Failed to load project duplicates'))
		throw error
	}
}

/**
 * Scans user storage (or a list of recently cleaned candidate paths) for empty folders.
 *
 * @param {string[]} [candidatePaths] Optional folder or deleted-file paths to scope the check
 * @return {Promise<{folders: Array, count: number}>}
 */
export async function scanEmptyFolders(candidatePaths = []) {
	try {
		const url = generateApiBaseUrl('/empty-folders/scan')
		const payload = Array.isArray(candidatePaths) && candidatePaths.length > 0
			? { candidatePaths }
			: {}
		const response = await axios.post(url, payload)
		return response.data || { folders: [], count: 0 }
	} catch (error) {
		console.error('Error scanning empty folders:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to scan for empty folders.'))
		throw error
	}
}

/**
 * Deletes selected empty folders in one batch (deepest-first on the server).
 *
 * @param {string[]} paths Folder paths to delete
 * @return {Promise<{deleted: string[], errors: Array}>}
 */
export async function deleteEmptyFolders(paths = []) {
	try {
		const url = generateApiBaseUrl('/empty-folders/delete')
		const response = await axios.post(url, { paths })
		const data = response.data || {}
		const deleted = Array.isArray(data.deleted) ? data.deleted : []
		const errors = Array.isArray(data.errors) ? data.errors : []

		if (deleted.length > 0) {
			showSuccessNotification(
				n('duplicatefinder', '%n empty folder deleted', '%n empty folders deleted', deleted.length)
			)
		}
		if (errors.length > 0) {
			showErrorNotification(
				n('duplicatefinder', 'Failed to delete %n empty folder', 'Failed to delete %n empty folders', errors.length)
			)
		}

		return { deleted, errors }
	} catch (error) {
		console.error('Error deleting empty folders:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to delete empty folders.'))
		throw error
	}
}

/**
 * Fetches identical duplicate folder trees computed from active duplicate groups.
 *
 * @param {object} [options] Optional filters
 * @param {number} [options.minFiles] Minimum duplicate files inside a folder
 * @param {number} [options.minSize] Minimum total size in bytes per folder
 * @return {Promise<{status: string, groups: Array, summary: object}>}
 */
export async function fetchDuplicateFolders(options = {}) {
	try {
		const url = generateApiBaseUrl('/duplicates/folders')
		const params = {}
		if (Number(options.minFiles) > 1) {
			params.minFiles = Math.floor(Number(options.minFiles))
		}
		if (Number(options.minSize) > 0) {
			params.minSize = Math.floor(Number(options.minSize))
		}
		const response = await axios.get(url, { params })
		const data = response.data || {}
		return {
			status: data.status || 'success',
			groups: Array.isArray(data.groups) ? data.groups : [],
			summary: data.summary || { groupCount: 0, duplicateFolderCount: 0, reclaimableSize: 0 },
		}
	} catch (error) {
		console.error('Error fetching duplicate folders:', error)
		showErrorNotification(t('duplicatefinder', 'Failed to scan duplicate folders.'))
		throw error
	}
}

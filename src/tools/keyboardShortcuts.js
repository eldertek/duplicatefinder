/**
 * Pure keyboard shortcut helpers for fast duplicate triage.
 */

export const SHORTCUT_DEFINITIONS = Object.freeze([
	{
		id: 'next-duplicate',
		keys: ['j', 'ArrowDown'],
		action: 'next-duplicate',
	},
	{
		id: 'previous-duplicate',
		keys: ['k', 'ArrowUp'],
		action: 'previous-duplicate',
	},
	{
		id: 'jump-to-largest-group',
		keys: ['g'],
		action: 'jump-to-largest-group',
	},
	{
		id: 'keep-oldest',
		keys: ['o'],
		action: 'keep-oldest',
	},
	{
		id: 'keep-newest',
		keys: ['n'],
		action: 'keep-newest',
	},
	{
		id: 'keep-shortest-path',
		keys: ['s'],
		action: 'keep-shortest-path',
	},
	{
		id: 'select-duplicate-copies',
		keys: ['a'],
		action: 'select-duplicate-copies',
	},
	{
		id: 'clear-selection',
		keys: ['c'],
		action: 'clear-selection',
	},
	{
		id: 'copy-group-hash',
		keys: ['y'],
		action: 'copy-group-hash',
	},
	{
		id: 'export-csv-report',
		keys: ['e'],
		action: 'export-csv-report',
	},
	{
		id: 'export-json-report',
		keys: ['x'],
		action: 'export-json-report',
	},
	{
		id: 'toggle-bulk-delete-view',
		keys: ['b'],
		action: 'toggle-bulk-delete-view',
	},
	{
		id: 'toggle-compare-view',
		keys: ['v'],
		action: 'toggle-compare-view',
	},
	{
		id: 'toggle-treemap',
		keys: ['t'],
		action: 'toggle-treemap',
	},
	{
		id: 'toggle-reclamation-history',
		keys: ['h'],
		action: 'toggle-reclamation-history',
	},
	{
		id: 'toggle-similarity-inspector',
		keys: ['f'],
		action: 'toggle-similarity-inspector',
	},
	{
		id: 'toggle-batch-auto-select',
		keys: ['w'],
		action: 'toggle-batch-auto-select',
	},
	{
		id: 'toggle-file-hygiene',
		keys: ['i'],
		action: 'toggle-file-hygiene',
	},
	{
		id: 'toggle-link-simulator',
		keys: ['l'],
		action: 'toggle-link-simulator',
	},
	{
		id: 'toggle-folder-matrix',
		keys: ['d'],
		action: 'toggle-folder-matrix',
	},
	{
		id: 'toggle-storage-footprint',
		keys: ['z'],
		action: 'toggle-storage-footprint',
	},
	{
		id: 'toggle-photo-bursts',
		keys: ['p'],
		action: 'toggle-photo-bursts',
	},
	{
		id: 'toggle-recovery-safety',
		keys: ['q'],
		action: 'toggle-recovery-safety',
	},
	{
		id: 'toggle-archive-inspector',
		keys: ['1'],
		action: 'toggle-archive-inspector',
	},
	{
		id: 'toggle-audio-workbench',
		keys: ['2'],
		action: 'toggle-audio-workbench',
	},
	{
		id: 'toggle-video-workbench',
		keys: ['3'],
		action: 'toggle-video-workbench',
	},
	{
		id: 'toggle-sidecar-sweep',
		keys: ['4'],
		action: 'toggle-sidecar-sweep',
	},
	{
		id: 'toggle-rule-profiles',
		keys: ['5'],
		action: 'toggle-rule-profiles',
	},
	{
		id: 'toggle-document-lineage',
		keys: ['6'],
		action: 'toggle-document-lineage',
	},
	{
		id: 'toggle-photo-perceptual',
		keys: ['7'],
		action: 'toggle-photo-perceptual',
	},
	{
		id: 'toggle-broken-quarantine',
		keys: ['8'],
		action: 'toggle-broken-quarantine',
	},
	{
		id: 'toggle-retention-pruner',
		keys: ['9'],
		action: 'toggle-retention-pruner',
	},
	{
		id: 'toggle-filename-collisions',
		keys: ['='],
		action: 'toggle-filename-collisions',
	},
	{
		id: 'toggle-quota-attribution',
		keys: ['-'],
		action: 'toggle-quota-attribution',
	},
	{
		id: 'toggle-preview-cache',
		keys: ['['],
		action: 'toggle-preview-cache',
	},
	{
		id: 'toggle-share-mount-auditor',
		keys: [']'],
		action: 'toggle-share-mount-auditor',
	},
	{
		id: 'toggle-backup-drift',
		keys: ['\\'],
		action: 'toggle-backup-drift',
	},
	{
		id: 'toggle-automation-rulebook',
		keys: [';'],
		action: 'toggle-automation-rulebook',
	},
	{
		id: 'toggle-metadata-consolidation',
		keys: [','],
		action: 'toggle-metadata-consolidation',
	},
	{
		id: 'toggle-forensic-verifier',
		keys: ['.'],
		action: 'toggle-forensic-verifier',
	},
	{
		id: 'toggle-inode-verifier',
		keys: ['\''],
		action: 'toggle-inode-verifier',
	},
	{
		id: 'toggle-shadow-reclaim',
		keys: ['`'],
		action: 'toggle-shadow-reclaim',
	},
	{
		id: 'toggle-junk-pair-inspector',
		keys: ['~'],
		action: 'toggle-junk-pair-inspector',
	},
	{
		id: 'toggle-media-fidelity-ranker',
		keys: ['%'],
		action: 'toggle-media-fidelity-ranker',
	},
	{
		id: 'toggle-cdc-chunking-estimator',
		keys: ['#'],
		action: 'toggle-cdc-chunking-estimator',
	},
	{
		id: 'toggle-ops-schedule-generator',
		keys: ['@'],
		action: 'toggle-ops-schedule-generator',
	},
	{
		id: 'toggle-legal-hold-guard',
		keys: ['!'],
		action: 'toggle-legal-hold-guard',
	},
	{
		id: 'toggle-ransomware-canary-guard',
		keys: ['*'],
		action: 'toggle-ransomware-canary-guard',
	},
	{
		id: 'toggle-dev-tree-reclaimer',
		keys: ['^'],
		action: 'toggle-dev-tree-reclaimer',
	},
	{
		id: 'toggle-conflict-storm-resolver',
		keys: ['&'],
		action: 'toggle-conflict-storm-resolver',
	},
	{
		id: 'toggle-vm-cow-reflink-auditor',
		keys: ['$'],
		action: 'toggle-vm-cow-reflink-auditor',
	},
	{
		id: 'toggle-scientific-bundle-auditor',
		keys: ['+'],
		action: 'toggle-scientific-bundle-auditor',
	},
	{
		id: 'toggle-brand-kit-auditor',
		keys: [':'],
		action: 'toggle-brand-kit-auditor',
	},
	{
		id: 'toggle-log-telemetry-auditor',
		keys: ['|'],
		action: 'toggle-log-telemetry-auditor',
	},
	{
		id: 'toggle-installer-repo-auditor',
		keys: ['_'],
		action: 'toggle-installer-repo-auditor',
	},
	{
		id: 'toggle-workbook-drift-auditor',
		keys: ['>'],
		action: 'toggle-workbook-drift-auditor',
	},
	{
		id: 'toggle-mailbox-archive-auditor',
		keys: ['<'],
		action: 'toggle-mailbox-archive-auditor',
	},
	{
		id: 'toggle-cad-vault-auditor',
		keys: ['{'],
		action: 'toggle-cad-vault-auditor',
	},
	{
		id: 'toggle-web-build-media-auditor',
		keys: ['}'],
		action: 'toggle-web-build-media-auditor',
	},
	{
		id: 'toggle-acknowledge',
		keys: ['u'],
		action: 'toggle-acknowledge',
	},
	{
		id: 'focus-search',
		keys: ['/'],
		action: 'focus-search',
	},
	{
		id: 'cycle-min-size-filter',
		keys: ['m'],
		action: 'cycle-min-size-filter',
	},
	{
		id: 'reset-filters',
		keys: ['r'],
		action: 'reset-filters',
	},
	{
		id: 'reset-all-filters',
		keys: ['0'],
		action: 'reset-all-filters',
	},
	{
		id: 'toggle-help',
		keys: ['?'],
		action: 'toggle-help',
	},
	{
		id: 'close-help',
		keys: ['Escape'],
		action: 'close-help',
	},
])

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const SINGLE_KEY_ACTIONS = Object.freeze({
	j: 'next-duplicate',
	k: 'previous-duplicate',
	g: 'jump-to-largest-group',
	o: 'keep-oldest',
	n: 'keep-newest',
	s: 'keep-shortest-path',
	a: 'select-duplicate-copies',
	c: 'clear-selection',
	y: 'copy-group-hash',
	e: 'export-csv-report',
	x: 'export-json-report',
	b: 'toggle-bulk-delete-view',
	v: 'toggle-compare-view',
	t: 'toggle-treemap',
	h: 'toggle-reclamation-history',
	f: 'toggle-similarity-inspector',
	w: 'toggle-batch-auto-select',
	i: 'toggle-file-hygiene',
	l: 'toggle-link-simulator',
	d: 'toggle-folder-matrix',
	z: 'toggle-storage-footprint',
	p: 'toggle-photo-bursts',
	q: 'toggle-recovery-safety',
	1: 'toggle-archive-inspector',
	2: 'toggle-audio-workbench',
	3: 'toggle-video-workbench',
	4: 'toggle-sidecar-sweep',
	5: 'toggle-rule-profiles',
	6: 'toggle-document-lineage',
	7: 'toggle-photo-perceptual',
	8: 'toggle-broken-quarantine',
	9: 'toggle-retention-pruner',
	'=': 'toggle-filename-collisions',
	'-': 'toggle-quota-attribution',
	'[': 'toggle-preview-cache',
	']': 'toggle-share-mount-auditor',
	'\\': 'toggle-backup-drift',
	';': 'toggle-automation-rulebook',
	',': 'toggle-metadata-consolidation',
	'.': 'toggle-forensic-verifier',
	'\'': 'toggle-inode-verifier',
	'`': 'toggle-shadow-reclaim',
	u: 'toggle-acknowledge',
	m: 'cycle-min-size-filter',
	r: 'reset-filters',
	0: 'reset-all-filters',
})

/**
 * Checks whether an event target is an editable form control or contenteditable region.
 *
 * @param {EventTarget|null|undefined} target Event target element.
 * @return {boolean} True when shortcuts must be ignored for this target.
 */
export function isEditableTarget(target) {
	if (!target || typeof target !== 'object') {
		return false
	}

	const tagName = typeof target.tagName === 'string'
		? target.tagName.toUpperCase()
		: ''
	if (EDITABLE_TAG_NAMES.has(tagName)) {
		return true
	}

	if (target.isContentEditable === true) {
		return true
	}

	if (typeof target.getAttribute === 'function') {
		const contentEditableAttr = target.getAttribute('contenteditable')
		if (contentEditableAttr !== null && contentEditableAttr.toLowerCase() !== 'false') {
			return true
		}
	}

	if (typeof target.closest === 'function') {
		const ancestor = target.closest('[contenteditable]')
		if (ancestor && typeof ancestor.getAttribute === 'function') {
			const ancestorValue = ancestor.getAttribute('contenteditable')
			if (ancestorValue !== null && ancestorValue.toLowerCase() !== 'false') {
				return true
			}
		}
	}

	return false
}

/**
 * Checks whether an event target is an open native dialog or inside one.
 *
 * @param {EventTarget|null|undefined} target Event target element.
 * @return {boolean} True when target is inside an open <dialog>.
 */
function isInsideOpenDialog(target) {
	if (!target || typeof target !== 'object') {
		return false
	}

	const tagName = typeof target.tagName === 'string'
		? target.tagName.toUpperCase()
		: ''
	if (tagName === 'DIALOG') {
		return Boolean(target.open || (typeof target.hasAttribute === 'function' && target.hasAttribute('open')))
	}

	if (typeof target.closest === 'function') {
		return Boolean(target.closest('dialog[open]'))
	}

	return false
}

/**
 * Resolves a keyboard event into a deterministic triage shortcut action.
 *
 * @param {KeyboardEvent|object|null|undefined} event Keyboard event.
 * @param {object} [options] Current UI modal state.
 * @param {boolean} [options.isHelpOpen=false] Whether the shortcuts dialog is open.
 * @param {boolean} [options.hasBlockingModal=false] Whether another modal or dialog is open.
 * @return {string|null} Action identifier or null if ignored.
 */
export function resolveShortcutAction(event, options = {}) {
	if (!event || typeof event.key !== 'string') {
		return null
	}

	const isHelpOpen = Boolean(options.isHelpOpen)
	const hasBlockingModal = Boolean(options.hasBlockingModal) || (!isHelpOpen && isInsideOpenDialog(event.target))
	const key = event.key

	if (key === 'Escape') {
		return isHelpOpen ? 'close-help' : null
	}

	if (event.ctrlKey || event.metaKey || event.altKey) {
		return null
	}

	if (isEditableTarget(event.target)) {
		return null
	}

	if (key === '?') {
		return hasBlockingModal && !isHelpOpen ? null : 'toggle-help'
	}

	if (isHelpOpen || hasBlockingModal) {
		return null
	}

	if (key === '/') {
		return 'focus-search'
	}

	if (key === '~') {
		return 'toggle-junk-pair-inspector'
	}

	if (key === '%') {
		return 'toggle-media-fidelity-ranker'
	}

	if (key === '#') {
		return 'toggle-cdc-chunking-estimator'
	}

	if (key === '@') {
		return 'toggle-ops-schedule-generator'
	}

	if (key === '!') {
		return 'toggle-legal-hold-guard'
	}

	if (key === '*') {
		return 'toggle-ransomware-canary-guard'
	}

	if (key === '^') {
		return 'toggle-dev-tree-reclaimer'
	}

	if (key === '&') {
		return 'toggle-conflict-storm-resolver'
	}

	if (key === '$') {
		return 'toggle-vm-cow-reflink-auditor'
	}

	if (key === '+') {
		return 'toggle-scientific-bundle-auditor'
	}

	if (key === ':') {
		return 'toggle-brand-kit-auditor'
	}

	if (key === '|') {
		return 'toggle-log-telemetry-auditor'
	}

	if (key === '_') {
		return 'toggle-installer-repo-auditor'
	}

	if (key === '>') {
		return 'toggle-workbook-drift-auditor'
	}

	if (key === '<') {
		return 'toggle-mailbox-archive-auditor'
	}

	if (key === '{') {
		return 'toggle-cad-vault-auditor'
	}

	if (key === '}') {
		return 'toggle-web-build-media-auditor'
	}

	if (key === 'ArrowDown') {
		return 'next-duplicate'
	}

	if (key === 'ArrowUp') {
		return 'previous-duplicate'
	}

	if (!event.shiftKey && key.length === 1) {
		return SINGLE_KEY_ACTIONS[key.toLowerCase()] || null
	}

	return null
}

/**
 * Builds the flat ordered list of navigable duplicate groups across sections.
 *
 * @param {Array<object>} acknowledgedDuplicates Acknowledged duplicate groups.
 * @param {Array<object>} unacknowledgedDuplicates Unacknowledged duplicate groups.
 * @param {object} [options] Section visibility options.
 * @param {boolean} [options.acknowledgedOpen=true] Whether acknowledged section is expanded.
 * @param {boolean} [options.unacknowledgedOpen=true] Whether unacknowledged section is expanded.
 * @return {Array<object>} Ordered list of duplicate groups.
 */
export function buildNavigableDuplicates(acknowledgedDuplicates, unacknowledgedDuplicates, options = {}) {
	const acknowledgedOpen = options.acknowledgedOpen !== false
	const unacknowledgedOpen = options.unacknowledgedOpen !== false

	const acknowledgedList = acknowledgedOpen && Array.isArray(acknowledgedDuplicates)
		? acknowledgedDuplicates.filter(Boolean)
		: []
	const unacknowledgedList = unacknowledgedOpen && Array.isArray(unacknowledgedDuplicates)
		? unacknowledgedDuplicates.filter(Boolean)
		: []

	return [...acknowledgedList, ...unacknowledgedList]
}

/**
 * Computes the next or previous duplicate group clamped to list bounds.
 *
 * @param {Array<object>} duplicates Ordered list of duplicate groups.
 * @param {string|number|null|undefined} currentDuplicateId Currently selected duplicate ID.
 * @param {'next'|'previous'} direction Navigation direction.
 * @return {object|null} Target duplicate group or null when list is empty.
 */
export function stepDuplicateSelection(duplicates, currentDuplicateId, direction) {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return null
	}

	const currentIndex = currentDuplicateId !== null && currentDuplicateId !== undefined
		? duplicates.findIndex(item => item && item.id === currentDuplicateId)
		: -1

	if (currentIndex === -1) {
		return duplicates[0] || null
	}

	const delta = direction === 'previous' ? -1 : 1
	const nextIndex = Math.max(0, Math.min(duplicates.length - 1, currentIndex + delta))
	return duplicates[nextIndex] || null
}

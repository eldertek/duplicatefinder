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
		id: 'toggle-legal-document-ocr-auditor',
		keys: ['('],
		action: 'toggle-legal-document-ocr-auditor',
	},
	{
		id: 'toggle-backup-takeout-auditor',
		keys: [')'],
		action: 'toggle-backup-takeout-auditor',
	},
	{
		id: 'toggle-daw-audio-stem-auditor',
		keys: ['"'],
		action: 'toggle-daw-audio-stem-auditor',
	},
	{
		id: 'toggle-vfx-render-cache-auditor',
		keys: ['Shift+D'],
		action: 'toggle-vfx-render-cache-auditor',
	},
	{
		id: 'toggle-elearning-scorm-auditor',
		keys: ['Shift+L'],
		action: 'toggle-elearning-scorm-auditor',
	},
	{
		id: 'toggle-photo-raw-catalog-auditor',
		keys: ['Shift+P'],
		action: 'toggle-photo-raw-catalog-auditor',
	},
	{
		id: 'toggle-vm-container-image-auditor',
		keys: ['Shift+I'],
		action: 'toggle-vm-container-image-auditor',
	},
	{
		id: 'toggle-ml-dataset-artifact-auditor',
		keys: ['Shift+W'],
		action: 'toggle-ml-dataset-artifact-auditor',
	},
	{
		id: 'toggle-game3d-asset-vault-auditor',
		keys: ['Shift+T'],
		action: 'toggle-game3d-asset-vault-auditor',
	},
	{
		id: 'toggle-database-dump-log-auditor',
		keys: ['Shift+Q'],
		action: 'toggle-database-dump-log-auditor',
	},
	{
		id: 'toggle-design-publishing-vault-auditor',
		keys: ['Shift+F'],
		action: 'toggle-design-publishing-vault-auditor',
	},
	{
		id: 'toggle-release-binary-artifact-auditor',
		keys: ['Shift+K'],
		action: 'toggle-release-binary-artifact-auditor',
	},
	{
		id: 'toggle-email-archive-vault-auditor',
		keys: ['Shift+H'],
		action: 'toggle-email-archive-vault-auditor',
	},
	{
		id: 'toggle-audio-daw-vault-auditor',
		keys: ['Shift+J'],
		action: 'toggle-audio-daw-vault-auditor',
	},
	{
		id: 'toggle-gis-map-archive-auditor',
		keys: ['Shift+Z'],
		action: 'toggle-gis-map-archive-auditor',
	},
	{
		id: 'toggle-photo-grading-vault-auditor',
		keys: ['F4'],
		action: 'toggle-photo-grading-vault-auditor',
	},
	{
		id: 'toggle-iot-firmware-vault-auditor',
		keys: ['Shift+F4'],
		action: 'toggle-iot-firmware-vault-auditor',
	},
	{
		id: 'toggle-ml-checkpoint-vault-auditor',
		keys: ['F2'],
		action: 'toggle-ml-checkpoint-vault-auditor',
	},
	{
		id: 'toggle-k8s-terraform-vault-auditor',
		keys: ['Shift+F2'],
		action: 'toggle-k8s-terraform-vault-auditor',
	},
	{
		id: 'toggle-vm-backup-vault-auditor',
		keys: ['F3'],
		action: 'toggle-vm-backup-vault-auditor',
	},
	{
		id: 'toggle-mobile-build-vault-auditor',
		keys: ['Shift+F3'],
		action: 'toggle-mobile-build-vault-auditor',
	},
	{
		id: 'toggle-db-sql-log-vault-auditor',
		keys: ['Shift+F8'],
		action: 'toggle-db-sql-log-vault-auditor',
	},
	{
		id: 'toggle-broadcast-nle-vault-auditor',
		keys: ['Shift+F9'],
		action: 'toggle-broadcast-nle-vault-auditor',
	},
	{
		id: 'toggle-game-dev-pipeline-vault-auditor',
		keys: ['F6'],
		action: 'toggle-game-dev-pipeline-vault-auditor',
	},
	{
		id: 'toggle-finance-tax-vault-auditor',
		keys: ['Shift+F6'],
		action: 'toggle-finance-tax-vault-auditor',
	},
	{
		id: 'toggle-additive-mfg-vault-auditor',
		keys: ['F7'],
		action: 'toggle-additive-mfg-vault-auditor',
	},
	{
		id: 'toggle-ecommerce-pim-vault-auditor',
		keys: ['Shift+F7'],
		action: 'toggle-ecommerce-pim-vault-auditor',
	},
	{
		id: 'toggle-scientific-research-vault-auditor',
		keys: ['F8'],
		action: 'toggle-scientific-research-vault-auditor',
	},
	{
		id: 'toggle-legal-contract-vault-auditor',
		keys: ['F9'],
		action: 'toggle-legal-contract-vault-auditor',
	},
	{
		id: 'toggle-medical-dicom-vault-auditor',
		keys: ['F10'],
		action: 'toggle-medical-dicom-vault-auditor',
	},
	{
		id: 'toggle-publishing-prepress-vault-auditor',
		keys: ['Shift+F10'],
		action: 'toggle-publishing-prepress-vault-auditor',
	},
	{
		id: 'toggle-genomics-bioinformatics-vault-auditor',
		keys: ['Shift+F1'],
		action: 'toggle-genomics-bioinformatics-vault-auditor',
	},
	{
		id: 'toggle-dfir-security-vault-auditor',
		keys: ['Shift+F11'],
		action: 'toggle-dfir-security-vault-auditor',
	},
	{
		id: 'toggle-robotics-ros-vault-auditor',
		keys: ['Shift+F12'],
		action: 'toggle-robotics-ros-vault-auditor',
	},
	{
		id: 'toggle-semiconductor-eda-vault-auditor',
		keys: ['Shift+F5'],
		action: 'toggle-semiconductor-eda-vault-auditor',
	},
	{
		id: 'toggle-aerospace-cfd-vault-auditor',
		keys: ['Alt+Shift+A'],
		action: 'toggle-aerospace-cfd-vault-auditor',
	},
	{
		id: 'toggle-battery-bms-vault-auditor',
		keys: ['Alt+Shift+B'],
		action: 'toggle-battery-bms-vault-auditor',
	},
	{
		id: 'toggle-chem-pharma-gmp-vault-auditor',
		keys: ['Alt+Shift+C'],
		action: 'toggle-chem-pharma-gmp-vault-auditor',
	},
	{
		id: 'toggle-digital-grid-scada-vault-auditor',
		keys: ['Alt+Shift+D'],
		action: 'toggle-digital-grid-scada-vault-auditor',
	},
	{
		id: 'toggle-energy-seismic-vault-auditor',
		keys: ['Alt+Shift+E'],
		action: 'toggle-energy-seismic-vault-auditor',
	},
	{
		id: 'toggle-fiber-telecom-rf-vault-auditor',
		keys: ['Alt+Shift+F'],
		action: 'toggle-fiber-telecom-rf-vault-auditor',
	},
	{
		id: 'toggle-geotech-shm-civil-vault-auditor',
		keys: ['Alt+Shift+G'],
		action: 'toggle-geotech-shm-civil-vault-auditor',
	},
	{
		id: 'toggle-hydrography-marine-vault-auditor',
		keys: ['Alt+Shift+H'],
		action: 'toggle-hydrography-marine-vault-auditor',
	},
	{
		id: 'toggle-astronomy-fits-interferometry-vault-auditor',
		keys: ['Alt+Shift+I'],
		action: 'toggle-astronomy-fits-interferometry-vault-auditor',
	},
	{
		id: 'toggle-meteorology-climate-vault-auditor',
		keys: ['Alt+Shift+J'],
		action: 'toggle-meteorology-climate-vault-auditor',
	},
	{
		id: 'toggle-materials-microscopy-vault-auditor',
		keys: ['Alt+Shift+K'],
		action: 'toggle-materials-microscopy-vault-auditor',
	},
	{
		id: 'toggle-lidar-photogrammetry-vault-auditor',
		keys: ['Alt+Shift+L'],
		action: 'toggle-lidar-photogrammetry-vault-auditor',
	},
	{
		id: 'toggle-mocap-biomechanics-vault-auditor',
		keys: ['Alt+Shift+M'],
		action: 'toggle-mocap-biomechanics-vault-auditor',
	},
	{
		id: 'toggle-neuroscience-electrophys-vault-auditor',
		keys: ['Alt+Shift+N'],
		action: 'toggle-neuroscience-electrophys-vault-auditor',
	},
	{
		id: 'toggle-orbital-spacecraft-vault-auditor',
		keys: ['Alt+Shift+O'],
		action: 'toggle-orbital-spacecraft-vault-auditor',
	},
	{
		id: 'toggle-particle-physics-hep-vault-auditor',
		keys: ['Alt+Shift+P'],
		action: 'toggle-particle-physics-hep-vault-auditor',
	},
	{
		id: 'toggle-quantum-qubit-pulse-vault-auditor',
		keys: ['Alt+Shift+Q'],
		action: 'toggle-quantum-qubit-pulse-vault-auditor',
	},
	{
		id: 'toggle-railway-signaling-telemetry-vault-auditor',
		keys: ['Alt+Shift+R'],
		action: 'toggle-railway-signaling-telemetry-vault-auditor',
	},
	{
		id: 'toggle-speech-asr-bioacoustics-vault-auditor',
		keys: ['Alt+Shift+S'],
		action: 'toggle-speech-asr-bioacoustics-vault-auditor',
	},
	{
		id: 'toggle-traffic-its-v2x-vault-auditor',
		keys: ['Alt+Shift+T'],
		action: 'toggle-traffic-its-v2x-vault-auditor',
	},
	{
		id: 'toggle-urban-water-utility-pipeline-vault-auditor',
		keys: ['Alt+Shift+U'],
		action: 'toggle-urban-water-utility-pipeline-vault-auditor',
	},
	{
		id: 'toggle-veterinary-equine-genomics-vault-auditor',
		keys: ['Alt+Shift+V'],
		action: 'toggle-veterinary-equine-genomics-vault-auditor',
	},
	{
		id: 'toggle-wine-enology-haccp-vault-auditor',
		keys: ['Alt+Shift+W'],
		action: 'toggle-wine-enology-haccp-vault-auditor',
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

	if (event.ctrlKey || event.metaKey) {
		return null
	}

	if (isEditableTarget(event.target)) {
		return null
	}

	if (event.altKey) {
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'A' || key === 'a')) {
			return 'toggle-aerospace-cfd-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'B' || key === 'b')) {
			return 'toggle-battery-bms-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'C' || key === 'c')) {
			return 'toggle-chem-pharma-gmp-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'D' || key === 'd')) {
			return 'toggle-digital-grid-scada-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'E' || key === 'e')) {
			return 'toggle-energy-seismic-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'F' || key === 'f')) {
			return 'toggle-fiber-telecom-rf-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'G' || key === 'g')) {
			return 'toggle-geotech-shm-civil-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'H' || key === 'h')) {
			return 'toggle-hydrography-marine-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'I' || key === 'i')) {
			return 'toggle-astronomy-fits-interferometry-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'J' || key === 'j')) {
			return 'toggle-meteorology-climate-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'K' || key === 'k')) {
			return 'toggle-materials-microscopy-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'L' || key === 'l')) {
			return 'toggle-lidar-photogrammetry-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'M' || key === 'm')) {
			return 'toggle-mocap-biomechanics-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'N' || key === 'n')) {
			return 'toggle-neuroscience-electrophys-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'O' || key === 'o')) {
			return 'toggle-orbital-spacecraft-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'P' || key === 'p')) {
			return 'toggle-particle-physics-hep-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'Q' || key === 'q')) {
			return 'toggle-quantum-qubit-pulse-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'R' || key === 'r')) {
			return 'toggle-railway-signaling-telemetry-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'S' || key === 's')) {
			return 'toggle-speech-asr-bioacoustics-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'T' || key === 't')) {
			return 'toggle-traffic-its-v2x-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'U' || key === 'u')) {
			return 'toggle-urban-water-utility-pipeline-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'V' || key === 'v')) {
			return 'toggle-veterinary-equine-genomics-vault-auditor'
		}
		if (event.shiftKey && !isHelpOpen && !hasBlockingModal && (key === 'W' || key === 'w')) {
			return 'toggle-wine-enology-haccp-vault-auditor'
		}
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

	if (key === '(') {
		return 'toggle-legal-document-ocr-auditor'
	}

	if (key === ')') {
		return 'toggle-backup-takeout-auditor'
	}

	if (key === '"') {
		return 'toggle-daw-audio-stem-auditor'
	}

	if (event.shiftKey && (key === 'D' || key === 'd')) {
		return 'toggle-vfx-render-cache-auditor'
	}

	if (event.shiftKey && (key === 'L' || key === 'l')) {
		return 'toggle-elearning-scorm-auditor'
	}

	if (event.shiftKey && (key === 'P' || key === 'p')) {
		return 'toggle-photo-raw-catalog-auditor'
	}

	if (event.shiftKey && (key === 'I' || key === 'i')) {
		return 'toggle-vm-container-image-auditor'
	}

	if (event.shiftKey && (key === 'W' || key === 'w')) {
		return 'toggle-ml-dataset-artifact-auditor'
	}

	if (event.shiftKey && (key === 'T' || key === 't')) {
		return 'toggle-game3d-asset-vault-auditor'
	}

	if (event.shiftKey && (key === 'Q' || key === 'q')) {
		return 'toggle-database-dump-log-auditor'
	}

	if (event.shiftKey && (key === 'F' || key === 'f')) {
		return 'toggle-design-publishing-vault-auditor'
	}

	if (event.shiftKey && (key === 'K' || key === 'k')) {
		return 'toggle-release-binary-artifact-auditor'
	}

	if (event.shiftKey && (key === 'H' || key === 'h')) {
		return 'toggle-email-archive-vault-auditor'
	}

	if (event.shiftKey && (key === 'J' || key === 'j')) {
		return 'toggle-audio-daw-vault-auditor'
	}

	if (event.shiftKey && (key === 'Z' || key === 'z')) {
		return 'toggle-gis-map-archive-auditor'
	}

	if (!event.shiftKey && key === 'F2') {
		return 'toggle-ml-checkpoint-vault-auditor'
	}

	if (event.shiftKey && key === 'F2') {
		return 'toggle-k8s-terraform-vault-auditor'
	}

	if (!event.shiftKey && key === 'F3') {
		return 'toggle-vm-backup-vault-auditor'
	}

	if (event.shiftKey && key === 'F3') {
		return 'toggle-mobile-build-vault-auditor'
	}

	if (!event.shiftKey && key === 'F4') {
		return 'toggle-photo-grading-vault-auditor'
	}

	if (event.shiftKey && key === 'F4') {
		return 'toggle-iot-firmware-vault-auditor'
	}

	if (!event.shiftKey && key === 'F6') {
		return 'toggle-game-dev-pipeline-vault-auditor'
	}

	if (event.shiftKey && key === 'F6') {
		return 'toggle-finance-tax-vault-auditor'
	}

	if (!event.shiftKey && key === 'F7') {
		return 'toggle-additive-mfg-vault-auditor'
	}

	if (event.shiftKey && key === 'F7') {
		return 'toggle-ecommerce-pim-vault-auditor'
	}

	if (!event.shiftKey && key === 'F8') {
		return 'toggle-scientific-research-vault-auditor'
	}

	if (event.shiftKey && key === 'F8') {
		return 'toggle-db-sql-log-vault-auditor'
	}

	if (!event.shiftKey && key === 'F9') {
		return 'toggle-legal-contract-vault-auditor'
	}

	if (event.shiftKey && key === 'F9') {
		return 'toggle-broadcast-nle-vault-auditor'
	}

	if (!event.shiftKey && key === 'F10') {
		return 'toggle-medical-dicom-vault-auditor'
	}

	if (event.shiftKey && key === 'F10') {
		return 'toggle-publishing-prepress-vault-auditor'
	}

	if (event.shiftKey && key === 'F1') {
		return 'toggle-genomics-bioinformatics-vault-auditor'
	}

	if (event.shiftKey && key === 'F11') {
		return 'toggle-dfir-security-vault-auditor'
	}

	if (event.shiftKey && key === 'F12') {
		return 'toggle-robotics-ros-vault-auditor'
	}

	if (event.shiftKey && key === 'F5') {
		return 'toggle-semiconductor-eda-vault-auditor'
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

/**
 * Pure Academic Research, LaTeX/BibTeX & Scientific Dataset Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Academic & Scientific Research Vault families:
 * - Manuscripts & Bibliography (*.tex, *.bib, *.pdf preprints, *.docx)
 * - Scientific Datasets & Notebooks (*.ipynb, *.hdf5/*.h5, *.nc/*.netcdf, *.fits, *.mat, *.parquet, *.csv)
 * - LaTeX & Build Artifacts (*.aux, *.bbl, *.blg, *.fls, *.fdb_latexmk, *.synctex.gz, *.log)
 * - Figure & Checkpoint Mirrors (*.eps, *.svg, *.png plots, .ipynb_checkpoints/)
 *
 * Groups artifacts deterministically by paper/experiment + normalized dataset/manuscript signature,
 * shields canonical .tex/.bib/raw-HDF5/NetCDF masters and active .ipynb notebooks by default,
 * and computes safe reclaimable GB plus POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SCIENTIFIC_RESEARCH_VAULT_SCHEMA = 'duplicatefinder.scientific-research-vault-auditor.v1'

export const SCIENTIFIC_RESEARCH_FAMILIES = Object.freeze([
	'all',
	'manuscripts-bibliography',
	'scientific-datasets-notebooks',
	'latex-build-artifacts',
	'figure-checkpoint-mirrors',
])

export const SCIENTIFIC_RESEARCH_FAMILY_META = Object.freeze({
	'manuscripts-bibliography': {
		id: 'manuscripts-bibliography',
		label: 'Manuscripts & Bibliography',
		shortLabel: 'Manuscripts (.tex/.bib/.pdf preprints/.docx)',
	},
	'scientific-datasets-notebooks': {
		id: 'scientific-datasets-notebooks',
		label: 'Scientific Datasets & Notebooks',
		shortLabel: 'Datasets (.ipynb/.hdf5/.h5/.nc/.fits/.mat/.parquet/.csv)',
	},
	'latex-build-artifacts': {
		id: 'latex-build-artifacts',
		label: 'LaTeX & Build Artifacts',
		shortLabel: 'Build (.aux/.bbl/.blg/.fls/.fdb_latexmk/.synctex.gz/.log)',
	},
	'figure-checkpoint-mirrors': {
		id: 'figure-checkpoint-mirrors',
		label: 'Figure & Checkpoint Mirrors',
		shortLabel: 'Figures/Checkpoints (.eps/.svg/.png plots/.ipynb_checkpoints)',
	},
})

export const SCIENTIFIC_RESEARCH_STRATEGIES = Object.freeze([
	'prune-build-artifacts-and-mirrors',
	'consolidate-research-vault-hardlinks',
	'prune-latex-build-and-checkpoints-only',
])

export const SCIENTIFIC_RESEARCH_SURVIVOR_RULES = Object.freeze([
	'canonical-tex-bib-hdf5-netcdf-first',
	'latest-revision-first',
	'shortest-path',
])

export const SCIENTIFIC_RESEARCH_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'canonical-master',
	'notebook-guard',
	'latex-build',
	'figure-checkpoint',
	'shielded',
])

export const SCIENTIFIC_RESEARCH_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const SCIENTIFIC_RESEARCH_PRESETS = Object.freeze([
	{
		id: 'all-scientific-research-audit',
		name: 'All Research & Dataset Audit',
		description: 'Audit manuscripts, bibliography, scientific datasets, notebooks, LaTeX build artifacts, and figure/checkpoint mirrors while shielding canonical .tex/.bib/HDF5/NetCDF masters.',
		familyFilter: 'all',
		strategy: 'prune-build-artifacts-and-mirrors',
		survivorRule: 'canonical-tex-bib-hdf5-netcdf-first',
		protectCanonicalMasters: true,
		protectCanonicalNotebooks: true,
		staleArtifactDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-latex-build-and-checkpoints',
		name: 'Prune LaTeX Build & Checkpoints',
		description: 'Reclaim duplicate .aux, .bbl, .blg, .fls, .fdb_latexmk, .synctex.gz, .log build outputs and .ipynb_checkpoints/ mirrors older than the retention window.',
		familyFilter: 'latex-build-artifacts',
		strategy: 'prune-latex-build-and-checkpoints-only',
		survivorRule: 'canonical-tex-bib-hdf5-netcdf-first',
		protectCanonicalMasters: true,
		protectCanonicalNotebooks: true,
		staleArtifactDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-research-vault-hardlinks',
		name: 'Hardlink-Consolidate Datasets',
		description: 'Deduplicate mirrored HDF5, NetCDF, FITS, MATLAB, and Parquet scientific datasets onto canonical anchors via POSIX hardlinks without breaking experiment paths.',
		familyFilter: 'all',
		strategy: 'consolidate-research-vault-hardlinks',
		survivorRule: 'canonical-tex-bib-hdf5-netcdf-first',
		protectCanonicalMasters: true,
		protectCanonicalNotebooks: true,
		staleArtifactDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-manuscripts-and-bibtex',
		name: 'Manuscripts & BibTeX',
		description: 'Audit duplicate .tex sources, .bib citation databases, .pdf preprints, and .docx drafts grouped by paper/experiment while shielding canonical .tex/.bib masters.',
		familyFilter: 'manuscripts-bibliography',
		strategy: 'prune-build-artifacts-and-mirrors',
		survivorRule: 'canonical-tex-bib-hdf5-netcdf-first',
		protectCanonicalMasters: true,
		protectCanonicalNotebooks: true,
		staleArtifactDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-figures-and-checkpoints',
		name: 'Figures & Checkpoint Mirrors',
		description: 'Audit duplicate .eps, .svg, and .png plot exports plus .ipynb_checkpoints/ mirrors across paper submissions and lab notebooks.',
		familyFilter: 'figure-checkpoint-mirrors',
		strategy: 'prune-build-artifacts-and-mirrors',
		survivorRule: 'latest-revision-first',
		protectCanonicalMasters: true,
		protectCanonicalNotebooks: true,
		staleArtifactDays: 14,
		minSizeMb: 0,
	},
])

const CORE_MANUSCRIPT_EXT_SET = new Set([
	'tex',
	'bib',
	'cls',
	'sty',
	'bst',
	'ris',
	'enw',
	'csl',
	'rmd',
	'qmd',
])

const CONTEXT_MANUSCRIPT_EXT_SET = new Set([
	'pdf',
	'docx',
	'odt',
])

const SCIENTIFIC_DATASET_EXT_SET = new Set([
	'ipynb',
	'hdf5',
	'h5',
	'h5ad',
	'nc',
	'netcdf',
	'nc4',
	'fits',
	'fit',
	'fts',
	'mat',
	'parquet',
	'csv',
	'tsv',
	'npy',
	'npz',
	'zarr',
	'feather',
	'arrow',
	'rds',
	'rdata',
])

const LATEX_BUILD_EXT_SET = new Set([
	'aux',
	'bbl',
	'blg',
	'fls',
	'fdb_latexmk',
	'synctex.gz',
	'synctex',
	'log',
	'out',
	'toc',
	'lof',
	'lot',
	'nav',
	'snm',
	'vrb',
	'bcf',
	'run.xml',
	'idx',
	'ilg',
	'ind',
	'dvi',
	'xdv',
])

const CORE_FIGURE_EXT_SET = new Set([
	'eps',
	'svg',
	'ps',
	'pgf',
	'tikz',
	'pdf_tex',
])

const CONTEXT_PLOT_IMAGE_EXT_SET = new Set([
	'png',
	'jpg',
	'jpeg',
])

const CHECKPOINT_PATH_RE = /(\/(?:\.ipynb_checkpoints|ipynb_checkpoints|checkpoints?|auto|_minted-[^/]+|latex\.out|build[_-]?tex|tex[_-]?build)(?:\/|$))/i
const CHECKPOINT_NAME_RE = /(?:-checkpoint\.ipynb$|[._-](?:checkpoint|autosave|bak|preview)(?:[._-\d]|$))/i

const RESEARCH_DOC_CONTEXT_RE = /(?:research|academic|paper|papers|manuscript|manuscripts|preprint|preprints|arxiv|thesis|dissertation|journal|submission|latex|bibtex|lab|labs|experiment|experiments|study|studies|dataset|datasets|supplement|supplementary|draft|camera[_-]?ready|rebuttal|proceedings|ieee|acm|nature|science|springer|elsevier)/i
const PLOT_FIGURE_CONTEXT_RE = /(?:figures?|figs?|plots?|charts?|graphs?|diagrams?|heatmaps?|spectr(?:a|um)|roc[_-]?curve|loss[_-]?curve|confusion|ablation|benchmark|experiment|research|papers?|manuscripts?|thesis|notebooks?|lab)/i

const CANONICAL_MASTER_PATH_RE = /(\/(?:research[_-]?vault|science[_-]?vault|academic[_-]?vault|papers?|manuscripts?|canonical|masters?|raw[_-]?data|raw[_-]?datasets?|datasets?|experiments?|studies?|thesis|lab[_-]?vault|archive|publications?|__groupfolders\/\d+\/(?:research|science|papers?|datasets?|labs?|experiments?))(?:\/|$))/i
const EXPORT_STAGING_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|exports?[_-]?tmp|submission[_-]?tmp|incoming|dropzone|wetransfer|desktop|review[_-]?exports?|overleaf[_-]?export)(?:\/|$))/i

const REVISION_RE = /(?:^|[._\s-])(?:v|ver|rev|r|run|exp|trial|draft)[._-]?(\d{1,3})(?:[._\s-]|$)/i

const IGNORED_EXPERIMENT_SEGMENTS = new Set([
	'files',
	'research',
	'research-vault',
	'science',
	'science-vault',
	'academic',
	'academic-vault',
	'papers',
	'paper',
	'manuscripts',
	'manuscript',
	'preprints',
	'preprint',
	'publications',
	'latex',
	'tex',
	'bibtex',
	'bibliography',
	'datasets',
	'dataset',
	'raw-data',
	'raw-datasets',
	'data',
	'notebooks',
	'notebook',
	'experiments',
	'experiment',
	'studies',
	'study',
	'labs',
	'lab',
	'lab-vault',
	'figures',
	'figs',
	'plots',
	'build',
	'out',
	'checkpoints',
	'.ipynb_checkpoints',
	'ipynb_checkpoints',
	'canonical',
	'masters',
	'master',
	'archive',
	'exports',
	'staging',
	'downloads',
	'telechargements',
	'tmp',
	'temp',
	'scratch',
	'desktop',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
])

/**
 * Safely normalize a path string for deterministic inspection.
 *
 * @param {string} rawPath File path.
 * @return {string} Normalized POSIX-like path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract the basename from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Basename.
 */
function getBasename(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	if (!clean) {
		return ''
	}
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Extract the directory path from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Directory path.
 */
function getDirname(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	const idx = clean.lastIndexOf('/')
	return idx > 0 ? clean.slice(0, idx) : '/'
}

/**
 * Extract lowercase extension including chained LaTeX build extensions (.synctex.gz, .run.xml, .fdb_latexmk).
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension without leading dot.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	if (lower.endsWith('.synctex.gz')) {
		return 'synctex.gz'
	}
	if (lower.endsWith('.run.xml')) {
		return 'run.xml'
	}
	if (lower.endsWith('.fdb_latexmk')) {
		return 'fdb_latexmk'
	}
	if (lower.endsWith('.pdf_tex')) {
		return 'pdf_tex'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Normalize epoch timestamp in seconds.
 *
 * @param {number|string|null|undefined} rawMtime Timestamp in seconds or ms.
 * @return {number} Epoch seconds or 0.
 */
function normalizeMtimeSec(rawMtime) {
	const num = Number(rawMtime)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)
}

/**
 * Extract paper or experiment identifier from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized paper/experiment slug.
 */
export function extractPaperExperimentName(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (
			/^(?:research[_-]?vault|science[_-]?vault|academic[_-]?vault|papers?|manuscripts?|experiments?|studies?|datasets?|notebooks?|thesis|labs?|lab[_-]?vault|publications?|masters?|canonical)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].toLowerCase()
			if (nextSeg && !IGNORED_EXPERIMENT_SEGMENTS.has(nextSeg) && !/^\d+$/.test(nextSeg)) {
				return nextSeg.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'research-study'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_EXPERIMENT_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'research-study'
		}
	}

	return normalizeResearchDatasetSignature(basename)
}

/**
 * Parse revision or experiment run number from filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {number} Parsed revision number or 0.
 */
export function parseResearchRevision(basename, fullPath = '') {
	const match = REVISION_RE.exec(basename) || REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Normalize a manuscript, dataset, LaTeX build, or figure filename into a deterministic signature.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized dataset/manuscript signature slug.
 */
export function normalizeResearchDatasetSignature(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-artifact'
	}
	let stem = basename.trim()
	// Strip chained LaTeX build extensions first
	stem = stem.replace(/\.(?:synctex\.gz|run\.xml|fdb_latexmk|pdf_tex)$/i, '')
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/(?:\s*\(\d+\)|[._\s-]+(?:checkpoint|copy|backup|bak|autosave|dup|duplicate|old|export|tmp|final|draft|preprint|v\d+|rev\d+|\d{4}[-_]\d{2}[-_]\d{2}))+$/gi, '')
	}
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'research-artifact'
}

/**
 * Detect scientific research authoring tool and format badge for display.
 *
 * @param {string} ext File extension.
 * @param {string} fullPath Full normalized path.
 * @param {string} family Assigned family ID.
 * @param {boolean} isCanonicalMaster Whether file is a canonical .tex/.bib/HDF5/NetCDF master.
 * @param {boolean} isCheckpointMirror Whether file is inside .ipynb_checkpoints/ or checkpoint mirror.
 * @return {object} Research tool label and format badge.
 */
function detectResearchToolAndFormat(ext, fullPath, family, isCanonicalMaster, isCheckpointMirror) {
	const lowerPath = fullPath.toLowerCase()
	let researchTool = 'Academic Research'

	if (isCheckpointMirror || ext === 'ipynb') {
		researchTool = 'Jupyter Notebook'
	} else if (ext === 'tex' || ext === 'cls' || ext === 'sty' || ext === 'synctex.gz' || ext === 'fdb_latexmk' || ext === 'aux' || ext === 'fls' || ext === 'log') {
		researchTool = 'LaTeX / TeXLive'
	} else if (ext === 'bib' || ext === 'bbl' || ext === 'blg' || ext === 'bst' || ext === 'bcf' || ext === 'run.xml' || ext === 'ris' || ext === 'enw') {
		researchTool = 'BibTeX / Biber'
	} else if (ext === 'hdf5' || ext === 'h5' || ext === 'h5ad') {
		researchTool = 'HDF5 Scientific Array'
	} else if (ext === 'nc' || ext === 'netcdf' || ext === 'nc4') {
		researchTool = 'NetCDF Climate / Grid'
	} else if (ext === 'fits' || ext === 'fit' || ext === 'fts') {
		researchTool = 'Astropy / FITS'
	} else if (ext === 'mat') {
		researchTool = 'MATLAB / SciPy'
	} else if (ext === 'parquet' || ext === 'feather' || ext === 'arrow' || ext === 'csv' || ext === 'tsv') {
		researchTool = 'Parquet / Tabular Data'
	} else if (ext === 'eps' || ext === 'svg' || ext === 'pgf' || ext === 'tikz' || ext === 'png') {
		researchTool = 'Publication Figures'
	} else if (ext === 'pdf' || ext === 'docx' || lowerPath.includes('arxiv')) {
		researchTool = 'Preprint / Manuscript'
	}

	let formatBadge = ext ? `.${ext}` : 'research'
	if (isCheckpointMirror) {
		formatBadge = 'Checkpoint Mirror'
	} else if (family === 'latex-build-artifacts') {
		formatBadge = `BUILD .${ext}`
	} else if (isCanonicalMaster && ext === 'tex') {
		formatBadge = 'TeX Master'
	} else if (isCanonicalMaster && ext === 'bib') {
		formatBadge = 'BibTeX Master'
	} else if (isCanonicalMaster && (ext === 'hdf5' || ext === 'h5' || ext === 'h5ad')) {
		formatBadge = 'HDF5 Master'
	} else if (isCanonicalMaster && (ext === 'nc' || ext === 'netcdf' || ext === 'nc4')) {
		formatBadge = 'NetCDF Master'
	} else if (ext === 'ipynb') {
		formatBadge = 'Jupyter .ipynb'
	}

	return { researchTool, formatBadge }
}

/**
 * Classify a single file into one of the 4 Academic Research, LaTeX/BibTeX & Scientific Dataset Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyScientificResearchFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const inCheckpointDir = CHECKPOINT_PATH_RE.test(path)
	const hasCheckpointName = CHECKPOINT_NAME_RE.test(basename)

	const isCheckpointMirror = (inCheckpointDir && (ext === 'ipynb' || SCIENTIFIC_DATASET_EXT_SET.has(ext) || CONTEXT_PLOT_IMAGE_EXT_SET.has(ext) || CORE_FIGURE_EXT_SET.has(ext)))
		|| (hasCheckpointName && ext === 'ipynb')

	const isLatexBuild = !isCheckpointMirror && LATEX_BUILD_EXT_SET.has(ext)

	const isFigureMirror = !isCheckpointMirror && !isLatexBuild && (
		CORE_FIGURE_EXT_SET.has(ext)
		|| (CONTEXT_PLOT_IMAGE_EXT_SET.has(ext) && PLOT_FIGURE_CONTEXT_RE.test(combinedContext))
	)

	const isScientificDataset = !isCheckpointMirror && !isLatexBuild && !isFigureMirror
		&& SCIENTIFIC_DATASET_EXT_SET.has(ext)

	const isManuscriptBib = !isCheckpointMirror && !isLatexBuild && !isFigureMirror && !isScientificDataset && (
		CORE_MANUSCRIPT_EXT_SET.has(ext)
		|| (CONTEXT_MANUSCRIPT_EXT_SET.has(ext) && RESEARCH_DOC_CONTEXT_RE.test(combinedContext))
	)

	if (!isCheckpointMirror && !isLatexBuild && !isFigureMirror && !isScientificDataset && !isManuscriptBib) {
		return null
	}

	let family = 'manuscripts-bibliography'
	let artifactKind = 'manuscript-bib'
	if (isScientificDataset) {
		family = 'scientific-datasets-notebooks'
		artifactKind = 'scientific-dataset'
	} else if (isLatexBuild) {
		family = 'latex-build-artifacts'
		artifactKind = 'latex-build-artifact'
	} else if (isCheckpointMirror || isFigureMirror) {
		family = 'figure-checkpoint-mirrors'
		artifactKind = isCheckpointMirror ? 'checkpoint-mirror' : 'figure-mirror'
	}

	const paperExperiment = extractPaperExperimentName(basename, path)
	const revisionNumber = parseResearchRevision(basename, path)
	const datasetSignature = normalizeResearchDatasetSignature(basename)

	const inExportStaging = EXPORT_STAGING_PATH_RE.test(path)
	const inCanonicalVault = CANONICAL_MASTER_PATH_RE.test(path) && !inExportStaging && !inCheckpointDir

	const isCanonicalMasterFormat = ext === 'tex'
		|| ext === 'bib'
		|| ext === 'hdf5'
		|| ext === 'h5'
		|| ext === 'h5ad'
		|| ext === 'nc'
		|| ext === 'netcdf'
		|| ext === 'nc4'

	const isCanonicalMaster = !isLatexBuild
		&& !isCheckpointMirror
		&& isCanonicalMasterFormat
		&& inCanonicalVault

	const isCanonicalNotebook = !isCheckpointMirror
		&& ext === 'ipynb'
		&& inCanonicalVault

	const { researchTool, formatBadge } = detectResearchToolAndFormat(
		ext,
		path,
		family,
		isCanonicalMaster,
		isCheckpointMirror
	)
	const dirname = getDirname(path)
	const vaultKey = `${paperExperiment}/${datasetSignature}`

	return {
		path,
		dirname,
		basename,
		ext,
		family,
		artifactKind,
		researchTool,
		formatBadge,
		paperExperiment,
		revisionNumber,
		datasetSignature,
		mtimeSec,
		isCheckpointMirror,
		isCanonicalMasterFormat,
		isCanonicalMaster,
		isCanonicalNotebook,
		inCanonicalVault,
		inExportStaging,
		vaultKey,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.45 GB").
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted GB string.
 */
export function formatGigabytes(bytes) {
	const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
	const gb = safe / (1024 * 1024 * 1024)
	return `${gb.toFixed(2)} GB`
}

/**
 * Compute reference timestamp from duplicate groups for deterministic age calculations.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Reference timestamp in epoch seconds.
 */
function resolveReferenceNowSec(duplicateGroups) {
	let maxMtimeSec = 0
	for (const group of duplicateGroups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const mtime = normalizeMtimeSec(file && file.mtime)
			if (mtime > maxMtimeSec) {
				maxMtimeSec = mtime
			}
		}
	}
	return maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000)
}

/**
 * Score a file copy's authority as canonical survivor anchor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isCanonicalMaster) {
		score += 34
	} else if (member.meta.isCanonicalMasterFormat) {
		score += 12
	}
	if (member.meta.isCanonicalNotebook) {
		score += 24
	}
	if (member.meta.inCanonicalVault) {
		score += 20
	}
	if (member.meta.inExportStaging) {
		score -= 26
	}
	if (member.meta.isCheckpointMirror || member.meta.family === 'latex-build-artifacts') {
		score -= 18
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'latest-revision-first') {
		if (member.meta.revisionNumber > 0) {
			score += Math.min(16, member.meta.revisionNumber * 3)
		}
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical survivor.
 *
 * @param {object} a First member.
 * @param {object} b Second member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}
	if (a.meta.isCanonicalMaster !== b.meta.isCanonicalMaster) {
		return a.meta.isCanonicalMaster ? -1 : 1
	}
	if (a.meta.isCanonicalNotebook !== b.meta.isCanonicalNotebook) {
		return a.meta.isCanonicalNotebook ? -1 : 1
	}

	if (survivorRule === 'latest-revision-first') {
		if (a.meta.revisionNumber !== b.meta.revisionNumber) {
			return b.meta.revisionNumber - a.meta.revisionNumber
		}
		if (a.mtimeSec !== b.mtimeSec) {
			return b.mtimeSec - a.mtimeSec
		}
	} else if (survivorRule === 'shortest-path') {
		if (a.meta.path.length !== b.meta.path.length) {
			return a.meta.path.length - b.meta.path.length
		}
	}

	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Academic Research, LaTeX/BibTeX & Scientific Dataset Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeScientificResearchVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = SCIENTIFIC_RESEARCH_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = SCIENTIFIC_RESEARCH_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = SCIENTIFIC_RESEARCH_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = SCIENTIFIC_RESEARCH_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-build-artifacts-and-mirrors'
	const survivorRule = SCIENTIFIC_RESEARCH_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'canonical-tex-bib-hdf5-netcdf-first'

	const protectCanonicalMasters = options.protectCanonicalMasters !== false
	const protectCanonicalNotebooks = options.protectCanonicalNotebooks !== false
	const staleArtifactDays = Number.isFinite(Number(options.staleArtifactDays)) && Number(options.staleArtifactDays) >= 0
		? Number(options.staleArtifactDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: resolveReferenceNowSec(groups)

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyScientificResearchFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const selectionKey = getFileSelectionKey(file)

			const member = {
				file,
				id: file.id ?? file.nodeId ?? selectionKey,
				selectionKey,
				path: meta.path,
				basename: meta.basename,
				size,
				formattedSize: formatBytes(size),
				mtimeSec,
				formattedMtime: formatFileModifiedTime(mtimeSec),
				ageDays,
				isInOriginFolder: Boolean(file.isInOriginFolder),
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length < 2) {
			continue
		}

		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = SCIENTIFIC_RESEARCH_FAMILY_META[family] || SCIENTIFIC_RESEARCH_FAMILY_META['manuscripts-bibliography']

		const hasCanonicalMaster = classifiedMembers.some(m => m.meta.isCanonicalMaster)
		const hasCanonicalNotebook = classifiedMembers.some(m => m.meta.isCanonicalNotebook)
		const hasCheckpointMirror = classifiedMembers.some(m => m.meta.isCheckpointMirror)

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isCanonicalMaster) {
					member.verdictReason = `Canonical ${member.meta.formatBadge} research anchor`
				} else if (member.meta.isCanonicalNotebook) {
					member.verdictReason = 'Primary Jupyter research notebook anchor'
				} else if (member.meta.inCanonicalVault) {
					member.verdictReason = 'Primary scientific vault anchor'
				} else {
					member.verdictReason = 'Highest-authority research artifact survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by researcher'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-research-vault-hardlinks'
					? 'consolidate-hardlink-research-asset'
					: 'reclaim-duplicate-research-asset'
				member.actionType = strategy === 'consolidate-research-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for safe remediation'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				if (member.actionType === 'hardlink') {
					consolidatableCopiesCount += 1
				}
				return
			}

			if (member.isInOriginFolder) {
				member.verdict = 'blocked-origin-folder'
				member.actionType = 'keep'
				member.verdictReason = 'Protected Nextcloud origin folder'
				shieldedCopiesCount += 1
				return
			}

			// Shield canonical .tex / .bib / raw HDF5 / NetCDF masters inside canonical vault
			if (protectCanonicalMasters && member.meta.isCanonicalMaster && strategy !== 'consolidate-research-vault-hardlinks') {
				member.verdict = 'blocked-canonical-master'
				member.actionType = 'keep'
				member.verdictReason = `Canonical ${member.meta.formatBadge} shielded for ${member.meta.paperExperiment}`
				shieldedCopiesCount += 1
				return
			}

			// Shield canonical .ipynb research notebooks inside canonical vault
			if (protectCanonicalNotebooks && member.meta.isCanonicalNotebook && strategy !== 'consolidate-research-vault-hardlinks') {
				member.verdict = 'blocked-canonical-notebook'
				member.actionType = 'keep'
				member.verdictReason = `Canonical Jupyter notebook shielded for ${member.meta.paperExperiment}`
				shieldedCopiesCount += 1
				return
			}

			// Protect very recent LaTeX build artifacts or checkpoint mirrors inside active project tree
			if (
				(family === 'latex-build-artifacts' || member.meta.isCheckpointMirror)
				&& !member.meta.inExportStaging
				&& member.ageDays < staleArtifactDays
			) {
				member.verdict = 'blocked-recent-build-artifact'
				member.actionType = 'keep'
				member.verdictReason = `Recent build/checkpoint artifact (${member.ageDays}d < ${staleArtifactDays}d threshold)`
				shieldedCopiesCount += 1
				return
			}

			// Strategy: hardlink-consolidate research vault copies
			if (strategy === 'consolidate-research-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-research-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			// Strategy: prune LaTeX build artifacts and checkpoint mirrors only
			if (strategy === 'prune-latex-build-and-checkpoints-only') {
				if (family === 'latex-build-artifacts' || member.meta.isCheckpointMirror || member.meta.inExportStaging) {
					member.verdict = member.meta.isCheckpointMirror
						? 'reclaim-stale-checkpoint-mirror'
						: 'reclaim-stale-latex-build-artifact'
					member.actionType = 'prune'
					member.verdictReason = `Stale ${member.meta.researchTool} build/checkpoint artifact (${member.ageDays}d old)`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside LaTeX build & checkpoint cleanup strategy scope'
				shieldedCopiesCount += 1
				return
			}

			// Default strategy: prune-build-artifacts-and-mirrors
			if (member.meta.inExportStaging) {
				member.verdict = 'reclaim-staging-export'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant submission export or download staging copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'latex-build-artifacts') {
				member.verdict = 'reclaim-stale-latex-build-artifact'
				member.actionType = 'prune'
				member.verdictReason = `Stale ${member.meta.researchTool} build artifact (${member.ageDays}d old)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'figure-checkpoint-mirrors') {
				member.verdict = member.meta.isCheckpointMirror
					? 'reclaim-stale-checkpoint-mirror'
					: 'reclaim-redundant-figure-mirror'
				member.actionType = 'prune'
				member.verdictReason = member.meta.isCheckpointMirror
					? 'Redundant .ipynb_checkpoints/ notebook mirror'
					: 'Redundant publication figure or plot export copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-redundant-research-copy'
			member.actionType = 'prune'
			member.verdictReason = 'Redundant research artifact copy outside canonical master anchors'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasCanonicalMaster) {
				riskState = 'canonical-master-protected'
				riskPriority = 5
			} else if (hasCanonicalNotebook) {
				riskState = 'notebook-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (family === 'latex-build-artifacts') {
			riskState = 'build-reclaimable'
			riskPriority = 2
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			paperExperiment: primaryMeta.paperExperiment,
			revisionNumber: primaryMeta.revisionNumber,
			revisionLabel: primaryMeta.revisionNumber > 0 ? `v${primaryMeta.revisionNumber}` : 'unversioned',
			datasetSignature: primaryMeta.datasetSignature,
			researchTool: primaryMeta.researchTool,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			hasCanonicalMaster,
			hasCanonicalNotebook,
			hasCheckpointMirror,
			riskState,
			riskPriority,
			copiesCount: classifiedMembers.length,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb: formatGigabytes(reclaimableBytes),
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableCopiesCount,
			consolidatableCopiesCount,
			shieldedCopiesCount,
			survivor,
			members: classifiedMembers,
		})
	}

	const familyBreakdown = Object.keys(SCIENTIFIC_RESEARCH_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: SCIENTIFIC_RESEARCH_FAMILY_META[famId].label,
			shortLabel: SCIENTIFIC_RESEARCH_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}
		if (minSizeBytes > 0 && cluster.survivor.size < minSizeBytes) {
			return false
		}
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
				return false
			}
			if (verdictFilter === 'canonical-master' && !cluster.hasCanonicalMaster) {
				return false
			}
			if (verdictFilter === 'notebook-guard' && !cluster.hasCanonicalNotebook) {
				return false
			}
			if (verdictFilter === 'latex-build' && cluster.family !== 'latex-build-artifacts') {
				return false
			}
			if (verdictFilter === 'figure-checkpoint' && cluster.family !== 'figure-checkpoint-mirrors') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.paperExperiment,
				cluster.datasetSignature,
				cluster.researchTool,
				cluster.formatBadge,
				cluster.vaultKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'risk_desc') {
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'copies_desc') {
			if (a.copiesCount !== b.copiesCount) {
				return b.copiesCount - a.copiesCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}
		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
			return b.rawDuplicateBytes - a.rawDuplicateBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = filteredClusters.reduce((acc, c) => acc + c.rawDuplicateBytes, 0)
	const totalReclaimableBytes = filteredClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
	const totalFilesCount = filteredClusters.reduce((acc, c) => acc + c.copiesCount, 0)
	const totalReclaimableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.reclaimableCopiesCount, 0)
	const totalConsolidatableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.consolidatableCopiesCount, 0)
	const totalShieldedCopiesCount = filteredClusters.reduce((acc, c) => acc + c.shieldedCopiesCount, 0)
	const totalCanonicalMasterClusters = filteredClusters.filter(c => c.hasCanonicalMaster).length
	const totalNotebookGuardClusters = filteredClusters.filter(c => c.hasCanonicalNotebook).length
	const totalLatexBuildClusters = filteredClusters.filter(c => c.family === 'latex-build-artifacts').length
	const totalFigureCheckpointClusters = filteredClusters.filter(c => c.family === 'figure-checkpoint-mirrors').length
	const distinctPapersCount = new Set(filteredClusters.map(c => c.paperExperiment)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: SCIENTIFIC_RESEARCH_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectCanonicalMasters,
			protectCanonicalNotebooks,
			staleArtifactDays,
			minSizeMb,
			searchQuery,
		},
		summary: {
			totalClustersCount: filteredClusters.length,
			totalUnfilteredClustersCount: allClusters.length,
			totalFilesCount,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			reclaimableGb: formatGigabytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalConsolidatableCopiesCount,
			totalShieldedCopiesCount,
			totalCanonicalMasterClusters,
			totalNotebookGuardClusters,
			totalLatexBuildClusters,
			totalFigureCheckpointClusters,
			distinctPapersCount,
			efficiencyPct,
		},
		familyBreakdown,
		clusters: filteredClusters,
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
function shellQuote(value) {
	const str = String(value ?? '')
	return `'${str.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Join Nextcloud data root and normalized artifact path cleanly.
 *
 * @param {string} dataRoot Nextcloud data root directory.
 * @param {string} relPath Artifact path.
 * @return {string} Combined POSIX path.
 */
function joinDataRoot(dataRoot, relPath) {
	const root = String(dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '')
	const cleanRel = safeNormalizePath(relPath).replace(/^\/+/, '')
	return `${root}/${cleanRel}`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for Academic Research & Scientific Dataset Vault cleanup.
 *
 * @param {object} analysis Output of analyzeScientificResearchVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildScientificResearchRemediationScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').trim() || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const summary = (analysis && analysis.summary) || {
		totalClustersCount: 0,
		formattedReclaimableBytes: '0 B',
		reclaimableGb: '0.00 GB',
		totalReclaimableCopiesCount: 0,
	}

	const lines = [
		'#!/usr/bin/env sh',
		'set -eu',
		'# DuplicateFinder Academic Research, LaTeX/BibTeX & Scientific Dataset Vault Remediation Script',
		`# Schema: ${SCIENTIFIC_RESEARCH_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
		'# Default is safe dry-run mode. Run with DRY_RUN=0 sh script.sh to apply.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "0" ]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0

	for (const cluster of clusters) {
		const targets = (cluster.members || []).filter(m => m.actionType === 'prune' || m.actionType === 'hardlink')
		if (!targets.length) {
			continue
		}
		const anchorPath = joinDataRoot(dataRoot, cluster.survivor.path)
		lines.push(`# Research Vault: ${cluster.vaultKey} [${cluster.researchTool} / ${cluster.formatBadge}] (${cluster.formattedReclaimableBytes})`)
		lines.push(`# Anchor: ${anchorPath}`)

		for (const target of targets) {
			const targetPath = joinDataRoot(dataRoot, target.path)
			actionCount += 1
			if (target.actionType === 'hardlink') {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd ln -f ${shellQuote(anchorPath)} ${shellQuote(targetPath)}`)
				lines.push('fi')
			} else {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd rm -f ${shellQuote(targetPath)}`)
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable academic manuscript, dataset, LaTeX build or checkpoint duplicates under current master guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeScientificResearchVault.
 * @return {string} CSV content.
 */
export function buildScientificResearchCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'PaperExperiment',
		'DatasetSignature',
		'ResearchTool',
		'Family',
		'Format',
		'CanonicalMaster',
		'NotebookGuard',
		'Verdict',
		'Action',
		'AuthorityScore',
		'SizeBytes',
		'Path',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			rows.push([
				cluster.paperExperiment,
				cluster.datasetSignature,
				cluster.researchTool,
				cluster.family,
				cluster.formatBadge,
				member.meta.isCanonicalMaster ? 'yes' : 'no',
				member.meta.isCanonicalNotebook ? 'yes' : 'no',
				member.verdict,
				member.actionType,
				String(member.authorityScore),
				String(member.size),
				member.path,
				member.verdictReason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit manifest.
 *
 * @param {object} analysis Output of analyzeScientificResearchVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildScientificResearchJsonReport(analysis) {
	const payload = {
		schema: SCIENTIFIC_RESEARCH_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			paperExperiment: cluster.paperExperiment,
			datasetSignature: cluster.datasetSignature,
			researchTool: cluster.researchTool,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			hasCanonicalMaster: cluster.hasCanonicalMaster,
			hasCanonicalNotebook: cluster.hasCanonicalNotebook,
			hasCheckpointMirror: cluster.hasCheckpointMirror,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				authorityScore: m.authorityScore,
				verdict: m.verdict,
				actionType: m.actionType,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient LaTeX build artifacts and Jupyter checkpoints.
 *
 * @param {object} analysis Output of analyzeScientificResearchVault.
 * @return {string} Sync exclude rules.
 */
export function buildScientificResearchSyncExcludeSnippet(analysis) {
	const buildCount = analysis && analysis.summary ? analysis.summary.totalLatexBuildClusters : 0
	const checkpointCount = analysis && analysis.summary ? analysis.summary.totalFigureCheckpointClusters : 0
	return [
		'# DuplicateFinder Academic Research, LaTeX Build & Jupyter Checkpoint Sync Exclusions',
		`# Detected LaTeX build clusters: ${buildCount} | Figure/checkpoint mirror clusters: ${checkpointCount}`,
		'*.aux',
		'*.bbl',
		'*.blg',
		'*.fls',
		'*.fdb_latexmk',
		'*.synctex.gz',
		'*.out',
		'*.toc',
		'*.nav',
		'*.snm',
		'*.bcf',
		'*.run.xml',
		'.ipynb_checkpoints/',
		'_minted-*/',
	].join('\n')
}

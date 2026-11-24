/**
 * Pure Spreadsheet, BI Report & Financial Workbook Version-Drift Auditor.
 * Detects and audits duplicate spreadsheets, macro-enabled models, BI dashboards,
 * and columnar/ledger exports across Nextcloud storage:
 * - Spreadsheets & Workbooks (.xlsx, .xls, .ods, .fods, .numbers, .csv, .tsv)
 * - Macro-Enabled & Binary Workbooks (.xlsm, .xlsb, .xltm, .xlam, .xla, .xlm, .ots, .xltx, .xlt)
 * - BI Dashboards & Analytical Models (.pbix, .pbit, .pbids, .twb, .twbx, .tds, .tdsx, .qvw, .qvf, .qvd, .hyper, .dax, .rdl, .jrxml, .biml)
 * - Columnar & Ledger Data Exports (.parquet, .feather, .arrow, .orc, .avro, .ofx, .qfx, .qif, .iif, .mt940, .camt, .xbrl)
 *
 * Extracts fiscal period stamps (FY/Quarter/Month), version-drift markers ("FINAL_v2", "Copy of",
 * "Copie de", working drafts), VBA macro risk flags, and Finance/Audit/Legal vault authority tiers.
 * Generates POSIX DRY_RUN=1 scripts with SHA-256 verification and same-filesystem hardlinks,
 * Nextcloud occ files:scan hints, .sync-exclude.lst rules for Office lockfiles, CWE-1236 CSV, and JSON manifests.
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const WORKBOOK_DRIFT_SCHEMA = 'duplicatefinder.workbook-drift-auditor.v1'

export const WORKBOOK_FAMILIES = Object.freeze([
	'all',
	'spreadsheets',
	'macro-workbooks',
	'bi-reports',
	'columnar-exports',
])

export const WORKBOOK_FAMILY_META = Object.freeze({
	spreadsheets: {
		id: 'spreadsheets',
		label: 'Spreadsheets & CSV',
		shortLabel: 'Spreadsheets',
	},
	'macro-workbooks': {
		id: 'macro-workbooks',
		label: 'Macro & Binary Workbooks',
		shortLabel: 'Macro (.xlsm/.xlsb)',
	},
	'bi-reports': {
		id: 'bi-reports',
		label: 'BI Dashboards & Models',
		shortLabel: 'BI Models',
	},
	'columnar-exports': {
		id: 'columnar-exports',
		label: 'Parquet & Ledger Exports',
		shortLabel: 'Parquet & Ledgers',
	},
})

export const WORKBOOK_STRATEGIES = Object.freeze([
	'consolidate-vault',
	'hardlink-vault',
	'keep-final-only',
])

export const WORKBOOK_SURVIVOR_RULES = Object.freeze([
	'finance-vault-first',
	'highest-version-final',
	'newest-approved',
	'oldest-canonical',
	'shortest-path',
])

export const WORKBOOK_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'finance-guarded',
	'macro-guarded',
	'drift-forks',
	'shielded',
])

export const WORKBOOK_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const WORKBOOK_PRESETS = Object.freeze([
	{
		id: 'all-finance-bi-audit',
		name: 'All Workbooks & BI Audit',
		description: 'Audit spreadsheets, macro workbooks, BI dashboards, and Parquet/ledger exports while guarding Finance/Audit vaults and VBA macros.',
		familyFilter: 'all',
		strategy: 'consolidate-vault',
		survivorRule: 'finance-vault-first',
		protectFinanceVaults: true,
		protectMacroWorkbooks: true,
		protectBiModels: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'final-copy-drift-purge',
		name: 'FINAL & Copy-of Drift Purge',
		description: 'Prioritize cleanup of "Copy of", "Copie de", "(1)", and superseded working drafts while preserving canonical Finance vault survivors.',
		familyFilter: 'spreadsheets',
		strategy: 'keep-final-only',
		survivorRule: 'highest-version-final',
		protectFinanceVaults: true,
		protectMacroWorkbooks: true,
		protectBiModels: true,
		staleDraftDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'macro-vba-audit',
		name: 'Macro & VBA (.xlsm/.xlsb)',
		description: 'Isolate macro-enabled and binary Excel workbooks with strict VBA vault protection and hardlink-safe deduplication options.',
		familyFilter: 'macro-workbooks',
		strategy: 'hardlink-vault',
		survivorRule: 'finance-vault-first',
		protectFinanceVaults: true,
		protectMacroWorkbooks: true,
		protectBiModels: true,
		staleDraftDays: 30,
		minSizeKb: 0,
	},
	{
		id: 'bi-parquet-hardlink',
		name: 'BI & Parquet Mirror Hardlink',
		description: 'Consolidate heavy Power BI (.pbix), Tableau (.twbx), Qlik, and Parquet analytical extracts across team shares with POSIX hardlinks.',
		familyFilter: 'bi-reports',
		strategy: 'hardlink-vault',
		survivorRule: 'finance-vault-first',
		protectFinanceVaults: true,
		protectMacroWorkbooks: true,
		protectBiModels: false,
		staleDraftDays: 14,
		minSizeKb: 256,
	},
	{
		id: 'ledger-export-cleanup',
		name: 'Ledger & CSV Export Cleanup',
		description: 'Reclaim duplicate CSV, TSV, Parquet, OFX, QIF, and XBRL accounting exports outside authoritative Treasury and Audit folders.',
		familyFilter: 'columnar-exports',
		strategy: 'consolidate-vault',
		survivorRule: 'newest-approved',
		protectFinanceVaults: true,
		protectMacroWorkbooks: true,
		protectBiModels: true,
		staleDraftDays: 7,
		minSizeKb: 0,
	},
])

const SPREADSHEET_EXTENSIONS = new Set([
	'xlsx', 'xls', 'ods', 'fods', 'numbers', 'csv', 'tsv',
])
const MACRO_WORKBOOK_EXTENSIONS = new Set([
	'xlsm', 'xlsb', 'xltm', 'xlam', 'xla', 'xlm', 'ots', 'xltx', 'xlt',
])
const BI_REPORT_EXTENSIONS = new Set([
	'pbix', 'pbit', 'pbids', 'twb', 'twbx', 'tds', 'tdsx', 'qvw', 'qvf', 'qvd', 'hyper', 'dax', 'rdl', 'jrxml', 'biml',
])
const COLUMNAR_EXPORT_EXTENSIONS = new Set([
	'parquet', 'feather', 'arrow', 'orc', 'avro', 'ofx', 'qfx', 'qif', 'iif', 'mt940', 'camt', 'xbrl',
])

const MACRO_SENSITIVE_EXTENSIONS = new Set(['xlsm', 'xlsb', 'xltm', 'xlam', 'xla', 'xlm'])

const FINANCE_VAULT_PATH_RE = /(\/finance|\/comptabilite|\/accounting|\/treasury|\/tresorerie|\/audit|\/statutory|\/consolidation|\/tax|\/fiscal|\/payroll|\/paie|\/board|\/legal|\/compliance|\/sox|\/ifrs|\/gaap|\/__groupfolders\/|\/closing|\/cloture|\/vault)/i
const BI_HUB_PATH_RE = /(\/bi\/|\/powerbi|\/tableau|\/qlik|\/reporting|\/analytics|\/kpi|\/dashboards?|\/datamart|\/shared\/|\/team\/|\/fpna|\/controlling)/i
const USER_SCRATCH_PATH_RE = /(\/downloads\/|\/telechargements\/|\/desktop\/|\/bureau\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/inbox\/|\/mail-attachments\/|\/attachments\/|\/exports\/)/i
const COPY_CONFLICT_PATH_RE = /(\/backup\/|\/backups\/|\/old\/|\/archive\/|\/archived\/|conflicted copy)/i

const COPY_FORK_NAME_RE = /^(?:copy of |copie de )|(?:\s-\s?copy|\s\(\d+\)|_copy\b|\bconflicted copy\b|\bbackup\b|\bbak\b|\bsuperseded\b|\bold\b|\bprev\b)/i
const WORKING_DRAFT_RE = /(?:^|[\s_.-])(draft|brouillon|wip|working|scratch|temp|tmp|review|relecture|notes|comments|edited|adjusted|modifie|rev\d+)(?:$|[\s_.-])/i
const FINAL_DRIFT_RE = /(?:^|[\s_.-])(final(?:_?v?\d+)?|finale|vfinal|definitif|definitive|valide|valid[eé]|signed|signe|approved|board_?ready|audited|certified)(?:$|[\s_.-])/i
const MACRO_HINT_RE = /(?:^|[\s_.-])(macro|vba|xlsm|xlsb)(?:$|[\s_.-])/i

const TIER_LABELS = Object.freeze({
	'finance-audit-vault': 'Finance / Audit / Board Vault',
	'bi-published-hub': 'Published BI & FP&A Hub',
	'team-workspace': 'Team / Project Workspace',
	'user-scratch-downloads': 'User Downloads / Scratch',
	'copy-conflict-pool': 'Backup / Conflict Copy Pool',
})

const TIER_AUTHORITY = Object.freeze({
	'finance-audit-vault': 96,
	'bi-published-hub': 78,
	'team-workspace': 52,
	'user-scratch-downloads': 22,
	'copy-conflict-pool': 12,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Survivor',
	'reclaim-drift-copy': 'Reclaim Drift Copy',
	'reclaim-stale-export': 'Purge Stale Export/Download',
	'hardlink-workbook-mirror': 'Hardlink Workbook Mirror',
	'blocked-finance-vault': 'Blocked: Finance Vault Guard',
	'blocked-macro-workbook': 'Blocked: Macro/VBA Guard',
	'blocked-bi-master': 'Blocked: BI Master Guard',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string value.
 * @return {string} Single-quoted POSIX literal.
 */
export function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, "'\\''")}'`
}

/**
 * Parse a timestamp field into epoch seconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch seconds or null when missing or invalid.
 */
function parseTimestampSeconds(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value < 0) {
			return null
		}
		return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const n = Number(trimmed)
			if (!Number.isFinite(n) || n < 0) {
				return null
			}
			return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file record.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch seconds or null.
 */
function getFileMtimeSeconds(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestampSeconds(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Extract basename from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const raw = String(normalizedPath || '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Classify a file path and optional MIME type into a workbook/BI/ledger family.
 *
 * @param {string} rawPath File path.
 * @param {string} [mimetype=''] Optional MIME type.
 * @return {{ matched: boolean, family: string, familyLabel: string, extension: string, isMacroEnabled: boolean }|null}
 */
export function classifyWorkbookArtifact(rawPath, mimetype = '') {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerMime = String(mimetype || '').toLowerCase()

	if (!lowerBase) {
		return null
	}

	const lastDot = lowerBase.lastIndexOf('.')
	const ext = lastDot > 0 && lastDot < lowerBase.length - 1 ? lowerBase.slice(lastDot + 1) : ''

	if (MACRO_WORKBOOK_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'macro-workbooks',
			familyLabel: WORKBOOK_FAMILY_META['macro-workbooks'].label,
			extension: ext,
			isMacroEnabled: MACRO_SENSITIVE_EXTENSIONS.has(ext) || MACRO_HINT_RE.test(lowerBase),
		}
	}

	if (SPREADSHEET_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'spreadsheets',
			familyLabel: WORKBOOK_FAMILY_META.spreadsheets.label,
			extension: ext,
			isMacroEnabled: false,
		}
	}

	if (BI_REPORT_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'bi-reports',
			familyLabel: WORKBOOK_FAMILY_META['bi-reports'].label,
			extension: ext,
			isMacroEnabled: false,
		}
	}

	if (COLUMNAR_EXPORT_EXTENSIONS.has(ext)) {
		return {
			matched: true,
			family: 'columnar-exports',
			familyLabel: WORKBOOK_FAMILY_META['columnar-exports'].label,
			extension: ext,
			isMacroEnabled: false,
		}
	}

	if (lowerMime.includes('spreadsheet') || lowerMime.includes('ms-excel') || lowerMime === 'text/csv' || lowerMime === 'text/tab-separated-values') {
		const isMacroMime = lowerMime.includes('macroenabled')
		const family = isMacroMime ? 'macro-workbooks' : 'spreadsheets'
		return {
			matched: true,
			family,
			familyLabel: WORKBOOK_FAMILY_META[family].label,
			extension: ext || (lowerMime.includes('csv') ? 'csv' : 'xlsx'),
			isMacroEnabled: isMacroMime,
		}
	}

	return null
}

/**
 * Extract fiscal period stamp (FY, Quarter, Half, Month) from a path or filename.
 *
 * @param {string} rawPath Normalized file path.
 * @return {string} Fiscal period label or 'unscheduled'.
 */
export function extractFiscalPeriod(rawPath) {
	const text = String(rawPath || '')

	const fyQuarter = text.match(/(?:^|[\s/_.-])(?:FY)?(20\d{2}|19\d{2}|2\d)[\s/_.-]?(Q[1-4])(?:$|[\s/_.-])/i)
	if (fyQuarter) {
		const rawYear = fyQuarter[1]
		const fullYear = rawYear.length === 2 ? `20${rawYear}` : rawYear
		return `${fullYear}-${fyQuarter[2].toUpperCase()}`
	}

	const quarterFy = text.match(/(?:^|[\s/_.-])(Q[1-4])[\s/_.-]?(?:FY)?(20\d{2}|19\d{2}|2\d)(?:$|[\s/_.-])/i)
	if (quarterFy) {
		const rawYear = quarterFy[2]
		const fullYear = rawYear.length === 2 ? `20${rawYear}` : rawYear
		return `${fullYear}-${quarterFy[1].toUpperCase()}`
	}

	const halfYear = text.match(/(?:^|[\s/_.-])(H[12])[\s/_.-]?(?:FY)?(20\d{2}|2\d)(?:$|[\s/_.-])/i)
	if (halfYear) {
		const rawYear = halfYear[2]
		const fullYear = rawYear.length === 2 ? `20${rawYear}` : rawYear
		return `${fullYear}-${halfYear[1].toUpperCase()}`
	}

	const fyOnly = text.match(/(?:^|[\s/_.-])FY[\s_.-]?(20\d{2}|2\d)(?:$|[\s/_.-])/i)
	if (fyOnly) {
		const rawYear = fyOnly[1]
		const fullYear = rawYear.length === 2 ? `20${rawYear}` : rawYear
		return `FY${fullYear}`
	}

	const yearMonth = text.match(/(?:^|[\s/_.-])(20\d{2})-(0[1-9]|1[0-2])(?:$|[\s/_.-])/)
	if (yearMonth) {
		return `${yearMonth[1]}-${yearMonth[2]}`
	}

	const ymdCompact = text.match(/(?:^|[\s/_.-])(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:$|[\s/_.-])/)
	if (ymdCompact) {
		return `${ymdCompact[1]}-${ymdCompact[2]}-${ymdCompact[3]}`
	}

	if (/(?:^|[\s/_.-])(ytd|mtd|closing|cloture)(?:$|[\s/_.-])/i.test(text)) {
		return 'YTD / Closing'
	}

	const yearOnly = text.match(/(?:^|[\s/_.-])(20\d{2})(?:$|[\s/_.-])/)
	if (yearOnly) {
		return `FY${yearOnly[1]}`
	}

	return 'unscheduled'
}

/**
 * Extract version tag, numeric rank, drift status, and normalized lineage stem from a basename.
 *
 * @param {string} basename File basename.
 * @return {{ driftStatus: string, versionTag: string, versionRank: number, lineageStem: string, isCopyFork: boolean, isWorkingDraft: boolean, isFinalDrift: boolean }}
 */
export function inspectWorkbookVersionDrift(basename) {
	const name = String(basename || '')
	const dotIdx = name.lastIndexOf('.')
	const stemRaw = dotIdx > 0 ? name.slice(0, dotIdx) : name

	const isCopyFork = COPY_FORK_NAME_RE.test(stemRaw)
	const isWorkingDraft = WORKING_DRAFT_RE.test(stemRaw)
	const isFinalDrift = FINAL_DRIFT_RE.test(stemRaw)

	let driftStatus = 'canonical'
	if (isCopyFork) {
		driftStatus = 'copy-fork'
	} else if (isWorkingDraft) {
		driftStatus = 'working-draft'
	} else if (isFinalDrift) {
		driftStatus = 'final-drift'
	}

	let versionTag = 'unversioned'
	let versionRank = 10

	const finalVer = stemRaw.match(/final[\s_.-]*v?(\d+(?:\.\d+)?)/i)
	const explicitVer = stemRaw.match(/(?:^|[\s_.-])(?:v|ver|rev)(\d+(?:\.\d+)?)(?:$|[\s_.-])/i)
	const copyIndex = stemRaw.match(/\((\d+)\)\s*$/)

	if (finalVer) {
		versionTag = `FINAL v${finalVer[1]}`
		versionRank = 90 + Number.parseFloat(finalVer[1])
	} else if (isFinalDrift) {
		versionTag = 'FINAL'
		versionRank = 85
	} else if (explicitVer) {
		versionTag = `v${explicitVer[1]}`
		versionRank = 30 + Number.parseFloat(explicitVer[1])
	} else if (isWorkingDraft) {
		versionTag = 'draft'
		versionRank = 5
	} else if (isCopyFork) {
		versionTag = copyIndex ? `copy (${copyIndex[1]})` : 'copy-fork'
		versionRank = 2
	}

	let lineageStem = stemRaw
		.replace(/^(?:copy of |copie de )/i, '')
		.replace(/\s-\s?copy(?:\s*\(\d+\))?$/i, '')
		.replace(/\s*\(\d+\)\s*$/g, '')
		.replace(/(?:^|[\s_.-])(final(?:_?v?\d+)?|finale|vfinal|definitif|definitive|valide|valid[eé]|signed|approved|audited|draft|brouillon|wip|working|scratch|copy|bak|backup|old|prev|v\d+(?:\.\d+)?|rev\d+)(?=$|[\s_.-])/gi, ' ')
		.replace(/[\s_.-]+/g, ' ')
		.trim()

	if (!lineageStem) {
		lineageStem = stemRaw
	}

	return {
		driftStatus,
		versionTag,
		versionRank,
		lineageStem,
		isCopyFork,
		isWorkingDraft,
		isFinalDrift,
	}
}

/**
 * Inspect folder governance tier and domain context for a workbook member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Output from classifyWorkbookArtifact.
 * @param {number} referenceTimeSec Reference timestamp in epoch seconds.
 * @param {number} staleDraftDays Age threshold in days for stale drift flagging.
 * @return {object} Member domain context.
 */
export function inspectWorkbookMemberContext(file, classification, referenceTimeSec, staleDraftDays) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const drift = inspectWorkbookVersionDrift(basename)
	const fiscalPeriod = extractFiscalPeriod(normalizedPath)

	let tier = 'team-workspace'
	if (FINANCE_VAULT_PATH_RE.test(lowerPath)) {
		tier = 'finance-audit-vault'
	} else if (COPY_CONFLICT_PATH_RE.test(lowerPath) || drift.isCopyFork) {
		tier = 'copy-conflict-pool'
	} else if (USER_SCRATCH_PATH_RE.test(lowerPath)) {
		tier = 'user-scratch-downloads'
	} else if (BI_HUB_PATH_RE.test(lowerPath) || classification.family === 'bi-reports') {
		tier = 'bi-published-hub'
	}

	const isFinanceVault = tier === 'finance-audit-vault'
	const isBiPublishedHub = tier === 'bi-published-hub'
	const isUserScratch = tier === 'user-scratch-downloads' || tier === 'copy-conflict-pool'
	const isMacroEnabled = Boolean(classification && classification.isMacroEnabled)
	const isStaleDrift = ageDays !== null && ageDays >= staleDraftDays && (isUserScratch || drift.isCopyFork || drift.isWorkingDraft)

	let authorityScore = TIER_AUTHORITY[tier] || 50
	if (!drift.isCopyFork && !drift.isWorkingDraft) {
		authorityScore += 4
	}
	if (drift.isFinalDrift && !drift.isCopyFork) {
		authorityScore += 3
	}
	if (isMacroEnabled && isFinanceVault) {
		authorityScore += 2
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['team-workspace'],
		authorityScore,
		fiscalPeriod,
		driftStatus: drift.driftStatus,
		versionTag: drift.versionTag,
		versionRank: drift.versionRank,
		lineageStem: drift.lineageStem,
		isCopyFork: drift.isCopyFork,
		isWorkingDraft: drift.isWorkingDraft,
		isFinalDrift: drift.isFinalDrift,
		isFinanceVault,
		isBiPublishedHub,
		isUserScratch,
		isMacroEnabled,
		isStaleDrift,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving workbook copy inside a duplicate cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor rule ID.
 * @param {Set<string>} excludeKeys Selection keys explicitly excluded by operator.
 * @return {object|null} Surviving member or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'highest-version-final') {
			if (a.context.versionRank !== b.context.versionRank) {
				return b.context.versionRank - a.context.versionRank
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-approved') {
			const mtimeA = a.context.mtimeSec ?? -1
			const mtimeB = b.context.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'oldest-canonical') {
			if (a.context.isCopyFork !== b.context.isCopyFork) {
				return a.context.isCopyFork ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			const mtimeB = b.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			if (mtimeA !== mtimeB) {
				return mtimeA - mtimeB
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else {
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
			if (a.context.versionRank !== b.context.versionRank) {
				return b.context.versionRank - a.context.versionRank
			}
		}

		const mtimeA = a.context.mtimeSec ?? 0
		const mtimeB = b.context.mtimeSec ?? 0
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic remediation verdict for a single workbook member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative workbook source.`,
		}
	}

	if (forceKeepKeys.has(member.selectionKey)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Protected by manual Keep override.',
		}
	}

	if (options.protectFinanceVaults && member.context.isFinanceVault) {
		return {
			verdict: 'blocked-finance-vault',
			verdictLabel: VERDICT_LABELS['blocked-finance-vault'],
			actionKind: 'shield',
			note: 'Protected by Finance/Audit/Board Vault Guard; statutory and closing records are never modified automatically.',
		}
	}

	if (options.protectMacroWorkbooks && member.context.isMacroEnabled) {
		return {
			verdict: 'blocked-macro-workbook',
			verdictLabel: VERDICT_LABELS['blocked-macro-workbook'],
			actionKind: 'shield',
			note: 'Protected by Macro/VBA Workbook Guard; review signed VBA modules before consolidating.',
		}
	}

	if (options.protectBiModels && member.family === 'bi-reports' && member.context.isBiPublishedHub) {
		return {
			verdict: 'blocked-bi-master',
			verdictLabel: VERDICT_LABELS['blocked-bi-master'],
			actionKind: 'shield',
			note: 'Protected by BI Master Guard; published dashboard datasets require workspace owner review.',
		}
	}

	if (options.strategy === 'hardlink-vault') {
		return {
			verdict: 'hardlink-workbook-mirror',
			verdictLabel: VERDICT_LABELS['hardlink-workbook-mirror'],
			actionKind: 'hardlink',
			note: 'Replace redundant copy with a same-filesystem POSIX hardlink to preserve all workbook paths at zero extra storage.',
		}
	}

	if (member.context.isUserScratch || member.context.isStaleDrift) {
		return {
			verdict: 'reclaim-stale-export',
			verdictLabel: VERDICT_LABELS['reclaim-stale-export'],
			actionKind: 'reclaim',
			note: 'Stale user download, scratch export, or backup conflict copy superseded by canonical survivor.',
		}
	}

	return {
		verdict: 'reclaim-drift-copy',
		verdictLabel: VERDICT_LABELS['reclaim-drift-copy'],
		actionKind: 'reclaim',
		note: 'Identical-hash workbook drift copy outside protected vaults; safe to consolidate.',
	}
}

/**
 * Normalize analysis options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = WORKBOOK_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = WORKBOOK_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = WORKBOOK_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = WORKBOOK_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-vault'
	const survivorRule = WORKBOOK_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'finance-vault-first'

	const parsedDays = Number.parseInt(rawOptions.staleDraftDays, 10)
	const staleDraftDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 30

	const parsedMinKb = Number.parseFloat(rawOptions.minSizeKb)
	const minSizeKb = Number.isFinite(parsedMinKb) && parsedMinKb >= 0
		? parsedMinKb
		: 0

	const refTime = Number(rawOptions.referenceTimeSec)
	const referenceTimeSec = Number.isFinite(refTime) && refTime > 0
		? Math.floor(refTime)
		: Math.floor(Date.now() / 1000)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectFinanceVaults: rawOptions.protectFinanceVaults !== false,
		protectMacroWorkbooks: rawOptions.protectMacroWorkbooks !== false,
		protectBiModels: rawOptions.protectBiModels !== false,
		staleDraftDays,
		minSizeKb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups for spreadsheets, macro workbooks, BI reports, and ledger/columnar exports.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeWorkbookDriftDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeKb * 1024

	const familyCounts = {
		all: 0,
		spreadsheets: 0,
		'macro-workbooks': 0,
		'bi-reports': 0,
		'columnar-exports': 0,
	}

	const rawClusters = []
	const stemClusterCounts = new Map()

	for (let groupIdx = 0; groupIdx < safeDuplicates.length; groupIdx += 1) {
		const group = safeDuplicates[groupIdx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const classifiedEntries = []
		for (let fileIdx = 0; fileIdx < group.files.length; fileIdx += 1) {
			const file = group.files[fileIdx]
			if (!file || typeof file !== 'object') {
				continue
			}
			const info = classifyWorkbookArtifact(file.path, file.mimetype)
			if (info && info.matched) {
				classifiedEntries.push({ file, fileIdx, info })
			}
		}

		if (classifiedEntries.length < 2) {
			continue
		}

		const primaryInfo = classifiedEntries[0].info
		const rawInfo = computeGroupReclaimableInfo(group)
		const groupSizeBytes = Number(group.size) || classifiedEntries.reduce((max, e) => Math.max(max, Number(e.file.size) || 0), 0)
		if (minSizeBytes > 0 && groupSizeBytes < minSizeBytes) {
			continue
		}

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = classifiedEntries.map(({ file, fileIdx, info }) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file, `${groupIdx}-${fileIdx}`))
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const context = inspectWorkbookMemberContext(file, info, options.referenceTimeSec, options.staleDraftDays)
			const size = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			const formattedMtime = formatFileModifiedTime(context.mtimeSec !== null ? context.mtimeSec : file.mtime)

			return {
				selectionKey,
				fileId: file.id ?? null,
				rawPath: String(file.path || ''),
				normalizedPath,
				basename,
				extension: info.extension,
				family: info.family,
				familyLabel: info.familyLabel,
				size,
				formattedSize: formatBytes(size),
				formattedMtime,
				override,
				tier: context.tier,
				tierLabel: context.tierLabel,
				context,
			}
		})

		const survivor = selectClusterSurvivor(members, options.survivorRule, excludeKeys)
		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys)
			member.role = survivor && member.selectionKey === survivor.selectionKey ? 'survivor' : 'duplicate'
			member.verdict = verdictInfo.verdict
			member.verdictLabel = verdictInfo.verdictLabel
			member.actionKind = verdictInfo.actionKind
			member.note = verdictInfo.note
		}

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'hardlink')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const financeGuardedCopiesCount = members.filter(m => m.verdict === 'blocked-finance-vault').length
		const macroGuardedCopiesCount = members.filter(m => m.verdict === 'blocked-macro-workbook').length
		const biGuardedCopiesCount = members.filter(m => m.verdict === 'blocked-bi-master').length
		const driftForkCopiesCount = members.filter(m => m.context.isCopyFork || m.context.isWorkingDraft || m.context.isFinalDrift).length
		const userScratchCopiesCount = members.filter(m => m.context.isUserScratch).length

		const fiscalPeriods = Array.from(new Set(members.map(m => m.context.fiscalPeriod).filter(p => p !== 'unscheduled')))
		const versionTags = Array.from(new Set(members.map(m => m.context.versionTag).filter(v => v !== 'unversioned')))
		const driftStatuses = Array.from(new Set(members.map(m => m.context.driftStatus)))

		const primaryStem = (survivor ? survivor.context.lineageStem : members[0].context.lineageStem).toLowerCase()
		stemClusterCounts.set(primaryStem, (stemClusterCounts.get(primaryStem) || 0) + 1)

		let clusterRiskState = 'reclaimable'
		if (macroGuardedCopiesCount > 0) {
			clusterRiskState = 'macro-guarded'
		} else if (financeGuardedCopiesCount > 0 || biGuardedCopiesCount > 0) {
			clusterRiskState = 'finance-guarded'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `workbook-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			lineageStem: survivor ? survivor.context.lineageStem : members[0].context.lineageStem,
			lineageStemKey: primaryStem,
			extension: primaryInfo.extension,
			family: primaryInfo.family,
			familyLabel: primaryInfo.familyLabel,
			tierLabel: survivor ? survivor.tierLabel : members[0].tierLabel,
			copyCount: members.length,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawInfo.reclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			financeGuardedCopiesCount,
			macroGuardedCopiesCount,
			biGuardedCopiesCount,
			driftForkCopiesCount,
			userScratchCopiesCount,
			hasFinanceVaultCopy: members.some(m => m.context.isFinanceVault),
			hasMacroCopy: members.some(m => m.context.isMacroEnabled),
			hasBiPublishedCopy: members.some(m => m.family === 'bi-reports' && m.context.isBiPublishedHub),
			hasDriftForkCopy: driftForkCopiesCount > 0,
			fiscalSummary: fiscalPeriods.length > 0 ? fiscalPeriods.join(', ') : 'unscheduled',
			versionSummary: versionTags.length > 0 ? versionTags.join(', ') : 'unversioned',
			driftSummary: driftStatuses.join(', '),
			clusterRiskState,
			survivor,
			members,
		})
	}

	for (const cluster of rawClusters) {
		cluster.stemSiblingClustersCount = stemClusterCounts.get(cluster.lineageStemKey) || 1
	}

	const searchFiltered = rawClusters.filter(cluster => {
		if (!options.searchQuery) {
			return true
		}
		const q = options.searchQuery
		if (
			cluster.displayName.toLowerCase().includes(q)
			|| cluster.lineageStem.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.fiscalSummary.toLowerCase().includes(q)
			|| cluster.versionSummary.toLowerCase().includes(q)
			|| cluster.driftSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => m.normalizedPath.toLowerCase().includes(q))
	})

	for (const cluster of searchFiltered) {
		familyCounts.all += 1
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const clusters = searchFiltered.filter(cluster => {
		if (options.familyFilter !== 'all' && cluster.family !== options.familyFilter) {
			return false
		}
		if (options.verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'finance-guarded' && cluster.financeGuardedCopiesCount === 0 && !cluster.hasFinanceVaultCopy) {
			return false
		}
		if (options.verdictFilter === 'macro-guarded' && cluster.macroGuardedCopiesCount === 0 && !cluster.hasMacroCopy) {
			return false
		}
		if (options.verdictFilter === 'drift-forks' && cluster.driftForkCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.macroGuardedCopiesCount * 4 + a.financeGuardedCopiesCount * 3 + a.driftForkCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.macroGuardedCopiesCount * 4 + b.financeGuardedCopiesCount * 3 + b.driftForkCopiesCount * 2 + b.shieldedCopiesCount
			if (riskA !== riskB) {
				return riskB - riskA
			}
		} else if (options.sortMode === 'copies_desc') {
			if (a.copyCount !== b.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (options.sortMode === 'name_asc') {
			return a.basename.localeCompare(b.basename)
		}

		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.basename.localeCompare(b.basename)
	})

	const totalRawDuplicateBytes = clusters.reduce((sum, c) => sum + c.rawReclaimableBytes, 0)
	const totalReclaimableBytes = clusters.reduce((sum, c) => sum + c.reclaimableBytes, 0)
	const totalReclaimableCopiesCount = clusters.reduce((sum, c) => sum + c.reclaimableCopiesCount, 0)
	const totalShieldedCopiesCount = clusters.reduce((sum, c) => sum + c.shieldedCopiesCount, 0)
	const totalFinanceVaultClusters = clusters.filter(c => c.hasFinanceVaultCopy).length
	const totalMacroClusters = clusters.filter(c => c.family === 'macro-workbooks' || c.hasMacroCopy).length
	const totalDriftForkCopiesCount = clusters.reduce((sum, c) => sum + c.driftForkCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: WORKBOOK_DRIFT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectFinanceVaults: options.protectFinanceVaults,
			protectMacroWorkbooks: options.protectMacroWorkbooks,
			protectBiModels: options.protectBiModels,
			staleDraftDays: options.staleDraftDays,
			minSizeKb: options.minSizeKb,
			referenceTimeSec: options.referenceTimeSec,
		},
		summary: {
			totalClustersCount: clusters.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalFinanceVaultClusters,
			totalMacroClusters,
			totalDriftForkCopiesCount,
			efficiencyPct,
			familyCounts,
		},
		clusters,
	}
}

/**
 * Extract Nextcloud relative scan roots for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique sorted Nextcloud relative roots.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts[0] === '__groupfolders') {
			roots.add(`/__groupfolders/${parts[1] || ''}`.replace(/\/+$/, ''))
		} else if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for workbook, BI, and ledger consolidation.
 *
 * @param {object} analysis Output from analyzeWorkbookDriftDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, and DRY_RUN=1 default.
 */
export function buildWorkbookDriftScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-vault'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				fiscalPeriod: member.context.fiscalPeriod,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.rawPath || member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Spreadsheet, BI Report & Financial Workbook Version-Drift Auditor',
		`# Strategy: ${strategy} | Safe defaults: DRY_RUN=1, VERIFY_SHA256=1`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'VERIFY_SHA256="$' + '{VERIFY_SHA256:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
		'verify_matching_digest() {',
		'  local survivor_full="$1"',
		'  local target_full="$2"',
		'  if [ "$VERIFY_SHA256" != "1" ]; then',
		'    return 0',
		'  fi',
		'  if command -v sha256sum >/dev/null 2>&1; then',
		'    local s_sum t_sum',
		'    s_sum="$(sha256sum -- "$survivor_full" | awk \'{print $1}\')"',
		'    t_sum="$(sha256sum -- "$target_full" | awk \'{print $1}\')"',
		'    [ "$s_sum" = "$t_sum" ]',
		'    return $?',
		'  fi',
		'  return 0',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable or hardlinkable workbook, BI model, or ledger targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_workbook_copy() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] verify %s && rm -f -- %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    rm -f -- "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('hardlink_workbook_mirror() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    local s_dev t_dev')
	lines.push('    s_dev="$(stat -c %d "$survivor_full" 2>/dev/null || stat -f %d "$survivor_full")"')
	lines.push('    t_dev="$(stat -c %d "$target_full" 2>/dev/null || stat -f %d "$target_full")"')
	lines.push('    if [ "$s_dev" != "$t_dev" ]; then')
	lines.push('      printf \'[SKIP cross-device] %s\\n\' "$target_full" >&2')
	lines.push('      return 0')
	lines.push('    fi')
	lines.push('    ln -f -- "$survivor_full" "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')

	for (const op of operations) {
		lines.push(`# ${op.family} [${op.fiscalPeriod}]: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_workbook_mirror ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_workbook_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan after DRY_RUN=0:')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for Office lockfiles and BI temp artifacts.
 *
 * @param {object} analysis Output from analyzeWorkbookDriftDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildWorkbookSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for spreadsheet lockfiles and BI temp extracts',
		'~$*.xlsx',
		'~$*.xlsm',
		'~$*.xlsb',
		'~$*.xls',
		'.~lock.*.ods#',
		'*.pbix.tmp',
		'*.twb~',
		'*.parquet.tmp',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension) {
			const lockPattern = `~$*.${cluster.extension}`
			if (['xlsx', 'xlsm', 'xlsb', 'xls', 'xltx', 'xltm'].includes(cluster.extension) && !seen.has(lockPattern)) {
				lines.push(lockPattern)
				seen.add(lockPattern)
			}
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for workbook/BI/ledger clusters.
 *
 * @param {object} analysis Output from analyzeWorkbookDriftDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildWorkbookDriftCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Workbook Name',
		'Lineage Stem',
		'Extension',
		'Family',
		'Tier',
		'Fiscal Period',
		'Version Tag',
		'Drift Status',
		'Macro Enabled',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Days',
		'Finance Vault',
		'BI Hub',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.lineageStem,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.fiscalPeriod,
				member.context.versionTag,
				member.context.driftStatus,
				member.context.isMacroEnabled ? 'yes' : 'no',
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageDays !== null ? member.context.ageDays : '',
				member.context.isFinanceVault ? 'yes' : 'no',
				member.context.isBiPublishedHub ? 'yes' : 'no',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for spreadsheet, BI report, and workbook drift clusters.
 *
 * @param {object} analysis Output from analyzeWorkbookDriftDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildWorkbookDriftJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: WORKBOOK_DRIFT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			lineageStem: cluster.lineageStem,
			stemSiblingClustersCount: cluster.stemSiblingClustersCount,
			extension: cluster.extension,
			family: cluster.family,
			tierLabel: cluster.tierLabel,
			fiscalSummary: cluster.fiscalSummary,
			versionSummary: cluster.versionSummary,
			driftSummary: cluster.driftSummary,
			clusterRiskState: cluster.clusterRiskState,
			copyCount: cluster.copyCount,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivor ? cluster.survivor.normalizedPath : '',
			members: (cluster.members || []).map(member => ({
				selectionKey: member.selectionKey,
				path: member.normalizedPath,
				role: member.role,
				verdict: member.verdict,
				actionKind: member.actionKind,
				size: member.size,
				ageDays: member.context.ageDays,
				fiscalPeriod: member.context.fiscalPeriod,
				versionTag: member.context.versionTag,
				driftStatus: member.context.driftStatus,
				isMacroEnabled: member.context.isMacroEnabled,
				isFinanceVault: member.context.isFinanceVault,
				isBiPublishedHub: member.context.isBiPublishedHub,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}

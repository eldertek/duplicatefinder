/**
 * Pure Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vault Auditor.
 * Classifies and audits duplicate clusters across 4 DFIR & Security Vault families:
 * - Disk & Memory Forensics (.e01, .ex01, .aff4, .raw, .dd, .vmem, .lime, .dmp, .mdmp, custody hashes)
 * - Network PCAP & Captures (.pcap, .pcapng, .pcap.gz, .pcapng.gz, .pcap.zst, .har, .saz, .zeek)
 * - Malware Quarantine & Threat Intel (.yar, .yara, .stix, .ioc, .misp.json, .sigma.yml, .zip.enc, .7z.enc, .infected, .vir)
 * - SIEM Logs & Carving Scratch (.evtx, .jsonl.gz, .plaso, .bodyfile, volatility_cache/, plaso_tmp/, kape_staging/, carved_tmp/)
 *
 * Enforces strict DFIR chain-of-custody and evidence governance defaults:
 * - Strictly conserves forensic disk/memory images (.e01, .ex01, .aff4, .vmem, .lime, .dd, .raw, .dmp) and hash manifests
 * - Strictly conserves compressed packet captures (.pcap.gz, .pcapng.gz, .pcap.zst) and canonical SIEM logs (.evtx, .jsonl.gz)
 * - Strictly conserves YARA/Sigma/STIX threat intel and encrypted malware quarantine bundles (.zip.enc, .7z.enc, .infected, .vir)
 * - Detects redundant uncompressed .pcap/.pcapng/.cap files when a verified compressed .pcap.gz/.pcap.zst anchor exists
 * - Blocks deletion of uncompressed .pcap/.pcapng lacking a verified compressed anchor when guard is active
 * - Blocks hardlinks on mutable IOC rules, encrypted malware quarantine samples, EVTX, memory dumps, and uncompressed PCAPs
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DFIR_SECURITY_VAULT_SCHEMA = 'duplicatefinder.dfir-security-vault-auditor.v1'

export const DFIR_SECURITY_FAMILIES = Object.freeze([
	'all',
	'disk-memory-forensics',
	'network-pcap-telemetry',
	'malware-ioc-threat-intel',
	'siem-carving-scratch',
])

export const DFIR_SECURITY_FAMILY_META = Object.freeze({
	'disk-memory-forensics': {
		id: 'disk-memory-forensics',
		label: 'Disk & Memory Forensics',
		shortLabel: 'Forensics (.e01, .aff4, .vmem, .lime, .dmp, .dd)',
	},
	'network-pcap-telemetry': {
		id: 'network-pcap-telemetry',
		label: 'Network PCAP & Captures',
		shortLabel: 'Captures (.pcap, .pcapng, .pcap.gz, .pcap.zst, .har)',
	},
	'malware-ioc-threat-intel': {
		id: 'malware-ioc-threat-intel',
		label: 'Malware & Threat Intel',
		shortLabel: 'IOC & Quarantine (.yar, .stix, .sigma.yml, .zip.enc)',
	},
	'siem-carving-scratch': {
		id: 'siem-carving-scratch',
		label: 'SIEM Logs & Carving Scratch',
		shortLabel: 'SIEM & Scratch (.evtx, .plaso, volatility_cache/, carved_tmp/)',
	},
})

export const DFIR_SECURITY_STRATEGIES = Object.freeze([
	'prune-pcap-and-carving-scratch',
	'hardlink-archived-forensics-and-pcap',
	'quarantine-uncompressed-pcap-and-scratch',
])

export const DFIR_SECURITY_SURVIVOR_RULES = Object.freeze([
	'evidence-custody-archive-first',
	'oldest-acquisition-first',
	'newest-analysis-first',
	'shortest-path',
])

export const DFIR_SECURITY_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'forensic-image-protected',
	'compressed-pcap-siem-protected',
	'threat-intel-quarantine-protected',
	'uncompressed-pcap-redundant',
	'carving-scratch-intermediate',
	'shielded',
])

export const DFIR_SECURITY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DFIR_SECURITY_PRESETS = Object.freeze([
	{
		id: 'all-dfir-security-audit',
		name: 'All DFIR & Security Vaults',
		description: 'Audit forensic disk/memory images, network PCAP/PCAPNG captures, malware quarantine/YARA/STIX bundles, and SIEM/Volatility/Plaso carving scratch while conserving chain-of-custody evidence.',
		familyFilter: 'all',
		strategy: 'prune-pcap-and-carving-scratch',
		survivorRule: 'evidence-custody-archive-first',
		protectForensicEvidenceImages: true,
		protectCompressedPcapAndSiem: true,
		protectThreatIntelAndQuarantine: true,
		requireCompressedPcapAnchorForPrune: true,
		keepRecentIncidentDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'carving-volatility-scratch-cleanup',
		name: 'Volatility, Plaso & Carving Scratch Cleanup',
		description: 'Reclaim redundant Volatility caches, Plaso temp stores, Autopsy caches, and KAPE carving intermediates older than the incident grace window while conserving canonical E01, VMEM, PCAP.GZ, and EVTX vaults.',
		familyFilter: 'all',
		strategy: 'prune-pcap-and-carving-scratch',
		survivorRule: 'evidence-custody-archive-first',
		protectForensicEvidenceImages: true,
		protectCompressedPcapAndSiem: true,
		protectThreatIntelAndQuarantine: true,
		requireCompressedPcapAnchorForPrune: true,
		keepRecentIncidentDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-uncompressed-pcap-audit',
		name: 'Redundant Uncompressed .pcap vs .pcap.gz/.zst',
		description: 'Detect uncompressed .pcap/.pcapng/.cap captures backed by a verified .pcap.gz/.pcap.zst archive anchor and reclaim them safely while preserving compressed packet archives.',
		familyFilter: 'network-pcap-telemetry',
		strategy: 'quarantine-uncompressed-pcap-and-scratch',
		survivorRule: 'evidence-custody-archive-first',
		protectForensicEvidenceImages: true,
		protectCompressedPcapAndSiem: true,
		protectThreatIntelAndQuarantine: true,
		requireCompressedPcapAnchorForPrune: true,
		keepRecentIncidentDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'evidence-chain-of-custody-shield',
		name: 'Conserved E01/AFF4/VMEM & PCAP.GZ Shield',
		description: 'Inspect raw disk/memory acquisitions (.e01, .aff4, .vmem, .lime, .dd), custody hashes, and compressed PCAP.GZ archives under strict forensic custody shields.',
		familyFilter: 'disk-memory-forensics',
		strategy: 'hardlink-archived-forensics-and-pcap',
		survivorRule: 'evidence-custody-archive-first',
		protectForensicEvidenceImages: true,
		protectCompressedPcapAndSiem: true,
		protectThreatIntelAndQuarantine: true,
		requireCompressedPcapAnchorForPrune: true,
		keepRecentIncidentDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'malware-ioc-quarantine-audit',
		name: 'Malware Quarantine, YARA/Sigma & STIX Bundles',
		description: 'Audit duplicate YARA/Sigma rules, STIX/MISP IOC feeds, and encrypted malware quarantine archives while blocking unsafe hardlinks on quarantine payloads and mutable rule files.',
		familyFilter: 'malware-ioc-threat-intel',
		strategy: 'prune-pcap-and-carving-scratch',
		survivorRule: 'evidence-custody-archive-first',
		protectForensicEvidenceImages: true,
		protectCompressedPcapAndSiem: true,
		protectThreatIntelAndQuarantine: true,
		requireCompressedPcapAnchorForPrune: true,
		keepRecentIncidentDays: 0,
		minSizeKb: 0,
	},
])

export const DFIR_SECURITY_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-dfir-security-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-pcap-and-carving-scratch',
	survivorRule: 'evidence-custody-archive-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectForensicEvidenceImages: true,
	protectCompressedPcapAndSiem: true,
	protectThreatIntelAndQuarantine: true,
	requireCompressedPcapAnchorForPrune: true,
	keepRecentIncidentDays: 0,
	minSizeKb: 0,
})

const STRICT_FORENSIC_IMAGE_EXT_RE = /\.(?:e01|ex01|s01|aff|aff4|vmem|lime|mdmp|hiberfil\.sys|pagefile\.sys)$/i
const CONTEXT_FORENSIC_IMAGE_EXT_RE = /\.(?:raw|dd|dmp|img)$/i
const CUSTODY_HASH_EXT_RE = /\.(?:e01\.txt|e01\.sha256|aff4\.json|sha256|sha512|md5)$/i

const COMPRESSED_PCAP_EXT_RE = /\.(?:pcap|pcapng|cap)\.(?:gz|zst|bz2|xz)$/i
const UNCOMPRESSED_PCAP_EXT_RE = /\.(?:pcap|pcapng|cap|erf)$/i
const WEB_CAPTURE_EXT_RE = /\.(?:har|saz|zeek)$/i

const THREAT_INTEL_EXT_RE = /\.(?:yar|yara|stix|ioc|misp\.json|sigma\.ya?ml)$/i
const QUARANTINE_EXT_RE = /\.(?:mal|vir|infected|zip\.enc|7z\.enc|bin\.quarantine)$/i

const SIEM_ARCHIVE_EXT_RE = /\.(?:evtx|jsonl\.gz|syslog\.gz|plaso|bodyfile)$/i
const CARVING_OUTPUT_EXT_RE = /\.(?:etl|sqlite)$/i

const MUTABLE_SECURITY_EXT_RE = /\.(?:yar|yara|stix|ioc|misp\.json|sigma\.ya?ml|mal|vir|infected|zip\.enc|7z\.enc|bin\.quarantine|evtx|pcap|pcapng|cap|dmp|mdmp|tmp)$/i

const DFIR_CONTEXT_RE = /(?:dfir|forensic|evidence|custody|incident|ir[-_]?case|soc[-_]?|volatility|autopsy|plaso|kape|velociraptor|memdump|memory[-_]?dump|disk[-_]?image|acquisition|triage|quarantine|malware|threat[-_]?intel|siem|suricata|zeek|splunk|sentinel|pcap|carved)/i

const CARVING_SCRATCH_PATH_RE = /(?:^|\/)(?:volatility_cache|\.volatility|plaso_tmp|autopsy_cache|bulk_extractor_tmp|carved_tmp|kape_staging|pcap_extracted|dfir_tmp|carving_tmp|strings_tmp|scratch|tmp|temp|cache)(?:\/|$)/i
const CANONICAL_EVIDENCE_PATH_RE = /(?:^|\/)(?:00_evidence|evidence[_-]?vault|chain[_-]?of[_-]?custody|forensic[_-]?images?|dfir[_-]?vault|pcap[_-]?archive|siem[_-]?cold|threat[_-]?intel|quarantine[_-]?vault|canonical|archive|vault|golden[_-]?evidence)(?:\/|$)/i

const ANY_DFIR_EXT_RE = /\.(?:e01\.txt|e01\.sha256|aff4\.json|pcapng\.gz|pcapng\.zst|pcap\.gz|pcap\.zst|cap\.gz|misp\.json|sigma\.yaml|sigma\.yml|jsonl\.gz|syslog\.gz|zip\.enc|7z\.enc|bin\.quarantine|hiberfil\.sys|pagefile\.sys|e01|ex01|s01|aff|aff4|vmem|lime|mdmp|raw|dd|dmp|img|sha256|sha512|md5|pcap|pcapng|cap|erf|har|saz|zeek|yar|yara|stix|ioc|mal|vir|infected|evtx|etl|plaso|bodyfile|sqlite)$/i

const GENERIC_DFIR_STEMS = new Set([
	'capture',
	'traffic',
	'network',
	'memory',
	'memdump',
	'disk',
	'image',
	'evidence',
	'rules',
	'alerts',
	'events',
	'timeline',
	'carved',
	'sample',
	'dump',
])

const NOISE_PARENT_DIRS = new Set([
	'volatility_cache',
	'.volatility',
	'plaso_tmp',
	'autopsy_cache',
	'bulk_extractor_tmp',
	'carved_tmp',
	'kape_staging',
	'pcap_extracted',
	'dfir_tmp',
	'carving_tmp',
	'strings_tmp',
	'scratch',
	'tmp',
	'temp',
	'cache',
	'pcap',
	'evidence',
	'logs',
])

/**
 * Normalize a non-negative integer value safely within bounds.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default fallback.
 * @param {number} [max] Upper bound.
 * @return {number} Clamped non-negative integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 1000000) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) {
		return fallback
	}
	return Math.min(max, Math.floor(num))
}

/**
 * Normalize audit configuration against presets and safe bounds.
 *
 * @param {object} [raw] Raw configuration object.
 * @return {object} Normalized configuration.
 */
export function normalizeDfirSecurityConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = DFIR_SECURITY_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...DFIR_SECURITY_DEFAULT_CONFIG, ...preset }
		: { ...DFIR_SECURITY_DEFAULT_CONFIG }

	const familyFilter = DFIR_SECURITY_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = DFIR_SECURITY_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = DFIR_SECURITY_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = DFIR_SECURITY_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = DFIR_SECURITY_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	const memberOverrides = input.memberOverrides && typeof input.memberOverrides === 'object'
		? { ...input.memberOverrides }
		: {}

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectForensicEvidenceImages: typeof input.protectForensicEvidenceImages === 'boolean'
			? input.protectForensicEvidenceImages
			: base.protectForensicEvidenceImages,
		protectCompressedPcapAndSiem: typeof input.protectCompressedPcapAndSiem === 'boolean'
			? input.protectCompressedPcapAndSiem
			: base.protectCompressedPcapAndSiem,
		protectThreatIntelAndQuarantine: typeof input.protectThreatIntelAndQuarantine === 'boolean'
			? input.protectThreatIntelAndQuarantine
			: base.protectThreatIntelAndQuarantine,
		requireCompressedPcapAnchorForPrune: typeof input.requireCompressedPcapAnchorForPrune === 'boolean'
			? input.requireCompressedPcapAnchorForPrune
			: base.requireCompressedPcapAnchorForPrune,
		keepRecentIncidentDays: normalizeNonNegativeInt(input.keepRecentIncidentDays, base.keepRecentIncidentDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract basename from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract directory portion from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse file mtime into epoch milliseconds when available.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch ms or null.
 */
function extractMtimeMs(file) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return null
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 1e12 ? raw : raw * 1000
	}
	const parsed = Date.parse(String(raw))
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Extract meaningful incident or case folder from a path, skipping generic scratch subdirs.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulCaseFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (!NOISE_PARENT_DIRS.has(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect DFIR tooling/telemetry platform and evidence stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ toolingPlatform: string, evidenceStage: string }} Detected platform and stage.
 */
export function extractDfirToolingAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()

	let toolingPlatform = 'DFIR Evidence Vault'
	if (/volatility/i.test(lowerPath)) {
		toolingPlatform = 'Volatility Memory Forensics'
	} else if (/plaso/i.test(lowerPath) || /\.plaso$/i.test(lowerBase)) {
		toolingPlatform = 'Plaso / log2timeline'
	} else if (/autopsy|bulk_extractor|carved/i.test(lowerPath)) {
		toolingPlatform = 'Autopsy / Bulk Carving'
	} else if (/kape|velociraptor/i.test(lowerPath)) {
		toolingPlatform = 'KAPE / Velociraptor'
	} else if (/zeek|suricata|pcap/i.test(lowerPath) || COMPRESSED_PCAP_EXT_RE.test(lowerBase) || UNCOMPRESSED_PCAP_EXT_RE.test(lowerBase)) {
		toolingPlatform = 'Wireshark / Zeek / Suricata'
	} else if (THREAT_INTEL_EXT_RE.test(lowerBase) || QUARANTINE_EXT_RE.test(lowerBase)) {
		toolingPlatform = 'YARA / MISP / Malware Quarantine'
	} else if (SIEM_ARCHIVE_EXT_RE.test(lowerBase) || /siem|splunk|sentinel|elastic/i.test(lowerPath)) {
		toolingPlatform = 'SIEM / Windows Event Archive'
	} else if (STRICT_FORENSIC_IMAGE_EXT_RE.test(lowerBase) || CONTEXT_FORENSIC_IMAGE_EXT_RE.test(lowerBase)) {
		toolingPlatform = 'EnCase / FTK / AFF4 Acquisition'
	}

	let evidenceStage = ''
	if (STRICT_FORENSIC_IMAGE_EXT_RE.test(lowerBase) || CONTEXT_FORENSIC_IMAGE_EXT_RE.test(lowerBase)) {
		evidenceStage = /\.(?:vmem|lime|dmp|mdmp|hiberfil\.sys|pagefile\.sys)$/i.test(lowerBase)
			? 'Volatile Memory Acquisition'
			: 'Forensic Disk Image'
	} else if (CUSTODY_HASH_EXT_RE.test(lowerBase)) {
		evidenceStage = 'Chain-of-Custody Hash Manifest'
	} else if (COMPRESSED_PCAP_EXT_RE.test(lowerBase)) {
		evidenceStage = 'Compressed Packet Archive (.pcap.gz/.zst)'
	} else if (UNCOMPRESSED_PCAP_EXT_RE.test(lowerBase)) {
		evidenceStage = 'Uncompressed Packet Capture (.pcap/.pcapng)'
	} else if (WEB_CAPTURE_EXT_RE.test(lowerBase)) {
		evidenceStage = 'HTTP / Zeek Telemetry Capture'
	} else if (THREAT_INTEL_EXT_RE.test(lowerBase)) {
		evidenceStage = 'Threat Intel / Detection Rules'
	} else if (QUARANTINE_EXT_RE.test(lowerBase)) {
		evidenceStage = 'Encrypted Malware Quarantine Sample'
	} else if (SIEM_ARCHIVE_EXT_RE.test(lowerBase) || CARVING_OUTPUT_EXT_RE.test(lowerBase)) {
		evidenceStage = CARVING_SCRATCH_PATH_RE.test(lowerPath)
			? 'Carving / Timeline Scratch Artifact'
			: 'Canonical SIEM / Timeline Archive'
	}

	return { toolingPlatform, evidenceStage }
}

/**
 * Extract normalized evidence lineage stem and incident anchor key to correlate
 * uncompressed .pcap against .pcap.gz/.zst archives and hash sidecars against disk images.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for case folder context.
 * @return {string} Normalized evidence lineage stem.
 */
export function extractDfirLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_DFIR_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|uncompressed|decrypted|extracted|carved|carving|scratch|tmp|temp|copy\d*|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_DFIR_STEMS.has(stem)) {
		const caseFolder = extractMeaningfulCaseFolder(normalizedPath)
		if (caseFolder) {
			return `${caseFolder}_${stem || 'evidence'}`
		}
	}

	return stem || 'unknown-evidence'
}

/**
 * Extract broader incident anchor key (stripping segment/shard suffixes like _part01/_0001).
 *
 * @param {string} lineageStem Normalized lineage stem.
 * @return {string} Incident anchor key.
 */
export function extractIncidentAnchorKey(lineageStem) {
	return String(lineageStem || '')
		.replace(/(?:[-_.](?:part\d+|seg\d+|chunk\d+|\d{4}))+$/i, '')
		|| 'unknown-evidence'
}

/**
 * Extract concise DFIR artifact tag for badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} DFIR artifact tag.
 */
function extractDfirTag(lowerBase) {
	if (/\.(?:e01|ex01|s01)$/i.test(lowerBase)) {
		return 'ewf-disk-image'
	}
	if (/\.aff4?$/i.test(lowerBase)) {
		return 'aff4-image'
	}
	if (/\.(?:vmem|lime|dmp|mdmp|hiberfil\.sys|pagefile\.sys)$/i.test(lowerBase)) {
		return 'memory-dump'
	}
	if (/\.(?:raw|dd|img)$/i.test(lowerBase)) {
		return 'raw-disk-image'
	}
	if (CUSTODY_HASH_EXT_RE.test(lowerBase)) {
		return 'custody-hash'
	}
	if (COMPRESSED_PCAP_EXT_RE.test(lowerBase)) {
		return 'pcap-compressed'
	}
	if (UNCOMPRESSED_PCAP_EXT_RE.test(lowerBase)) {
		return 'pcap-uncompressed'
	}
	if (WEB_CAPTURE_EXT_RE.test(lowerBase)) {
		return 'http-zeek-capture'
	}
	if (THREAT_INTEL_EXT_RE.test(lowerBase)) {
		return 'ioc-rule-bundle'
	}
	if (QUARANTINE_EXT_RE.test(lowerBase)) {
		return 'malware-quarantine'
	}
	if (/\.evtx$/i.test(lowerBase)) {
		return 'windows-evtx'
	}
	if (/\.plaso$/i.test(lowerBase)) {
		return 'plaso-timeline'
	}
	if (SIEM_ARCHIVE_EXT_RE.test(lowerBase) || CARVING_OUTPUT_EXT_RE.test(lowerBase)) {
		return 'siem-carving-log'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Cybersecurity, DFIR Forensics & Threat Intel Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyDfirSecurityFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dirname = extractDirname(normalized)
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = extractMtimeMs(file)
	const formattedMtime = mtimeMs !== null ? formatFileModifiedTime(mtimeMs / 1000) : ''
	const ageDays = mtimeMs !== null ? Math.max(0, (referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)) : null

	const hasDfirContext = DFIR_CONTEXT_RE.test(lower)
	const isCarvingScratchPath = CARVING_SCRATCH_PATH_RE.test(lower)
	const isCanonicalEvidencePath = CANONICAL_EVIDENCE_PATH_RE.test(lower) && !isCarvingScratchPath

	const isStrictForensicImage = STRICT_FORENSIC_IMAGE_EXT_RE.test(lowerBase)
	const isContextForensicImage = CONTEXT_FORENSIC_IMAGE_EXT_RE.test(lowerBase) && hasDfirContext
	const isCustodyHash = CUSTODY_HASH_EXT_RE.test(lowerBase) && (/\.(?:e01\.txt|e01\.sha256|aff4\.json)$/i.test(lowerBase) || hasDfirContext)

	const isCompressedPcap = COMPRESSED_PCAP_EXT_RE.test(lowerBase)
	const isUncompressedPcap = !isCompressedPcap && UNCOMPRESSED_PCAP_EXT_RE.test(lowerBase)
	const isWebCapture = WEB_CAPTURE_EXT_RE.test(lowerBase) && (/\.zeek$/i.test(lowerBase) || hasDfirContext)

	const isThreatIntelRule = THREAT_INTEL_EXT_RE.test(lowerBase)
	const isMalwareQuarantine = QUARANTINE_EXT_RE.test(lowerBase)

	const isStrictSiemOrTimeline = /\.(?:evtx|syslog\.gz|plaso|bodyfile)$/i.test(lowerBase)
	const isContextSiemOrCarving = (/\.(?:jsonl\.gz|etl|sqlite)$/i.test(lowerBase) && hasDfirContext) || (isCarvingScratchPath && hasDfirContext)

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedForensicImage = false
	let isProtectedCompressedPcapOrSiem = false
	let isProtectedThreatIntelOrQuarantine = false
	let isCompressedPcapAnchor = false
	let isUncompressedPcapFile = false
	let isThreatIntelOrQuarantineFile = false
	const isMutableFile = MUTABLE_SECURITY_EXT_RE.test(lowerBase)

	if (isStrictForensicImage || isContextForensicImage || isCustodyHash) {
		family = 'disk-memory-forensics'
		isProtectedForensicImage = !isCarvingScratchPath
		if (isCustodyHash) {
			artifactKind = 'Chain-of-Custody Hash Manifest'
			vaultRole = isCarvingScratchPath ? 'Scratch Hash Copy' : 'Chain-of-Custody Verification Anchor'
		} else if (/\.(?:vmem|lime|dmp|mdmp|hiberfil\.sys|pagefile\.sys)$/i.test(lowerBase)) {
			artifactKind = 'Volatile Memory Dump (.vmem/.lime/.dmp)'
			vaultRole = isCarvingScratchPath ? 'Scratch Memory Copy' : 'Conserved Memory Forensics Evidence'
		} else {
			artifactKind = 'Forensic Disk Image (.e01/.aff4/.dd/.raw)'
			vaultRole = isCarvingScratchPath ? 'Scratch Forensic Image Copy' : 'Conserved Forensic Acquisition Vault'
		}
	} else if (isCompressedPcap || isUncompressedPcap || isWebCapture) {
		family = 'network-pcap-telemetry'
		if (isCompressedPcap) {
			isCompressedPcapAnchor = !isCarvingScratchPath
			isProtectedCompressedPcapOrSiem = !isCarvingScratchPath
			artifactKind = 'Compressed Packet Archive (.pcap.gz/.pcap.zst)'
			vaultRole = isCarvingScratchPath ? 'Scratch PCAP.GZ Copy' : 'Archived Compressed PCAP Vault'
		} else if (isUncompressedPcap) {
			isUncompressedPcapFile = true
			artifactKind = 'Uncompressed Packet Capture (.pcap/.pcapng)'
			vaultRole = isCarvingScratchPath ? 'Scratch Uncompressed PCAP' : 'Uncompressed PCAP Copy'
		} else {
			isProtectedCompressedPcapOrSiem = isCanonicalEvidencePath && !isCarvingScratchPath
			artifactKind = 'HTTP / Zeek Network Capture (.har/.saz/.zeek)'
			vaultRole = isCarvingScratchPath ? 'Scratch Telemetry Copy' : 'Network Telemetry Archive'
		}
	} else if (isThreatIntelRule || isMalwareQuarantine) {
		family = 'malware-ioc-threat-intel'
		isThreatIntelOrQuarantineFile = true
		isProtectedThreatIntelOrQuarantine = !isCarvingScratchPath
		if (isMalwareQuarantine) {
			artifactKind = 'Encrypted Malware Quarantine Sample'
			vaultRole = isCarvingScratchPath ? 'Scratch Quarantine Copy' : 'Isolated Malware Quarantine Vault'
		} else {
			artifactKind = 'YARA / Sigma / STIX Threat Intel'
			vaultRole = isCarvingScratchPath ? 'Scratch IOC Rule Copy' : 'Canonical Threat Intel Rule Vault'
		}
	} else if (isStrictSiemOrTimeline || isContextSiemOrCarving) {
		family = 'siem-carving-scratch'
		if (!isCarvingScratchPath && (/\.(?:evtx|jsonl\.gz|syslog\.gz)$/i.test(lowerBase) || isCanonicalEvidencePath)) {
			isProtectedCompressedPcapOrSiem = true
			artifactKind = 'Canonical SIEM / EVTX Cold Archive'
			vaultRole = 'Conserved SIEM / Event Log Archive'
		} else {
			artifactKind = /\.plaso$/i.test(lowerBase)
				? 'Plaso Super-Timeline Cache (.plaso)'
				: 'DFIR Carving / Volatility / KAPE Scratch'
			vaultRole = isCarvingScratchPath
				? 'Volatility / Plaso / Carving Scratch'
				: 'DFIR Intermediate / Export Copy'
		}
	}

	const { toolingPlatform, evidenceStage } = extractDfirToolingAndStage(normalized, basename)
	const lineageStem = extractDfirLineageStem(basename, normalized)
	const incidentAnchorKey = extractIncidentAnchorKey(lineageStem)
	const caseFolder = extractMeaningfulCaseFolder(normalized)
	const dfirTag = extractDfirTag(lowerBase)

	return {
		normalized,
		lower,
		basename,
		dirname,
		size,
		mtimeMs,
		formattedMtime,
		ageDays,
		family,
		artifactKind,
		vaultRole,
		toolingPlatform,
		evidenceStage,
		lineageStem,
		incidentAnchorKey,
		caseFolder,
		dfirTag,
		isStrictForensicImage,
		isContextForensicImage,
		isCustodyHash,
		isCompressedPcap,
		isUncompressedPcap,
		isWebCapture,
		isThreatIntelRule,
		isMalwareQuarantine,
		isProtectedForensicImage,
		isProtectedCompressedPcapOrSiem,
		isProtectedThreatIntelOrQuarantine,
		isCompressedPcapAnchor,
		isUncompressedPcapFile,
		isThreatIntelOrQuarantineFile,
		isMutableFile,
		isCarvingScratchPath,
		isCanonicalEvidencePath,
	}
}

/**
 * Determine whether a duplicate group belongs to the DFIR & Security Evidence Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isDfirSecurityGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyDfirSecurityFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified compressed .pcap.gz/.pcapng.gz/.pcap.zst
 * archive anchors to redundant uncompressed .pcap/.pcapng/.cap captures.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildDfirSecurityCorrelationIndex(groups) {
	const compressedPcapStems = new Set()
	const compressedPcapIncidentKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyDfirSecurityFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedPcapAnchor) {
				compressedPcapStems.add(meta.lineageStem)
				compressedPcapIncidentKeys.add(meta.incidentAnchorKey)
			}
		}
	}

	return {
		compressedPcapStems,
		compressedPcapIncidentKeys,
	}
}

/**
 * Determine primary family for a heterogeneous DFIR cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'disk-memory-forensics')) {
		return 'disk-memory-forensics'
	}
	if (members.some(m => m.family === 'network-pcap-telemetry')) {
		return 'network-pcap-telemetry'
	}
	if (members.some(m => m.family === 'malware-ioc-threat-intel')) {
		return 'malware-ioc-threat-intel'
	}
	return 'siem-carving-scratch'
}

/**
 * Compute deterministic survivor priority score for a DFIR vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-acquisition-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedForensicImage ? 96000 : 0)
			+ (member.isProtectedCompressedPcapOrSiem ? 92000 : 0)
			+ (member.isProtectedThreatIntelOrQuarantine ? 90000 : 0)
			+ (member.isCanonicalEvidencePath ? 25000 : 0)
			+ (member.isCarvingScratchPath ? -50000 : 0)
			+ (member.isUncompressedPcapFile ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-analysis-first') {
		return (member.isProtectedForensicImage ? 96000 : 0)
			+ (member.isProtectedCompressedPcapOrSiem ? 92000 : 0)
			+ (member.isProtectedThreatIntelOrQuarantine ? 90000 : 0)
			+ (member.isCarvingScratchPath ? -45000 : 0)
			+ (member.isUncompressedPcapFile ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedForensicImage ? 50000 : 0)
			+ (member.isProtectedCompressedPcapOrSiem ? 48000 : 0)
			+ (member.isProtectedThreatIntelOrQuarantine ? 46000 : 0)
			+ (member.isCarvingScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedForensicImage ? 98000 : 0)
		+ (member.isProtectedCompressedPcapOrSiem ? 94000 : 0)
		+ (member.isProtectedThreatIntelOrQuarantine ? 92000 : 0)
		+ (member.isCanonicalEvidencePath ? 25000 : 0)
		+ (member.isUncompressedPcapFile ? -45000 : 0)
		+ (member.isCarvingScratchPath ? -55000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Cybersecurity, DFIR Forensics & Threat Intel duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Cross-group correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyDfirSecurityFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}
		return {
			...meta,
			id: file?.id ?? null,
			key: getFileSelectionKey(file) ?? `member-${index}`,
			file,
			index,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryPlatform = rawMembers.find(m => m.toolingPlatform)?.toolingPlatform || ''
	const primaryStage = rawMembers.find(m => m.evidenceStage)?.evidenceStage || ''
	const primaryStem = rawMembers[0].lineageStem || extractDfirLineageStem(primaryName, rawMembers[0].normalized)
	const primaryIncidentKey = rawMembers[0].incidentAnchorKey || extractIncidentAnchorKey(primaryStem)

	const hasCompressedPcapAnchor = Boolean(
		rawMembers.some(m => m.isCompressedPcapAnchor)
		|| correlationIndex.compressedPcapStems.has(primaryStem)
		|| correlationIndex.compressedPcapIncidentKeys.has(primaryIncidentKey)
	)

	const info = computeGroupReclaimableInfo(group)
	const totalBytes = Number(info.totalBytes) || rawMembers.reduce((sum, item) => sum + item.size, 0)
	const unitBytes = Number(info.unitBytes) || (rawMembers[0]?.size || 0)

	const sortedForSurvivor = [...rawMembers].sort((a, b) => {
		const diff = scoreMemberForSurvivor(b, config.survivorRule) - scoreMemberForSurvivor(a, config.survivorRule)
		if (diff !== 0) {
			return diff
		}
		return a.normalized.localeCompare(b.normalized)
	})
	const survivor = sortedForSurvivor[0]
	const survivorKey = survivor.key

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'

		const isRedundantPcapMember = member.isUncompressedPcapFile && hasCompressedPcapAnchor
		const pcapRedundancyReason = member.isUncompressedPcapFile
			? (isRedundantPcapMember
				? 'Uncompressed .pcap/.pcapng duplicates verified .pcap.gz/.pcap.zst archive'
				: 'Uncompressed .pcap/.pcapng without verified compressed archive anchor')
			: ''

		let governanceTier = 'carving-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isProtectedForensicImage
				? 'forensic-image-protected'
				: (member.isProtectedCompressedPcapOrSiem
					? 'compressed-pcap-siem-protected'
					: (member.isProtectedThreatIntelOrQuarantine
						? 'threat-intel-quarantine-protected'
						: (member.isUncompressedPcapFile ? 'uncompressed-pcap-redundant' : 'carving-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedForensicImage && config.protectForensicEvidenceImages) {
			governanceTier = 'forensic-image-protected'
			shielded = true
			protectedReason = member.isCustodyHash
				? 'Chain-of-custody hash manifest strictly conserved'
				: 'Forensic disk/memory acquisition strictly conserved'
		} else if (member.isProtectedCompressedPcapOrSiem && config.protectCompressedPcapAndSiem) {
			governanceTier = 'compressed-pcap-siem-protected'
			shielded = true
			protectedReason = member.isCompressedPcap
				? 'Compressed PCAP archive (.pcap.gz/.pcap.zst) strictly conserved'
				: 'Canonical SIEM / network telemetry archive strictly conserved'
		} else if (member.isProtectedThreatIntelOrQuarantine && config.protectThreatIntelAndQuarantine) {
			governanceTier = 'threat-intel-quarantine-protected'
			shielded = true
			protectedReason = member.isMalwareQuarantine
				? 'Encrypted malware quarantine sample strictly conserved'
				: 'YARA/Sigma/STIX threat intel rule strictly conserved'
		} else if (isSurvivor && !(member.isUncompressedPcapFile && isRedundantPcapMember)) {
			governanceTier = member.isProtectedForensicImage
				? 'forensic-image-protected'
				: (member.isProtectedCompressedPcapOrSiem
					? 'compressed-pcap-siem-protected'
					: (member.isProtectedThreatIntelOrQuarantine
						? 'threat-intel-quarantine-protected'
						: (member.isUncompressedPcapFile ? 'uncompressed-pcap-redundant' : 'carving-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical DFIR evidence vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isUncompressedPcapFile
				? 'uncompressed-pcap-redundant'
				: (member.isThreatIntelOrQuarantineFile ? 'threat-intel-quarantine-protected' : 'carving-scratch-intermediate')
			action = config.strategy === 'hardlink-archived-forensics-and-pcap' && !member.isMutableFile && !member.isCarvingScratchPath
				? 'hardlink'
				: 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
			protectedReason = 'Marked for remediation via per-copy override'
		} else if (
			config.keepRecentIncidentDays > 0
			&& member.isCarvingScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentIncidentDays
		) {
			governanceTier = 'carving-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentIncidentDays}-day active DFIR incident retention window`
		} else if (member.isUncompressedPcapFile) {
			governanceTier = 'uncompressed-pcap-redundant'
			if (config.requireCompressedPcapAnchorForPrune && !hasCompressedPcapAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .pcap.gz/.pcap.zst archive anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = pcapRedundancyReason
			}
		} else if (member.isCarvingScratchPath) {
			governanceTier = 'carving-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Volatility/Plaso/KAPE carving scratch eligible for safe cleanup'
		} else if (member.isProtectedForensicImage) {
			governanceTier = 'forensic-image-protected'
			action = config.strategy === 'hardlink-archived-forensics-and-pcap' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (member.isProtectedCompressedPcapOrSiem) {
			governanceTier = 'compressed-pcap-siem-protected'
			action = config.strategy === 'hardlink-archived-forensics-and-pcap' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (member.isProtectedThreatIntelOrQuarantine) {
			governanceTier = 'threat-intel-quarantine-protected'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-archived-forensics-and-pcap' && !member.isMutableFile) {
			governanceTier = 'forensic-image-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'carving-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantPcapMember,
			pcapRedundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUncompressedPcap = members.some(m => m.isRedundantPcapMember || m.isUncompressedPcapFile)
	const hasCarvingScratchIntermediate = members.some(m => m.isCarvingScratchPath)
	const hasProtectedForensicImage = members.some(m => m.governanceTier === 'forensic-image-protected')
	const hasProtectedCompressedPcapOrSiem = members.some(m => m.governanceTier === 'compressed-pcap-siem-protected')
	const hasProtectedThreatIntelOrQuarantine = members.some(m => m.governanceTier === 'threat-intel-quarantine-protected')

	let clusterVerdict = 'carving-scratch-intermediate'
	if (hasRedundantUncompressedPcap && members.some(m => m.isRedundantPcapMember)) {
		clusterVerdict = 'uncompressed-pcap-redundant'
	} else if (hasProtectedForensicImage) {
		clusterVerdict = 'forensic-image-protected'
	} else if (hasProtectedCompressedPcapOrSiem) {
		clusterVerdict = 'compressed-pcap-siem-protected'
	} else if (hasProtectedThreatIntelOrQuarantine) {
		clusterVerdict = 'threat-intel-quarantine-protected'
	} else if (hasCarvingScratchIntermediate) {
		clusterVerdict = 'carving-scratch-intermediate'
	} else if (hasRedundantUncompressedPcap) {
		clusterVerdict = 'uncompressed-pcap-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const dfirTags = Array.from(new Set(members.map(m => m.dfirTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantPcapMember) ? 125 : 0)
		+ (hasCarvingScratchIntermediate ? 110 : 0)
		+ (hasProtectedForensicImage ? 95 : 0)
		+ (hasProtectedCompressedPcapOrSiem ? 90 : 0)
		+ (hasProtectedThreatIntelOrQuarantine ? 85 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		toolingPlatform: primaryPlatform,
		evidenceStage: primaryStage,
		lineageStem: primaryStem,
		incidentAnchorKey: primaryIncidentKey,
		family,
		familyLabel: DFIR_SECURITY_FAMILY_META[family]?.label || family,
		clusterVerdict,
		riskScore,
		unitBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		totalBytes,
		formattedTotalBytes: formatBytes(totalBytes),
		reclaimableBytes,
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		hardlinkSavingsBytes,
		copyCount: members.length,
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		hasReclaimable,
		survivorPath: survivor.normalized,
		hasProtectedForensicImage,
		hasProtectedCompressedPcapOrSiem,
		hasProtectedThreatIntelOrQuarantine,
		hasRedundantUncompressedPcap,
		hasCarvingScratchIntermediate,
		hasCompressedPcapAnchor,
		dfirTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditDfirSecurityVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeDfirSecurityConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isDfirSecurityGroup)
	const correlationIndex = buildDfirSecurityCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'disk-memory-forensics': 0,
		'network-pcap-telemetry': 0,
		'malware-ioc-threat-intel': 0,
		'siem-carving-scratch': 0,
	}
	for (const cluster of sizeFiltered) {
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const query = config.searchQuery.toLowerCase()
	const filteredClusters = sizeFiltered.filter((cluster) => {
		if (config.familyFilter !== 'all' && cluster.family !== config.familyFilter) {
			return false
		}
		if (config.verdictFilter === 'reclaimable' && !cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'uncompressed-pcap-redundant' && !cluster.hasRedundantUncompressedPcap) {
			return false
		}
		if (config.verdictFilter === 'carving-scratch-intermediate' && !cluster.hasCarvingScratchIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'uncompressed-pcap-redundant'
			&& config.verdictFilter !== 'carving-scratch-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.lineageStem.toLowerCase().includes(query)
			const matchesPlatform = cluster.toolingPlatform.toLowerCase().includes(query)
			const matchesStage = cluster.evidenceStage.toLowerCase().includes(query)
			const matchesTag = cluster.dfirTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesPlatform && !matchesStage && !matchesTag && !matchesMember) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.riskScore - a.riskScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.totalBytes - a.totalBytes) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalForensicImageClusters = 0
	let totalCompressedPcapSiemClusters = 0
	let totalThreatIntelClusters = 0
	let totalRedundantPcapClusters = 0
	let totalCarvingScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedForensicImage) {
			totalForensicImageClusters += 1
		}
		if (cluster.hasProtectedCompressedPcapOrSiem) {
			totalCompressedPcapSiemClusters += 1
		}
		if (cluster.hasProtectedThreatIntelOrQuarantine) {
			totalThreatIntelClusters += 1
		}
		if (cluster.hasRedundantUncompressedPcap) {
			totalRedundantPcapClusters += 1
		}
		if (cluster.hasCarvingScratchIntermediate) {
			totalCarvingScratchClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = DFIR_SECURITY_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: DFIR_SECURITY_FAMILY_META[id].label,
			shortLabel: DFIR_SECURITY_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: DFIR_SECURITY_VAULT_SCHEMA,
		config,
		familyCounts,
		familyBreakdown,
		clusters: filteredClusters,
		summary: {
			totalDomainGroupsCount: allClusters.length,
			totalUnfilteredClustersCount: sizeFiltered.length,
			totalClustersCount: filteredClusters.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb,
			efficiencyPct,
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalForensicImageClusters,
			totalCompressedPcapSiemClusters,
			totalThreatIntelClusters,
			totalRedundantPcapClusters,
			totalCarvingScratchClusters,
		},
	}
}

/**
 * Quote a filesystem path safely for POSIX shell scripts using single-quote escaping.
 *
 * @param {string} rawPath Filesystem path.
 * @return {string} POSIX-quoted string.
 */
function quotePosixPath(rawPath) {
	const safe = String(rawPath || '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for DFIR & Security vaults.
 * Strictly blocks deletion or hardlinking of shielded forensic images, compressed PCAPs,
 * SIEM cold archives, and threat intel/quarantine artifacts, and never hardlinks mutable files.
 *
 * @param {object} auditResult Result from auditDfirSecurityVault.
 * @return {string} POSIX bash script.
 */
export function buildDfirSecurityRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./dfir-security-vault-reclaim.sh only after verifying E01/VMEM, PCAP.GZ, and custody hashes.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.dfir-pcap-scratch-quarantine}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  else',
		'    "$@"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	const strategy = auditResult?.config?.strategy || 'prune-pcap-and-carving-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isCarvingScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-uncompressed-pcap-and-scratch' && (target.isUncompressedPcapFile || target.isCarvingScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable uncompressed .pcap files or Volatility/Plaso carving scratch under active evidence shields.\\n"')
	} else {
		lines.push(`printf "Completed DFIR & Security Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditDfirSecurityVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildDfirSecurityCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'tooling_platform',
		'evidence_stage',
		'lineage_stem',
		'incident_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_pcap_anchor',
		'is_redundant_pcap',
		'is_carving_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'dfir_tag',
		'governance_tier',
		'action',
		'shielded',
		'protected_reason',
		'is_survivor',
		'size_bytes',
		'formatted_size',
		'mtime',
		'survivor_path',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.id,
				cluster.name,
				cluster.toolingPlatform || '',
				cluster.evidenceStage || '',
				cluster.lineageStem,
				cluster.incidentAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedPcapAnchor ? 'true' : 'false',
				member.isRedundantPcapMember ? 'true' : 'false',
				member.isCarvingScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.dfirTag || '',
				member.governanceTier,
				member.action,
				member.shielded ? 'true' : 'false',
				member.protectedReason || '',
				member.isSurvivor ? 'true' : 'false',
				member.size,
				formatBytes(member.size),
				member.formattedMtime || '',
				cluster.survivorPath,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a deterministic JSON audit manifest.
 *
 * @param {object} auditResult Result from auditDfirSecurityVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildDfirSecurityJsonManifest(auditResult) {
	const payload = {
		schema: DFIR_SECURITY_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || DFIR_SECURITY_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			toolingPlatform: cluster.toolingPlatform,
			evidenceStage: cluster.evidenceStage,
			lineageStem: cluster.lineageStem,
			incidentAnchorKey: cluster.incidentAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedForensicImage: cluster.hasProtectedForensicImage,
			hasProtectedCompressedPcapOrSiem: cluster.hasProtectedCompressedPcapOrSiem,
			hasProtectedThreatIntelOrQuarantine: cluster.hasProtectedThreatIntelOrQuarantine,
			hasRedundantUncompressedPcap: cluster.hasRedundantUncompressedPcap,
			hasCarvingScratchIntermediate: cluster.hasCarvingScratchIntermediate,
			hasCompressedPcapAnchor: cluster.hasCompressedPcapAnchor,
			dfirTags: cluster.dfirTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				dfirTag: member.dfirTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantPcapMember: member.isRedundantPcapMember,
				isCarvingScratchPath: member.isCarvingScratchPath,
				isMutableFile: member.isMutableFile,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set to prevent accidental
 * cloud sync of Volatility caches, Plaso temp dirs, KAPE staging, carving scratch,
 * and transient PCAP/forensic image staging files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildDfirSecuritySyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for DFIR Forensics & Security Vaults',
		'volatility_cache/',
		'.volatility/',
		'plaso_tmp/',
		'autopsy_cache/',
		'bulk_extractor_tmp/',
		'carved_tmp/',
		'kape_staging/',
		'pcap_extracted/',
		'dfir_tmp/',
		'*.pcap.tmp',
		'*.pcapng.tmp',
		'*.e01.tmp',
		'*.aff4.tmp',
		'*.tmp',
	].join('\n')
}

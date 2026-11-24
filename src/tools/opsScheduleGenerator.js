/**
 * Pure Automated Deduplication Schedule, Systemd Service/Timer Unit,
 * Cron + flock/ionice/MemoryHigh Runner & Preflight Health Check Generator.
 * Grounded in Nextcloud DuplicateFinder OCC commands and real scan telemetry.
 * Zero DOM dependencies, zero network side effects, zero XSS sinks.
 */

import { formatBytes } from './duplicateStats'
import { escapeCsvCell } from './duplicateSelectionAndExport'
import { normalizePathForDiff } from './duplicatePathDiff'

export const OPS_SCHEDULE_SCHEMA = 'duplicatefinder.ops-schedule-generator.v1'

export const SCHEDULE_FREQUENCIES = Object.freeze([
	{ id: 'daily', label: 'Daily', runsPerWeek: 7 },
	{ id: 'weekdays', label: 'Weekdays (Mon-Fri)', runsPerWeek: 5 },
	{ id: 'weekly', label: 'Weekly (Sunday)', runsPerWeek: 1 },
	{ id: 'hourly', label: 'Hourly', runsPerWeek: 168 },
	{ id: 'custom', label: 'Custom Cron / OnCalendar', runsPerWeek: 7 },
])

export const OCC_WORKFLOWS = Object.freeze({
	'find-and-list': {
		id: 'find-and-list',
		label: 'Scan + JSON Audit Report (find-all + list-all)',
		description: 'Runs occ duplicates:find-all followed by a read-only occ duplicates:list-all --output=json audit.',
		requiresWriteLock: true,
	},
	'find-only': {
		id: 'find-only',
		label: 'Index & Hash Scan Only (duplicates:find-all)',
		description: 'Scans user trees and refreshes the duplicate index without modifying files.',
		requiresWriteLock: true,
	},
	'list-all-audit': {
		id: 'list-all-audit',
		label: 'Read-Only Cluster Audit (duplicates:list-all)',
		description: 'Reads indexed duplicates across all users and emits a JSON waste report.',
		requiresWriteLock: false,
	},
	'folders-audit': {
		id: 'folders-audit',
		label: 'Folder Tree Audit (duplicates:folders)',
		description: 'Audits identical folder subtrees and exports JSON telemetry.',
		requiresWriteLock: false,
	},
	'find-and-trashbin': {
		id: 'find-and-trashbin',
		label: 'Scan + Trashbin Cleanup (find-all + trashbin:cleanup)',
		description: 'Scans duplicates and trims expired trashbin snapshots within the maintenance window.',
		requiresWriteLock: true,
	},
})

export const IO_CLASS_PROFILES = Object.freeze({
	'best-effort-7': {
		id: 'best-effort-7',
		label: 'Best-Effort Low (-c2 -n7)',
		ioniceClass: 2,
		ionicePriority: 7,
		ioniceFlags: '-c2 -n7',
		throughputFactor: 0.72,
	},
	'idle-3': {
		id: 'idle-3',
		label: 'Idle Class (-c3)',
		ioniceClass: 3,
		ionicePriority: null,
		ioniceFlags: '-c3',
		throughputFactor: 0.45,
	},
	'best-effort-4': {
		id: 'best-effort-4',
		label: 'Best-Effort Balanced (-c2 -n4)',
		ioniceClass: 2,
		ionicePriority: 4,
		ioniceFlags: '-c2 -n4',
		throughputFactor: 0.9,
	},
})

export const STORAGE_TIER_PROFILES = Object.freeze({
	nvme: {
		id: 'nvme',
		label: 'Local NVMe SSD',
		baseScanMbPerSec: 420,
		hashCpuMultiplier: 1.0,
		supportsLocalIonice: true,
	},
	ssd: {
		id: 'ssd',
		label: 'SATA / SAS SSD',
		baseScanMbPerSec: 210,
		hashCpuMultiplier: 1.05,
		supportsLocalIonice: true,
	},
	hdd_raid: {
		id: 'hdd_raid',
		label: 'Spinning HDD / RAID',
		baseScanMbPerSec: 75,
		hashCpuMultiplier: 1.25,
		supportsLocalIonice: true,
	},
	network_nfs_smb: {
		id: 'network_nfs_smb',
		label: 'NFS / SMB / S3 Mount',
		baseScanMbPerSec: 45,
		hashCpuMultiplier: 1.45,
		supportsLocalIonice: false,
	},
})

export const LANE_SORT_MODES = Object.freeze([
	'waste_desc',
	'runtime_desc',
	'groups_desc',
	'name_asc',
])

export const SCHEDULE_PRESETS = Object.freeze([
	{
		id: 'nightly-offpeak',
		name: 'Nightly Off-Peak Guard',
		description: 'Daily 02:15 run with flock, ionice -c2 -n7, MemoryHigh=512M, and CPUQuota=35%.',
		config: {
			frequency: 'daily',
			runTime: '02:15',
			occWorkflow: 'find-and-list',
			ioClass: 'best-effort-7',
			niceLevel: 15,
			memoryHighMb: 512,
			memoryMaxMb: 1024,
			cpuQuotaPct: 35,
			ioWeight: 100,
			randomizedDelayMin: 10,
			windowMinutes: 120,
			minFreeDiskPct: 15,
			maxLoadAvg: 4.0,
			useFlock: true,
			flockTimeoutSec: 0,
			requireMaintenanceOff: true,
		},
	},
	{
		id: 'weekend-deep',
		name: 'Weekend Deep Sweep',
		description: 'Sunday 03:00 deep scan + trashbin cleanup with 2G MemoryMax and 3h window.',
		config: {
			frequency: 'weekly',
			runTime: '03:00',
			occWorkflow: 'find-and-trashbin',
			ioClass: 'best-effort-4',
			niceLevel: 10,
			memoryHighMb: 1024,
			memoryMaxMb: 2048,
			cpuQuotaPct: 60,
			ioWeight: 200,
			randomizedDelayMin: 15,
			windowMinutes: 180,
			minFreeDiskPct: 12,
			maxLoadAvg: 6.0,
			useFlock: true,
			flockTimeoutSec: 30,
			requireMaintenanceOff: true,
		},
	},
	{
		id: 'idle-low-impact',
		name: 'Idle-Only Background',
		description: 'Weekday 01:30 idle I/O class (-c3), nice 19, MemoryHigh=384M, CPUQuota=20%.',
		config: {
			frequency: 'weekdays',
			runTime: '01:30',
			occWorkflow: 'find-only',
			ioClass: 'idle-3',
			niceLevel: 19,
			memoryHighMb: 384,
			memoryMaxMb: 768,
			cpuQuotaPct: 20,
			ioWeight: 50,
			randomizedDelayMin: 20,
			windowMinutes: 90,
			minFreeDiskPct: 15,
			maxLoadAvg: 2.5,
			useFlock: true,
			flockTimeoutSec: 0,
			requireMaintenanceOff: true,
		},
	},
	{
		id: 'hourly-incremental',
		name: 'Hourly Read-Only Audit',
		description: 'Hourly :20 read-only duplicates:list-all --output=json snapshot with 256M ceiling.',
		config: {
			frequency: 'hourly',
			runTime: '00:20',
			occWorkflow: 'list-all-audit',
			ioClass: 'best-effort-7',
			niceLevel: 15,
			memoryHighMb: 256,
			memoryMaxMb: 512,
			cpuQuotaPct: 15,
			ioWeight: 80,
			randomizedDelayMin: 5,
			windowMinutes: 25,
			minFreeDiskPct: 10,
			maxLoadAvg: 4.0,
			useFlock: true,
			flockTimeoutSec: 0,
			requireMaintenanceOff: true,
		},
	},
])

export const DEFAULT_SCHEDULE_CONFIG = Object.freeze({
	presetId: 'nightly-offpeak',
	serviceName: 'nextcloud-duplicatefinder',
	nextcloudRoot: '/var/www/nextcloud',
	phpBin: '/usr/bin/php',
	occUser: 'www-data',
	lockFile: '/run/lock/nextcloud-duplicatefinder.lock',
	logFile: '/var/log/nextcloud/duplicatefinder-ops.log',
	frequency: 'daily',
	runTime: '02:15',
	customCron: '15 2 * * *',
	customOnCalendar: '*-*-* 02:15:00',
	occWorkflow: 'find-and-list',
	storageTier: 'ssd',
	ioClass: 'best-effort-7',
	niceLevel: 15,
	memoryHighMb: 512,
	memoryMaxMb: 1024,
	cpuQuotaPct: 35,
	ioWeight: 100,
	randomizedDelayMin: 10,
	windowMinutes: 120,
	minFreeDiskPct: 15,
	maxLoadAvg: 4.0,
	useFlock: true,
	flockTimeoutSec: 0,
	requireMaintenanceOff: true,
	slaTargetPct: 80,
	maxGroupsPerRun: 250,
	minSizeFilterMb: 0,
	targetLaneId: 'all',
	laneSortMode: 'waste_desc',
	searchQuery: '',
})

/**
 * Strips ASCII control characters and dangerous shell metacharacters.
 *
 * @param {string} value Raw input string.
 * @return {string} Cleaned string.
 */
function stripUnsafeShellChars(value) {
	let result = ''
	const str = String(value || '')
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i)
		if (code < 32 || code === 127) {
			continue
		}
		const ch = str[i]
		if ('`$;|&><\'"\\'.includes(ch)) {
			continue
		}
		result += ch
	}
	return result.trim()
}

/**
 * Sanitizes a systemd unit / filename slug to safe alphanumeric, hyphen, underscore characters.
 *
 * @param {string} raw Raw service name.
 * @return {string} Safe service unit base name.
 */
export function sanitizeServiceName(raw) {
	const cleaned = String(raw || '')
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
	return cleaned || 'nextcloud-duplicatefinder'
}

/**
 * Sanitizes a POSIX path or executable path for safe embedding in systemd units and bash scripts.
 *
 * @param {string} raw Raw path input.
 * @param {string} fallback Safe default path.
 * @return {string} Sanitized POSIX path.
 */
export function sanitizePosixPath(raw, fallback) {
	const cleaned = stripUnsafeShellChars(raw).replace(/\s+/g, '')
	if (!cleaned || !cleaned.startsWith('/')) {
		return fallback
	}
	return cleaned.slice(0, 220)
}

/**
 * Sanitizes a Linux system username (e.g. www-data, nginx, apache).
 *
 * @param {string} raw Raw user input.
 * @return {string} Safe POSIX user identifier.
 */
export function sanitizePosixUser(raw) {
	const cleaned = String(raw || '')
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, '')
		.slice(0, 32)
	return cleaned || 'www-data'
}

/**
 * Sanitizes an HH:MM 24-hour time string.
 *
 * @param {string} raw Raw time input.
 * @return {{ hour: number, minute: number, formatted: string }} Parsed time components.
 */
export function parseRunTime(raw) {
	const match = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/)
	if (!match) {
		return { hour: 2, minute: 15, formatted: '02:15' }
	}
	const hour = Math.max(0, Math.min(23, Number(match[1])))
	const minute = Math.max(0, Math.min(59, Number(match[2])))
	return {
		hour,
		minute,
		formatted: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
	}
}

/**
 * Validates and normalizes a 5-field cron expression.
 *
 * @param {string} raw Raw cron expression.
 * @param {string} fallback Safe fallback cron expression.
 * @return {string} Sanitized 5-field cron expression.
 */
export function sanitizeCronExpr(raw, fallback = '15 2 * * *') {
	const cleaned = stripUnsafeShellChars(raw).replace(/\s+/g, ' ').trim()
	const fields = cleaned.split(' ')
	if (fields.length !== 5) {
		return fallback
	}
	const fieldRe = /^[0-9*,/-]+$/
	for (const f of fields) {
		if (!fieldRe.test(f)) {
			return fallback
		}
	}
	return cleaned
}

/**
 * Sanitizes a systemd OnCalendar expression.
 *
 * @param {string} raw Raw OnCalendar expression.
 * @param {string} fallback Safe default expression.
 * @return {string} Sanitized OnCalendar expression.
 */
export function sanitizeOnCalendar(raw, fallback = '*-*-* 02:15:00') {
	const cleaned = stripUnsafeShellChars(raw).replace(/\s+/g, ' ').trim()
	if (!cleaned || !/^[a-zA-Z0-9*,.:/~ -]+$/.test(cleaned)) {
		return fallback
	}
	return cleaned.slice(0, 64)
}

/**
 * Derives aligned 5-field cron and systemd OnCalendar expressions from schedule settings.
 *
 * @param {object} options Schedule frequency options.
 * @return {{ cronExpression: string, systemdOnCalendar: string, scheduleLabel: string, runsPerWeek: number }} Derived expressions.
 */
export function deriveScheduleExpressions(options = {}) {
	const frequency = SCHEDULE_FREQUENCIES.some(item => item.id === options.frequency)
		? options.frequency
		: 'daily'
	const { hour, minute, formatted } = parseRunTime(options.runTime)
	const hh = String(hour).padStart(2, '0')
	const mm = String(minute).padStart(2, '0')

	if (frequency === 'hourly') {
		return {
			cronExpression: `${minute} * * * *`,
			systemdOnCalendar: `*-*-* *:${mm}:00`,
			scheduleLabel: `Hourly at :${mm}`,
			runsPerWeek: 168,
		}
	}
	if (frequency === 'weekdays') {
		return {
			cronExpression: `${minute} ${hour} * * 1-5`,
			systemdOnCalendar: `Mon..Fri *-*-* ${hh}:${mm}:00`,
			scheduleLabel: `Weekdays at ${formatted}`,
			runsPerWeek: 5,
		}
	}
	if (frequency === 'weekly') {
		return {
			cronExpression: `${minute} ${hour} * * 0`,
			systemdOnCalendar: `Sun *-*-* ${hh}:${mm}:00`,
			scheduleLabel: `Weekly (Sunday ${formatted})`,
			runsPerWeek: 1,
		}
	}
	if (frequency === 'custom') {
		const cronExpression = sanitizeCronExpr(options.customCron, `${minute} ${hour} * * *`)
		const systemdOnCalendar = sanitizeOnCalendar(options.customOnCalendar, `*-*-* ${hh}:${mm}:00`)
		return {
			cronExpression,
			systemdOnCalendar,
			scheduleLabel: `Custom (${cronExpression})`,
			runsPerWeek: 7,
		}
	}

	return {
		cronExpression: `${minute} ${hour} * * *`,
		systemdOnCalendar: `*-*-* ${hh}:${mm}:00`,
		scheduleLabel: `Daily at ${formatted}`,
		runsPerWeek: 7,
	}
}

/**
 * Extracts a Nextcloud storage lane (user home, group folder, or external mount) from a path.
 *
 * @param {string} rawPath File path from duplicate scan payload.
 * @return {{ laneId: string, laneType: string, laneLabel: string, occScopeFlag: string }} Normalized lane descriptor.
 */
export function extractUserScope(rawPath) {
	const posixRaw = String(rawPath || '').trim().replace(/\\/g, '/')
	const userMatch = posixRaw.match(/^\/([^/]+)\/files(?:\/|$)/i)
	if (userMatch && !/^__(?:groupfolders)$/i.test(userMatch[1])) {
		const uid = sanitizePosixUser(userMatch[1])
		return {
			laneId: `user:${uid}`,
			laneType: 'user_home',
			laneLabel: `User ${uid}`,
			occScopeFlag: `--user="${uid}"`,
		}
	}

	const normalized = normalizePathForDiff(posixRaw) || posixRaw
	const groupMatch = normalized.match(/^\/(?:__groupfolders|groupfolders)\/([^/]+)(?:\/|$)/i)
	if (groupMatch) {
		const gfId = sanitizePosixUser(groupMatch[1])
		return {
			laneId: `groupfolder:${gfId}`,
			laneType: 'group_folder',
			laneLabel: `GroupFolder #${gfId}`,
			occScopeFlag: `--path="/__groupfolders/${gfId}"`,
		}
	}

	const externalMatch = normalized.match(/^\/(?:External|external|mounts?)\/([^/]+)(?:\/|$)/i)
	if (externalMatch) {
		const mountName = sanitizePosixUser(externalMatch[1])
		return {
			laneId: `external:${mountName}`,
			laneType: 'external_mount',
			laneLabel: `External /${mountName}`,
			occScopeFlag: `--path="/External/${mountName}"`,
		}
	}

	const firstSeg = normalized.replace(/^\/+/, '').split('/')[0]
	if (firstSeg) {
		const safeSeg = sanitizePosixUser(firstSeg)
		return {
			laneId: `root:${safeSeg}`,
			laneType: 'shared_root',
			laneLabel: `Root /${safeSeg}`,
			occScopeFlag: `--path="/${safeSeg}"`,
		}
	}

	return {
		laneId: 'root:default',
		laneType: 'shared_root',
		laneLabel: 'Default Root',
		occScopeFlag: '',
	}
}

/**
 * Normalizes raw user configuration into bounded, shell-safe parameters.
 *
 * @param {object} rawConfig User-provided configuration overrides.
 * @return {object} Normalized configuration.
 */
export function normalizeScheduleConfig(rawConfig = {}) {
	const merged = { ...DEFAULT_SCHEDULE_CONFIG, ...(rawConfig || {}) }
	const niceLevel = Number.isFinite(Number(merged.niceLevel))
		? Math.max(0, Math.min(19, Math.round(Number(merged.niceLevel))))
		: DEFAULT_SCHEDULE_CONFIG.niceLevel
	const memoryHighMb = Number.isFinite(Number(merged.memoryHighMb)) && Number(merged.memoryHighMb) > 0
		? Math.max(64, Math.min(65536, Math.round(Number(merged.memoryHighMb))))
		: DEFAULT_SCHEDULE_CONFIG.memoryHighMb
	const memoryMaxMb = Number.isFinite(Number(merged.memoryMaxMb)) && Number(merged.memoryMaxMb) > 0
		? Math.max(64, Math.min(131072, Math.round(Number(merged.memoryMaxMb))))
		: DEFAULT_SCHEDULE_CONFIG.memoryMaxMb
	const cpuQuotaPct = Number.isFinite(Number(merged.cpuQuotaPct)) && Number(merged.cpuQuotaPct) > 0
		? Math.max(5, Math.min(800, Math.round(Number(merged.cpuQuotaPct))))
		: DEFAULT_SCHEDULE_CONFIG.cpuQuotaPct
	const ioWeight = Number.isFinite(Number(merged.ioWeight)) && Number(merged.ioWeight) > 0
		? Math.max(10, Math.min(1000, Math.round(Number(merged.ioWeight))))
		: DEFAULT_SCHEDULE_CONFIG.ioWeight
	const randomizedDelayMin = Number.isFinite(Number(merged.randomizedDelayMin)) && Number(merged.randomizedDelayMin) >= 0
		? Math.max(0, Math.min(180, Math.round(Number(merged.randomizedDelayMin))))
		: DEFAULT_SCHEDULE_CONFIG.randomizedDelayMin
	const windowMinutes = Number.isFinite(Number(merged.windowMinutes)) && Number(merged.windowMinutes) > 0
		? Math.max(5, Math.min(1440, Math.round(Number(merged.windowMinutes))))
		: DEFAULT_SCHEDULE_CONFIG.windowMinutes
	const minFreeDiskPct = Number.isFinite(Number(merged.minFreeDiskPct)) && Number(merged.minFreeDiskPct) >= 0
		? Math.max(0, Math.min(80, Math.round(Number(merged.minFreeDiskPct))))
		: DEFAULT_SCHEDULE_CONFIG.minFreeDiskPct
	const maxLoadAvg = Number.isFinite(Number(merged.maxLoadAvg)) && Number(merged.maxLoadAvg) > 0
		? Math.max(0.5, Math.min(128, Math.round(Number(merged.maxLoadAvg) * 10) / 10))
		: DEFAULT_SCHEDULE_CONFIG.maxLoadAvg
	const flockTimeoutSec = Number.isFinite(Number(merged.flockTimeoutSec)) && Number(merged.flockTimeoutSec) >= 0
		? Math.max(0, Math.min(3600, Math.round(Number(merged.flockTimeoutSec))))
		: DEFAULT_SCHEDULE_CONFIG.flockTimeoutSec
	const slaTargetPct = Number.isFinite(Number(merged.slaTargetPct)) && Number(merged.slaTargetPct) > 0
		? Math.max(10, Math.min(100, Math.round(Number(merged.slaTargetPct))))
		: DEFAULT_SCHEDULE_CONFIG.slaTargetPct
	const maxGroupsPerRun = Number.isFinite(Number(merged.maxGroupsPerRun)) && Number(merged.maxGroupsPerRun) > 0
		? Math.max(1, Math.min(100000, Math.round(Number(merged.maxGroupsPerRun))))
		: DEFAULT_SCHEDULE_CONFIG.maxGroupsPerRun
	const minSizeFilterMb = Number.isFinite(Number(merged.minSizeFilterMb)) && Number(merged.minSizeFilterMb) >= 0
		? Math.max(0, Math.min(102400, Number(merged.minSizeFilterMb)))
		: 0

	const occWorkflow = OCC_WORKFLOWS[merged.occWorkflow] ? merged.occWorkflow : 'find-and-list'
	const ioClass = IO_CLASS_PROFILES[merged.ioClass] ? merged.ioClass : 'best-effort-7'
	const storageTier = STORAGE_TIER_PROFILES[merged.storageTier] ? merged.storageTier : 'ssd'
	const laneSortMode = LANE_SORT_MODES.includes(merged.laneSortMode) ? merged.laneSortMode : 'waste_desc'

	return {
		presetId: typeof merged.presetId === 'string' ? merged.presetId : 'nightly-offpeak',
		serviceName: sanitizeServiceName(merged.serviceName),
		nextcloudRoot: sanitizePosixPath(merged.nextcloudRoot, '/var/www/nextcloud'),
		phpBin: sanitizePosixPath(merged.phpBin, '/usr/bin/php'),
		occUser: sanitizePosixUser(merged.occUser),
		lockFile: sanitizePosixPath(merged.lockFile, '/run/lock/nextcloud-duplicatefinder.lock'),
		logFile: sanitizePosixPath(merged.logFile, '/var/log/nextcloud/duplicatefinder-ops.log'),
		frequency: SCHEDULE_FREQUENCIES.some(f => f.id === merged.frequency) ? merged.frequency : 'daily',
		runTime: parseRunTime(merged.runTime).formatted,
		customCron: sanitizeCronExpr(merged.customCron, '15 2 * * *'),
		customOnCalendar: sanitizeOnCalendar(merged.customOnCalendar, '*-*-* 02:15:00'),
		occWorkflow,
		storageTier,
		ioClass,
		niceLevel,
		memoryHighMb,
		memoryMaxMb,
		cpuQuotaPct,
		ioWeight,
		randomizedDelayMin,
		windowMinutes,
		minFreeDiskPct,
		maxLoadAvg,
		useFlock: Boolean(merged.useFlock),
		flockTimeoutSec,
		requireMaintenanceOff: Boolean(merged.requireMaintenanceOff),
		slaTargetPct,
		maxGroupsPerRun,
		minSizeFilterMb,
		targetLaneId: typeof merged.targetLaneId === 'string' && merged.targetLaneId ? merged.targetLaneId : 'all',
		laneSortMode,
		searchQuery: String(merged.searchQuery || '').trim(),
	}
}

/**
 * Formats seconds into a concise human-readable duration (e.g., "42s", "6m 15s", "1h 22m").
 *
 * @param {number} totalSeconds Duration in seconds.
 * @return {string} Formatted duration label.
 */
export function formatDurationSeconds(totalSeconds) {
	const safeSec = Math.max(0, Math.round(Number(totalSeconds) || 0))
	if (safeSec < 60) {
		return `${safeSec}s`
	}
	const hours = Math.floor(safeSec / 3600)
	const minutes = Math.floor((safeSec % 3600) / 60)
	const seconds = safeSec % 60
	if (hours > 0) {
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
	}
	return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

/**
 * Computes effective I/O & CPU-throttled scan throughput in MiB/s.
 *
 * @param {object} config Normalized schedule configuration.
 * @return {number} Effective throughput in MiB/s.
 */
export function computeEffectiveThroughputMbPerSec(config) {
	const tier = STORAGE_TIER_PROFILES[config.storageTier] || STORAGE_TIER_PROFILES.ssd
	const ioProfile = IO_CLASS_PROFILES[config.ioClass] || IO_CLASS_PROFILES['best-effort-7']
	const cpuThrottleFactor = Math.min(1.0, Math.max(0.2, config.cpuQuotaPct / 100 + 0.35))
	const nicePenalty = 1 - (config.niceLevel / 100)
	const throughput = tier.baseScanMbPerSec * ioProfile.throughputFactor * cpuThrottleFactor * nicePenalty / tier.hashCpuMultiplier
	return Math.max(5, Math.round(throughput * 10) / 10)
}

/**
 * Builds deterministic preflight health and safety checks for the configured schedule.
 *
 * @param {object} config Normalized schedule configuration.
 * @param {object} telemetry Aggregated scan metrics.
 * @return {Array<object>} Ordered list of preflight checks.
 */
export function evaluatePreflightChecks(config, telemetry) {
	const checks = []

	if (config.useFlock) {
		const modeLabel = config.flockTimeoutSec === 0
			? 'non-blocking (-n) immediate skip on overlap'
			: `bounded wait (-w ${config.flockTimeoutSec}s)`
		checks.push({
			id: 'flock-concurrency',
			status: 'pass',
			title: 'Flock concurrency guard enabled',
			detail: `Exclusive lock at ${config.lockFile} using ${modeLabel}. Prevents concurrent occ DB/I/O contention.`,
			remediation: '',
		})
	} else {
		checks.push({
			id: 'flock-concurrency',
			status: 'block',
			title: 'Flock overlap guard disabled',
			detail: 'Without flock, slow scans over large media or NAS trees can overlap and exhaust PHP/DB connections.',
			remediation: 'Enable flock concurrency guard with -n (non-blocking) before deploying to production.',
		})
	}

	if (config.memoryMaxMb < config.memoryHighMb) {
		checks.push({
			id: 'memory-cgroup',
			status: 'block',
			title: 'MemoryMax is lower than MemoryHigh',
			detail: `MemoryMax (${config.memoryMaxMb}M) must be >= MemoryHigh (${config.memoryHighMb}M) for systemd cgroup v2 throttling.`,
			remediation: 'Increase MemoryMax above MemoryHigh (recommended: 2x MemoryHigh).',
		})
	} else if (config.memoryMaxMb < 256) {
		checks.push({
			id: 'memory-cgroup',
			status: 'warn',
			title: 'Tight PHP CLI memory ceiling',
			detail: `MemoryMax=${config.memoryMaxMb}M may trigger OOM-kill during large occ duplicates:find-all runs.`,
			remediation: 'Raise MemoryHigh to >= 384M and MemoryMax to >= 512M.',
		})
	} else {
		checks.push({
			id: 'memory-cgroup',
			status: 'pass',
			title: 'Cgroup v2 memory guard balanced',
			detail: `MemoryHigh=${config.memoryHighMb}M throttles page cache cleanly before MemoryMax=${config.memoryMaxMb}M hard cap.`,
			remediation: '',
		})
	}

	const tier = STORAGE_TIER_PROFILES[config.storageTier] || STORAGE_TIER_PROFILES.ssd
	if (!tier.supportsLocalIonice && config.ioClass === 'idle-3') {
		checks.push({
			id: 'io-scheduling',
			status: 'warn',
			title: 'ionice -c3 has limited effect on NFS/SMB/S3 mounts',
			detail: `${tier.label} bypasses local block CFQ/BFQ queues; remote I/O stalls can still saturate links.`,
			remediation: 'Pair CPUQuota <= 35% with --user sharding or --min-size filtering.',
		})
	} else {
		checks.push({
			id: 'io-scheduling',
			status: 'pass',
			title: 'I/O and CPU niceness guard configured',
			detail: `ionice ${IO_CLASS_PROFILES[config.ioClass].ioniceFlags}, nice ${config.niceLevel}, CPUQuota=${config.cpuQuotaPct}%, IOWeight=${config.ioWeight}.`,
			remediation: '',
		})
	}

	if (config.requireMaintenanceOff) {
		checks.push({
			id: 'maintenance-guard',
			status: 'pass',
			title: 'Nextcloud maintenance:mode preflight active',
			detail: 'Runner inspects occ status --output=json and skips cleanly while Nextcloud is in maintenance mode.',
			remediation: '',
		})
	} else {
		checks.push({
			id: 'maintenance-guard',
			status: 'warn',
			title: 'Maintenance mode preflight skipped',
			detail: 'Scheduled scan may contend with Nextcloud upgrades or database migrations.',
			remediation: 'Keep maintenance mode preflight enabled in production.',
		})
	}

	if (config.minFreeDiskPct < 10) {
		checks.push({
			id: 'disk-headroom',
			status: 'warn',
			title: 'Low preflight disk headroom threshold',
			detail: `Disk headroom threshold is ${config.minFreeDiskPct}%. Log/DB temp writes need at least 10-15% free space.`,
			remediation: 'Set min free disk headroom to >= 15%.',
		})
	} else {
		checks.push({
			id: 'disk-headroom',
			status: 'pass',
			title: 'Disk headroom & loadavg preflight active',
			detail: `Requires >= ${config.minFreeDiskPct}% free disk on ${config.nextcloudRoot} and 1m loadavg <= ${config.maxLoadAvg}.`,
			remediation: '',
		})
	}

	if (!telemetry.fitsInWindow && telemetry.totalGroups > 0) {
		checks.push({
			id: 'window-fit',
			status: 'warn',
			title: 'Full scan exceeds configured maintenance window',
			detail: `Estimated full scan (${telemetry.estimatedFullScanFormatted}) exceeds ${config.windowMinutes}m window (${telemetry.windowUtilizationPct}% utilization).`,
			remediation: 'Shard by user/groupfolder lane or set --min-size to process top reclaimable clusters first.',
		})
	} else {
		checks.push({
			id: 'window-fit',
			status: 'pass',
			title: 'Estimated runtime fits maintenance window',
			detail: `Estimated duration ${telemetry.estimatedFullScanFormatted} fits inside ${config.windowMinutes}m window (${telemetry.windowUtilizationPct}%).`,
			remediation: '',
		})
	}

	return checks
}

/**
 * Aggregates duplicate clusters into sharded schedule lanes, SLA reclaim projections,
 * and preflight health verdicts.
 *
 * @param {Array<object>} duplicates Duplicate groups from store/API.
 * @param {object} rawConfig Schedule configuration options.
 * @return {object} Complete schedule plan and telemetry report.
 */
export function buildOpsSchedulePlan(duplicates, rawConfig = {}) {
	const config = normalizeScheduleConfig(rawConfig)
	const groups = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []
	const minSizeBytes = Math.round(config.minSizeFilterMb * 1024 * 1024)

	const laneMap = new Map()
	let totalGroups = 0
	let totalFiles = 0
	let totalLogicalBytes = 0
	let totalReclaimableBytes = 0

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length === 0) {
			continue
		}

		const groupSize = Number(group.size) || Number(files[0].size) || 0
		if (minSizeBytes > 0 && groupSize < minSizeBytes) {
			continue
		}

		totalGroups += 1
		totalFiles += files.length
		let groupLogical = 0
		for (const file of files) {
			groupLogical += Number(file.size) || groupSize
		}
		const groupReclaimable = files.length > 1
			? Math.max(0, groupLogical - (Number(files[0].size) || groupSize))
			: 0

		totalLogicalBytes += groupLogical
		totalReclaimableBytes += groupReclaimable

		const seenLanesForGroup = new Set()
		for (const file of files) {
			const scope = extractUserScope(file.path || file.name || '')
			if (!laneMap.has(scope.laneId)) {
				laneMap.set(scope.laneId, {
					laneId: scope.laneId,
					laneType: scope.laneType,
					laneLabel: scope.laneLabel,
					occScopeFlag: scope.occScopeFlag,
					groupCount: 0,
					fileCount: 0,
					logicalBytes: 0,
					reclaimableBytes: 0,
					largestGroupBytes: 0,
					primaryDuplicateId: group.id ?? null,
					rawGroup: group,
				})
			}
			const entry = laneMap.get(scope.laneId)
			entry.fileCount += 1
			const fileBytes = Number(file.size) || groupSize
			entry.logicalBytes += fileBytes
			if (!seenLanesForGroup.has(scope.laneId)) {
				seenLanesForGroup.add(scope.laneId)
				entry.groupCount += 1
				entry.reclaimableBytes += groupReclaimable
				if (groupReclaimable >= entry.largestGroupBytes) {
					entry.largestGroupBytes = groupReclaimable
					entry.primaryDuplicateId = group.id ?? null
					entry.rawGroup = group
				}
			}
		}
	}

	const effectiveThroughputMbPerSec = computeEffectiveThroughputMbPerSec(config)
	const bytesPerSec = effectiveThroughputMbPerSec * 1024 * 1024
	const windowSeconds = config.windowMinutes * 60
	const searchLower = config.searchQuery.toLowerCase()

	const allLanes = Array.from(laneMap.values()).map(lane => {
		const estimatedScanSec = lane.logicalBytes > 0
			? Math.max(2, Math.ceil((lane.logicalBytes / bytesPerSec) + (lane.fileCount * 0.04)))
			: 0
		const wasteSharePct = totalReclaimableBytes > 0
			? Math.round((lane.reclaimableBytes / totalReclaimableBytes) * 1000) / 10
			: 0
		const exceedsWindow = estimatedScanSec > windowSeconds
		const recommendedMinSize = exceedsWindow && lane.largestGroupBytes >= 10 * 1024 * 1024
			? '10M'
			: (exceedsWindow ? '1M' : '0')
		const minSizeArg = recommendedMinSize !== '0' ? ` --min-size=${recommendedMinSize}` : ''
		const baseCmd = config.occWorkflow === 'list-all-audit'
			? `${config.phpBin} ${config.nextcloudRoot}/occ duplicates:list-all --output=json${minSizeArg}`
			: config.occWorkflow === 'folders-audit'
				? `${config.phpBin} ${config.nextcloudRoot}/occ duplicates:folders --json${lane.occScopeFlag ? ` ${lane.occScopeFlag}` : ''}`
				: `${config.phpBin} ${config.nextcloudRoot}/occ duplicates:find-all${lane.occScopeFlag ? ` ${lane.occScopeFlag}` : ''}`

		return {
			...lane,
			logicalFormatted: formatBytes(lane.logicalBytes),
			reclaimableFormatted: formatBytes(lane.reclaimableBytes),
			wasteSharePct,
			estimatedScanSec,
			estimatedScanFormatted: formatDurationSeconds(estimatedScanSec),
			exceedsWindow,
			recommendedMinSize,
			recommendedCommand: baseCmd,
		}
	})

	const filteredLanes = searchLower
		? allLanes.filter(lane => (
			lane.laneLabel.toLowerCase().includes(searchLower)
			|| lane.laneId.toLowerCase().includes(searchLower)
			|| lane.occScopeFlag.toLowerCase().includes(searchLower)
		))
		: allLanes

	filteredLanes.sort((a, b) => {
		if (config.laneSortMode === 'runtime_desc') {
			return b.estimatedScanSec - a.estimatedScanSec || b.reclaimableBytes - a.reclaimableBytes
		}
		if (config.laneSortMode === 'groups_desc') {
			return b.groupCount - a.groupCount || b.reclaimableBytes - a.reclaimableBytes
		}
		if (config.laneSortMode === 'name_asc') {
			return a.laneLabel.localeCompare(b.laneLabel)
		}
		return b.reclaimableBytes - a.reclaimableBytes || b.groupCount - a.groupCount
	})

	const activeLane = config.targetLaneId !== 'all'
		? allLanes.find(item => item.laneId === config.targetLaneId) || null
		: null
	const targetLogicalBytes = activeLane ? activeLane.logicalBytes : totalLogicalBytes
	const targetFilesCount = activeLane ? activeLane.fileCount : totalFiles
	const targetGroupsCount = activeLane ? activeLane.groupCount : totalGroups
	const targetReclaimableBytes = activeLane ? activeLane.reclaimableBytes : totalReclaimableBytes

	const estimatedFullScanSec = targetLogicalBytes > 0
		? Math.max(3, Math.ceil((targetLogicalBytes / bytesPerSec) + (targetFilesCount * 0.04)))
		: 0
	const windowUtilizationPct = windowSeconds > 0
		? Math.round((estimatedFullScanSec / windowSeconds) * 100)
		: 0
	const fitsInWindow = estimatedFullScanSec <= windowSeconds

	const slaTargetBytes = Math.round(targetReclaimableBytes * (config.slaTargetPct / 100))
	// Compute cumulative groups needed in descending order of group waste to hit SLA goal
	const sortedGroupSavings = groups
		.map(g => {
			const files = Array.isArray(g.files) ? g.files.filter(Boolean) : []
			const sz = Number(g.size) || (files[0] ? Number(files[0].size) || 0 : 0)
			if (minSizeBytes > 0 && sz < minSizeBytes) {
				return 0
			}
			if (files.length <= 1) {
				return 0
			}
			let logical = 0
			for (const f of files) {
				logical += Number(f.size) || sz
			}
			return Math.max(0, logical - (Number(files[0].size) || sz))
		})
		.filter(v => v > 0)
		.sort((a, b) => b - a)

	let accumulatedSlaBytes = 0
	let groupsForSla = 0
	for (const saving of sortedGroupSavings) {
		if (accumulatedSlaBytes >= slaTargetBytes) {
			break
		}
		accumulatedSlaBytes += saving
		groupsForSla += 1
	}

	const scheduleMeta = deriveScheduleExpressions(config)
	const cyclesByGroupCap = groupsForSla > 0
		? Math.ceil(groupsForSla / config.maxGroupsPerRun)
		: (targetGroupsCount > 0 ? 1 : 0)
	const cyclesByWindow = estimatedFullScanSec > 0 && windowSeconds > 0
		? Math.ceil(estimatedFullScanSec / windowSeconds)
		: 0
	const cyclesToReachSla = Math.max(cyclesByGroupCap, cyclesByWindow)
	const daysToReachSla = cyclesToReachSla > 0 && scheduleMeta.runsPerWeek > 0
		? Math.max(1, Math.ceil((cyclesToReachSla / scheduleMeta.runsPerWeek) * 7))
		: 0

	const summary = {
		totalGroups: targetGroupsCount,
		totalFiles: targetFilesCount,
		totalLogicalBytes: targetLogicalBytes,
		totalLogicalFormatted: formatBytes(targetLogicalBytes),
		totalReclaimableBytes: targetReclaimableBytes,
		totalReclaimableFormatted: formatBytes(targetReclaimableBytes),
		laneCount: allLanes.length,
		activeLaneLabel: activeLane ? activeLane.laneLabel : 'All Scopes',
		activeLaneFlag: activeLane ? activeLane.occScopeFlag : '',
		estimatedFullScanSec,
		estimatedFullScanFormatted: formatDurationSeconds(estimatedFullScanSec),
		fitsInWindow,
		windowMinutes: config.windowMinutes,
		windowUtilizationPct,
		slaTargetPct: config.slaTargetPct,
		slaTargetBytes,
		slaTargetFormatted: formatBytes(slaTargetBytes),
		groupsForSla,
		maxGroupsPerRun: config.maxGroupsPerRun,
		cyclesToReachSla,
		daysToReachSla,
		effectiveThroughputMbPerSec,
		preflightPassCount: 0,
		preflightWarnCount: 0,
		preflightBlockCount: 0,
	}

	const preflightChecks = evaluatePreflightChecks(config, summary)
	for (const check of preflightChecks) {
		if (check.status === 'pass') {
			summary.preflightPassCount += 1
		} else if (check.status === 'warn') {
			summary.preflightWarnCount += 1
		} else if (check.status === 'block') {
			summary.preflightBlockCount += 1
		}
	}

	return {
		schema: OPS_SCHEDULE_SCHEMA,
		config,
		scheduleMeta,
		summary,
		lanes: filteredLanes,
		allLanes,
		preflightChecks,
	}
}

/**
 * Builds the exact OCC execution command chain for a given schedule plan.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {Array<string>} Ordered shell command lines.
 */
export function buildOccCommandLines(plan) {
	const { config, summary } = plan
	const scopeArg = summary.activeLaneFlag ? ` ${summary.activeLaneFlag}` : ''
	const minSizeArg = config.minSizeFilterMb > 0 ? ` --min-size=${Math.round(config.minSizeFilterMb)}M` : ''
	const limitArg = ` --limit=${config.maxGroupsPerRun}`
	const occ = `${config.phpBin} -f ${config.nextcloudRoot}/occ`

	if (config.occWorkflow === 'find-only') {
		return [`${occ} duplicates:find-all${scopeArg}`]
	}
	if (config.occWorkflow === 'list-all-audit') {
		return [`${occ} duplicates:list-all --output=json${minSizeArg}${limitArg}`]
	}
	if (config.occWorkflow === 'folders-audit') {
		return [`${occ} duplicates:folders --json${scopeArg}${minSizeArg}`]
	}
	if (config.occWorkflow === 'find-and-trashbin') {
		return [
			`${occ} duplicates:find-all${scopeArg}`,
			`${occ} trashbin:cleanup --all-users`,
		]
	}
	return [
		`${occ} duplicates:find-all${scopeArg}`,
		`${occ} duplicates:list-all --output=json${minSizeArg}${limitArg}`,
	]
}

/**
 * Generates a hardened systemd `.service` unit file with cgroup v2 memory/CPU/IO limits,
 * flock concurrency lock, and preflight checks.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {string} Systemd service unit content.
 */
export function buildSystemdServiceUnit(plan) {
	const { config, summary } = plan
	const ioProfile = IO_CLASS_PROFILES[config.ioClass] || IO_CLASS_PROFILES['best-effort-7']
	const timeoutSec = Math.max(300, config.windowMinutes * 60)
	const flockPrefix = config.useFlock
		? `/usr/bin/flock ${config.flockTimeoutSec === 0 ? '-n' : `-w ${config.flockTimeoutSec}`} ${config.lockFile} `
		: ''
	const runnerPath = `/usr/local/sbin/${config.serviceName}-runner.sh`
	const ioPriorityLine = ioProfile.ionicePriority !== null
		? `IOSchedulingPriority=${ioProfile.ionicePriority}`
		: '# IOSchedulingPriority omitted for idle class'

	const lines = [
		`# /etc/systemd/system/${config.serviceName}.service`,
		`# Generated by Nextcloud DuplicateFinder Ops Schedule Generator (${summary.activeLaneLabel})`,
		'[Unit]',
		'Description=Nextcloud DuplicateFinder Rate-Limited Deduplication Job',
		'Documentation=https://github.com/eldertek/duplicatefinder',
		'After=network-online.target mariadb.service postgresql.service redis-server.service',
		'Wants=network-online.target',
		'',
		'[Service]',
		'Type=oneshot',
		`User=${config.occUser}`,
		`Group=${config.occUser}`,
		`WorkingDirectory=${config.nextcloudRoot}`,
		`Nice=${config.niceLevel}`,
		`IOSchedulingClass=${ioProfile.ioniceClass === 3 ? 'idle' : 'best-effort'}`,
		ioPriorityLine,
		`CPUQuota=${config.cpuQuotaPct}%`,
		`MemoryHigh=${config.memoryHighMb}M`,
		`MemoryMax=${config.memoryMaxMb}M`,
		`IOWeight=${config.ioWeight}`,
		`TimeoutStartSec=${timeoutSec}`,
		'PrivateTmp=yes',
		'NoNewPrivileges=yes',
		'ProtectSystem=full',
		'ProtectHome=read-only',
		`ReadWritePaths=${config.nextcloudRoot}/data /run/lock /var/log/nextcloud`,
		'StandardOutput=journal',
		'StandardError=journal',
		`SyslogIdentifier=${config.serviceName}`,
		`ExecStartPre=/bin/sh -c 'test -r ${config.nextcloudRoot}/occ && test -x ${config.phpBin}'`,
		`ExecStart=${flockPrefix}${runnerPath}`,
		'',
		'[Install]',
		'WantedBy=multi-user.target',
	]

	return `${lines.join('\n')}\n`
}

/**
 * Generates a systemd `.timer` unit file aligned with the configured OnCalendar schedule.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {string} Systemd timer unit content.
 */
export function buildSystemdTimerUnit(plan) {
	const { config, scheduleMeta } = plan
	const lines = [
		`# /etc/systemd/system/${config.serviceName}.timer`,
		`# Schedule: ${scheduleMeta.scheduleLabel}`,
		'[Unit]',
		`Description=Timer for ${config.serviceName}.service`,
		'',
		'[Timer]',
		`OnCalendar=${scheduleMeta.systemdOnCalendar}`,
		'Persistent=true',
		`RandomizedDelaySec=${config.randomizedDelayMin}m`,
		'AccuracySec=1min',
		`Unit=${config.serviceName}.service`,
		'',
		'[Install]',
		'WantedBy=timers.target',
	]
	return `${lines.join('\n')}\n`
}

/**
 * Generates an `/etc/cron.d/` line and a standalone POSIX bash runner script with
 * DRY_RUN=1 preview, flock, ionice, nice, disk headroom, loadavg, and maintenance-mode guards.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {{ cronLine: string, runnerScript: string }} Cron definition and runner script.
 */
export function buildCronAndRunnerScript(plan) {
	const { config, scheduleMeta, summary } = plan
	const ioProfile = IO_CLASS_PROFILES[config.ioClass] || IO_CLASS_PROFILES['best-effort-7']
	const runnerPath = `/usr/local/sbin/${config.serviceName}-runner.sh`
	const flockCmd = config.useFlock
		? `/usr/bin/flock ${config.flockTimeoutSec === 0 ? '-n' : `-w ${config.flockTimeoutSec}`} "${config.lockFile}" `
		: ''
	const cronPrefix = `${scheduleMeta.cronExpression} ${config.occUser}`
	const cronExec = `${flockCmd}/usr/bin/ionice ${ioProfile.ioniceFlags} /usr/bin/nice -n ${config.niceLevel} ${runnerPath} >> "${config.logFile}" 2>&1`
	const cronLine = [
		`# /etc/cron.d/${config.serviceName}`,
		`# Schedule: ${scheduleMeta.scheduleLabel} | Target: ${summary.activeLaneLabel}`,
		'SHELL=/bin/bash',
		'PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin',
		`${cronPrefix} ${cronExec}`,
	].join('\n')

	const occCommands = buildOccCommandLines(plan)
	const maintenanceGuardBlock = config.requireMaintenanceOff
		? [
			'MAINT_JSON="$("$PHP_BIN" -f "$NC_ROOT/occ" status --output=json 2>/dev/null || echo \'{}\')"',
			'if printf \'%s\' "$MAINT_JSON" | grep -q \'"maintenance":true\'; then',
			'  log_msg "SKIP: Nextcloud maintenance mode is active."',
			'  exit 0',
			'fi',
		]
		: ['# Maintenance mode preflight disabled by operator']

	const scriptLines = [
		'#!/usr/bin/env bash',
		`# ${runnerPath}`,
		`# Nextcloud DuplicateFinder Automated Runner (${summary.activeLaneLabel})`,
		'# Usage: DRY_RUN=0 /usr/local/sbin/...-runner.sh  (defaults to DRY_RUN=1 safety preview)',
		'set -euo pipefail',
		'',
		`NC_ROOT="${config.nextcloudRoot}"`,
		`PHP_BIN="${config.phpBin}"`,
		`LOCK_FILE="${config.lockFile}"`,
		`MIN_FREE_DISK_PCT=${config.minFreeDiskPct}`,
		`MAX_LOAD_AVG=${config.maxLoadAvg}`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'log_msg() {',
		'  printf \'%s [%s] %s\\n\' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$' + '{2:-}"',
		'}',
		'',
		'# Preflight 1: Verify Nextcloud occ & PHP binary',
		'if [[ ! -x "$PHP_BIN" || ! -r "$NC_ROOT/occ" ]]; then',
		'  log_msg "ERROR" "Missing PHP binary or occ entrypoint under $NC_ROOT"',
		'  exit 2',
		'fi',
		'',
		'# Preflight 2: Disk headroom check',
		'USED_PCT="$(df -P "$NC_ROOT" | awk \'NR==2 { gsub(/%/, "", $5); print $5 }\')"',
		'FREE_PCT=$((100 - $' + '{USED_PCT:-100}))',
		'if (( FREE_PCT < MIN_FREE_DISK_PCT )); then',
		'  log_msg "ABORT" "Free disk $' + '{FREE_PCT}% < required $' + '{MIN_FREE_DISK_PCT}% on $NC_ROOT"',
		'  exit 3',
		'fi',
		'',
		'# Preflight 3: Load average guard',
		'LOAD_1M="$(awk \'{ print $1 }\' /proc/loadavg)"',
		'if awk -v l="$LOAD_1M" -v m="$MAX_LOAD_AVG" \'BEGIN { exit !(l > m) }\'; then',
		'  log_msg "SKIP" "1m loadavg $LOAD_1M exceeds threshold $MAX_LOAD_AVG"',
		'  exit 0',
		'fi',
		'',
		'# Preflight 4: Nextcloud maintenance mode guard',
		...maintenanceGuardBlock,
		'',
		'# Preflight 5: Execute rate-limited occ workflow',
		'if [[ "$DRY_RUN" != "0" ]]; then',
		`  log_msg "DRY_RUN" "Would acquire $LOCK_FILE and execute with ionice ${ioProfile.ioniceFlags} nice -n ${config.niceLevel}:"`,
		...occCommands.map(cmd => `  printf '  %s\\n' '${cmd.replace(/'/g, "'\\''")}'`),
		'  exit 0',
		'fi',
		'',
		'log_msg "START" "Starting DuplicateFinder scheduled run"',
		...occCommands.map(cmd => `/usr/bin/ionice ${ioProfile.ioniceFlags} /usr/bin/nice -n ${config.niceLevel} ${cmd}`),
		'log_msg "DONE" "DuplicateFinder scheduled run completed"',
	]

	return {
		cronLine: `${cronLine}\n`,
		runnerScript: `${scriptLines.join('\n')}\n`,
	}
}

/**
 * Generates an installation and verification shell bundle (.sh) with DRY_RUN=1 preview default.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {string} Complete install and verification shell script.
 */
export function buildInstallBundleScript(plan) {
	const { config, summary } = plan
	const serviceUnit = buildSystemdServiceUnit(plan)
	const timerUnit = buildSystemdTimerUnit(plan)
	const { cronLine, runnerScript } = buildCronAndRunnerScript(plan)

	const lines = [
		'#!/usr/bin/env bash',
		`# Deployment bundle for ${config.serviceName}`,
		`# Target scope: ${summary.activeLaneLabel} | Est. duration: ${summary.estimatedFullScanFormatted}`,
		'set -euo pipefail',
		'',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`SERVICE_NAME="${config.serviceName}"`,
		`RUNNER_PATH="/usr/local/sbin/${config.serviceName}-runner.sh"`,
		`SERVICE_PATH="/etc/systemd/system/${config.serviceName}.service"`,
		`TIMER_PATH="/etc/systemd/system/${config.serviceName}.timer"`,
		`CRON_PATH="/etc/cron.d/${config.serviceName}"`,
		'',
		'if [[ "$DRY_RUN" != "0" ]]; then',
		'  echo "[DRY_RUN=1] Previewing installation paths (pass DRY_RUN=0 as root to write units):"',
		'  echo "  Runner:  $RUNNER_PATH"',
		'  echo "  Service: $SERVICE_PATH"',
		'  echo "  Timer:   $TIMER_PATH"',
		'  echo "  Cron:    $CRON_PATH"',
		'  exit 0',
		'fi',
		'',
		'install -d -m 0755 /usr/local/sbin /var/log/nextcloud',
		`chown ${config.occUser}:${config.occUser} /var/log/nextcloud`,
		'',
		'cat <<\'EOF_RUNNER\' > "$RUNNER_PATH"',
		runnerScript.trimEnd(),
		'EOF_RUNNER',
		'chmod 0750 "$RUNNER_PATH"',
		`chown root:${config.occUser} "$RUNNER_PATH"`,
		'',
		'cat <<\'EOF_SERVICE\' > "$SERVICE_PATH"',
		serviceUnit.trimEnd(),
		'EOF_SERVICE',
		'chmod 0644 "$SERVICE_PATH"',
		'',
		'cat <<\'EOF_TIMER\' > "$TIMER_PATH"',
		timerUnit.trimEnd(),
		'EOF_TIMER',
		'chmod 0644 "$TIMER_PATH"',
		'',
		'cat <<\'EOF_CRON\' > "$CRON_PATH"',
		cronLine.trimEnd(),
		'EOF_CRON',
		'chmod 0644 "$CRON_PATH"',
		'',
		'systemd-analyze verify "$SERVICE_PATH" "$TIMER_PATH"',
		'systemctl daemon-reload',
		'systemctl enable --now "$' + '{SERVICE_NAME}.timer"',
		'systemctl list-timers "$' + '{SERVICE_NAME}.timer" --no-pager',
	]

	return `${lines.join('\n')}\n`
}

/**
 * Builds a structured JSON audit payload containing SLA calculations, preflight checks,
 * sharded lanes, and generated systemd/cron artifacts.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {object} JSON-serializable audit object.
 */
export function buildOpsScheduleAuditJson(plan) {
	const { cronLine, runnerScript } = buildCronAndRunnerScript(plan)
	return {
		schema: OPS_SCHEDULE_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: plan.config,
		scheduleMeta: plan.scheduleMeta,
		summary: plan.summary,
		preflightChecks: plan.preflightChecks,
		lanes: plan.lanes.map(lane => ({
			laneId: lane.laneId,
			laneType: lane.laneType,
			laneLabel: lane.laneLabel,
			occScopeFlag: lane.occScopeFlag,
			groupCount: lane.groupCount,
			fileCount: lane.fileCount,
			logicalBytes: lane.logicalBytes,
			reclaimableBytes: lane.reclaimableBytes,
			wasteSharePct: lane.wasteSharePct,
			estimatedScanSec: lane.estimatedScanSec,
			exceedsWindow: lane.exceedsWindow,
			recommendedMinSize: lane.recommendedMinSize,
			recommendedCommand: lane.recommendedCommand,
		})),
		artifacts: {
			systemdService: buildSystemdServiceUnit(plan),
			systemdTimer: buildSystemdTimerUnit(plan),
			cronLine,
			runnerScript,
		},
	}
}

/**
 * Builds a CWE-1236-safe CSV ledger of all schedule lanes and sharded OCC commands.
 *
 * @param {object} plan Schedule plan from buildOpsSchedulePlan.
 * @return {string} RFC-4180 CSV content with formula-injection escaping.
 */
export function buildOpsScheduleAuditCsv(plan) {
	const headers = [
		'lane_id',
		'lane_type',
		'lane_label',
		'groups',
		'files',
		'reclaimable_bytes',
		'reclaimable_human',
		'waste_share_pct',
		'est_scan_sec',
		'est_scan_human',
		'exceeds_window',
		'recommended_min_size',
		'recommended_occ_command',
	]

	const rows = (plan.lanes || []).map(lane => [
		escapeCsvCell(lane.laneId),
		escapeCsvCell(lane.laneType),
		escapeCsvCell(lane.laneLabel),
		escapeCsvCell(lane.groupCount),
		escapeCsvCell(lane.fileCount),
		escapeCsvCell(lane.reclaimableBytes),
		escapeCsvCell(lane.reclaimableFormatted),
		escapeCsvCell(`${lane.wasteSharePct}%`),
		escapeCsvCell(lane.estimatedScanSec),
		escapeCsvCell(lane.estimatedScanFormatted),
		escapeCsvCell(lane.exceedsWindow ? 'yes' : 'no'),
		escapeCsvCell(lane.recommendedMinSize),
		escapeCsvCell(lane.recommendedCommand),
	].join(','))

	return [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')
}

/**
 * Pure Kubernetes, Terraform & Infrastructure-as-Code State Vault Auditor.
 * Classifies and audits duplicate clusters across 4 IaC & Cluster Vault families:
 * - Terraform State & Plans (.tfstate, .tfstate.backup, .tfplan, .tfplan.json)
 * - Terraform Vars & Secret Exposure (.tfvars, .tfvars.json, .auto.tfvars)
 * - Helm Charts & K8s Manifests (.yaml/.yml Helm/K8s manifests, .tgz chart releases)
 * - Certificates, Keys & Kubeconfigs (.pem, .crt, .key, .kubeconfig, kubeconfig)
 *
 * Distinguishes active canonical .tfstate files, active Helm chart releases, and active
 * PKI certificates/keys from old/redundant .tfstate.backup snapshots, expired .tfplan
 * artifacts, and exposed/redundant secret copies (.tfvars, .key, .pem, .kubeconfig)
 * flagged with explicit security exposure badges.
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const K8S_TERRAFORM_VAULT_SCHEMA = 'duplicatefinder.k8s-terraform-vault-auditor.v1'

export const K8S_TERRAFORM_FAMILIES = Object.freeze([
	'all',
	'terraform-state-and-plans',
	'terraform-vars-and-secrets',
	'helm-charts-and-k8s-manifests',
	'tls-certs-keys-kubeconfigs',
])

export const K8S_TERRAFORM_FAMILY_META = Object.freeze({
	'terraform-state-and-plans': {
		id: 'terraform-state-and-plans',
		label: 'Terraform State & Plans',
		shortLabel: 'State & Plans (.tfstate, .tfstate.backup, .tfplan)',
	},
	'terraform-vars-and-secrets': {
		id: 'terraform-vars-and-secrets',
		label: 'Tfvars & Secret Exposure',
		shortLabel: 'Vars & Secrets (.tfvars, .auto.tfvars, .tfvars.json)',
	},
	'helm-charts-and-k8s-manifests': {
		id: 'helm-charts-and-k8s-manifests',
		label: 'Helm Charts & K8s Manifests',
		shortLabel: 'Helm & K8s (.tgz charts, .yaml/.yml manifests)',
	},
	'tls-certs-keys-kubeconfigs': {
		id: 'tls-certs-keys-kubeconfigs',
		label: 'Certs, Keys & Kubeconfigs',
		shortLabel: 'PKI & Access (.pem, .crt, .key, .kubeconfig)',
	},
})

export const K8S_TERRAFORM_STRATEGIES = Object.freeze([
	'prune-backups-plans-and-leaks',
	'hardlink-immutable-charts',
	'quarantine-stale-and-exposed',
])

export const K8S_TERRAFORM_SURVIVOR_RULES = Object.freeze([
	'active-state-and-vault-first',
	'oldest-vault-first',
	'newest-active-state',
	'shortest-path',
])

export const K8S_TERRAFORM_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'active-tfstate-protected',
	'helm-release-protected',
	'active-cert-key-protected',
	'redundant-tfstate-backup',
	'expired-tfplan-artifact',
	'secret-exposure-risk',
	'shielded',
])

export const K8S_TERRAFORM_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const K8S_TERRAFORM_PRESETS = Object.freeze([
	{
		id: 'all-k8s-terraform-vault-audit',
		name: 'All IaC State, Helm & PKI Vaults',
		description: 'Audit .tfstate/.tfstate.backup/.tfplan, .tfvars secret exposure, Helm .tgz/.yaml charts, and .pem/.crt/.key/.kubeconfig files while strictly conserving active state, releases, and certs.',
		familyFilter: 'all',
		strategy: 'prune-backups-plans-and-leaks',
		survivorRule: 'active-state-and-vault-first',
		protectActiveTfstate: true,
		protectHelmReleases: true,
		protectActiveCertsAndKeys: true,
		requireActiveStateAnchor: true,
		keepRecentBackupDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'terraform-state-plan-reclaim',
		name: 'Terraform Backups & Expired Plans',
		description: 'Target redundant .tfstate.backup snapshots and expired .tfplan files correlated against active canonical .tfstate anchors.',
		familyFilter: 'terraform-state-and-plans',
		strategy: 'prune-backups-plans-and-leaks',
		survivorRule: 'active-state-and-vault-first',
		protectActiveTfstate: true,
		protectHelmReleases: true,
		protectActiveCertsAndKeys: true,
		requireActiveStateAnchor: true,
		keepRecentBackupDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'secret-exposure-tfvars-keys',
		name: 'Secret Exposure (.tfvars, .key, .pem, Kubeconfig)',
		description: 'Quarantine exposed duplicate .tfvars, .key, .pem, and .kubeconfig copies in Downloads, tmp, or shared folders while preserving canonical vault credentials.',
		familyFilter: 'all',
		strategy: 'quarantine-stale-and-exposed',
		survivorRule: 'active-state-and-vault-first',
		protectActiveTfstate: true,
		protectHelmReleases: true,
		protectActiveCertsAndKeys: true,
		requireActiveStateAnchor: false,
		keepRecentBackupDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'helm-charts-k8s-manifests',
		name: 'Helm Charts & K8s Manifests',
		description: 'Audit Helm .tgz chart archives, Chart.yaml, values.yaml, and Kubernetes YAML manifests while conserving active production chart releases.',
		familyFilter: 'helm-charts-and-k8s-manifests',
		strategy: 'prune-backups-plans-and-leaks',
		survivorRule: 'active-state-and-vault-first',
		protectActiveTfstate: true,
		protectHelmReleases: true,
		protectActiveCertsAndKeys: true,
		requireActiveStateAnchor: false,
		keepRecentBackupDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hardlink-immutable-helm-charts',
		name: 'Hardlink Immutable Helm Chart Archives',
		description: 'Deduplicate identical immutable Helm .tgz chart archives via POSIX hardlinks while strictly blocking hardlinks on mutable .tfstate, .tfvars, .yaml, and private key files.',
		familyFilter: 'all',
		strategy: 'hardlink-immutable-charts',
		survivorRule: 'active-state-and-vault-first',
		protectActiveTfstate: true,
		protectHelmReleases: true,
		protectActiveCertsAndKeys: true,
		requireActiveStateAnchor: false,
		keepRecentBackupDays: 0,
		minSizeKb: 0,
	},
])

export const K8S_TERRAFORM_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-k8s-terraform-vault-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-backups-plans-and-leaks',
	survivorRule: 'active-state-and-vault-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectActiveTfstate: true,
	protectHelmReleases: true,
	protectActiveCertsAndKeys: true,
	requireActiveStateAnchor: true,
	keepRecentBackupDays: 0,
	minSizeKb: 0,
})

const TFSTATE_BACKUP_EXT_RE = /\.tfstate(?:\.[a-z0-9_-]+)?\.(?:backup|bak)$/i
const TFSTATE_ACTIVE_EXT_RE = /\.tfstate$/i
const TFPLAN_EXT_RE = /\.tfplan(?:\.json)?$/i
const TFPLAN_NAME_RE = /^(?:tfplan|plan[-_][^/]*\.plan|[^/]*\.tfplan(?:\.json)?)$/i
const TFVARS_EXT_RE = /\.(?:auto\.)?tfvars(?:\.json)?$/i

const CERT_KEY_EXT_RE = /\.(?:pem|crt|key|kubeconfig)$/i
const KUBECONFIG_NAME_RE = /^(?:kubeconfig(?:[-_.][^/]*)?|config\.kubeconfig)$/i

const HELM_CHART_TGZ_RE = /\.(?:tgz|tar\.gz)$/i
const HELM_CHART_CONTEXT_RE = /(?:^|\/)(?:helm|charts?|chart-repo|helm-charts?|helm-releases?|k8s|kubernetes|argocd|flux|gitops|manifests?|releases?)(?:\/|$)/i
const HELM_CHART_NAME_HINT_RE = /(?:chart|helm|ingress|nginx|prometheus|grafana|cert-manager|external-dns|argo|kube|istio|vault|redis|postgres)/i
const YAML_EXT_RE = /\.ya?ml$/i
const K8S_HELM_YAML_NAME_RE = /^(?:chart|values(?:[-_.][^/]*)?|helmfile|kustomization|deployment|service|ingress|statefulset|daemonset|configmap|secret(?:s)?|rbac|clusterrole|serviceaccount|namespace|cronjob|job|hpa|pdb|networkpolicy|application|applicationset)\.ya?ml$/i

const MUTABLE_OR_SENSITIVE_EXT_RE = /\.(?:tfstate|backup|bak|tfplan|tfvars|json|yaml|yml|hcl|pem|crt|key|kubeconfig|txt|lock)$/i

const IAC_ENV_PROD_RE = /(?:^|\/|[-_.])(?:prod|production|live|prd|main|master)(?:\/|[-_.]|$)/i
const IAC_ENV_STAGING_RE = /(?:^|\/|[-_.])(?:staging|stage|stg|preprod|uat)(?:\/|[-_.]|$)/i
const IAC_ENV_DEV_RE = /(?:^|\/|[-_.])(?:dev|development|sandbox|sbx|test|qa|lab|local)(?:\/|[-_.]|$)/i

const ACTIVE_VAULT_PATH_RE = /(?:^|\/)(?:state[-_]?vault|tfstate[-_]?vault|live|prod|production|releases?|chart[-_]?repo|charts|pki|certs|tls|vault|etc\/kubernetes\/pki|kubeconfigs?|canonical|active)(?:\/|$)/i
const EXPOSED_OR_SCRATCH_PATH_RE = /(?:^|\/)(?:downloads?|tmp|temp|scratch|public|shared|desktop|drop|inbox|ci[-_]?artifacts?|ci[-_]?builds?|old|archive[-_]?old|stale|expired|tfstate[-_]?backups?|state[-_]?backups?|backups?|cache|\.terraform|\.helm\/cache|helm-cache)(?:\/|$)/i
const BACKUP_OR_COPY_NAME_RE = /(?:[-_.](?:backup|bak|old|stale|expired|tmp|temp|copy\d*|leaked|exposed|draft|debug)| \(\d+\))(?=\.[^.]+$)/i
const EXPIRED_PLAN_MARKER_RE = /(?:^|[-_./])(?:expired|old|stale|obsolete|superseded|archived|ci[-_]?plan|tmp|temp|pr[-_]?\d+|202[0-4])(?:[-_./]|$)/i

const GENERIC_STACK_STEMS = new Set([
	'terraform',
	'default',
	'state',
	'tfplan',
	'plan',
	'chart',
	'values',
	'kustomization',
	'helmfile',
	'kubeconfig',
	'config',
	'tls',
	'ca',
	'server',
	'client',
	'secret',
	'secrets',
	'main',
	'variables',
])

const NOISE_PARENT_DIRS = new Set([
	'backups',
	'backup',
	'tfstate-backups',
	'state-backups',
	'old',
	'tmp',
	'temp',
	'downloads',
	'ci-artifacts',
	'plans',
	'.terraform',
	'scratch',
	'shared',
	'public',
	'pki',
	'certs',
	'tls',
	'charts',
	'releases',
	'manifests',
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
export function normalizeK8sTerraformConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = K8S_TERRAFORM_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset ? { ...K8S_TERRAFORM_DEFAULT_CONFIG, ...preset } : { ...K8S_TERRAFORM_DEFAULT_CONFIG }

	const familyFilter = K8S_TERRAFORM_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = K8S_TERRAFORM_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = K8S_TERRAFORM_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = K8S_TERRAFORM_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = K8S_TERRAFORM_SORT_MODES.includes(input.sortMode)
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
		protectActiveTfstate: typeof input.protectActiveTfstate === 'boolean'
			? input.protectActiveTfstate
			: base.protectActiveTfstate,
		protectHelmReleases: typeof input.protectHelmReleases === 'boolean'
			? input.protectHelmReleases
			: base.protectHelmReleases,
		protectActiveCertsAndKeys: typeof input.protectActiveCertsAndKeys === 'boolean'
			? input.protectActiveCertsAndKeys
			: base.protectActiveCertsAndKeys,
		requireActiveStateAnchor: typeof input.requireActiveStateAnchor === 'boolean'
			? input.requireActiveStateAnchor
			: base.requireActiveStateAnchor,
		keepRecentBackupDays: normalizeNonNegativeInt(input.keepRecentBackupDays, base.keepRecentBackupDays, 3650),
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
 * Extract meaningful stack or workspace folder name from a path, skipping noise folders.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful stack folder name or empty string.
 */
function extractMeaningfulStackFolder(normalizedPath) {
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
 * Detect IaC toolchain and target environment from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} basename File basename.
 * @return {{ iacTool: string, iacEnvironment: string }} Detected tool and environment.
 */
export function extractIacToolAndEnv(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()
	const combined = `${lowerPath} ${lowerBase}`

	let iacTool = ''
	if (TFSTATE_BACKUP_EXT_RE.test(lowerBase) || TFSTATE_ACTIVE_EXT_RE.test(lowerBase) || TFPLAN_EXT_RE.test(lowerBase) || TFPLAN_NAME_RE.test(lowerBase) || TFVARS_EXT_RE.test(lowerBase) || /terraform/.test(combined)) {
		iacTool = 'Terraform'
	} else if (CERT_KEY_EXT_RE.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)) {
		iacTool = /\.kubeconfig$|kubeconfig/.test(lowerBase) ? 'Kubernetes' : 'PKI / TLS'
	} else if (HELM_CHART_TGZ_RE.test(lowerBase) || /chart\.ya?ml$|values.*\.ya?ml$|helmfile/.test(lowerBase) || /helm|charts?/.test(lowerPath)) {
		iacTool = 'Helm'
	} else if (/k8s|kubernetes|kustomization|argocd|flux|manifests?/.test(combined)) {
		iacTool = 'Kubernetes'
	}

	let iacEnvironment = ''
	if (IAC_ENV_PROD_RE.test(combined)) {
		iacEnvironment = 'prod'
	} else if (IAC_ENV_STAGING_RE.test(combined)) {
		iacEnvironment = 'staging'
	} else if (IAC_ENV_DEV_RE.test(combined)) {
		iacEnvironment = 'dev'
	}

	return { iacTool, iacEnvironment }
}

/**
 * Extract normalized IaC lineage stem to correlate .tfstate.backup and .tfplan
 * artifacts against active canonical .tfstate files, Helm releases, and certs.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for stack context.
 * @return {string} Normalized lineage stem.
 */
export function extractK8sTerraformLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:tfstate(?:\.[a-z0-9_-]+)?\.(?:backup|bak)|tfstate|tfplan(?:\.json)?|(?:auto\.)?tfvars(?:\.json)?|kubeconfig|pem|crt|key|tgz|tar\.gz|ya?ml|json|hcl)$/i, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/-\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(/[-_.](?:backup|bak|old|stale|expired|tmp|temp|copy\d*|leaked|exposed|draft|debug|plan|apply)$/i, '')
	}

	if (!stem || GENERIC_STACK_STEMS.has(stem)) {
		const stackFolder = extractMeaningfulStackFolder(normalizedPath)
		if (stackFolder) {
			if (stem === 'tfplan' || stem === 'plan' || !stem) {
				return `${stackFolder}_terraform`
			}
			return `${stackFolder}_${stem}`
		}
	}

	return stem || 'unknown-iac-artifact'
}

/**
 * Extract concise provenance tag for an IaC / Kubernetes vault file.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase path.
 * @return {string} Provenance tag or empty string.
 */
function extractIacTag(lowerBase, lowerPath) {
	if (TFSTATE_BACKUP_EXT_RE.test(lowerBase)) {
		return 'tfstate-backup'
	}
	if (TFSTATE_ACTIVE_EXT_RE.test(lowerBase)) {
		return 'tfstate-active'
	}
	if (TFPLAN_EXT_RE.test(lowerBase) || TFPLAN_NAME_RE.test(lowerBase)) {
		return 'tfplan-snapshot'
	}
	if (TFVARS_EXT_RE.test(lowerBase)) {
		return 'tfvars-secrets'
	}
	if (/\.kubeconfig$/i.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)) {
		return 'kubeconfig'
	}
	if (/\.key$/i.test(lowerBase)) {
		return 'private-key'
	}
	if (/\.pem$/i.test(lowerBase)) {
		return 'pem-cert-or-key'
	}
	if (/\.crt$/i.test(lowerBase)) {
		return 'tls-certificate'
	}
	if (HELM_CHART_TGZ_RE.test(lowerBase)) {
		return 'helm-chart-tgz'
	}
	if (/^chart\.ya?ml$/i.test(lowerBase) || /^values/i.test(lowerBase) || /helm/i.test(lowerPath)) {
		return 'helm-manifest'
	}
	if (YAML_EXT_RE.test(lowerBase)) {
		return 'k8s-manifest'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Kubernetes, Terraform & IaC State Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyK8sTerraformFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '').replace(/\\/g, '/')
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dir = extractDirname(normalized)
	const lowerDir = dir.toLowerCase()

	const { iacTool, iacEnvironment } = extractIacToolAndEnv(normalized, basename)
	const iacLineageStem = extractK8sTerraformLineageStem(basename, normalized)
	const stackFolder = extractMeaningfulStackFolder(normalized)

	const isTfstateBackupMatch = TFSTATE_BACKUP_EXT_RE.test(lowerBase)
	const isTfstateFileMatch = !isTfstateBackupMatch && TFSTATE_ACTIVE_EXT_RE.test(lowerBase)
	const isTfplanMatch = TFPLAN_EXT_RE.test(lowerBase) || (TFPLAN_NAME_RE.test(lowerBase) && /terraform|tfplan|infra|iac|plans?/i.test(lower))
	const isTfvarsMatch = TFVARS_EXT_RE.test(lowerBase)

	const isCertOrKeyMatch = CERT_KEY_EXT_RE.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)

	const isHelmTgzMatch = HELM_CHART_TGZ_RE.test(lowerBase)
		&& (HELM_CHART_CONTEXT_RE.test(lower) || HELM_CHART_NAME_HINT_RE.test(lowerBase))
	const isK8sYamlMatch = YAML_EXT_RE.test(lowerBase)
		&& (HELM_CHART_CONTEXT_RE.test(lower) || K8S_HELM_YAML_NAME_RE.test(lowerBase))

	const inDomain = Boolean(
		isTfstateBackupMatch
		|| isTfstateFileMatch
		|| isTfplanMatch
		|| isTfvarsMatch
		|| isCertOrKeyMatch
		|| isHelmTgzMatch
		|| isK8sYamlMatch
	)

	const isExposedLocation = EXPOSED_OR_SCRATCH_PATH_RE.test(lower) || BACKUP_OR_COPY_NAME_RE.test(lowerBase)
	const isCanonicalVaultPath = ACTIVE_VAULT_PATH_RE.test(lower) && !isExposedLocation

	let family = null
	let artifactKind = 'unknown'

	if (inDomain) {
		if (isTfstateBackupMatch || isTfstateFileMatch || isTfplanMatch) {
			family = 'terraform-state-and-plans'
			if (isTfstateBackupMatch) {
				artifactKind = 'tfstate-backup-file'
			} else if (isTfplanMatch) {
				artifactKind = 'terraform-plan-file'
			} else {
				artifactKind = 'terraform-state-file'
			}
		} else if (isTfvarsMatch) {
			family = 'terraform-vars-and-secrets'
			artifactKind = /\.auto\.tfvars/i.test(lowerBase) ? 'terraform-auto-tfvars' : 'terraform-tfvars'
		} else if (isCertOrKeyMatch) {
			family = 'tls-certs-keys-kubeconfigs'
			if (/\.kubeconfig$/i.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)) {
				artifactKind = 'kubernetes-kubeconfig'
			} else if (/\.key$/i.test(lowerBase)) {
				artifactKind = 'tls-private-key'
			} else if (/\.pem$/i.test(lowerBase)) {
				artifactKind = 'pem-key-or-cert'
			} else {
				artifactKind = 'tls-certificate-crt'
			}
		} else {
			family = 'helm-charts-and-k8s-manifests'
			if (isHelmTgzMatch) {
				artifactKind = 'helm-chart-package'
			} else if (/^chart\.ya?ml$/i.test(lowerBase) || /^values/i.test(lowerBase) || /helm/i.test(lower)) {
				artifactKind = 'helm-chart-manifest'
			} else {
				artifactKind = 'kubernetes-yaml-manifest'
			}
		}
	}

	const mtimeMs = extractMtimeMs(file)
	const ageDays = mtimeMs !== null && Number.isFinite(referenceNowMs)
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / 86400000))
		: null

	const isRedundantTfstateBackup = inDomain && (
		isTfstateBackupMatch
		|| (isTfstateFileMatch && isExposedLocation)
	)
	const isActiveTfstate = inDomain && isTfstateFileMatch && !isRedundantTfstateBackup
	const isExpiredTfplan = inDomain && isTfplanMatch

	const isHelmRelease = inDomain
		&& family === 'helm-charts-and-k8s-manifests'
		&& !isExposedLocation
		&& (
			isHelmTgzMatch
			|| /^chart\.ya?ml$/i.test(lowerBase)
			|| /^values[-_.]?prod/i.test(lowerBase)
			|| (/helm|charts?|chart-repo/i.test(lower) && isCanonicalVaultPath)
		)

	const isK8sSecretYaml = isK8sYamlMatch && /(?:secret|credentials|sealed-secret|vault-token)/i.test(lowerBase)
	const isPrivateSecretKeyOrVar = isTfvarsMatch
		|| /\.key$/i.test(lowerBase)
		|| /\.pem$/i.test(lowerBase)
		|| /\.kubeconfig$/i.test(lowerBase)
		|| KUBECONFIG_NAME_RE.test(lowerBase)
		|| isK8sSecretYaml

	const isActiveCertOrKey = inDomain
		&& family === 'tls-certs-keys-kubeconfigs'
		&& !isExposedLocation

	const hasSecretExposureRisk = inDomain && isPrivateSecretKeyOrVar
	let secretRiskLevel = 'none'
	let secretExposureReason = ''

	if (hasSecretExposureRisk) {
		if (isExposedLocation || /\.key$/i.test(lowerBase) || /\.kubeconfig$/i.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)) {
			secretRiskLevel = 'critical'
			if (isExposedLocation) {
				secretExposureReason = 'Sensitive IaC/PKI credential copy detected in exposed or backup path'
			} else if (/\.kubeconfig$/i.test(lowerBase) || KUBECONFIG_NAME_RE.test(lowerBase)) {
				secretExposureReason = 'Cluster kubeconfig with API credentials requires strict vault isolation'
			} else {
				secretExposureReason = 'Unencrypted TLS private key material requires strict vault isolation'
			}
		} else {
			secretRiskLevel = 'elevated'
			secretExposureReason = isTfvarsMatch
				? 'Terraform .tfvars may embed plaintext secrets or API tokens'
				: 'PEM bundle may contain unencrypted private key material'
		}
	}

	const isImmutableHelmChart = isHelmTgzMatch && !isExposedLocation
	const isMutableFile = MUTABLE_OR_SENSITIVE_EXT_RE.test(lowerBase) || !isImmutableHelmChart
	const isExpiredPlanMarker = isExpiredTfplan && (EXPIRED_PLAN_MARKER_RE.test(lower) || (ageDays !== null && ageDays >= 7))
	const iacTag = extractIacTag(lowerBase, lower)

	const vaultRole = isActiveTfstate
		? 'active-tfstate-anchor'
		: (isRedundantTfstateBackup
			? 'redundant-tfstate-backup'
			: (isExpiredTfplan
				? 'expired-tfplan-snapshot'
				: (isActiveCertOrKey
					? 'active-pki-or-kubeconfig'
					: (isHelmRelease
						? 'active-helm-release'
						: (hasSecretExposureRisk ? 'exposed-secret-copy' : 'iac-manifest-copy')))))

	return {
		family,
		artifactKind,
		vaultRole,
		normalized,
		lower,
		basename,
		lowerBase,
		dir,
		lowerDir,
		iacTool,
		iacEnvironment,
		iacLineageStem,
		stackFolder,
		iacTag,
		isActiveTfstate,
		isRedundantTfstateBackup,
		isExpiredTfplan,
		isExpiredPlanMarker,
		isHelmRelease,
		isActiveCertOrKey,
		isExposedLocation,
		isCanonicalVaultPath,
		hasSecretExposureRisk,
		secretRiskLevel,
		secretExposureReason,
		isImmutableHelmChart,
		isMutableFile,
		size: Number(file?.size) || 0,
		mtimeMs,
		ageDays,
		formattedMtime: formatFileModifiedTime(file),
	}
}

/**
 * Determine whether a duplicate group belongs to the Kubernetes, Terraform & IaC State Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file matches the domain.
 */
export function isK8sTerraformGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyK8sTerraformFile(file).family !== null)
}

/**
 * Build cross-vault correlation index linking .tfstate.backup and .tfplan artifacts
 * against active canonical .tfstate files and stack folders.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
function buildK8sTerraformCorrelationIndex(groups) {
	const activeStateStems = new Set()
	const activeStateStacks = new Set()
	const activeReleaseStems = new Set()
	const staleVariantsByStem = new Map()

	for (const group of groups) {
		for (const file of group.files || []) {
			const meta = classifyK8sTerraformFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isActiveTfstate) {
				activeStateStems.add(meta.iacLineageStem)
				if (meta.stackFolder) {
					activeStateStacks.add(meta.stackFolder)
				}
			}
			if (meta.isHelmRelease || meta.isActiveCertOrKey) {
				activeReleaseStems.add(meta.iacLineageStem)
			}
			if (meta.isRedundantTfstateBackup || meta.isExpiredTfplan || (meta.hasSecretExposureRisk && meta.isExposedLocation)) {
				staleVariantsByStem.set(
					meta.iacLineageStem,
					(staleVariantsByStem.get(meta.iacLineageStem) || 0) + 1
				)
			}
		}
	}

	return {
		activeStateStems,
		activeStateStacks,
		activeReleaseStems,
		staleVariantsByStem,
	}
}

/**
 * Resolve primary governance family of a cluster across its classified members.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'terraform-state-and-plans')) {
		return 'terraform-state-and-plans'
	}
	if (members.some(m => m.family === 'tls-certs-keys-kubeconfigs')) {
		return 'tls-certs-keys-kubeconfigs'
	}
	if (members.some(m => m.family === 'terraform-vars-and-secrets')) {
		return 'terraform-vars-and-secrets'
	}
	return 'helm-charts-and-k8s-manifests'
}

/**
 * Compute deterministic survivor priority score for a cluster member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor selection rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-vault-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isActiveTfstate ? 90000 : 0)
			+ (member.isActiveCertOrKey ? 80000 : 0)
			+ (member.isHelmRelease ? 70000 : 0)
			+ (member.isCanonicalVaultPath ? 20000 : 0)
			+ (member.isRedundantTfstateBackup || member.isExpiredTfplan || member.isExposedLocation ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-active-state') {
		return (member.isActiveTfstate ? 90000 : 0)
			+ (member.isActiveCertOrKey ? 80000 : 0)
			+ (member.isHelmRelease ? 70000 : 0)
			+ (member.isCanonicalVaultPath ? 20000 : 0)
			+ (member.isRedundantTfstateBackup || member.isExpiredTfplan || member.isExposedLocation ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isActiveTfstate ? 40000 : 0)
			+ (member.isExposedLocation || member.isRedundantTfstateBackup ? -5000 : 0)
			+ shortPathScore
	}

	return (member.isActiveTfstate ? 95000 : 0)
		+ (member.isActiveCertOrKey ? 85000 : 0)
		+ (member.isHelmRelease ? 75000 : 0)
		+ (member.isCanonicalVaultPath ? 20000 : 0)
		+ (member.isRedundantTfstateBackup ? -35000 : 0)
		+ (member.isExpiredTfplan ? -38000 : 0)
		+ (member.isExposedLocation ? -45000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Kubernetes, Terraform & IaC State Vault cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex IaC correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyK8sTerraformFile(file, referenceNowMs)
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
	const primaryTool = rawMembers.find(m => m.iacTool)?.iacTool || ''
	const primaryEnv = rawMembers.find(m => m.iacEnvironment)?.iacEnvironment || ''
	const primaryStem = rawMembers[0].iacLineageStem || extractK8sTerraformLineageStem(primaryName, rawMembers[0].normalized)
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

	const hasActiveStateAnchor = Boolean(
		survivor.isActiveTfstate
		|| correlationIndex.activeStateStems.has(primaryStem)
		|| rawMembers.some(m => m.stackFolder && correlationIndex.activeStateStacks.has(m.stackFolder))
	)

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'
		let governanceTier = 'iac-manifest-duplicate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isActiveTfstate
				? 'active-tfstate-protected'
				: (member.isActiveCertOrKey
					? 'active-cert-key-protected'
					: (member.isHelmRelease
						? 'helm-release-protected'
						: (member.hasSecretExposureRisk ? 'secret-exposure-risk' : 'iac-manifest-duplicate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isActiveTfstate && config.protectActiveTfstate) {
			governanceTier = 'active-tfstate-protected'
			shielded = true
			protectedReason = 'Active canonical Terraform state (.tfstate) strictly conserved'
		} else if (member.isActiveCertOrKey && config.protectActiveCertsAndKeys) {
			governanceTier = 'active-cert-key-protected'
			shielded = true
			protectedReason = 'Active certificate, private key, or kubeconfig strictly conserved'
		} else if (member.isHelmRelease && config.protectHelmReleases) {
			governanceTier = 'helm-release-protected'
			shielded = true
			protectedReason = 'Active Helm chart release strictly conserved'
		} else if (isSurvivor) {
			governanceTier = member.isActiveTfstate
				? 'active-tfstate-protected'
				: (member.isActiveCertOrKey
					? 'active-cert-key-protected'
					: (member.isHelmRelease
						? 'helm-release-protected'
						: (member.hasSecretExposureRisk
							? 'secret-exposure-risk'
							: (member.isRedundantTfstateBackup
								? 'redundant-tfstate-backup'
								: (member.isExpiredTfplan ? 'expired-tfplan-artifact' : 'iac-manifest-duplicate')))))
			shielded = true
			protectedReason = member.hasSecretExposureRisk
				? 'Canonical survivor retained; verify secret encryption/vaulting'
				: 'Canonical IaC or cluster vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantTfstateBackup
				? 'redundant-tfstate-backup'
				: (member.isExpiredTfplan
					? 'expired-tfplan-artifact'
					: (member.hasSecretExposureRisk ? 'secret-exposure-risk' : 'iac-manifest-duplicate'))
			action = config.strategy === 'hardlink-immutable-charts' && !member.isMutableFile && !member.hasSecretExposureRisk
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
		} else if (member.isActiveTfstate) {
			governanceTier = 'active-tfstate-protected'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		} else if (member.isActiveCertOrKey) {
			governanceTier = 'active-cert-key-protected'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		} else if (member.isHelmRelease) {
			governanceTier = 'helm-release-protected'
			action = config.strategy === 'hardlink-immutable-charts' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (
			config.keepRecentBackupDays > 0
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentBackupDays
			&& (member.isRedundantTfstateBackup || member.isExpiredTfplan)
		) {
			governanceTier = member.isExpiredTfplan ? 'expired-tfplan-artifact' : 'redundant-tfstate-backup'
			shielded = true
			protectedReason = `Within ${config.keepRecentBackupDays}-day Terraform backup/plan grace window`
		} else if (member.isRedundantTfstateBackup) {
			governanceTier = 'redundant-tfstate-backup'
			if (config.requireActiveStateAnchor && !hasActiveStateAnchor) {
				shielded = true
				protectedReason = 'Blocked until an active .tfstate anchor is verified for this stack'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
			}
		} else if (member.isExpiredTfplan) {
			governanceTier = 'expired-tfplan-artifact'
			if (config.requireActiveStateAnchor && !hasActiveStateAnchor) {
				shielded = true
				protectedReason = 'Blocked until an active .tfstate anchor is verified for this plan'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
			}
		} else if (member.hasSecretExposureRisk) {
			governanceTier = 'secret-exposure-risk'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Exposed or redundant secret copy flagged for quarantine/removal'
		} else if (config.strategy === 'hardlink-immutable-charts' && !member.isMutableFile) {
			governanceTier = 'iac-manifest-duplicate'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'iac-manifest-duplicate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasSecretExposureRisk = members.some(m => m.hasSecretExposureRisk)
	const hasCriticalSecretRisk = members.some(m => m.secretRiskLevel === 'critical')
	const maxSecretRiskLevel = hasCriticalSecretRisk ? 'critical' : (hasSecretExposureRisk ? 'elevated' : 'none')

	let clusterVerdict = 'iac-manifest-duplicate'
	if (members.some(m => m.governanceTier === 'active-tfstate-protected')) {
		clusterVerdict = 'active-tfstate-protected'
	} else if (members.some(m => m.governanceTier === 'active-cert-key-protected')) {
		clusterVerdict = 'active-cert-key-protected'
	} else if (members.some(m => m.governanceTier === 'helm-release-protected')) {
		clusterVerdict = 'helm-release-protected'
	} else if (members.some(m => m.governanceTier === 'secret-exposure-risk')) {
		clusterVerdict = 'secret-exposure-risk'
	} else if (members.some(m => m.governanceTier === 'redundant-tfstate-backup')) {
		clusterVerdict = 'redundant-tfstate-backup'
	} else if (members.some(m => m.governanceTier === 'expired-tfplan-artifact')) {
		clusterVerdict = 'expired-tfplan-artifact'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const iacTags = Array.from(new Set(members.map(m => m.iacTag).filter(Boolean)))
	const crossGroupStaleVariantsCount = correlationIndex.staleVariantsByStem.get(primaryStem) || 0

	const riskScore = (hasCriticalSecretRisk ? 125 : (hasSecretExposureRisk ? 110 : 0))
		+ (clusterVerdict === 'active-tfstate-protected' ? 100 : 0)
		+ (clusterVerdict === 'active-cert-key-protected' ? 95 : 0)
		+ (clusterVerdict === 'helm-release-protected' ? 90 : 0)
		+ (clusterVerdict === 'redundant-tfstate-backup' ? 80 : 0)
		+ (clusterVerdict === 'expired-tfplan-artifact' ? 75 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		iacTool: primaryTool,
		iacEnvironment: primaryEnv,
		iacLineageStem: primaryStem,
		family,
		familyLabel: K8S_TERRAFORM_FAMILY_META[family]?.label || family,
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
		hasActiveTfstate: members.some(m => m.governanceTier === 'active-tfstate-protected'),
		hasActiveCertOrKey: members.some(m => m.governanceTier === 'active-cert-key-protected'),
		hasHelmRelease: members.some(m => m.governanceTier === 'helm-release-protected'),
		hasRedundantTfstateBackup: members.some(m => m.isRedundantTfstateBackup),
		hasExpiredTfplan: members.some(m => m.isExpiredTfplan),
		hasSecretExposureRisk,
		maxSecretRiskLevel,
		hasActiveStateAnchor,
		crossGroupStaleVariantsCount,
		iacTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Kubernetes, Terraform & Infrastructure-as-Code State Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditK8sTerraformVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeK8sTerraformConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isK8sTerraformGroup)
	const correlationIndex = buildK8sTerraformCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'terraform-state-and-plans': 0,
		'terraform-vars-and-secrets': 0,
		'helm-charts-and-k8s-manifests': 0,
		'tls-certs-keys-kubeconfigs': 0,
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
		if (config.verdictFilter === 'secret-exposure-risk' && !cluster.hasSecretExposureRisk) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'secret-exposure-risk'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.iacLineageStem.toLowerCase().includes(query)
			const matchesTool = cluster.iacTool.toLowerCase().includes(query)
			const matchesEnv = cluster.iacEnvironment.toLowerCase().includes(query)
			const matchesTag = cluster.iacTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesTool && !matchesEnv && !matchesTag && !matchesMember) {
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
	let totalActiveStateClusters = 0
	let totalHelmReleaseClusters = 0
	let totalActiveCertKeyClusters = 0
	let totalStaleBackupPlanClusters = 0
	let totalSecretExposureClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasActiveTfstate) {
			totalActiveStateClusters += 1
		}
		if (cluster.hasHelmRelease) {
			totalHelmReleaseClusters += 1
		}
		if (cluster.hasActiveCertOrKey) {
			totalActiveCertKeyClusters += 1
		}
		if (cluster.hasRedundantTfstateBackup || cluster.hasExpiredTfplan) {
			totalStaleBackupPlanClusters += 1
		}
		if (cluster.hasSecretExposureRisk) {
			totalSecretExposureClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = K8S_TERRAFORM_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: K8S_TERRAFORM_FAMILY_META[id].label,
			shortLabel: K8S_TERRAFORM_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: K8S_TERRAFORM_VAULT_SCHEMA,
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
			totalActiveStateClusters,
			totalHelmReleaseClusters,
			totalActiveCertKeyClusters,
			totalStaleBackupPlanClusters,
			totalSecretExposureClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Kubernetes, Terraform & IaC vaults.
 * Strictly blocks deletion or hardlinking of shielded active .tfstate files, active Helm
 * chart releases, and canonical active certificates/keys, and never hardlinks mutable or secret files.
 *
 * @param {object} auditResult Result from auditK8sTerraformVault.
 * @return {string} POSIX bash script.
 */
export function buildK8sTerraformRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Kubernetes, Terraform & Infrastructure-as-Code State Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./k8s-terraform-vault-reclaim.sh only after verifying active .tfstate, Helm releases, and PKI vaults.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.iac-vault-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-backups-plans-and-leaks'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.hasSecretExposureRisk) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-stale-and-exposed' || target.hasSecretExposureRisk) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable .tfstate.backup, expired .tfplan, or exposed secret copies under active IaC vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Kubernetes & Terraform State Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditK8sTerraformVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildK8sTerraformCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'iac_tool',
		'iac_environment',
		'iac_lineage_stem',
		'family',
		'cluster_verdict',
		'secret_exposure_risk',
		'secret_risk_level',
		'member_path',
		'artifact_kind',
		'vault_role',
		'iac_tag',
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
				cluster.iacTool || '',
				cluster.iacEnvironment || '',
				cluster.iacLineageStem,
				cluster.family,
				cluster.clusterVerdict,
				member.hasSecretExposureRisk ? 'true' : 'false',
				member.secretRiskLevel || 'none',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.iacTag || '',
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
 * @param {object} auditResult Result from auditK8sTerraformVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildK8sTerraformJsonManifest(auditResult) {
	const payload = {
		schema: K8S_TERRAFORM_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || K8S_TERRAFORM_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			iacTool: cluster.iacTool,
			iacEnvironment: cluster.iacEnvironment,
			iacLineageStem: cluster.iacLineageStem,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasActiveTfstate: cluster.hasActiveTfstate,
			hasActiveCertOrKey: cluster.hasActiveCertOrKey,
			hasHelmRelease: cluster.hasHelmRelease,
			hasRedundantTfstateBackup: cluster.hasRedundantTfstateBackup,
			hasExpiredTfplan: cluster.hasExpiredTfplan,
			hasSecretExposureRisk: cluster.hasSecretExposureRisk,
			maxSecretRiskLevel: cluster.maxSecretRiskLevel,
			hasActiveStateAnchor: cluster.hasActiveStateAnchor,
			crossGroupStaleVariantsCount: cluster.crossGroupStaleVariantsCount,
			iacTags: cluster.iacTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				iacTag: member.iacTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				hasSecretExposureRisk: member.hasSecretExposureRisk,
				secretRiskLevel: member.secretRiskLevel,
				secretExposureReason: member.secretExposureReason || '',
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set to prevent accidental
 * cloud sync of Terraform state/plan/secret files, private keys, and Helm caches.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildK8sTerraformSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Terraform State, Plans, Secrets, Helm Caches & Kubeconfigs',
		'.terraform/',
		'*.tfstate',
		'*.tfstate.*',
		'*.tfplan',
		'*.tfplan.json',
		'tfplan',
		'*.tfvars',
		'*.tfvars.json',
		'*.auto.tfvars',
		'*.key',
		'*.pem',
		'*.kubeconfig',
		'kubeconfig',
		'.helm/cache/',
		'charts/*.tgz.part',
		'*.tmp',
	].join('\n')
}

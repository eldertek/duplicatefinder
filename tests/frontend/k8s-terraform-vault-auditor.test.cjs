const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Kubernetes, Terraform & IaC State Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadK8sTerraformVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/k8sTerraformVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load K8sTerraformVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadK8sTerraformVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const k8sTerraformVaultAuditor = loadModule('src/tools/k8sTerraformVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/K8sTerraformVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/k8sTerraformVaultAuditor': k8sTerraformVaultAuditor,
	})
}

/**
 * Build deterministic Kubernetes, Terraform & IaC State Vault duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleK8sTerraformDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1951,
			hash: 'hash-tfstate-active-and-backup',
			acknowledged: false,
			files: [
				{
					id: 19511,
					path: '/IaC_Vault/Terraform/prod/payments/terraform.tfstate',
					size: 12 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19512,
					path: '/IaC_Vault/Terraform/prod/payments/terraform.tfstate.backup',
					size: 12 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19513,
					path: '/Backups/tfstate-backups/payments/terraform.tfstate.backup',
					size: 12 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1952,
			hash: 'hash-tfstate-backup-mirror',
			acknowledged: false,
			files: [
				{
					id: 19521,
					path: '/IaC_Vault/Terraform/prod/payments/terraform.tfstate.1700000000.backup',
					size: 8 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19522,
					path: '/tmp/tfstate-backups/payments/terraform.tfstate.1700000000.backup',
					size: 8 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1953,
			hash: 'hash-tfplan-expired',
			acknowledged: false,
			files: [
				{
					id: 19531,
					path: '/CI_Artifacts/Terraform/payments/plan-expired-2024.tfplan',
					size: 18 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19532,
					path: '/Downloads/payments/plan-expired-2024.tfplan',
					size: 18 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1954,
			hash: 'hash-tfvars-secret-exposure',
			acknowledged: false,
			files: [
				{
					id: 19541,
					path: '/IaC_Vault/Terraform/prod/payments/prod.tfvars',
					size: 64 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19542,
					path: '/Downloads/prod.tfvars',
					size: 64 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1955,
			hash: 'hash-helm-chart-release-tgz',
			acknowledged: false,
			files: [
				{
					id: 19551,
					path: '/K8s_Vault/Helm/releases/ingress-nginx-4.10.0.tgz',
					size: 24 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19552,
					path: '/K8s_Vault/Helm/chart-repo/ingress-nginx-4.10.0.tgz',
					size: 24 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19553,
					path: '/tmp/helm-cache/ingress-nginx-4.10.0.tgz',
					size: 24 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1956,
			hash: 'hash-k8s-manifest-yaml',
			acknowledged: false,
			files: [
				{
					id: 19561,
					path: '/K8s_Vault/manifests/prod/deployment.yaml',
					size: 128 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19562,
					path: '/tmp/k8s-export/deployment.yaml',
					size: 128 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1957,
			hash: 'hash-tls-private-key-exposed',
			acknowledged: false,
			files: [
				{
					id: 19571,
					path: '/etc/kubernetes/pki/prod-apiserver.key',
					size: 4096,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19572,
					path: '/Downloads/prod-apiserver.key',
					size: 4096,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1958,
			hash: 'hash-kubeconfig-exposed',
			acknowledged: false,
			files: [
				{
					id: 19581,
					path: '/K8s_Vault/kubeconfigs/prod-eu-west.kubeconfig',
					size: 16 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19582,
					path: '/tmp/shared/prod-eu-west.kubeconfig',
					size: 16 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1959,
			hash: 'hash-tls-crt-pem-vault',
			acknowledged: false,
			files: [
				{
					id: 19591,
					path: '/K8s_Vault/pki/live/cluster-ca.pem',
					size: 8192,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19592,
					path: '/K8s_Vault/certs/cluster-ca.pem',
					size: 8192,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1950,
			hash: 'hash-non-iac-photo',
			acknowledged: false,
			files: [
				{
					id: 19501,
					path: '/Photos/vacation/config.yaml',
					size: 512 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19502,
					path: '/Photos/archive/family_bundle.tgz',
					size: 512 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 195: Kubernetes, Terraform & Infrastructure-as-Code State Vault Auditor', () => {
	test('classifies Terraform state/backups/plans, tfvars, Helm charts, K8s manifests, and PKI certs/keys while excluding unrelated files', () => {
		const {
			classifyK8sTerraformFile,
			isK8sTerraformGroup,
			extractIacToolAndEnv,
			extractK8sTerraformLineageStem,
		} = loadK8sTerraformVaultModule()

		const activeState = classifyK8sTerraformFile({ path: '/IaC_Vault/Terraform/prod/payments/terraform.tfstate', size: 1024 })
		assert.equal(activeState.family, 'terraform-state-and-plans')
		assert.equal(activeState.isActiveTfstate, true)
		assert.equal(activeState.isRedundantTfstateBackup, false)
		assert.equal(activeState.iacTool, 'Terraform')
		assert.equal(activeState.iacEnvironment, 'prod')

		const backupState = classifyK8sTerraformFile({ path: '/Backups/tfstate-backups/payments/terraform.tfstate.backup', size: 1024 })
		assert.equal(backupState.family, 'terraform-state-and-plans')
		assert.equal(backupState.isRedundantTfstateBackup, true)
		assert.equal(backupState.isActiveTfstate, false)
		assert.equal(backupState.iacLineageStem, activeState.iacLineageStem)

		const expiredPlan = classifyK8sTerraformFile({ path: '/CI_Artifacts/Terraform/payments/plan-expired-2024.tfplan', size: 1024 })
		assert.equal(expiredPlan.family, 'terraform-state-and-plans')
		assert.equal(expiredPlan.isExpiredTfplan, true)

		const exposedVars = classifyK8sTerraformFile({ path: '/Downloads/prod.tfvars', size: 1024 })
		assert.equal(exposedVars.family, 'terraform-vars-and-secrets')
		assert.equal(exposedVars.hasSecretExposureRisk, true)
		assert.equal(exposedVars.secretRiskLevel, 'critical')

		const safeVars = classifyK8sTerraformFile({ path: '/IaC_Vault/Terraform/prod/payments/prod.tfvars', size: 1024 })
		assert.equal(safeVars.family, 'terraform-vars-and-secrets')
		assert.equal(safeVars.hasSecretExposureRisk, true)
		assert.equal(safeVars.secretRiskLevel, 'elevated')

		const helmTgz = classifyK8sTerraformFile({ path: '/K8s_Vault/Helm/releases/ingress-nginx-4.10.0.tgz', size: 1024 })
		assert.equal(helmTgz.family, 'helm-charts-and-k8s-manifests')
		assert.equal(helmTgz.isHelmRelease, true)
		assert.equal(helmTgz.isImmutableHelmChart, true)
		assert.equal(helmTgz.isMutableFile, false)

		const privateKey = classifyK8sTerraformFile({ path: '/Downloads/prod-apiserver.key', size: 1024 })
		assert.equal(privateKey.family, 'tls-certs-keys-kubeconfigs')
		assert.equal(privateKey.hasSecretExposureRisk, true)
		assert.equal(privateKey.secretRiskLevel, 'critical')
		assert.equal(privateKey.isActiveCertOrKey, false)

		const activeKey = classifyK8sTerraformFile({ path: '/etc/kubernetes/pki/prod-apiserver.key', size: 1024 })
		assert.equal(activeKey.family, 'tls-certs-keys-kubeconfigs')
		assert.equal(activeKey.isActiveCertOrKey, true)
		assert.equal(activeKey.hasSecretExposureRisk, true)

		const nonIacYaml = classifyK8sTerraformFile({ path: '/Photos/vacation/config.yaml', size: 1024 })
		assert.equal(nonIacYaml.family, null)

		const nonIacTgz = classifyK8sTerraformFile({ path: '/Photos/archive/family_bundle.tgz', size: 1024 })
		assert.equal(nonIacTgz.family, null)

		assert.deepEqual(extractIacToolAndEnv('/K8s_Vault/Helm/staging/values.yaml', 'values.yaml'), {
			iacTool: 'Helm',
			iacEnvironment: 'staging',
		})
		assert.equal(
			extractK8sTerraformLineageStem('terraform.tfstate.1700000000.backup', '/Backups/tfstate-backups/payments/terraform.tfstate.1700000000.backup'),
			'payments_terraform'
		)

		const samples = buildSampleK8sTerraformDuplicates()
		assert.equal(isK8sTerraformGroup(samples[0]), true)
		assert.equal(isK8sTerraformGroup(samples[9]), false)
	})

	test('strictly conserves active .tfstate, Helm chart releases, and active PKI certs/keys while flagging secret exposure risks', () => {
		const { auditK8sTerraformVault } = loadK8sTerraformVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const result = auditK8sTerraformVault(buildSampleK8sTerraformDuplicates(nowMs), {}, nowMs)

		assert.equal(result.summary.totalDomainGroupsCount, 9)
		assert.equal(result.summary.totalClustersCount, 9)
		assert.equal(result.summary.totalActiveStateClusters, 1)
		assert.equal(result.summary.totalHelmReleaseClusters, 1)
		assert.equal(result.summary.totalActiveCertKeyClusters, 3)
		assert.equal(result.summary.totalSecretExposureClusters, 4)

		const stateCluster = result.clusters.find(c => c.id === 1951)
		assert.ok(stateCluster)
		assert.equal(stateCluster.clusterVerdict, 'active-tfstate-protected')
		const activeMember = stateCluster.members.find(m => m.normalized.endsWith('/terraform.tfstate'))
		assert.equal(activeMember.shielded, true)
		assert.equal(activeMember.action, 'keep')
		const backupMembers = stateCluster.members.filter(m => m.isRedundantTfstateBackup)
		assert.equal(backupMembers.length, 2)
		assert.equal(backupMembers.every(m => m.action === 'delete' && !m.shielded), true)

		const helmCluster = result.clusters.find(c => c.id === 1955)
		assert.ok(helmCluster)
		const releaseCopies = helmCluster.members.filter(m => m.isHelmRelease)
		assert.equal(releaseCopies.length, 2)
		assert.equal(releaseCopies.every(m => m.shielded && m.action === 'keep'), true)
		const cachedHelmCopy = helmCluster.members.find(m => m.normalized.includes('/tmp/helm-cache/'))
		assert.equal(cachedHelmCopy.action, 'delete')

		const pkiCluster = result.clusters.find(c => c.id === 1959)
		assert.ok(pkiCluster)
		assert.equal(pkiCluster.hasReclaimable, false)
		assert.equal(pkiCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const leakedKeyCluster = result.clusters.find(c => c.id === 1957)
		assert.ok(leakedKeyCluster)
		assert.equal(leakedKeyCluster.hasSecretExposureRisk, true)
		assert.equal(leakedKeyCluster.maxSecretRiskLevel, 'critical')
		const canonicalKey = leakedKeyCluster.members.find(m => m.normalized.startsWith('/etc/kubernetes/pki/'))
		const leakedKey = leakedKeyCluster.members.find(m => m.normalized.startsWith('/Downloads/'))
		assert.equal(canonicalKey.shielded, true)
		assert.equal(canonicalKey.action, 'keep')
		assert.equal(leakedKey.shielded, false)
		assert.equal(leakedKey.action, 'delete')
	})

	test('enforces active .tfstate anchor guard and blocks hardlinking on mutable state/secret files', () => {
		const {
			auditK8sTerraformVault,
			buildK8sTerraformRemediationScript,
		} = loadK8sTerraformVaultModule()

		const orphanPlanGroup = [
			{
				id: 9901,
				hash: 'hash-orphan-tfplan',
				files: [
					{ id: 99011, path: '/CI_Artifacts/network/plan-orphan.tfplan', size: 1024 * 1024, mtime: 1700000000 },
					{ id: 99012, path: '/Downloads/network/plan-orphan.tfplan', size: 1024 * 1024, mtime: 1700000000 },
				],
			},
		]

		const guarded = auditK8sTerraformVault(orphanPlanGroup, { requireActiveStateAnchor: true })
		assert.equal(guarded.clusters[0].hasActiveStateAnchor, false)
		assert.equal(guarded.clusters[0].hasReclaimable, false)
		assert.equal(guarded.clusters[0].members.every(m => m.shielded), true)

		const unguarded = auditK8sTerraformVault(orphanPlanGroup, { requireActiveStateAnchor: false })
		assert.equal(unguarded.clusters[0].hasReclaimable, true)

		const hardlinkAudit = auditK8sTerraformVault(buildSampleK8sTerraformDuplicates(), {
			strategy: 'hardlink-immutable-charts',
			protectHelmReleases: false,
		})
		const hardlinkScript = buildK8sTerraformRemediationScript(hardlinkAudit)
		assert.match(hardlinkScript, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(hardlinkScript, /run_cmd ln -f '[^']*ingress-nginx-4\.10\.0\.tgz' '[^']*ingress-nginx-4\.10\.0\.tgz'/)
		assert.equal(/run_cmd ln -f[^\n]*\.(?:tfstate|tfplan|tfvars|yaml|key|pem|kubeconfig)/.test(hardlinkScript), false)
		assert.equal(/run_cmd rm -f[^\n]*\/IaC_Vault\/Terraform\/prod\/payments\/terraform\.tfstate'/.test(hardlinkScript), false)
	})

	test('generates CWE-1236-safe CSV, deterministic JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			auditK8sTerraformVault,
			buildK8sTerraformCsvReport,
			buildK8sTerraformJsonManifest,
			buildK8sTerraformSyncExcludeList,
		} = loadK8sTerraformVaultModule()

		const adversarial = [
			{
				id: '=CMD("calc")',
				hash: 'hash-cwe1236',
				files: [
					{ id: 1, path: '/IaC_Vault/Terraform/prod/+formula/terraform.tfstate', size: 2048 },
					{ id: 2, path: '/Downloads/@evil/terraform.tfstate.backup', size: 2048 },
				],
			},
		]

		const audit = auditK8sTerraformVault(adversarial, { requireActiveStateAnchor: false })
		const csv = buildK8sTerraformCsvReport(audit)
		assert.ok(csv.includes('secret_exposure_risk,secret_risk_level'))
		assert.ok(csv.includes("'=CMD"))

		const manifest = JSON.parse(buildK8sTerraformJsonManifest(audit))
		assert.equal(manifest.schema, 'duplicatefinder.k8s-terraform-vault-auditor.v1')
		assert.equal(manifest.clusters.length, 1)

		const syncExclude = buildK8sTerraformSyncExcludeList()
		assert.ok(syncExclude.includes('.terraform/'))
		assert.ok(syncExclude.includes('*.tfstate'))
		assert.ok(syncExclude.includes('*.tfplan'))
		assert.ok(syncExclude.includes('*.tfvars'))
		assert.ok(syncExclude.includes('*.kubeconfig'))
	})

	test('K8sTerraformVaultWorkbench renders empty state, populated security badges, filters, and clipboard/triage actions', async () => {
		const copied = []
		const Workbench = loadK8sTerraformVaultWorkbench(copied)

		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(emptyNode)

		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.ktv__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const events = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleK8sTerraformDuplicates(),
					allDuplicates: buildSampleK8sTerraformDuplicates(),
				},
				on: {
					'select-duplicate': d => events.push(['select', d.id]),
					'compare-duplicate': d => events.push(['compare', d.id]),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const cards = vm.$el.querySelectorAll('.ktv__cluster-card')
			assert.equal(cards.length, 9)

			const securityBadges = vm.$el.querySelectorAll('.ktv__badge.is-security')
			assert.ok(securityBadges.length >= 4, 'Security exposure badges must render on exposed secret clusters')

			const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.match(copied[0], /DRY_RUN/)

			const syncBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			syncBtn.click()
			await settle()
			assert.equal(copied.length, 2)
			assert.ok(copied[1].includes('*.tfstate'))

			const triageBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Open in Triage'))
			triageBtn.click()
			const compareBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Side-by-Side'))
			compareBtn.click()
			await settle()
			assert.equal(events.length, 2)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders K8s & Terraform Vault button and toggles K8sTerraformVaultWorkbench via Shift+F2 shortcut', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const icon = { render: h => h('span') }
		const slotBox = tag => ({
			render(h) {
				return h(tag, {}, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})

		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: slotBox('div') },
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: { render(h) { return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default) } },
				NcAppNavigationItem: slotBox('div'),
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
			'./SearchBar.vue': { __esModule: true, default: SearchBar },
			'vue-material-design-icons/CloseCircle': icon,
			'vue-material-design-icons/CheckCircle': icon,
			'vue-material-design-icons/Cog': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/HelpCircle': icon,
			'vue-material-design-icons/School': icon,
			'vue-material-design-icons/PlayCircle': icon,
			'vue-material-design-icons/FrequentlyAskedQuestions': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/FolderCog': icon,
			'vue-material-design-icons/Folder': icon,
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': loadModule('src/tools/duplicateTreemap.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
				'./duplicateStats': statsModule,
			}),
		})

		const K8sTerraformVaultWorkbench = loadK8sTerraformVaultWorkbench()

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('quarantine') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: stub('ml-checkpoint-vault-auditor') },
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: stub('db-sql-log-vault-auditor') },
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: K8sTerraformVaultWorkbench },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: stub('energy-seismic-vault-auditor') },
			'./components/FiberTelecomRfVaultWorkbench.vue': { __esModule: true, default: stub('fiber-telecom-rf-vault-auditor') },
			'./components/GeotechShmCivilVaultWorkbench.vue': { __esModule: true, default: stub('geotech-shm-civil-vault-auditor') },
			'./components/HydrographyMarineVaultWorkbench.vue': { __esModule: true, default: stub('hydrography-marine-vault-auditor') },
			'./components/AstronomyFitsInterferometryVaultWorkbench.vue': { __esModule: true, default: stub('astronomy-fits-interferometry-vault-auditor') },
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: stub('meteorology-climate-vault-auditor') },
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
			'./components/VeterinaryEquineGenomicsVaultWorkbench.vue': { __esModule: true, default: stub('veterinary-equine-genomics-vault-auditor') },
			'./components/WineEnologyHaccpVaultWorkbench.vue': { __esModule: true, default: stub('wine-enology-haccp-vault-auditor') },
			'./components/XrSpatialNerfSplatVaultWorkbench.vue': { __esModule: true, default: stub('xr-spatial-nerf-splat-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleK8sTerraformDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 10, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()

			const btn = vm.$el.querySelector('button.topbar-k8s-terraform-vault-button')
			assert.ok(btn, 'K8s & Terraform Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F2')
			assert.equal(vm.$el.querySelector('.k8s-terraform-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.k8s-terraform-vault-workbench'), 'K8sTerraformVaultWorkbench must open on Shift+F2 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.k8s-terraform-vault-workbench'), null, 'K8sTerraformVaultWorkbench must toggle closed on Shift+F2 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Kubernetes, Terraform & IaC State Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/k8sTerraformVaultAuditor.js',
			'src/components/K8sTerraformVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadVideoModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const filters = loadModule('src/tools/duplicateFilters.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const visualMedia = loadModule('src/tools/visualMediaInspector.js')
	const mediaContent = loadModule('src/tools/mediaContentInspector.js', {
		'./visualMediaInspector': visualMedia,
	})
	const videoInspector = loadModule('src/tools/videoSceneInspector.js', {
		'./duplicateStats': stats,
		'./duplicateFilters': filters,
		'./duplicateSelectionAndExport': selectionAndExport,
		'./visualMediaInspector': visualMedia,
		'./mediaContentInspector': mediaContent,
	})
	return { stats, filters, selectionAndExport, visualMedia, mediaContent, videoInspector }
}

function loadWorkbenchComponent(deps, overrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboard = overrides.clipboard || loadModule('src/tools/clipboardHelper.js')
	return loadComponent('src/components/VideoSceneWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [] }),
			...(overrides.api || {}),
		},
		'../tools/clipboardHelper': clipboard,
		'../tools/duplicateSelectionAndExport': deps.selectionAndExport,
		'../tools/duplicateStats': deps.stats,
		'../tools/mediaContentInspector': deps.mediaContent,
		'../tools/utils': utils,
		'../tools/videoSceneInspector': deps.videoInspector,
	})
}

/**
 * Build a minimal ISO BMFF (MP4) box buffer with mvhd, tkhd, hdlr, mdhd, stsd, stts.
 */
function buildMp4Box(type, payload) {
	const buf = new Uint8Array(8 + payload.length)
	const view = new DataView(buf.buffer)
	view.setUint32(0, buf.length, false)
	for (let i = 0; i < 4; i += 1) {
		buf[4 + i] = type.charCodeAt(i)
	}
	buf.set(payload, 8)
	return buf
}

function concatBytes(...chunks) {
	const total = chunks.reduce((sum, c) => sum + c.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.length
	}
	return out
}

function buildSyntheticMp4({
	width = 1920,
	height = 1080,
	durationSeconds = 42,
	codec = 'hvc1',
	fps = 60,
	audioCodec = 'mp4a',
} = {}) {
	const ftypPayload = new Uint8Array(8)
	ftypPayload.set([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]) // isom
	const ftyp = buildMp4Box('ftyp', ftypPayload)

	const mvhdPayload = new Uint8Array(24)
	const mvhdView = new DataView(mvhdPayload.buffer)
	mvhdView.setUint32(12, 1000, false) // timescale
	mvhdView.setUint32(16, Math.round(durationSeconds * 1000), false)
	const mvhd = buildMp4Box('mvhd', mvhdPayload)

	const tkhdPayload = new Uint8Array(84)
	const tkhdView = new DataView(tkhdPayload.buffer)
	tkhdView.setUint32(76, width << 16, false)
	tkhdView.setUint32(80, height << 16, false)
	const tkhd = buildMp4Box('tkhd', tkhdPayload)

	const hdlrPayload = new Uint8Array(16)
	'vide'.split('').forEach((ch, idx) => { hdlrPayload[8 + idx] = ch.charCodeAt(0) })
	const hdlr = buildMp4Box('hdlr', hdlrPayload)

	const mdhdPayload = new Uint8Array(20)
	const mdhdView = new DataView(mdhdPayload.buffer)
	mdhdView.setUint32(12, 60000, false)
	const mdhd = buildMp4Box('mdhd', mdhdPayload)

	const stsdPayload = new Uint8Array(24)
	codec.split('').forEach((ch, idx) => { stsdPayload[12 + idx] = ch.charCodeAt(0) })
	const stsd = buildMp4Box('stsd', stsdPayload)

	const sttsPayload = new Uint8Array(16)
	const sttsView = new DataView(sttsPayload.buffer)
	sttsView.setUint32(4, 1, false)
	sttsView.setUint32(8, 100, false)
	sttsView.setUint32(12, Math.round(60000 / fps), false)
	const stts = buildMp4Box('stts', sttsPayload)

	const stbl = buildMp4Box('stbl', concatBytes(stsd, stts))
	const minf = buildMp4Box('minf', stbl)
	const mdia = buildMp4Box('mdia', concatBytes(mdhd, hdlr, minf))
	const videoTrak = buildMp4Box('trak', concatBytes(tkhd, mdia))

	const audioStsdPayload = new Uint8Array(24)
	audioCodec.split('').forEach((ch, idx) => { audioStsdPayload[12 + idx] = ch.charCodeAt(0) })
	const audioStsd = buildMp4Box('stsd', audioStsdPayload)
	const audioTrak = buildMp4Box('trak', buildMp4Box('mdia', buildMp4Box('minf', buildMp4Box('stbl', audioStsd))))

	const moov = buildMp4Box('moov', concatBytes(mvhd, videoTrak, audioTrak))
	return concatBytes(ftyp, moov)
}

function buildEbmlElement(idBytes, payload) {
	const len = payload.length
	let sizeHeader
	if (len < 127) {
		sizeHeader = new Uint8Array([0x80 | len])
	} else {
		sizeHeader = new Uint8Array([0x40 | ((len >> 8) & 0x3f), len & 0xff])
	}
	return concatBytes(new Uint8Array(idBytes), sizeHeader, payload)
}

function buildSyntheticWebm({
	width = 3840,
	height = 2160,
	durationSeconds = 90,
	fps = 30,
	codecId = 'V_VP9',
} = {}) {
	const docTypeBytes = new Uint8Array(codecId ? 4 : 4)
	'webm'.split('').forEach((ch, i) => { docTypeBytes[i] = ch.charCodeAt(0) })
	const ebmlHeader = buildEbmlElement([0x1a, 0x45, 0xdf, 0xa3], buildEbmlElement([0x42, 0x82], docTypeBytes))

	const scaleBytes = new Uint8Array(4)
	new DataView(scaleBytes.buffer).setUint32(0, 1000000, false) // 1ms ticks
	const durBytes = new Uint8Array(8)
	new DataView(durBytes.buffer).setFloat64(0, durationSeconds * 1000, false)
	const info = buildEbmlElement([0x15, 0x49, 0xa9, 0x66], concatBytes(
		buildEbmlElement([0x2a, 0xd7, 0xb1], scaleBytes),
		buildEbmlElement([0x44, 0x89], durBytes),
	))

	const trackType = buildEbmlElement([0x83], new Uint8Array([1]))
	const codecBytes = new Uint8Array(codecId.length)
	for (let i = 0; i < codecId.length; i += 1) {
		codecBytes[i] = codecId.charCodeAt(i)
	}
	const codecEl = buildEbmlElement([0x86], codecBytes)
	const defDurBytes = new Uint8Array(4)
	new DataView(defDurBytes.buffer).setUint32(0, Math.round(1000000000 / fps), false)
	const defDurEl = buildEbmlElement([0x23, 0xe3, 0x83], defDurBytes)

	const wBytes = new Uint8Array(2)
	new DataView(wBytes.buffer).setUint16(0, width, false)
	const hBytes = new Uint8Array(2)
	new DataView(hBytes.buffer).setUint16(0, height, false)
	const videoEl = buildEbmlElement([0xe0], concatBytes(
		buildEbmlElement([0xb0], wBytes),
		buildEbmlElement([0xba], hBytes),
	))
	const trackEntry = buildEbmlElement([0xae], concatBytes(trackType, codecEl, defDurEl, videoEl))
	const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry)

	const segment = buildEbmlElement([0x18, 0x53, 0x80, 0x67], concatBytes(info, tracks))
	return concatBytes(ebmlHeader, segment)
}

function buildSyntheticAvi({
	width = 1280,
	height = 720,
	fps = 25,
	durationSeconds = 20,
	codec = 'H264',
	maxBytesPerSec = 400000,
} = {}) {
	const avihPayload = new Uint8Array(56)
	const avihView = new DataView(avihPayload.buffer)
	const microsecPerFrame = Math.round(1000000 / fps)
	avihView.setUint32(0, microsecPerFrame, true)
	avihView.setUint32(4, maxBytesPerSec, true)
	avihView.setUint32(16, durationSeconds * fps, true)
	avihView.setUint32(32, width, true)
	avihView.setUint32(36, height, true)

	const strhPayload = new Uint8Array(16)
	'vids'.split('').forEach((ch, i) => { strhPayload[i] = ch.charCodeAt(0) })
	codec.split('').forEach((ch, i) => { strhPayload[4 + i] = ch.charCodeAt(0) })

	const makeChunk = (id, payload) => {
		const out = new Uint8Array(8 + payload.length)
		for (let i = 0; i < 4; i += 1) {
			out[i] = id.charCodeAt(i)
		}
		new DataView(out.buffer).setUint32(4, payload.length, true)
		out.set(payload, 8)
		return out
	}

	const avih = makeChunk('avih', avihPayload)
	const strh = makeChunk('strh', strhPayload)
	const strlPayload = concatBytes(new Uint8Array([0x73, 0x74, 0x72, 0x6c]), strh) // strl
	const strl = makeChunk('LIST', strlPayload)
	const hdrlPayload = concatBytes(new Uint8Array([0x68, 0x64, 0x72, 0x6c]), avih, strl) // hdrl
	const hdrl = makeChunk('LIST', hdrlPayload)
	const riffBody = concatBytes(new Uint8Array([0x41, 0x56, 0x49, 0x20]), hdrl) // 'AVI '
	return makeChunk('RIFF', riffBody)
}

function makePatternRgba(width, height, variant = 'gradient-a') {
	const rgba = new Uint8ClampedArray(width * height * 4)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const idx = (y * width + x) * 4
			let val = 0
			if (variant === 'black') {
				val = 4
			} else if (variant === 'gradient-a') {
				val = Math.round(((x / width) * 200) + ((y / height) * 40))
			} else if (variant === 'gradient-a-reencode') {
				val = Math.min(255, Math.round(((x / width) * 195) + ((y / height) * 42) + 3))
			} else {
				val = Math.round((((width - x) / width) * 210) + ((y / height) * 30))
			}
			rgba[idx] = val
			rgba[idx + 1] = val
			rgba[idx + 2] = val
			rgba[idx + 3] = 255
		}
	}
	return rgba
}

describe('Cycle 132: Video Scene Perceptual Fingerprint, Codec Quality & Duration Tolerance Workbench', () => {
	test('parseVideoContainerMetadata parses MP4/MOV, WebM/MKV EBML, RIFF AVI, and filename hints safely', () => {
		const { videoInspector } = loadVideoModules()

		const mp4Bytes = buildSyntheticMp4({
			width: 1920,
			height: 1080,
			durationSeconds: 45,
			codec: 'hvc1',
			fps: 60,
			audioCodec: 'mp4a',
		})
		const mp4Meta = videoInspector.parseVideoContainerMetadata(mp4Bytes, {
			path: '/Videos/Holiday_Master.mp4',
			size: 45 * 1000 * 1000,
		})
		assert.equal(mp4Meta.container, 'MP4')
		assert.equal(mp4Meta.width, 1920)
		assert.equal(mp4Meta.height, 1080)
		assert.equal(mp4Meta.videoCodec, 'HEVC')
		assert.equal(mp4Meta.audioCodec, 'AAC')
		assert.equal(mp4Meta.fps, 60)
		assert.equal(mp4Meta.durationSeconds, 45)
		assert.equal(mp4Meta.bitrateKbps, 8000)
		assert.equal(mp4Meta.resolutionTier.id, '1080p')
		assert.equal(mp4Meta.aspectRatio, '16:9')
		assert.equal(mp4Meta.metadataSource, 'container')
		assert.ok(mp4Meta.qualityScore >= 75)

		const webmBytes = buildSyntheticWebm({
			width: 3840,
			height: 2160,
			durationSeconds: 90,
			fps: 30,
			codecId: 'V_VP9',
		})
		const webmMeta = videoInspector.parseVideoContainerMetadata(webmBytes, {
			path: '/Videos/Drone_4K.webm',
			size: 180 * 1000 * 1000,
		})
		assert.equal(webmMeta.container, 'WebM')
		assert.equal(webmMeta.width, 3840)
		assert.equal(webmMeta.height, 2160)
		assert.equal(webmMeta.videoCodec, 'VP9')
		assert.equal(webmMeta.fps, 30)
		assert.equal(webmMeta.durationSeconds, 90)
		assert.equal(webmMeta.resolutionTier.id, '4k')

		const aviBytes = buildSyntheticAvi({
			width: 1280,
			height: 720,
			fps: 25,
			durationSeconds: 20,
			codec: 'H264',
			maxBytesPerSec: 400000,
		})
		const aviMeta = videoInspector.parseVideoContainerMetadata(aviBytes, {
			path: '/Videos/Archive_Clip.avi',
			size: 8 * 1000 * 1000,
		})
		assert.equal(aviMeta.container, 'AVI')
		assert.equal(aviMeta.width, 1280)
		assert.equal(aviMeta.height, 720)
		assert.equal(aviMeta.videoCodec, 'H.264')
		assert.equal(aviMeta.fps, 25)
		assert.equal(aviMeta.durationSeconds, 20)
		assert.equal(aviMeta.resolutionTier.id, '720p')

		const hintMeta = videoInspector.parseVideoContainerMetadata(new Uint8Array([0xff, 0x00, 0x11]), {
			path: '/Videos/Concert_1080p_x265_60fps.mkv',
			size: 1024,
		})
		assert.equal(hintMeta.width, 1920)
		assert.equal(hintMeta.height, 1080)
		assert.equal(hintMeta.videoCodec, 'HEVC')
		assert.equal(hintMeta.fps, 60)
		assert.equal(hintMeta.metadataSource, 'filename-hint')
		assert.equal(hintMeta.inspected, false)
	})

	test('buildKeyframeSample, detectBlankVideoFrame, compareVideoFrameStrips, and isDurationWithinTolerance handle scene matching & trimmed subclips', () => {
		const { videoInspector } = loadVideoModules()

		const blackRgba = makePatternRgba(36, 24, 'black')
		assert.equal(videoInspector.detectBlankVideoFrame(blackRgba, 36, 24), true)

		const sceneA = makePatternRgba(36, 24, 'gradient-a')
		const sceneAReencode = makePatternRgba(24, 16, 'gradient-a-reencode')
		const sceneB = makePatternRgba(36, 24, 'gradient-b')

		const framesMaster = [
			videoInspector.buildKeyframeSample(blackRgba, 36, 24, 0.1, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.3, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.5, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.7, 100),
		]
		assert.equal(framesMaster[0].isBlank, true)
		assert.equal(framesMaster[1].isBlank, false)

		const framesReencode = [
			videoInspector.buildKeyframeSample(blackRgba, 24, 16, 0.1, 98),
			videoInspector.buildKeyframeSample(sceneAReencode, 24, 16, 0.3, 98),
			videoInspector.buildKeyframeSample(sceneAReencode, 24, 16, 0.5, 98),
			videoInspector.buildKeyframeSample(sceneAReencode, 24, 16, 0.7, 98),
		]
		const matchResult = videoInspector.compareVideoFrameStrips(framesMaster, framesReencode, {
			similarityThreshold: 85,
		})
		assert.equal(matchResult.comparable, true)
		assert.ok(matchResult.overallSimilarityPercent >= 90)
		assert.ok(matchResult.classification === 'exact-visual' || matchResult.classification === 're-encode-match')

		const framesDifferent = [
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.1, 100),
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.3, 100),
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.5, 100),
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.7, 100),
		]
		const diffResult = videoInspector.compareVideoFrameStrips(framesMaster, framesDifferent, {
			similarityThreshold: 85,
		})
		assert.equal(diffResult.classification, 'different-scene')
		assert.ok(diffResult.overallSimilarityPercent < 50)

		const trimmedA = [
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.1, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.3, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.5, 100),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.7, 100),
		]
		const trimmedB = [
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.1, 95),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.3, 95),
			videoInspector.buildKeyframeSample(sceneA, 36, 24, 0.5, 95),
			videoInspector.buildKeyframeSample(sceneB, 36, 24, 0.7, 95),
		]
		const trimmedResult = videoInspector.compareVideoFrameStrips(trimmedA, trimmedB, {
			similarityThreshold: 85,
		})
		assert.equal(trimmedResult.bestShift, -1)
		assert.equal(trimmedResult.classification, 'trimmed-subclip')

		const tolOk = videoInspector.isDurationWithinTolerance(100, 96, 5)
		assert.equal(tolOk.withinTolerance, true)
		assert.equal(tolOk.driftSeconds, 4)
		assert.equal(tolOk.driftPercent, 4)

		const tolFail = videoInspector.isDurationWithinTolerance(100, 88, 5)
		assert.equal(tolFail.withinTolerance, false)
	})

	test('analyzeVideoCatalog evaluates survivor rules, duration-tolerance cross matches, filtering, and CWE-1236-safe CSV/JSON export', () => {
		const { videoInspector } = loadVideoModules()

		const kf = videoInspector.buildKeyframeSample(makePatternRgba(36, 24, 'gradient-a'), 36, 24, 0.5, 120)
		const duplicates = [
			{
				id: 101,
				hash: 'vid-hash-101',
				files: [
					{
						id: 1,
						path: '/Origin/Drone_Mountain_4K.mp4',
						size: 400 * 1024 * 1024,
						mtime: 1700000100,
						isProtectedOrigin: true,
						videoMetadata: {
							container: 'MP4',
							width: 3840,
							height: 2160,
							durationSeconds: 120,
							videoCodec: 'HEVC',
							audioCodec: 'AAC',
							fps: 60,
						},
						keyframes: [kf],
					},
					{
						id: 2,
						path: '/Exports/Drone_Mountain_480p.mp4',
						size: 45 * 1024 * 1024,
						mtime: 1700000500,
						isProtectedOrigin: false,
						videoMetadata: {
							container: 'MP4',
							width: 854,
							height: 480,
							durationSeconds: 120,
							videoCodec: 'H.264',
							fps: 30,
						},
						keyframes: [kf],
					},
				],
			},
			{
				id: 102,
				hash: 'vid-hash-102',
				files: [
					{
						id: 3,
						path: '/Mobile/=EVIL_FORMULA_CLIP.webm',
						size: 32 * 1024 * 1024,
						mtime: 1700000800,
						videoMetadata: {
							container: 'WebM',
							width: 1280,
							height: 720,
							durationSeconds: 117,
							videoCodec: 'VP9',
							fps: 30,
						},
						keyframes: [kf],
					},
					{
						id: 4,
						path: '/Mobile/Copy_Clip.webm',
						size: 30 * 1024 * 1024,
						mtime: 1700000900,
						videoMetadata: {
							container: 'WebM',
							width: 1280,
							height: 720,
							durationSeconds: 117,
							videoCodec: 'VP9',
							fps: 30,
						},
						keyframes: [kf],
					},
				],
			},
			{
				id: 103,
				hash: 'non-video-group',
				files: [
					{ id: 5, path: '/Docs/readme.txt', size: 1200 },
					{ id: 6, path: '/Docs/readme-copy.txt', size: 1200 },
				],
			},
		]

		const catalog = videoInspector.analyzeVideoCatalog(duplicates, {
			keepRule: 'balanced_master',
			durationTolerancePct: 5,
			similarityThreshold: 85,
		})

		assert.equal(catalog.schema, videoInspector.VIDEO_INSPECTOR_SCHEMA)
		assert.equal(catalog.summary.totalVideoGroups, 2)
		assert.equal(catalog.summary.totalVideoFiles, 4)
		assert.equal(catalog.summary.durationMatchAlertsCount, 2)

		const group101 = catalog.groups.find(g => g.groupId === 101)
		assert.ok(group101)
		assert.equal(group101.survivors[0].id, 1)
		assert.equal(group101.deletionCandidates[0].id, 2)
		assert.equal(group101.hasResolutionMismatch, true)
		assert.equal(group101.hasCodecMismatch, true)
		assert.equal(group101.hasLowRes, true)
		assert.equal(group101.crossGroupMatches.length, 1)
		assert.equal(group101.crossGroupMatches[0].targetGroupId, 102)

		const filteredResGap = videoInspector.filterAndSortVideoGroups(catalog.groups, {
			category: 'resolution-mismatch',
		})
		assert.equal(filteredResGap.length, 1)
		assert.equal(filteredResGap[0].groupId, 101)

		const csv = videoInspector.exportVideoAuditCsv(catalog)
		assert.ok(csv.includes('"' + "'=EVIL_FORMULA_CLIP.webm" + '"') || csv.includes("'=EVIL_FORMULA_CLIP.webm"))
		const json = JSON.parse(videoInspector.exportVideoAuditJson(catalog))
		assert.equal(json.schema, videoInspector.VIDEO_INSPECTOR_SCHEMA)
		assert.equal(json.groups.length, 2)
	})

	test('VideoSceneWorkbench.vue renders empty, populated, non-clamping inputs, probing, copy sheet, delete dialog, and XSS defense', async () => {
		const deps = loadVideoModules()
		const deletedBatches = []
		const copiedPayloads = []
		const Component = loadWorkbenchComponent(deps, {
			api: {
				deleteFiles: async files => {
					deletedBatches.push(files)
					return { success: files, deletedNodeIds: [] }
				},
			},
			clipboard: {
				copyTextSafely: async text => {
					copiedPayloads.push(text)
					return true
				},
			},
		})

		const emptyVm = new Vue({
			...Component,
			propsData: { duplicates: [], allDuplicates: [] },
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		let scanTriggered = false
		emptyVm.$on('start-scan', () => { scanTriggered = true })
		emptyVm.$el.querySelector('.video-workbench__primary-btn').click()
		assert.equal(scanTriggered, true)
		emptyVm.$destroy()

		const mp4Bytes = buildSyntheticMp4({
			width: 1920,
			height: 1080,
			durationSeconds: 30,
			codec: 'hvc1',
			fps: 60,
		})
		const xssPath = '/Videos/<img src=x onerror=alert(1)>_Clip.mp4'
		const dupList = [
			{
				id: 501,
				hash: 'vid-501',
				files: [
					{
						id: 11,
						path: xssPath,
						size: 30 * 1024 * 1024,
						mtime: 1700000100,
						videoBuffer: mp4Bytes,
					},
					{
						id: 12,
						path: '/Videos/Copy_Low.mp4',
						size: 12 * 1024 * 1024,
						mtime: 1700000200,
						videoMetadata: {
							container: 'MP4',
							width: 854,
							height: 480,
							durationSeconds: 30,
							videoCodec: 'H.264',
							fps: 30,
						},
					},
				],
			},
		]

		const vm = new Vue({
			...Component,
			propsData: {
				duplicates: dupList,
				allDuplicates: dupList,
				currentDuplicateId: 501,
			},
		}).$mount()
		await settle()

		// XSS check: literal path rendered as text, zero injected <img> elements from filename
		assert.equal(vm.$el.querySelectorAll('img[onerror]').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>_Clip.mp4'))

		// Non-clamping numeric tolerance draft while typing
		const numInputs = vm.$el.querySelectorAll('.video-workbench__number-input')
		assert.equal(numInputs.length, 2)
		const tolInput = numInputs[0]
		tolInput.value = ''
		tolInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(vm.durationToleranceDraft, '', 'Draft should not be reset mid-keystroke')
		tolInput.value = '12'
		tolInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(vm.durationTolerancePct, 12)

		// Probe headers from videoBuffer
		await vm.probeVideoGroup(vm.activeGroup)
		await settle()
		assert.ok(vm.$el.textContent.includes('1920x1080'))
		assert.ok(vm.$el.textContent.includes('HEVC'))
		assert.ok(vm.$el.textContent.includes('60 fps'))

		// Copy video sheet
		await vm.copyVideoSheet()
		assert.equal(copiedPayloads.length, 1)
		assert.ok(copiedPayloads[0].includes('HEVC'))

		// Delete confirmation <dialog> + execution
		let deleteCompleted = null
		vm.$on('video-delete-completed', payload => { deleteCompleted = payload })
		const delBtn = vm.$el.querySelector('.video-detail__actions .video-workbench__danger-btn')
		delBtn.click()
		await settle()
		const dialog = vm.$refs.videoDeleteDialog
		assert.ok(dialog && (dialog.open || dialog.hasAttribute('open')))
		await vm.confirmDeleteRedundantVideos()
		await settle()
		assert.equal(deletedBatches.length, 1)
		assert.equal(deletedBatches[0][0].id, 12)
		assert.ok(deleteCompleted && deleteCompleted.deletedFiles.length === 1)
		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire 3 shortcut, topbar Video Scenes button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '3' }), 'toggle-video-workbench')
		assert.ok(
			keyboardShortcuts.SHORTCUT_DEFINITIONS.some(
				item => item.id === 'toggle-video-workbench' && item.keys.includes('3'),
			),
		)

		const stats = loadModule('src/tools/duplicateStats.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const { videoInspector, selectionAndExport, mediaContent, filters } = loadVideoModules()
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': stats,
			'./duplicateFilters': filters,
			'./utils': utils,
		})
		const Workbench = loadWorkbenchComponent({ stats, selectionAndExport, mediaContent, videoInspector })
		const stub = name => ({ name, render(h) { return h('div', { class: name }) } })

		const duplicatesPayload = [
			{
				id: 901,
				hash: 'vid-app-901',
				files: [
					{ id: 1, path: '/Videos/Clip_A.mp4', size: 10000, mtime: 100 },
					{ id: 2, path: '/Videos/Clip_B.mp4', size: 10000, mtime: 200 },
				],
			},
		]

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: stub('nc-loading'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('dup-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('dup-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('dup-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene-inspector') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-pair-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint-analyzer') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: Workbench },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-quarantine') },
'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-pruner') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collisions') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-verifier') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow-reclaim') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk-pair') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('media-fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc-chunking') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops-schedule') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal-hold') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('ransomware-canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('dev-tree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict-storm') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vm-cow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand-kit-auditor') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log-telemetry-auditor') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer-repo-auditor') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook-drift-auditor') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox-archive-auditor') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('elearning-scorm-auditor') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('database-dump-log-auditor') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('design-publishing-vault-auditor') },
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
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('proj-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? duplicatesPayload : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: type === 'unacknowledged' ? 1 : 0 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => null,
				startUserScan: async () => null,
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
		})

		const vm = new Vue(App).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-video-workbench-button')
		assert.ok(topbarBtn, 'Topbar Video Scenes button exists')
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), '3')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '3', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.video-scene-workbench'), 'Pressing 3 opens VideoSceneWorkbench')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '3', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.video-scene-workbench'), null, 'Pressing 3 again hides VideoSceneWorkbench')
		vm.$destroy()
	})

	test('Cycle 132 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/videoSceneInspector.js',
			'src/components/VideoSceneWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'tests/frontend/video-scene-inspector.test.cjs',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `${relPath} must not contain U+2013`)
			assert.equal(content.includes('\u2014'), false, `${relPath} must not contain U+2014`)
			assert.equal(/\bv-html\b|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(/.test(content), false, `${relPath} must have zero XSS sinks`)
		}
		const vueSource = readFileSync(resolve(root, 'src/components/VideoSceneWorkbench.vue'), 'utf8')
		assert.ok(vueSource.includes('minmax(0, 1fr)'))
		assert.ok(vueSource.includes('min-block-size: 45px'))
		assert.ok(vueSource.includes(':focus-visible'))
		assert.ok(vueSource.includes('padding-inline'))
	})
})

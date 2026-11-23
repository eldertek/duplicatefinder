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

function loadAudioModules() {
	const stats = loadModule('src/tools/duplicateStats.js')
	const filters = loadModule('src/tools/duplicateFilters.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const consolidator = loadModule('src/tools/audioTagConsolidator.js', {
		'./duplicateStats': stats,
		'./duplicateFilters': filters,
		'./duplicateSelectionAndExport': selectionAndExport,
	})
	return { stats, filters, selectionAndExport, consolidator }
}

function loadWorkbenchComponent(deps, overrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboard = overrides.clipboard || loadModule('src/tools/clipboardHelper.js')
	return loadComponent('src/components/AudioTagWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async () => ({ success: [], errors: [] }),
			...(overrides.api || {}),
		},
		'../tools/clipboardHelper': clipboard,
		'../tools/duplicateSelectionAndExport': deps.selectionAndExport,
		'../tools/utils': utils,
		'../tools/audioTagConsolidator': deps.consolidator,
	})
}

/**
 * Build a synthetic MP3 buffer with ID3v2.3 frames + MPEG-1 Layer III frame + Xing VBR header.
 */
function buildSyntheticMp3Buffer({ title = '', artist = '', album = '', year = '', track = '', genre = '', cover = false, bitrateIndex = 14 } = {}) {
	const frames = []
	const pushTextFrame = (id, text) => {
		if (!text) {
			return
		}
		const textBytes = Buffer.from(text, 'utf8')
		const payload = Buffer.concat([Buffer.from([0x03]), textBytes])
		const header = Buffer.alloc(10)
		header.write(id, 0, 4, 'ascii')
		header.writeUInt32BE(payload.length, 4)
		frames.push(header, payload)
	}
	pushTextFrame('TIT2', title)
	pushTextFrame('TPE1', artist)
	pushTextFrame('TALB', album)
	pushTextFrame('TYER', year)
	pushTextFrame('TRCK', track)
	pushTextFrame('TCON', genre)
	if (cover) {
		const apicPayload = Buffer.from([0x00, 0x69, 0x6d, 0x61, 0x67, 0x65, 0x2f, 0x6a, 0x70, 0x65, 0x67, 0x00, 0x03, 0x00, 0xff, 0xd8])
		const apicHeader = Buffer.alloc(10)
		apicHeader.write('APIC', 0, 4, 'ascii')
		apicHeader.writeUInt32BE(apicPayload.length, 4)
		frames.push(apicHeader, apicPayload)
	}

	const tagPayload = Buffer.concat(frames)
	const id3Header = Buffer.alloc(10)
	id3Header.write('ID3', 0, 3, 'ascii')
	id3Header[3] = 3
	id3Header[4] = 0
	const sz = tagPayload.length
	id3Header[6] = (sz >> 21) & 0x7f
	id3Header[7] = (sz >> 14) & 0x7f
	id3Header[8] = (sz >> 7) & 0x7f
	id3Header[9] = sz & 0x7f

	// MPEG-1 Layer III (versionBits=3, layerBits=1), bitrateIndex=14 (320kbps) or 9 (128kbps), sampleIdx=0 (44100Hz), stereo=0
	const mpegFrame = Buffer.alloc(4 + 32 + 16)
	mpegFrame[0] = 0xff
	mpegFrame[1] = 0xfb
	mpegFrame[2] = (bitrateIndex << 4) | 0x00
	mpegFrame[3] = 0x00
	// Xing header at offset 4 + 32 = 36
	mpegFrame.write('Xing', 36, 4, 'ascii')
	mpegFrame.writeUInt32BE(0x03, 40) // frames + bytes flags
	mpegFrame.writeUInt32BE(8000, 44) // 8000 frames (~209s)
	mpegFrame.writeUInt32BE(8360000, 48)

	const full = Buffer.concat([id3Header, tagPayload, mpegFrame])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

/**
 * Build a synthetic ID3v1 128-byte footer.
 */
function buildSyntheticId3v1Tail({ title = '', artist = '', album = '', year = '', track = 0, genreByte = 17 } = {}) {
	const tail = Buffer.alloc(128)
	tail.write('TAG', 0, 3, 'ascii')
	tail.write(title.slice(0, 30), 3, 'ascii')
	tail.write(artist.slice(0, 30), 33, 'ascii')
	tail.write(album.slice(0, 30), 63, 'ascii')
	tail.write(year.slice(0, 4), 93, 'ascii')
	tail[125] = 0
	tail[126] = track
	tail[127] = genreByte
	return tail.buffer.slice(tail.byteOffset, tail.byteOffset + tail.byteLength)
}

/**
 * Build a synthetic FLAC buffer with STREAMINFO (24-bit/96kHz) + VORBIS_COMMENT + PICTURE.
 */
function buildSyntheticFlacBuffer({ title = 'Aerodynamic', artist = 'Daft Punk', album = 'Discovery', year = '2001', track = '2', genre = 'Electronic' } = {}) {
	const streamInfo = Buffer.alloc(34)
	// sampleRate=96000 (0x17700), channels=2 (encoded 1), bps=24 (encoded 23), totalSamples=19200000 (200s)
	streamInfo[10] = (96000 >> 12) & 0xff
	streamInfo[11] = (96000 >> 4) & 0xff
	streamInfo[12] = ((96000 & 0x0f) << 4) | (1 << 1) | ((23 >> 4) & 0x01)
	streamInfo[13] = ((23 & 0x0f) << 4) | 0x00
	streamInfo.writeUInt32BE(19200000, 14)

	const b0Header = Buffer.from([0x00, 0x00, 0x00, streamInfo.length])

	const comments = [
		`TITLE=${title}`,
		`ARTIST=${artist}`,
		`ALBUM=${album}`,
		`DATE=${year}`,
		`TRACKNUMBER=${track}`,
		`GENRE=${genre}`,
	]
	const vendor = Buffer.from('libFLAC', 'utf8')
	const vcParts = [Buffer.alloc(4)]
	vcParts[0].writeUInt32LE(vendor.length, 0)
	vcParts.push(vendor)
	const countBuf = Buffer.alloc(4)
	countBuf.writeUInt32LE(comments.length, 0)
	vcParts.push(countBuf)
	for (const c of comments) {
		const cb = Buffer.from(c, 'utf8')
		const lb = Buffer.alloc(4)
		lb.writeUInt32LE(cb.length, 0)
		vcParts.push(lb, cb)
	}
	const vcPayload = Buffer.concat(vcParts)
	const b4Header = Buffer.from([0x04, (vcPayload.length >> 16) & 0xff, (vcPayload.length >> 8) & 0xff, vcPayload.length & 0xff])

	const picPayload = Buffer.alloc(8)
	const b6Header = Buffer.from([0x86, 0x00, 0x00, picPayload.length])

	const full = Buffer.concat([Buffer.from('fLaC', 'ascii'), b0Header, streamInfo, b4Header, vcPayload, b6Header, picPayload])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

/**
 * Build a synthetic OGG Opus buffer (page 1 OpusHead + page 2 OpusTags).
 */
function buildSyntheticOggOpusBuffer() {
	const page1Header = Buffer.alloc(28)
	page1Header.write('OggS', 0, 4, 'ascii')
	page1Header[26] = 1
	page1Header[27] = 19
	const opusHead = Buffer.alloc(19)
	opusHead.write('OpusHead', 0, 8, 'ascii')
	opusHead[8] = 1
	opusHead[9] = 2
	opusHead.writeUInt32LE(48000, 12)

	const vendor = Buffer.from('opus', 'utf8')
	const c1 = Buffer.from('TITLE=Veridis Quo', 'utf8')
	const c2 = Buffer.from('ARTIST=Daft Punk', 'utf8')
	const vc = Buffer.alloc(8 + 4 + vendor.length + 4 + 4 + c1.length + 4 + c2.length)
	vc.write('OpusTags', 0, 8, 'ascii')
	vc.writeUInt32LE(vendor.length, 8)
	vendor.copy(vc, 12)
	let p = 12 + vendor.length
	vc.writeUInt32LE(2, p)
	p += 4
	vc.writeUInt32LE(c1.length, p)
	p += 4
	c1.copy(vc, p)
	p += c1.length
	vc.writeUInt32LE(c2.length, p)
	p += 4
	c2.copy(vc, p)

	const page2Header = Buffer.alloc(28)
	page2Header.write('OggS', 0, 4, 'ascii')
	page2Header[26] = 1
	page2Header[27] = vc.length

	const full = Buffer.concat([page1Header, opusHead, page2Header, vc])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

/**
 * Build a synthetic M4A container with ftyp + moov -> mvhd + udta -> meta -> ilst atoms.
 */
function buildSyntheticM4aBuffer() {
	const atom = (typeBytes, payload) => {
		const buf = Buffer.alloc(8 + payload.length)
		buf.writeUInt32BE(buf.length, 0)
		Buffer.from(typeBytes).copy(buf, 4)
		payload.copy(buf, 8)
		return buf
	}
	const makeDataAtom = text => {
		const txt = Buffer.from(text, 'utf8')
		const p = Buffer.alloc(8 + txt.length)
		txt.copy(p, 8)
		return atom([0x64, 0x61, 0x74, 0x61], p)
	}
	const ftyp = Buffer.alloc(16)
	ftyp.writeUInt32BE(16, 0)
	ftyp.write('ftypM4A ', 4, 8, 'ascii')

	const mvhdPayload = Buffer.alloc(24)
	mvhdPayload.writeUInt32BE(1000, 12)
	mvhdPayload.writeUInt32BE(185000, 16) // 185s
	const mvhd = atom([0x6d, 0x76, 0x68, 0x64], mvhdPayload)

	const nam = atom([0xa9, 0x6e, 0x61, 0x6d], makeDataAtom('Harder Better Faster'))
	const art = atom([0xa9, 0x41, 0x52, 0x54], makeDataAtom('Daft Punk'))
	const alb = atom([0xa9, 0x61, 0x6c, 0x62], makeDataAtom('Discovery'))
	const ilst = atom([0x69, 0x6c, 0x73, 0x74], Buffer.concat([nam, art, alb]))
	const metaPayload = Buffer.concat([Buffer.alloc(4), ilst])
	const meta = atom([0x6d, 0x65, 0x74, 0x61], metaPayload)
	const udta = atom([0x75, 0x64, 0x74, 0x61], meta)
	const moov = atom([0x6d, 0x6f, 0x6f, 0x76], Buffer.concat([mvhd, udta]))

	const full = Buffer.concat([ftyp, moov])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

/**
 * Build a synthetic WAV buffer with fmt + LIST/INFO + data.
 */
function buildSyntheticWavBuffer() {
	const fmtPayload = Buffer.alloc(16)
	fmtPayload.writeUInt16LE(1, 0) // PCM
	fmtPayload.writeUInt16LE(2, 2) // Stereo
	fmtPayload.writeUInt32LE(44100, 4)
	fmtPayload.writeUInt32LE(176400, 8)
	fmtPayload.writeUInt16LE(4, 12)
	fmtPayload.writeUInt16LE(16, 14)

	const subChunk = (id, text) => {
		const txt = Buffer.from(`${text}\0`, 'utf8')
		const pad = txt.length % 2
		const out = Buffer.alloc(8 + txt.length + pad)
		out.write(id, 0, 4, 'ascii')
		out.writeUInt32LE(txt.length, 4)
		txt.copy(out, 8)
		return out
	}
	const infoPayload = Buffer.concat([
		Buffer.from('INFO', 'ascii'),
		subChunk('INAM', 'Digital Love'),
		subChunk('IART', 'Daft Punk'),
		subChunk('IPRD', 'Discovery'),
	])
	const listChunk = Buffer.alloc(8 + infoPayload.length)
	listChunk.write('LIST', 0, 4, 'ascii')
	listChunk.writeUInt32LE(infoPayload.length, 4)
	infoPayload.copy(listChunk, 8)

	const dataHeader = Buffer.alloc(8)
	dataHeader.write('data', 0, 4, 'ascii')
	dataHeader.writeUInt32LE(176400 * 120, 4) // 120s

	const fmtChunk = Buffer.alloc(8 + fmtPayload.length)
	fmtChunk.write('fmt ', 0, 4, 'ascii')
	fmtChunk.writeUInt32LE(fmtPayload.length, 4)
	fmtPayload.copy(fmtChunk, 8)

	const riffHeader = Buffer.alloc(12)
	riffHeader.write('RIFF', 0, 4, 'ascii')
	riffHeader.writeUInt32LE(4 + fmtChunk.length + listChunk.length + dataHeader.length, 4)
	riffHeader.write('WAVE', 8, 4, 'ascii')

	const full = Buffer.concat([riffHeader, fmtChunk, listChunk, dataHeader])
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength)
}

describe('Cycle 131: Duplicate Music, ID3 Audio Tags & Bitrate Consolidator Workbench', () => {
	test('parses MP3 (ID3v2.3 + ID3v1 + Xing VBR), FLAC, OGG Opus, M4A, WAV, and handles corrupt buffers safely', () => {
		const { consolidator } = loadAudioModules()

		const mp3Buf = buildSyntheticMp3Buffer({
			title: 'One More Time',
			artist: 'Daft Punk',
			album: 'Discovery',
			year: '2001',
			track: '1',
			genre: '(52)',
			cover: true,
		})
		const mp3Meta = consolidator.parseAudioTrackMetadata(mp3Buf, { path: '/Music/01 - One More Time.mp3', size: 8400000 })
		assert.equal(mp3Meta.status, 'ready')
		assert.equal(mp3Meta.codec, 'MP3')
		assert.equal(mp3Meta.title, 'One More Time')
		assert.equal(mp3Meta.artist, 'Daft Punk')
		assert.equal(mp3Meta.album, 'Discovery')
		assert.equal(mp3Meta.year, '2001')
		assert.equal(mp3Meta.trackNumber, '1')
		assert.equal(mp3Meta.genre, 'Electronic')
		assert.equal(mp3Meta.hasCoverArt, true)
		assert.equal(mp3Meta.bitrateMode, 'VBR')
		assert.equal(mp3Meta.sampleRate, 44100)
		assert.equal(mp3Meta.tagCompletenessPercent, 100)

		const id3v1Tail = buildSyntheticId3v1Tail({
			title: 'Voyager',
			artist: 'Daft Punk',
			album: 'Discovery',
			year: '2001',
			track: 10,
			genreByte: 18,
		})
		const rawMpegOnly = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00])
		const v1Meta = consolidator.parseAudioTrackMetadata(rawMpegOnly, { path: '/Downloads/voyager.mp3', size: 3200000 }, { tailBuffer: id3v1Tail })
		assert.equal(v1Meta.title, 'Voyager')
		assert.equal(v1Meta.trackNumber, '10')
		assert.equal(v1Meta.genre, 'Techno')
		assert.equal(v1Meta.tagFormat, 'ID3v1')

		const flacMeta = consolidator.parseAudioTrackMetadata(buildSyntheticFlacBuffer(), { path: '/Music/02 - Aerodynamic.flac', size: 28000000 })
		assert.equal(flacMeta.codec, 'FLAC')
		assert.equal(flacMeta.lossless, true)
		assert.equal(flacMeta.bitsPerSample, 24)
		assert.equal(flacMeta.sampleRate, 96000)
		assert.equal(flacMeta.durationSeconds, 200)
		assert.equal(flacMeta.hasCoverArt, true)
		assert.equal(flacMeta.tagCompletenessPercent, 100)

		const oggMeta = consolidator.parseAudioTrackMetadata(buildSyntheticOggOpusBuffer(), { path: '/Music/veridis.opus', size: 3400000 })
		assert.equal(oggMeta.codec, 'OPUS')
		assert.equal(oggMeta.title, 'Veridis Quo')
		assert.equal(oggMeta.artist, 'Daft Punk')

		const m4aMeta = consolidator.parseAudioTrackMetadata(buildSyntheticM4aBuffer(), { path: '/Music/hbfs.m4a', size: 4200000 })
		assert.equal(m4aMeta.codec, 'M4A')
		assert.equal(m4aMeta.title, 'Harder Better Faster')
		assert.equal(m4aMeta.album, 'Discovery')
		assert.equal(m4aMeta.durationSeconds, 185)

		const wavMeta = consolidator.parseAudioTrackMetadata(buildSyntheticWavBuffer(), { path: '/Studio/digital_love.wav', size: 21168000 })
		assert.equal(wavMeta.codec, 'WAV')
		assert.equal(wavMeta.lossless, true)
		assert.equal(wavMeta.title, 'Digital Love')
		assert.equal(wavMeta.durationSeconds, 120)

		const corrupt = consolidator.parseAudioTrackMetadata(new Uint8Array([0x01, 0x02, 0x03, 0x04]), { path: '/tmp/broken.mp3', size: 12 })
		assert.equal(corrupt.status, 'unavailable')
		assert.equal(corrupt.effectiveTitle, 'broken')
	})

	test('builds audio consolidation catalog, cross-format links, tag merge advisor, and CWE-1236-safe CSV/JSON exports', () => {
		const { consolidator } = loadAudioModules()

		const flacGroup = {
			id: 101,
			hash: 'h-flac',
			files: [
				{
					id: 1,
					nodeId: 11,
					path: '/Music/Daft Punk/Discovery/01 - One More Time.flac',
					size: 32000000,
					mimetype: 'audio/flac',
					mtime: 1700000100,
					audioTags: {
						codec: 'FLAC',
						lossless: true,
						bitrateKbps: 1411,
						sampleRate: 96000,
						bitsPerSample: 24,
						durationSeconds: 320,
						title: 'One More Time',
						artist: 'Daft Punk',
						album: '',
						year: '',
						hasCoverArt: false,
					},
				},
				{
					id: 2,
					nodeId: 12,
					path: '/Backup/01 - One More Time (1).flac',
					size: 32000000,
					mimetype: 'audio/flac',
					mtime: 1700000200,
					audioTags: {
						codec: 'FLAC',
						lossless: true,
						bitrateKbps: 980,
						sampleRate: 44100,
						bitsPerSample: 16,
						durationSeconds: 320,
						title: 'One More Time',
						artist: 'Daft Punk',
						album: 'Discovery',
						year: '2001',
						hasCoverArt: true,
					},
				},
			],
		}

		const mp3LowGroup = {
			id: 102,
			hash: 'h-mp3',
			files: [
				{
					id: 3,
					nodeId: 13,
					path: '/Downloads/=CMD("calc")/One More Time.mp3',
					size: 5120000,
					mimetype: 'audio/mpeg',
					mtime: 1700000300,
					audioTags: {
						codec: 'MP3',
						lossless: false,
						bitrateKbps: 128,
						durationSeconds: 320,
						title: 'One More Time',
						artist: 'Daft Punk',
						album: 'Discovery',
					},
				},
				{
					id: 4,
					nodeId: 14,
					path: '/Origin/One More Time.mp3',
					size: 5120000,
					mimetype: 'audio/mpeg',
					mtime: 1700000400,
					isInOriginFolder: true,
					audioTags: {
						codec: 'MP3',
						lossless: false,
						bitrateKbps: 128,
						durationSeconds: 320,
						title: 'One More Time',
						artist: 'Daft Punk',
						album: '=CMD("calc")',
					},
				},
			],
		}

		const catalog = consolidator.buildAudioConsolidationCatalog([flacGroup, mp3LowGroup], {}, { keepRule: 'highest_quality' })
		assert.equal(catalog.summary.totalAudioGroups, 2)
		assert.equal(catalog.summary.losslessGroupsCount, 1)
		assert.equal(catalog.summary.lowBitrateGroupsCount, 1)
		assert.equal(catalog.summary.crossFormatGroupsCount, 2)
		assert.ok(catalog.summary.tagConsolidationCount >= 1)

		const first = catalog.groups[0]
		assert.equal(first.crossFormatMatches.length, 1)
		assert.equal(first.consolidation.tagConsolidationNeeded, true)
		assert.ok(first.consolidation.mergeableFields.some(f => f.field === 'album' && f.value === 'Discovery'))

		const second = catalog.groups[1]
		assert.equal(second.survivors[0].isInOriginFolder, true, 'Origin folder anchor always survives')

		const filteredCross = consolidator.filterAndSortAudioGroups(catalog.groups, { category: 'cross-format' })
		assert.equal(filteredCross.length, 2)

		const csv = consolidator.buildAudioAuditCsv(catalog)
		assert.ok(csv.includes("'=CMD") || csv.includes('"\'=CMD'), 'CSV must neutralize CWE-1236 formula injection')

		const json = JSON.parse(consolidator.buildAudioAuditJson(catalog, first))
		assert.equal(json.schema, consolidator.AUDIO_CONSOLIDATOR_SCHEMA)
		assert.equal(json.groups.length, 2)
	})

	test('AudioTagWorkbench.vue renders empty, populated, binary tag inspection, copy sheet, safe delete, and XSS defense', async () => {
		const deps = loadAudioModules()
		const deleteCalls = []
		const copiedTexts = []

		const Workbench = loadWorkbenchComponent(deps, {
			api: {
				deleteFiles: async (files, opts) => {
					deleteCalls.push({ files, opts })
					return {
						success: files,
						deletedNodeIds: files.map(f => f.nodeId),
						errors: [],
					}
				},
			},
			clipboard: {
				copyTextSafely: async text => {
					copiedTexts.push(text)
					return true
				},
			},
		})

		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: { duplicates: [], allDuplicates: [] },
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.audio-workbench__empty'))
		emptyVm.$destroy()

		const mp3Buf = buildSyntheticMp3Buffer({
			title: '<img src=x onerror=alert(1)> Track',
			artist: 'Daft Punk',
			album: 'Discovery',
			year: '2001',
			track: '3',
			genre: 'House',
			cover: true,
		})

		const groupA = {
			id: 201,
			hash: 'hash-audio-1',
			files: [
				{
					id: 21,
					nodeId: 211,
					path: '/Music/<svg onload=alert(1)>/03 - Track.mp3',
					size: 8000000,
					mimetype: 'audio/mpeg',
					mtime: 1700000100,
					audioBuffer: mp3Buf,
				},
				{
					id: 22,
					nodeId: 212,
					path: '/Downloads/03 - Track (1).mp3',
					size: 8000000,
					mimetype: 'audio/mpeg',
					mtime: 1700000200,
				},
			],
		}

		const completedEvents = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: [groupA],
						allDuplicates: [groupA],
						currentDuplicateId: 201,
					},
					on: {
						'audio-delete-completed': payload => completedEvents.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.audio-track-card').length, 1)
		assert.equal(vm.$el.querySelectorAll('img[onerror], svg[onload]').length, 0, 'XSS payloads must be plain text only')

		// Click "Read ID3 tags" on first card
		const readBtn = vm.$el.querySelector('.audio-track-card__quick-actions button')
		readBtn.click()
		await settle()

		assert.ok(vm.$el.textContent.includes('320 kbps'), 'Binary MP3 header inspection reports 320 kbps')
		assert.ok(vm.$el.textContent.includes('Embedded artwork'), 'ID3v2 APIC cover art detected')

		// Copy tag sheet
		const copyBtn = Array.from(vm.$el.querySelectorAll('.audio-detail__actions button')).find(b => b.textContent.includes('Copy tag sheet'))
		assert.ok(copyBtn)
		copyBtn.click()
		await settle()
		assert.equal(copiedTexts.length, 1)
		assert.ok(copiedTexts[0].includes('Artist: Daft Punk'))

		// Open delete confirmation dialog and confirm
		const deleteBtn = vm.$el.querySelector('.audio-workbench__danger-btn')
		deleteBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.audio-delete-dialog')
		assert.ok(dialog.hasAttribute('open'))

		const confirmBtn = dialog.querySelector('.audio-workbench__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deleteCalls.length, 1)
		assert.equal(deleteCalls[0].opts.allowLastCopy, false)
		assert.equal(completedEvents.length, 1)
		assert.equal(completedEvents[0].bytesReclaimed, 8000000)

		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire 2 shortcut, topbar Audio Tags button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '2' }), 'toggle-audio-workbench')
		assert.ok(keyboardShortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-audio-workbench' && item.keys.includes('2')))

		const deps = loadAudioModules()
		const Workbench = loadWorkbenchComponent(deps)
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const group = {
			id: 501,
			hash: 'h-audio-app',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 11, path: '/Music/song.flac', size: 22000000, mimetype: 'audio/flac', mtime: 100 },
				{ id: 2, nodeId: 12, path: '/Downloads/song.flac', size: 22000000, mimetype: 'audio/flac', mtime: 200 },
			],
		}

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
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: Workbench },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? [group] : [],
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
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': deps.stats,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue(App).$mount()
		await settle()

		const topBtn = vm.$el.querySelector('.topbar-audio-workbench-button')
		assert.ok(topBtn, 'Topbar renders Audio Tags workbench toggle button')
		assert.equal(topBtn.getAttribute('aria-keyshortcuts'), '2')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '2', bubbles: true }))
		await settle()
		assert.ok(vm.$el.querySelector('.audio-tag-workbench'), 'Pressing 2 opens AudioTagWorkbench')

		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: '2', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.audio-tag-workbench'), null, 'Pressing 2 again hides AudioTagWorkbench')

		vm.$destroy()
	})

	test('Cycle 131 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/audioTagConsolidator.js',
			'src/components/AudioTagWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 dash allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueSource = readFileSync(resolve(root, 'src/components/AudioTagWorkbench.vue'), 'utf8')
		assert.ok(vueSource.includes(':focus-visible'))
		assert.ok(vueSource.includes('min-block-size: 45px'))
		assert.ok(vueSource.includes('margin-block-end'))
		assert.ok(vueSource.includes('padding-inline'))
	})
})

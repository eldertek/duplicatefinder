/**
 * Pure Similar-Photo Perceptual pHash (DCT), Gradient dHash, Color Histogram,
 * Laplacian/Tenengrad Sharpness, EXIF Resolution, and Crop Comparator helpers.
 * Inspired by DigiKam, Czkawka Similar Images, VisiPics, and Gemini 2.
 */

import { extractFileExtension } from './duplicateFilters'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'
import {
	computeAspectRatioLabel,
	computeDifferenceHash,
	computeHammingSimilarity,
	computeMegapixelsLabel,
	extractMediaDimensions,
	normalizeExifMetadata,
	parseImageHeaderAndExif,
} from './visualMediaInspector'

export const PHOTO_PERCEPTUAL_SCHEMA = 'duplicatefinder.photo-perceptual.v1'
export const MAX_PHOTO_PROBE_BYTES = 262144

export const MIN_HAMMING_DISTANCE = 0
export const MAX_HAMMING_DISTANCE = 18
export const DEFAULT_HAMMING_DISTANCE = 10

export const MIN_SIMILARITY_PCT = 50
export const MAX_SIMILARITY_PCT = 100
export const DEFAULT_SIMILARITY_PCT = 82

export const PHOTO_KEEP_RULES = Object.freeze([
	'highest_quality',
	'sharpest',
	'highest_resolution',
	'raw_master',
	'oldest',
	'newest',
	'shortest_path',
])

export const PHOTO_VARIANT_FILTERS = Object.freeze([
	'all',
	'cropped',
	'lower-res',
	'social',
	'raw-pairs',
	'unprobed',
])

export const PHOTO_HASH_MODES = Object.freeze([
	'combined',
	'phash',
	'dhash',
])

export const PHOTO_SORT_MODES = Object.freeze([
	'reclaimable_desc',
	'res_spread_desc',
	'similarity_asc',
	'cluster_size_desc',
])

export const RAW_PHOTO_EXTENSIONS = new Set([
	'dng',
	'cr2',
	'cr3',
	'nef',
	'arw',
	'raf',
	'orf',
	'rw2',
	'pef',
	'srw',
	'raw',
])

export const RASTER_PHOTO_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'jpe',
	'jfif',
	'png',
	'webp',
	'heic',
	'heif',
	'avif',
	'tiff',
	'tif',
	'bmp',
	'gif',
])

const SOCIAL_PHOTO_HINT_RE = /(?:^|[\s._/-])(wa\d{3,}|whatsapp|telegram|fb_img|messenger|signal|instagram|insta|compressed|resized|thumb|thumbnail|img_\d+_wa)(?:[\s._/-]|\d|$)/i
const CROP_EDIT_HINT_RE = /(?:^|[\s._-])(crop|cropped|square|story|reel|cover|banner|edit|edited|retouch|retouched|hdr|export)(?:[\s._-]|\d|$)/i
const GENERIC_PHOTO_STEMS = new Set([
	'img',
	'image',
	'photo',
	'pic',
	'picture',
	'dsc',
	'pxl',
	'dcim',
	'scan',
	'screenshot',
	'capture',
	'untitled',
	'file',
	'copy',
])

const DCT_SIZE = 32
const DCT_LOW_FREQ = 9
const COS_TABLE = (() => {
	const table = new Float64Array(DCT_LOW_FREQ * DCT_SIZE)
	const factor = Math.PI / (2 * DCT_SIZE)
	for (let u = 0; u < DCT_LOW_FREQ; u++) {
		for (let x = 0; x < DCT_SIZE; x++) {
			table[u * DCT_SIZE + x] = Math.cos((2 * x + 1) * u * factor)
		}
	}
	return table
})()

/**
 * Determine whether a duplicate file entry is an inspectable raster or RAW photo.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {boolean} True when file is a raster or RAW photograph.
 */
export function isInspectablePhotoFile(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	const mime = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''
	if (mime === 'image/svg+xml') {
		return false
	}
	if (mime.startsWith('image/')) {
		return true
	}
	const ext = extractFileExtension(file.name || file.path || '')
	return RASTER_PHOTO_EXTENSIONS.has(ext) || RAW_PHOTO_EXTENSIONS.has(ext)
}

/**
 * Resolve a stable string key for a photo entry.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {string|null} Stable string key or null.
 */
export function resolvePhotoFileKey(file) {
	const raw = getFileSelectionKey(file)
	if (raw !== null && raw !== undefined && raw !== '') {
		return String(raw)
	}
	if (file && typeof file.path === 'string' && file.path.trim() !== '') {
		return file.path.trim()
	}
	return null
}

/**
 * Extract folder, filename, stem, and extension parts from a file path.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {{ normalizedPath: string, folder: string, fileName: string, stem: string, extension: string }} Parsed parts.
 */
function parsePhotoPathParts(rawPath) {
	const normalized = typeof rawPath === 'string' ? rawPath.trim().replace(/\\/g, '/') : ''
	const clean = normalized.replace(/^\/+/, '')
	const slashIdx = clean.lastIndexOf('/')
	const folder = slashIdx >= 0 ? clean.slice(0, slashIdx) : '/'
	const fileName = slashIdx >= 0 ? clean.slice(slashIdx + 1) : clean
	const dotIdx = fileName.lastIndexOf('.')
	const stem = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName
	const extension = dotIdx > 0 && dotIdx < fileName.length - 1
		? fileName.slice(dotIdx + 1).toLowerCase()
		: ''
	return {
		normalizedPath: normalized || fileName,
		folder: folder || '/',
		fileName,
		stem,
		extension,
	}
}

/**
 * Build a canonical stem for grouping renamed/cropped/social photo variants across folders.
 *
 * @param {string} stem - Raw filename stem without extension.
 * @return {string} Canonical stem or empty string when too generic.
 */
export function normalizeCanonicalPhotoStem(stem) {
	if (typeof stem !== 'string' || !stem.trim()) {
		return ''
	}
	let cleaned = stem.trim().toLowerCase()
	cleaned = cleaned
		.replace(/(?:[\s._-]+)(?:crop|cropped|square|story|edit|edited|retouch|retouched|final|hdr|compressed|resized|thumb|thumbnail|copy|wa\d+|v\d+)+$/gi, '')
		.replace(/\s*\(\d+\)\s*$/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
	if (cleaned.length < 4 || GENERIC_PHOTO_STEMS.has(cleaned)) {
		return ''
	}
	return cleaned
}

/**
 * Compute a 64-bit Perceptual DCT Hash (pHash) from an RGBA pixel buffer.
 * Resamples to 32x32 luminance, computes separable 2D DCT-II low-frequency block,
 * and thresholds 64 AC coefficients against their median.
 *
 * @param {Uint8ClampedArray|Uint8Array|Array<number>} rgba - RGBA pixel buffer.
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @return {{ hex: string, bits: string }|null} 64-bit pHash or null on invalid input.
 */
export function computePerceptualDctHash(rgba, width, height) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	if (!rgba || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return null
	}
	if (rgba.length < w * h * 4) {
		return null
	}

	const gray = new Float64Array(DCT_SIZE * DCT_SIZE)
	for (let gy = 0; gy < DCT_SIZE; gy++) {
		const y0 = Math.floor((gy * h) / DCT_SIZE)
		const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / DCT_SIZE))
		for (let gx = 0; gx < DCT_SIZE; gx++) {
			const x0 = Math.floor((gx * w) / DCT_SIZE)
			const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / DCT_SIZE))
			let sum = 0
			let count = 0
			for (let py = y0; py < y1; py++) {
				for (let px = x0; px < x1; px++) {
					const idx = (py * w + px) * 4
					sum += (0.299 * rgba[idx]) + (0.587 * rgba[idx + 1]) + (0.114 * rgba[idx + 2])
					count += 1
				}
			}
			gray[gy * DCT_SIZE + gx] = count > 0 ? sum / count : 0
		}
	}

	// Row-wise 1D DCT for first 9 frequencies
	const rowDct = new Float64Array(DCT_SIZE * DCT_LOW_FREQ)
	for (let y = 0; y < DCT_SIZE; y++) {
		const rowOffset = y * DCT_SIZE
		for (let u = 0; u < DCT_LOW_FREQ; u++) {
			const cosOffset = u * DCT_SIZE
			let sum = 0
			for (let x = 0; x < DCT_SIZE; x++) {
				sum += gray[rowOffset + x] * COS_TABLE[cosOffset + x]
			}
			rowDct[y * DCT_LOW_FREQ + u] = sum
		}
	}

	// Column-wise 1D DCT for first 9x9 low-frequency matrix
	const coeffs2D = new Float64Array(DCT_LOW_FREQ * DCT_LOW_FREQ)
	for (let v = 0; v < DCT_LOW_FREQ; v++) {
		const cosOffset = v * DCT_SIZE
		for (let u = 0; u < DCT_LOW_FREQ; u++) {
			let sum = 0
			for (let y = 0; y < DCT_SIZE; y++) {
				sum += rowDct[y * DCT_LOW_FREQ + u] * COS_TABLE[cosOffset + y]
			}
			coeffs2D[v * DCT_LOW_FREQ + u] = sum
		}
	}

	// 64 AC coefficients: (0..7, 0..7) with DC (0,0) replaced by (0,8)
	const acValues = []
	for (let v = 0; v < 8; v++) {
		for (let u = 0; u < 8; u++) {
			if (u === 0 && v === 0) {
				acValues.push(coeffs2D[8])
			} else {
				acValues.push(coeffs2D[v * DCT_LOW_FREQ + u])
			}
		}
	}

	const sorted = [...acValues].sort((a, b) => a - b)
	const median = (sorted[31] + sorted[32]) / 2

	let bits = ''
	let hex = ''
	let nibble = 0
	let nibbleBits = 0
	for (let i = 0; i < 64; i++) {
		const bit = acValues[i] > median ? 1 : 0
		bits += bit ? '1' : '0'
		nibble = (nibble << 1) | bit
		nibbleBits += 1
		if (nibbleBits === 4) {
			hex += nibble.toString(16)
			nibble = 0
			nibbleBits = 0
		}
	}

	return { hex, bits }
}

/**
 * Compute normalized 16-bin Luma & RGB color histograms and exposure stats.
 *
 * @param {Uint8ClampedArray|Uint8Array|Array<number>} rgba - RGBA pixel buffer.
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @param {number} [bins=16] - Histogram bin count.
 * @return {{
 *   bins: number,
 *   luma: Array<number>,
 *   r: Array<number>,
 *   g: Array<number>,
 *   b: Array<number>,
 *   lumaPct: Array<number>,
 *   meanLuma: number,
 *   shadowClipPct: number,
 *   highlightClipPct: number,
 *   dynamicRange: number
 * }|null} Normalized histogram telemetry or null on invalid input.
 */
export function computeColorHistogram(rgba, width, height, bins = 16) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	const binCount = Math.max(4, Math.min(32, Math.floor(Number(bins) || 16)))
	if (!rgba || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return null
	}
	const totalPixels = w * h
	if (rgba.length < totalPixels * 4) {
		return null
	}

	const lumaCounts = new Float64Array(binCount)
	const rCounts = new Float64Array(binCount)
	const gCounts = new Float64Array(binCount)
	const bCounts = new Float64Array(binCount)
	const luma256 = new Uint32Array(256)

	let lumaSum = 0
	let shadowClipCount = 0
	let highlightClipCount = 0
	const binScale = binCount / 256

	for (let i = 0; i < totalPixels; i++) {
		const idx = i * 4
		const r = Math.max(0, Math.min(255, rgba[idx]))
		const g = Math.max(0, Math.min(255, rgba[idx + 1]))
		const b = Math.max(0, Math.min(255, rgba[idx + 2]))
		const y = Math.max(0, Math.min(255, Math.round((0.299 * r) + (0.587 * g) + (0.114 * b))))

		lumaSum += y
		luma256[y] += 1
		if (y < 8) {
			shadowClipCount += 1
		}
		if (y > 247) {
			highlightClipCount += 1
		}

		lumaCounts[Math.min(binCount - 1, Math.floor(y * binScale))] += 1
		rCounts[Math.min(binCount - 1, Math.floor(r * binScale))] += 1
		gCounts[Math.min(binCount - 1, Math.floor(g * binScale))] += 1
		bCounts[Math.min(binCount - 1, Math.floor(b * binScale))] += 1
	}

	const normalize = counts => Array.from(counts, c => Math.round((c / totalPixels) * 10000) / 10000)
	const luma = normalize(lumaCounts)
	const maxLuma = Math.max(0.0001, ...luma)
	const lumaPct = luma.map(v => Math.round((v / maxLuma) * 100))

	let p5 = 0
	let p95 = 255
	let cum = 0
	const p5Target = totalPixels * 0.05
	const p95Target = totalPixels * 0.95
	let foundP5 = false
	for (let v = 0; v < 256; v++) {
		cum += luma256[v]
		if (!foundP5 && cum >= p5Target) {
			p5 = v
			foundP5 = true
		}
		if (cum >= p95Target) {
			p95 = v
			break
		}
	}

	return {
		bins: binCount,
		luma,
		r: normalize(rCounts),
		g: normalize(gCounts),
		b: normalize(bCounts),
		lumaPct,
		meanLuma: Math.round(lumaSum / totalPixels),
		shadowClipPct: Math.round((shadowClipCount / totalPixels) * 1000) / 10,
		highlightClipPct: Math.round((highlightClipCount / totalPixels) * 1000) / 10,
		dynamicRange: Math.max(0, p95 - p5),
	}
}

/**
 * Compare two color histograms using Bhattacharyya correlation across luma and RGB channels.
 *
 * @param {object|null|undefined} histA - First histogram.
 * @param {object|null|undefined} histB - Second histogram.
 * @return {{ lumaSimilarityPct: number, rgbSimilarityPct: number, combinedSimilarityPct: number, meanLumaDelta: number }|null} Comparison result.
 */
export function compareColorHistograms(histA, histB) {
	if (!histA || !histB || !Array.isArray(histA.luma) || !Array.isArray(histB.luma)) {
		return null
	}
	if (histA.luma.length === 0 || histA.luma.length !== histB.luma.length) {
		return null
	}

	const bhattacharyya = (arrA, arrB) => {
		if (!Array.isArray(arrA) || !Array.isArray(arrB) || arrA.length !== arrB.length) {
			return 0
		}
		let sum = 0
		for (let i = 0; i < arrA.length; i++) {
			sum += Math.sqrt(Math.max(0, arrA[i]) * Math.max(0, arrB[i]))
		}
		return Math.max(0, Math.min(1, sum))
	}

	const lumaScore = bhattacharyya(histA.luma, histB.luma)
	const rScore = bhattacharyya(histA.r, histB.r)
	const gScore = bhattacharyya(histA.g, histB.g)
	const bScore = bhattacharyya(histA.b, histB.b)
	const rgbScore = (rScore + gScore + bScore) / 3
	const combined = (lumaScore * 0.45) + (rgbScore * 0.55)

	return {
		lumaSimilarityPct: Math.round(lumaScore * 1000) / 10,
		rgbSimilarityPct: Math.round(rgbScore * 1000) / 10,
		combinedSimilarityPct: Math.round(combined * 1000) / 10,
		meanLumaDelta: Math.abs(Number(histA.meanLuma || 0) - Number(histB.meanLuma || 0)),
	}
}

/**
 * Compute edge sharpness (Tenengrad-style gradient energy) and exposure telemetry from RGBA pixels.
 *
 * @param {Uint8ClampedArray|Uint8Array|Array<number>} rgba - RGBA pixel buffer.
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @return {{
 *   sharpnessScore: number,
 *   sharpnessTier: 'crisp'|'moderate'|'soft',
 *   exposureStatus: 'balanced'|'underexposed'|'overexposed'|'clipped',
 *   meanLuma: number,
 *   shadowClipPct: number,
 *   highlightClipPct: number
 * }|null} Sharpness and exposure metrics or null on invalid input.
 */
export function computeSharpnessAndExposure(rgba, width, height) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	if (!rgba || !Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) {
		return null
	}
	if (rgba.length < w * h * 4) {
		return null
	}

	const sampleW = Math.min(w, 128)
	const sampleH = Math.min(h, 128)
	const lumaGrid = new Float64Array(sampleW * sampleH)

	let lumaSum = 0
	let shadowClipCount = 0
	let highlightClipCount = 0

	for (let sy = 0; sy < sampleH; sy++) {
		const py = Math.min(h - 1, Math.floor((sy * h) / sampleH))
		for (let sx = 0; sx < sampleW; sx++) {
			const px = Math.min(w - 1, Math.floor((sx * w) / sampleW))
			const idx = (py * w + px) * 4
			const y = (0.299 * rgba[idx]) + (0.587 * rgba[idx + 1]) + (0.114 * rgba[idx + 2])
			lumaGrid[sy * sampleW + sx] = y
			lumaSum += y
			if (y < 8) {
				shadowClipCount += 1
			}
			if (y > 247) {
				highlightClipCount += 1
			}
		}
	}

	let gradSum = 0
	let gradCount = 0
	for (let sy = 0; sy < sampleH - 1; sy++) {
		for (let sx = 0; sx < sampleW - 1; sx++) {
			const center = lumaGrid[sy * sampleW + sx]
			const right = lumaGrid[sy * sampleW + sx + 1]
			const bottom = lumaGrid[(sy + 1) * sampleW + sx]
			gradSum += Math.abs(right - center) + Math.abs(bottom - center)
			gradCount += 1
		}
	}

	const totalSamples = sampleW * sampleH
	const meanGrad = gradCount > 0 ? gradSum / gradCount : 0
	const sharpnessScore = Math.max(0, Math.min(100, Math.round(meanGrad * 1.4)))
	const sharpnessTier = sharpnessScore >= 55
		? 'crisp'
		: (sharpnessScore >= 25 ? 'moderate' : 'soft')

	const meanLuma = Math.round(lumaSum / totalSamples)
	const shadowClipPct = Math.round((shadowClipCount / totalSamples) * 1000) / 10
	const highlightClipPct = Math.round((highlightClipCount / totalSamples) * 1000) / 10

	let exposureStatus = 'balanced'
	if (shadowClipPct > 15 && highlightClipPct > 15) {
		exposureStatus = 'clipped'
	} else if (meanLuma < 45 || shadowClipPct > 20) {
		exposureStatus = 'underexposed'
	} else if (meanLuma > 215 || highlightClipPct > 20) {
		exposureStatus = 'overexposed'
	}

	return {
		sharpnessScore,
		sharpnessTier,
		exposureStatus,
		meanLuma,
		shadowClipPct,
		highlightClipPct,
	}
}

/**
 * Probe binary image header + EXIF metadata and optional decoded RGBA pixels
 * to build a complete perceptual signature record.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} inputBytes - Binary header/image bytes.
 * @param {object|null|undefined} [file=null] - Duplicate file entry.
 * @param {{ rgba: Uint8ClampedArray|Uint8Array, width: number, height: number }|null} [rgbaFrame=null] - Optional decoded RGBA pixel frame.
 * @return {{
 *   probed: boolean,
 *   format: string,
 *   width: number,
 *   height: number,
 *   bitDepth: number|null,
 *   exif: object,
 *   dimensions: object|null,
 *   pHash: { hex: string, bits: string }|null,
 *   dHash: { hex: string, bits: string }|null,
 *   histogram: object|null,
 *   sharpness: object|null,
 *   source: string
 * }} Probed perceptual photo signature.
 */
export function probePhotoBufferAndPixels(inputBytes, file = null, rgbaFrame = null) {
	const bytes = inputBytes instanceof Uint8Array
		? inputBytes
		: (inputBytes instanceof ArrayBuffer ? new Uint8Array(inputBytes) : null)

	const header = bytes ? parseImageHeaderAndExif(bytes) : null
	const exif = normalizeExifMetadata(file, header)

	let bitDepth = null
	if (bytes && bytes.byteLength >= 26 && header?.format === 'PNG') {
		bitDepth = bytes[24] || null
	}

	const frameW = Number(rgbaFrame?.width)
	const frameH = Number(rgbaFrame?.height)
	const hasRgba = Boolean(
		rgbaFrame
		&& rgbaFrame.rgba
		&& Number.isFinite(frameW)
		&& Number.isFinite(frameH)
		&& frameW > 0
		&& frameH > 0,
	)

	const liveDims = header && header.width > 0 && header.height > 0
		? { width: header.width, height: header.height }
		: (hasRgba ? { width: frameW, height: frameH } : null)

	const dimensions = extractMediaDimensions(file, liveDims)
	const pHash = hasRgba
		? computePerceptualDctHash(rgbaFrame.rgba, frameW, frameH)
		: normalizeHashInput(file?.pHash || file?.perceptualHash)
	const dHash = hasRgba
		? computeDifferenceHash(rgbaFrame.rgba, frameW, frameH)
		: normalizeHashInput(file?.dHash || file?.imageHash)
	const histogram = hasRgba
		? computeColorHistogram(rgbaFrame.rgba, frameW, frameH)
		: (file?.histogram && Array.isArray(file.histogram.luma) ? file.histogram : null)
	const sharpness = hasRgba
		? computeSharpnessAndExposure(rgbaFrame.rgba, frameW, frameH)
		: buildSharpnessFromFile(file)

	const ext = extractFileExtension(file?.name || file?.path || '').toUpperCase()
	const format = header?.format || ext || 'IMAGE'

	return {
		probed: Boolean(header || hasRgba),
		format,
		width: dimensions?.width || 0,
		height: dimensions?.height || 0,
		bitDepth,
		exif,
		dimensions,
		pHash,
		dHash,
		histogram,
		sharpness,
		source: hasRgba ? 'header+pixels' : (header ? 'header' : 'metadata'),
	}
}

/**
 * Normalize pre-supplied pHash or dHash strings/objects into `{ hex, bits }`.
 *
 * @param {object|string|null|undefined} hash - Input hash string or object.
 * @return {{ hex: string, bits: string }|null} Normalized hash or null.
 */
function normalizeHashInput(hash) {
	if (!hash) {
		return null
	}
	if (typeof hash === 'object' && typeof hash.hex === 'string' && typeof hash.bits === 'string' && hash.bits.length === 64) {
		return { hex: hash.hex.toLowerCase(), bits: hash.bits }
	}
	const hexStr = typeof hash === 'string'
		? hash.trim().toLowerCase()
		: (typeof hash.hex === 'string' ? hash.hex.trim().toLowerCase() : '')
	if (!/^[0-9a-f]{16}$/.test(hexStr)) {
		return null
	}
	let bits = ''
	for (const ch of hexStr) {
		bits += parseInt(ch, 16).toString(2).padStart(4, '0')
	}
	return { hex: hexStr, bits }
}

/**
 * Build sharpness summary from pre-attached metadata if available.
 *
 * @param {object|null|undefined} file - Duplicate file object.
 * @return {object|null} Sharpness summary or null.
 */
function buildSharpnessFromFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const rawScore = Number(file.sharpnessScore ?? file.sharpness?.sharpnessScore)
	if (!Number.isFinite(rawScore) || rawScore < 0) {
		return null
	}
	const sharpnessScore = Math.max(0, Math.min(100, Math.round(rawScore)))
	return {
		sharpnessScore,
		sharpnessTier: sharpnessScore >= 55 ? 'crisp' : (sharpnessScore >= 25 ? 'moderate' : 'soft'),
		exposureStatus: file.sharpness?.exposureStatus || 'balanced',
		meanLuma: Number.isFinite(Number(file.sharpness?.meanLuma)) ? Number(file.sharpness.meanLuma) : 128,
		shadowClipPct: Number(file.sharpness?.shadowClipPct || 0),
		highlightClipPct: Number(file.sharpness?.highlightClipPct || 0),
	}
}

/**
 * Build an enriched photo item from a duplicate file entry and optional probe map.
 *
 * @param {object} file - Duplicate file entry.
 * @param {object} group - Parent duplicate group.
 * @param {object} [probeByKey={}] - Map of probed signatures keyed by file key.
 * @return {object|null} Enriched photo record.
 */
function enrichPhotoRecord(file, group, probeByKey = {}) {
	if (!isInspectablePhotoFile(file)) {
		return null
	}
	const key = resolvePhotoFileKey(file)
	if (!key) {
		return null
	}

	const pathParts = parsePhotoPathParts(file.path || file.name || '')
	const probe = probeByKey && typeof probeByKey === 'object' ? probeByKey[key] : null
	const exif = probe?.exif || normalizeExifMetadata(file, null)
	const dimensions = probe?.dimensions || extractMediaDimensions(file, null)

	const pHash = probe?.pHash || normalizeHashInput(file.pHash || file.perceptualHash)
	const dHash = probe?.dHash || normalizeHashInput(file.dHash || file.imageHash)
	const histogram = probe?.histogram || (file.histogram && Array.isArray(file.histogram.luma) ? file.histogram : null)
	const sharpness = probe?.sharpness || buildSharpnessFromFile(file)

	const rawSize = Number(file.size)
	const size = Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0
	const rawMtime = Number(file.mtime ?? file.modifiedAt ?? file.lastModified)
	const mtime = Number.isFinite(rawMtime) && rawMtime > 0
		? (rawMtime < 1e12 ? rawMtime * 1000 : rawMtime)
		: 0

	const isRaw = RAW_PHOTO_EXTENSIONS.has(pathParts.extension)
	const isSocialCopy = SOCIAL_PHOTO_HINT_RE.test(pathParts.normalizedPath)
	const isCropHint = CROP_EDIT_HINT_RE.test(pathParts.fileName)
	const isProtected = Boolean(file.isOrigin || file.protected)

	return {
		key,
		file,
		groupId: group?.id ?? null,
		groupHash: typeof group?.hash === 'string' ? group.hash : '',
		name: file.name || pathParts.fileName || 'image',
		path: file.path || pathParts.normalizedPath || '',
		folder: pathParts.folder,
		stem: pathParts.stem,
		canonicalStem: normalizeCanonicalPhotoStem(pathParts.stem),
		extension: pathParts.extension,
		format: probe?.format || pathParts.extension.toUpperCase() || 'IMAGE',
		mimetype: file.mimetype || '',
		size,
		sizeFormatted: formatBytes(size),
		mtime,
		isRaw,
		isSocialCopy,
		isCropHint,
		isProtected,
		probed: Boolean(probe?.probed || pHash || dHash || dimensions),
		dimensions,
		width: dimensions?.width || 0,
		height: dimensions?.height || 0,
		pixels: dimensions?.pixels || 0,
		megapixels: dimensions?.megapixels || '',
		aspectRatio: dimensions?.aspectRatio || '',
		exif,
		pHash,
		dHash,
		histogram,
		sharpness,
		sharpnessScore: sharpness?.sharpnessScore ?? null,
		qualityScore: 0,
		variantTag: 'exact',
		variantLabel: 'Exact duplicate',
		isSurvivor: false,
		deletable: false,
	}
}

/**
 * Compute overall quality score for ranking photo master candidates.
 *
 * @param {object} item - Enriched photo record.
 * @param {string} keepRule - Active keep rule.
 * @return {number} Deterministic quality score.
 */
function scorePhotoCandidate(item, keepRule) {
	const pixels = item.pixels || 0
	const sharpness = item.sharpnessScore !== null ? item.sharpnessScore : 50
	const rawBonus = item.isRaw ? 100000000 : 0
	const exifBonus = item.exif?.hasExif ? 500000 : 0
	const socialPenalty = item.isSocialCopy ? -2000000 : 0
	const cropPenalty = item.isCropHint ? -1500000 : 0
	const losslessBonus = (item.extension === 'png' || item.extension === 'tiff' || item.extension === 'tif') ? 5000000 : 0

	if (keepRule === 'raw_master') {
		return rawBonus + losslessBonus + pixels + (sharpness * 1000) + item.size
	}
	if (keepRule === 'sharpest') {
		return (sharpness * 10000000) + pixels + (item.isRaw ? 500000 : 0) + item.size
	}
	if (keepRule === 'highest_resolution') {
		return (pixels * 10) + item.size + (sharpness * 100) + (item.isRaw ? 1000 : 0)
	}
	if (keepRule === 'oldest') {
		return item.mtime > 0 ? -item.mtime : 0
	}
	if (keepRule === 'newest') {
		return item.mtime
	}
	if (keepRule === 'shortest_path') {
		const pathLen = item.path ? item.path.length : 9999
		return -pathLen * 10000 + pixels + item.size
	}

	// Default: highest_quality
	return rawBonus + losslessBonus + exifBonus + socialPenalty + cropPenalty + (pixels * 2) + (sharpness * 25000) + Math.min(item.size, 50000000)
}

/**
 * Select the survivor entry for a cluster of enriched photos.
 *
 * @param {Array<object>} items - Cluster photo entries.
 * @param {string} keepRule - Survivor selection strategy.
 * @param {string|null} pinnedKey - Optional manually pinned survivor key.
 * @return {object} Winning survivor entry.
 */
function selectClusterSurvivor(items, keepRule, pinnedKey = null) {
	if (pinnedKey) {
		const pinned = items.find(item => item.key === pinnedKey)
		if (pinned) {
			return pinned
		}
	}

	const sorted = [...items].sort((a, b) => {
		if (a.isProtected !== b.isProtected) {
			return a.isProtected ? -1 : 1
		}
		const scoreDelta = scorePhotoCandidate(b, keepRule) - scorePhotoCandidate(a, keepRule)
		if (scoreDelta !== 0) {
			return scoreDelta
		}
		return a.path.localeCompare(b.path)
	})
	return sorted[0]
}

/**
 * Analyze crop, aspect ratio, orientation, resolution, and compression relationship
 * between a master survivor photo and a candidate photo.
 *
 * @param {object|null|undefined} master - Master photo record or raw file.
 * @param {object|null|undefined} candidate - Candidate photo record or raw file.
 * @return {{
 *   relationship: 'exact-match'|'raw-vs-preview'|'orientation-rotated'|'aspect-cropped'|'social-reencoded'|'downscaled-copy'|'upscaled-or-reencoded',
 *   badgeLabel: string,
 *   summary: string,
 *   cropRetentionPct: number,
 *   aspectDeltaPct: number,
 *   resolutionDeltaPct: number,
 *   sharpnessDelta: number|null,
 *   sizeRatioPct: number,
 *   cropOverlayBox: { xPct: number, yPct: number, widthPct: number, heightPct: number }
 * }} Framing and crop comparison analysis.
 */
export function analyzeCropAndFraming(master, candidate) {
	const w1 = Number(master?.width || master?.dimensions?.width || 0)
	const h1 = Number(master?.height || master?.dimensions?.height || 0)
	const w2 = Number(candidate?.width || candidate?.dimensions?.width || 0)
	const h2 = Number(candidate?.height || candidate?.dimensions?.height || 0)

	const p1 = w1 > 0 && h1 > 0 ? w1 * h1 : 0
	const p2 = w2 > 0 && h2 > 0 ? w2 * h2 : 0
	const resolutionDeltaPct = p1 > 0 && p2 > 0
		? Math.round(((p2 - p1) / p1) * 1000) / 10
		: 0

	const s1 = Number(master?.size || 0)
	const s2 = Number(candidate?.size || 0)
	const sizeRatioPct = s1 > 0 ? Math.round((s2 / s1) * 1000) / 10 : 100

	const sharp1 = Number.isFinite(Number(master?.sharpnessScore)) ? Number(master.sharpnessScore) : null
	const sharp2 = Number.isFinite(Number(candidate?.sharpnessScore)) ? Number(candidate.sharpnessScore) : null
	const sharpnessDelta = sharp1 !== null && sharp2 !== null ? sharp2 - sharp1 : null

	let aspectDeltaPct = 0
	let cropRetentionPct = 100
	let cropOverlayBox = { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }
	let rotatedOrientation = false

	if (w1 > 0 && h1 > 0 && w2 > 0 && h2 > 0) {
		const ar1 = w1 / h1
		const ar2 = w2 / h2
		aspectDeltaPct = Math.round((Math.abs(ar1 - ar2) / Math.max(ar1, ar2)) * 1000) / 10
		const swappedAr2 = h2 / w2
		const swappedDelta = Math.abs(ar1 - swappedAr2) / Math.max(ar1, swappedAr2)
		if (aspectDeltaPct > 12 && swappedDelta <= 0.04) {
			rotatedOrientation = true
		} else if (aspectDeltaPct > 3.5) {
			// Fit candidate aspect inside master frame centered to visualize crop framing
			if (ar2 > ar1) {
				const hFrac = Math.max(0.15, Math.min(1, ar1 / ar2))
				cropRetentionPct = Math.round(hFrac * 1000) / 10
				cropOverlayBox = {
					xPct: 0,
					yPct: Math.round(((1 - hFrac) / 2) * 1000) / 10,
					widthPct: 100,
					heightPct: Math.round(hFrac * 1000) / 10,
				}
			} else {
				const wFrac = Math.max(0.15, Math.min(1, ar2 / ar1))
				cropRetentionPct = Math.round(wFrac * 1000) / 10
				cropOverlayBox = {
					xPct: Math.round(((1 - wFrac) / 2) * 1000) / 10,
					yPct: 0,
					widthPct: Math.round(wFrac * 1000) / 10,
					heightPct: 100,
				}
			}
		}
	}

	const orient1 = master?.exif?.orientationLabel || ''
	const orient2 = candidate?.exif?.orientationLabel || ''
	if (!rotatedOrientation && orient1 && orient2 && orient1 !== orient2) {
		rotatedOrientation = true
	}

	const isRawPair = Boolean(master?.isRaw) !== Boolean(candidate?.isRaw)
	const isSocial = Boolean(candidate?.isSocialCopy)
		|| (!candidate?.exif?.hasExif && Boolean(master?.exif?.hasExif) && s1 > 0 && s2 > 0 && s2 < s1 * 0.55)

	let relationship = 'exact-match'
	let badgeLabel = 'Exact duplicate'
	let summary = 'Identical framing and pixel dimensions.'

	if (rotatedOrientation) {
		relationship = 'orientation-rotated'
		badgeLabel = 'Rotated / EXIF orient'
		summary = 'Dimensions or EXIF orientation tag differ by 90/180/270 deg rotation.'
	} else if (aspectDeltaPct > 3.5 || candidate?.isCropHint) {
		relationship = 'aspect-cropped'
		const arMaster = computeAspectRatioLabel(w1, h1) || 'master'
		const arCand = computeAspectRatioLabel(w2, h2) || 'crop'
		badgeLabel = arMaster !== arCand ? `Crop (${arMaster} -> ${arCand})` : 'Cropped edit'
		summary = `Aspect framing retains ~${cropRetentionPct}% of master frame (${arMaster} to ${arCand}).`
	} else if (isSocial) {
		relationship = 'social-reencoded'
		badgeLabel = 'Social / re-encoded'
		summary = `Messenger or social recompression (${sizeRatioPct}% of master size).`
	} else if (isRawPair) {
		relationship = 'raw-vs-preview'
		badgeLabel = candidate?.isRaw ? 'RAW archive' : 'JPEG preview'
		summary = candidate?.isRaw
			? 'Uncompressed RAW master alongside processed raster copy.'
			: 'Processed raster preview derived from RAW master.'
	} else if (p1 > 0 && p2 > 0 && p2 < p1 * 0.92) {
		relationship = 'downscaled-copy'
		badgeLabel = 'Downscaled'
		summary = `Lower resolution copy (${Math.abs(resolutionDeltaPct)}% fewer pixels than master).`
	} else if (s1 > 0 && s2 > 0 && s2 !== s1) {
		relationship = 'upscaled-or-reencoded'
		badgeLabel = s2 < s1 ? 'Recompressed' : 'Larger re-save'
		summary = `Same dimensions with ${sizeRatioPct}% file size ratio vs master.`
	}

	return {
		relationship,
		badgeLabel,
		summary,
		cropRetentionPct,
		aspectDeltaPct,
		resolutionDeltaPct,
		sharpnessDelta,
		sizeRatioPct,
		cropOverlayBox,
	}
}

/**
 * Compute similarity score between two enriched photo entries using pHash, dHash, and Histogram.
 *
 * @param {object} photoA - First photo entry.
 * @param {object} photoB - Second photo entry.
 * @param {'combined'|'phash'|'dhash'} [matchMode='combined'] - Perceptual match strategy.
 * @return {{
 *   pHashSimilarity: { distance: number, similarityPercent: number }|null,
 *   dHashSimilarity: { distance: number, similarityPercent: number }|null,
 *   histogramComparison: object|null,
 *   combinedSimilarityPct: number|null,
 *   minDistance: number|null,
 *   cropAnalysis: object,
 *   exifDiffRows: Array<{ label: string, leftValue: string, rightValue: string, differs: boolean }>
 * }} Pairwise comparison metrics.
 */
export function comparePhotoPair(photoA, photoB, matchMode = 'combined') {
	const pHashSimilarity = photoA?.pHash && photoB?.pHash
		? computeHammingSimilarity(photoA.pHash, photoB.pHash)
		: null
	const dHashSimilarity = photoA?.dHash && photoB?.dHash
		? computeHammingSimilarity(photoA.dHash, photoB.dHash)
		: null
	const histogramComparison = photoA?.histogram && photoB?.histogram
		? compareColorHistograms(photoA.histogram, photoB.histogram)
		: null

	let combinedSimilarityPct = null
	let minDistance = null

	if (matchMode === 'phash' && pHashSimilarity) {
		combinedSimilarityPct = pHashSimilarity.similarityPercent
		minDistance = pHashSimilarity.distance
	} else if (matchMode === 'dhash' && dHashSimilarity) {
		combinedSimilarityPct = dHashSimilarity.similarityPercent
		minDistance = dHashSimilarity.distance
	} else {
		const weightedParts = []
		if (pHashSimilarity) {
			weightedParts.push({ value: pHashSimilarity.similarityPercent, weight: 0.5 })
			minDistance = pHashSimilarity.distance
		}
		if (dHashSimilarity) {
			weightedParts.push({ value: dHashSimilarity.similarityPercent, weight: 0.35 })
			minDistance = minDistance === null ? dHashSimilarity.distance : Math.min(minDistance, dHashSimilarity.distance)
		}
		if (histogramComparison) {
			weightedParts.push({ value: histogramComparison.combinedSimilarityPct, weight: 0.15 })
		}
		if (weightedParts.length > 0) {
			const totalWeight = weightedParts.reduce((s, p) => s + p.weight, 0)
			const score = weightedParts.reduce((s, p) => s + (p.value * p.weight), 0) / totalWeight
			combinedSimilarityPct = Math.round(score * 10) / 10
		} else if (photoA?.groupHash && photoB?.groupHash && photoA.groupHash === photoB.groupHash) {
			combinedSimilarityPct = 100
			minDistance = 0
		}
	}

	const cropAnalysis = analyzeCropAndFraming(photoA, photoB)

	const fmtDims = item => item?.dimensions?.formattedDimensions || (item?.width > 0 && item?.height > 0 ? `${item.width} x ${item.height} px` : 'Unknown')
	const fmtMp = item => item?.dimensions?.megapixels || computeMegapixelsLabel(item?.width, item?.height) || 'n/a'
	const fmtAspect = item => item?.dimensions?.aspectRatio || computeAspectRatioLabel(item?.width, item?.height) || 'n/a'
	const fmtSharp = item => item?.sharpness ? `${item.sharpness.sharpnessScore}/100 (${item.sharpness.sharpnessTier})` : 'Unprobed'

	const rawRows = [
		{ label: 'Dimensions', leftValue: fmtDims(photoA), rightValue: fmtDims(photoB) },
		{ label: 'Megapixels & Aspect', leftValue: `${fmtMp(photoA)} (${fmtAspect(photoA)})`, rightValue: `${fmtMp(photoB)} (${fmtAspect(photoB)})` },
		{ label: 'File Size & Format', leftValue: `${photoA?.sizeFormatted || '0 B'} (${photoA?.format || ''})`, rightValue: `${photoB?.sizeFormatted || '0 B'} (${photoB?.format || ''})` },
		{ label: 'Sharpness Score', leftValue: fmtSharp(photoA), rightValue: fmtSharp(photoB) },
		{ label: 'Camera', leftValue: photoA?.exif?.camera || 'None', rightValue: photoB?.exif?.camera || 'None' },
		{ label: 'Capture Settings', leftValue: photoA?.exif?.captureSettings || 'None', rightValue: photoB?.exif?.captureSettings || 'None' },
		{ label: 'Color Space', leftValue: photoA?.exif?.colorSpace || 'Unspecified', rightValue: photoB?.exif?.colorSpace || 'Unspecified' },
		{ label: 'Orientation', leftValue: photoA?.exif?.orientationLabel || 'Normal', rightValue: photoB?.exif?.orientationLabel || 'Normal' },
	]

	const exifDiffRows = rawRows.map(row => ({
		...row,
		differs: row.leftValue !== row.rightValue,
	}))

	return {
		pHashSimilarity,
		dHashSimilarity,
		histogramComparison,
		combinedSimilarityPct,
		minDistance,
		cropAnalysis,
		exifDiffRows,
	}
}

/**
 * Normalize query options for photo perceptual catalog generation.
 *
 * @param {object} [rawOptions={}] - Raw options object.
 * @return {object} Normalized options.
 */
export function normalizePhotoCatalogOptions(rawOptions = {}) {
	const keepRule = PHOTO_KEEP_RULES.includes(rawOptions.keepRule)
		? rawOptions.keepRule
		: 'highest_quality'
	const variantFilter = PHOTO_VARIANT_FILTERS.includes(rawOptions.variantFilter)
		? rawOptions.variantFilter
		: 'all'
	const matchMode = PHOTO_HASH_MODES.includes(rawOptions.matchMode)
		? rawOptions.matchMode
		: 'combined'
	const sortBy = PHOTO_SORT_MODES.includes(rawOptions.sortBy)
		? rawOptions.sortBy
		: 'reclaimable_desc'
	const clusteringMode = rawOptions.clusteringMode === 'groups' ? 'groups' : 'perceptual'

	const rawHamming = Number(rawOptions.maxHammingDistance)
	const maxHammingDistance = Number.isFinite(rawHamming)
		? Math.max(MIN_HAMMING_DISTANCE, Math.min(MAX_HAMMING_DISTANCE, Math.round(rawHamming)))
		: DEFAULT_HAMMING_DISTANCE

	const rawMinSim = Number(rawOptions.minSimilarityPct)
	const minSimilarityPct = Number.isFinite(rawMinSim)
		? Math.max(MIN_SIMILARITY_PCT, Math.min(MAX_SIMILARITY_PCT, Math.round(rawMinSim)))
		: DEFAULT_SIMILARITY_PCT

	return {
		keepRule,
		variantFilter,
		matchMode,
		sortBy,
		clusteringMode,
		maxHammingDistance,
		minSimilarityPct,
		searchQuery: typeof rawOptions.searchQuery === 'string' ? rawOptions.searchQuery.trim().toLowerCase() : '',
		probeByKey: rawOptions.probeByKey && typeof rawOptions.probeByKey === 'object' ? rawOptions.probeByKey : {},
		manualKeepByCluster: rawOptions.manualKeepByCluster && typeof rawOptions.manualKeepByCluster === 'object'
			? rawOptions.manualKeepByCluster
			: {},
	}
}

/**
 * Build the complete Similar-Photo Perceptual catalog across duplicate groups.
 *
 * @param {Array<object>|null|undefined} duplicates - Duplicate groups list.
 * @param {object} [rawOptions={}] - Clustering, filter, and keep-rule options.
 * @return {{
 *   clusters: Array<object>,
 *   summary: {
 *     totalClusters: number,
 *     totalPhotos: number,
 *     croppedCount: number,
 *     lowerResCount: number,
 *     socialCount: number,
 *     rawPairCount: number,
 *     probedCount: number,
 *     totalReclaimableBytes: number,
 *     totalReclaimableFormatted: string
 *   }
 * }} Built perceptual photo catalog.
 */
export function buildPhotoPerceptualCatalog(duplicates, rawOptions = {}) {
	const options = normalizePhotoCatalogOptions(rawOptions)
	const groups = Array.isArray(duplicates) ? duplicates : []

	const records = []
	const seenKeys = new Set()

	for (const group of groups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const enriched = enrichPhotoRecord(file, group, options.probeByKey)
			if (!enriched || seenKeys.has(enriched.key)) {
				continue
			}
			seenKeys.add(enriched.key)
			records.push(enriched)
		}
	}

	if (records.length === 0) {
		return {
			clusters: [],
			summary: {
				totalClusters: 0,
				totalPhotos: 0,
				croppedCount: 0,
				lowerResCount: 0,
				socialCount: 0,
				rawPairCount: 0,
				probedCount: 0,
				totalReclaimableBytes: 0,
				totalReclaimableFormatted: formatBytes(0),
			},
		}
	}

	// Union-Find clustering
	const parent = records.map((_, i) => i)
	const find = i => {
		let cur = i
		while (parent[cur] !== cur) {
			parent[cur] = parent[parent[cur]]
			cur = parent[cur]
		}
		return cur
	}
	const union = (a, b) => {
		const ra = find(a)
		const rb = find(b)
		if (ra !== rb) {
			parent[rb] = ra
		}
	}

	// 1) Always group photos sharing exact duplicate group ID/hash
	const byGroupKey = new Map()
	for (let i = 0; i < records.length; i++) {
		const rec = records[i]
		const gKey = rec.groupId !== null && rec.groupId !== undefined
			? `id:${String(rec.groupId)}`
			: (rec.groupHash ? `hash:${rec.groupHash}` : '')
		if (!gKey) {
			continue
		}
		if (byGroupKey.has(gKey)) {
			union(byGroupKey.get(gKey), i)
		} else {
			byGroupKey.set(gKey, i)
		}
	}

	// 2) In perceptual mode, also merge cross-group perceptual matches & canonical stems
	if (options.clusteringMode === 'perceptual') {
		const byStem = new Map()
		for (let i = 0; i < records.length; i++) {
			const rec = records[i]
			if (rec.canonicalStem) {
				if (byStem.has(rec.canonicalStem)) {
					union(byStem.get(rec.canonicalStem), i)
				} else {
					byStem.set(rec.canonicalStem, i)
				}
			}
		}

		// Pairwise perceptual hash check (bounded cleanly to avoid O(N^2) blowup on giant scans)
		const perceptualIndices = []
		for (let i = 0; i < records.length; i++) {
			if (records[i].pHash || records[i].dHash) {
				perceptualIndices.push(i)
			}
		}
		const maxCheck = Math.min(perceptualIndices.length, 240)
		for (let a = 0; a < maxCheck; a++) {
			const idxA = perceptualIndices[a]
			for (let b = a + 1; b < maxCheck; b++) {
				const idxB = perceptualIndices[b]
				if (find(idxA) === find(idxB)) {
					continue
				}
				const pair = comparePhotoPair(records[idxA], records[idxB], options.matchMode)
				if (
					pair.minDistance !== null
					&& pair.minDistance <= options.maxHammingDistance
					&& pair.combinedSimilarityPct !== null
					&& pair.combinedSimilarityPct >= options.minSimilarityPct
				) {
					union(idxA, idxB)
				}
			}
		}
	}

	const clusterBuckets = new Map()
	for (let i = 0; i < records.length; i++) {
		const root = find(i)
		if (!clusterBuckets.has(root)) {
			clusterBuckets.set(root, [])
		}
		clusterBuckets.get(root).push(records[i])
	}

	const rawClusters = []
	for (const items of clusterBuckets.values()) {
		if (items.length < 2) {
			continue
		}

		const clusterKeys = items.map(item => item.key).sort()
		const clusterKey = `photo-cluster:${clusterKeys[0]}`
		const pinnedKey = options.manualKeepByCluster[clusterKey] || null
		const survivor = selectClusterSurvivor(items, options.keepRule, pinnedKey)

		let hasCropped = false
		let hasLowerRes = false
		let hasSocial = false
		let hasRawPair = false
		let hasUnprobed = false
		let minSimilarity = 100
		let maxPixels = survivor.pixels || 0
		let minPixels = survivor.pixels > 0 ? survivor.pixels : Number.POSITIVE_INFINITY
		let maxSharpness = survivor.sharpnessScore !== null ? survivor.sharpnessScore : -1
		let minSharpness = survivor.sharpnessScore !== null ? survivor.sharpnessScore : 101

		const enrichedFiles = items.map(item => {
			const isSurvivor = item.key === survivor.key
			const comparison = isSurvivor
				? null
				: comparePhotoPair(survivor, item, options.matchMode)
			const relationship = comparison ? comparison.cropAnalysis.relationship : 'exact-match'
			const simPct = comparison && comparison.combinedSimilarityPct !== null
				? comparison.combinedSimilarityPct
				: 100

			if (!isSurvivor && (Boolean(survivor.isRaw) !== Boolean(item.isRaw))) {
				hasRawPair = true
			}
			if (!isSurvivor && simPct < minSimilarity) {
				minSimilarity = simPct
			}
			if (item.pixels > 0) {
				maxPixels = Math.max(maxPixels, item.pixels)
				minPixels = Math.min(minPixels, item.pixels)
			}
			if (item.sharpnessScore !== null) {
				maxSharpness = Math.max(maxSharpness, item.sharpnessScore)
				minSharpness = Math.min(minSharpness, item.sharpnessScore)
			}
			if (!item.probed) {
				hasUnprobed = true
			}

			let variantTag = 'exact'
			let variantLabel = 'Exact duplicate'
			if (isSurvivor) {
				variantTag = 'master'
				variantLabel = item.isRaw ? 'Master (RAW)' : 'Master survivor'
			} else if (relationship === 'aspect-cropped') {
				variantTag = 'cropped'
				variantLabel = comparison.cropAnalysis.badgeLabel
				hasCropped = true
			} else if (relationship === 'orientation-rotated') {
				variantTag = 'cropped'
				variantLabel = comparison.cropAnalysis.badgeLabel
				hasCropped = true
			} else if (relationship === 'raw-vs-preview') {
				variantTag = 'raw-pair'
				variantLabel = comparison.cropAnalysis.badgeLabel
				hasRawPair = true
			} else if (relationship === 'social-reencoded') {
				variantTag = 'social'
				variantLabel = comparison.cropAnalysis.badgeLabel
				hasSocial = true
			} else if (relationship === 'downscaled-copy') {
				variantTag = 'lower-res'
				variantLabel = comparison.cropAnalysis.badgeLabel
				hasLowerRes = true
			} else if (comparison) {
				variantLabel = comparison.cropAnalysis.badgeLabel
			}

			const deletable = !isSurvivor && !item.isProtected

			return {
				...item,
				isSurvivor,
				deletable,
				variantTag,
				variantLabel,
				similarityVsMaster: simPct,
				cropAnalysis: comparison ? comparison.cropAnalysis : null,
				pHashDistance: comparison?.pHashSimilarity?.distance ?? null,
				dHashDistance: comparison?.dHashSimilarity?.distance ?? null,
			}
		})

		// Sort files with survivor first, then highest quality/resolution
		enrichedFiles.sort((a, b) => {
			if (a.isSurvivor !== b.isSurvivor) {
				return a.isSurvivor ? -1 : 1
			}
			return scorePhotoCandidate(b, options.keepRule) - scorePhotoCandidate(a, options.keepRule)
		})

		const reclaimableBytes = enrichedFiles
			.filter(f => f.deletable)
			.reduce((sum, f) => sum + f.size, 0)

		const resolutionSpreadRatio = minPixels < Number.POSITIVE_INFINITY && minPixels > 0
			? Math.round((maxPixels / minPixels) * 10) / 10
			: 1
		const sharpnessSpread = maxSharpness >= 0 && minSharpness <= 100
			? Math.max(0, maxSharpness - minSharpness)
			: 0

		const primaryGroupId = survivor.groupId ?? enrichedFiles.find(f => f.groupId !== null)?.groupId ?? null
		const probedInCluster = enrichedFiles.filter(f => f.probed).length

		rawClusters.push({
			clusterKey,
			title: survivor.name,
			primaryGroupId,
			survivorKey: survivor.key,
			survivorFile: enrichedFiles[0],
			files: enrichedFiles,
			fileCount: enrichedFiles.length,
			probedCount: probedInCluster,
			minSimilarityPct: Math.round(minSimilarity * 10) / 10,
			hasCropped,
			hasLowerRes,
			hasSocial,
			hasRawPair,
			hasUnprobed,
			resolutionSpreadRatio,
			sharpnessSpread,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
		})
	}

	const filteredClusters = rawClusters.filter(cluster => {
		if (options.variantFilter === 'cropped' && !cluster.hasCropped) {
			return false
		}
		if (options.variantFilter === 'lower-res' && !cluster.hasLowerRes) {
			return false
		}
		if (options.variantFilter === 'social' && !cluster.hasSocial) {
			return false
		}
		if (options.variantFilter === 'raw-pairs' && !cluster.hasRawPair) {
			return false
		}
		if (options.variantFilter === 'unprobed' && !cluster.hasUnprobed) {
			return false
		}
		if (options.searchQuery) {
			const matches = cluster.files.some(f => {
				const hay = `${f.name} ${f.path} ${f.exif?.camera || ''} ${f.variantLabel}`.toLowerCase()
				return hay.includes(options.searchQuery)
			})
			if (!matches) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (options.sortBy === 'res_spread_desc') {
			if (b.resolutionSpreadRatio !== a.resolutionSpreadRatio) {
				return b.resolutionSpreadRatio - a.resolutionSpreadRatio
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (options.sortBy === 'similarity_asc') {
			if (a.minSimilarityPct !== b.minSimilarityPct) {
				return a.minSimilarityPct - b.minSimilarityPct
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (options.sortBy === 'cluster_size_desc') {
			if (b.fileCount !== a.fileCount) {
				return b.fileCount - a.fileCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		// reclaimable_desc
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return b.fileCount - a.fileCount
	})

	let totalPhotos = 0
	let croppedCount = 0
	let lowerResCount = 0
	let socialCount = 0
	let rawPairCount = 0
	let probedCount = 0
	let totalReclaimableBytes = 0

	for (const cluster of filteredClusters) {
		totalPhotos += cluster.fileCount
		probedCount += cluster.probedCount
		totalReclaimableBytes += cluster.reclaimableBytes
		for (const file of cluster.files) {
			if (file.variantTag === 'cropped') {
				croppedCount += 1
			} else if (file.variantTag === 'lower-res') {
				lowerResCount += 1
			} else if (file.variantTag === 'social') {
				socialCount += 1
			} else if (file.variantTag === 'raw-pair') {
				rawPairCount += 1
			}
		}
	}

	return {
		clusters: filteredClusters,
		summary: {
			totalClusters: filteredClusters.length,
			totalPhotos,
			croppedCount,
			lowerResCount,
			socialCount,
			rawPairCount,
			probedCount,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
		},
	}
}

/**
 * Select safe deletable inferior photo keys from a catalog, ensuring every
 * duplicate group retains at least one copy and protected origin files are never selected.
 *
 * @param {object} catalog - Output from `buildPhotoPerceptualCatalog`.
 * @param {object} [options={}] - Selection filter flags.
 * @param {boolean} [options.includeCropped=false] - Whether to include cropped variants.
 * @return {Array<string>} Array of safe deletable file keys.
 */
export function selectInferiorPhotoKeys(catalog, options = {}) {
	if (!catalog || !Array.isArray(catalog.clusters)) {
		return []
	}
	const includeCropped = Boolean(options.includeCropped)

	const totalByGroupHash = new Map()
	for (const cluster of catalog.clusters) {
		for (const item of cluster.files) {
			if (item.groupHash) {
				totalByGroupHash.set(item.groupHash, (totalByGroupHash.get(item.groupHash) || 0) + 1)
			}
		}
	}

	const keys = []
	for (const cluster of catalog.clusters) {
		for (const item of cluster.files) {
			if (!item.deletable || item.isProtected) {
				continue
			}
			if (item.variantTag === 'cropped' && !includeCropped) {
				continue
			}
			if (item.groupHash) {
				const remaining = totalByGroupHash.get(item.groupHash) || 0
				if (remaining <= 1) {
					continue
				}
				totalByGroupHash.set(item.groupHash, remaining - 1)
			}
			keys.push(item.key)
		}
	}
	return keys
}

/**
 * Export the photo perceptual catalog as a deterministic JSON string.
 *
 * @param {object} catalog - Catalog produced by `buildPhotoPerceptualCatalog`.
 * @param {string} [exportedAt] - Optional ISO timestamp.
 * @return {string} Formatted JSON string.
 */
export function exportPhotoPerceptualJson(catalog, exportedAt = new Date().toISOString()) {
	const safeCatalog = catalog && typeof catalog === 'object' ? catalog : { clusters: [], summary: {} }
	const payload = {
		schema: PHOTO_PERCEPTUAL_SCHEMA,
		exportedAt,
		summary: safeCatalog.summary || {},
		clusters: (safeCatalog.clusters || []).map(cluster => ({
			clusterKey: cluster.clusterKey,
			title: cluster.title,
			survivorKey: cluster.survivorKey,
			minSimilarityPct: cluster.minSimilarityPct,
			resolutionSpreadRatio: cluster.resolutionSpreadRatio,
			sharpnessSpread: cluster.sharpnessSpread,
			reclaimableBytes: cluster.reclaimableBytes,
			files: cluster.files.map(item => ({
				key: item.key,
				name: item.name,
				path: item.path,
				format: item.format,
				size: item.size,
				dimensions: item.dimensions ? `${item.width}x${item.height}` : '',
				sharpnessScore: item.sharpnessScore,
				pHash: item.pHash?.hex || '',
				dHash: item.dHash?.hex || '',
				camera: item.exif?.camera || '',
				variantTag: item.variantTag,
				variantLabel: item.variantLabel,
				similarityVsMaster: item.similarityVsMaster,
				isSurvivor: item.isSurvivor,
				isProtected: item.isProtected,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export the photo perceptual catalog as CWE-1236 formula-safe CSV.
 *
 * @param {object} catalog - Catalog produced by `buildPhotoPerceptualCatalog`.
 * @return {string} Safe CSV document.
 */
export function exportPhotoPerceptualCsv(catalog) {
	const headers = [
		'Cluster',
		'FileName',
		'Path',
		'Format',
		'SizeBytes',
		'Dimensions',
		'Sharpness',
		'pHash',
		'dHash',
		'Camera',
		'Variant',
		'SimilarityPct',
		'Role',
		'Protected',
	]
	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	const clusters = catalog && Array.isArray(catalog.clusters) ? catalog.clusters : []

	for (const cluster of clusters) {
		for (const item of cluster.files) {
			const row = [
				cluster.title,
				item.name,
				item.path,
				item.format,
				String(item.size),
				item.width > 0 && item.height > 0 ? `${item.width}x${item.height}` : '',
				item.sharpnessScore !== null ? String(item.sharpnessScore) : '',
				item.pHash?.hex || '',
				item.dHash?.hex || '',
				item.exif?.camera || '',
				item.variantLabel,
				String(item.similarityVsMaster),
				item.isSurvivor ? 'survivor' : 'copy',
				item.isProtected ? 'yes' : 'no',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\n')
}

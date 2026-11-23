/**
 * Pure visual media inspection, EXIF header parsing, perceptual dHash,
 * pixel-difference metrics, and resolution-winner evaluation helpers.
 */

const INSPECTABLE_IMAGE_PREFIX = 'image/'
const NON_RASTER_IMAGE_TYPES = new Set(['image/svg+xml'])

/**
 * Resolve a stable selection/cache key for a file entry.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {string|number|null} Stable file key or null.
 */
export function resolveVisualFileKey(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	if (file.id !== null && file.id !== undefined && file.id !== '') {
		return file.id
	}
	if (typeof file.path === 'string' && file.path.trim() !== '') {
		return file.path
	}
	return null
}

/**
 * Determine whether a MIME type represents a raster image suitable for pixel/EXIF inspection.
 *
 * @param {string|null|undefined} mimetype - MIME type string.
 * @return {boolean} True for raster image MIME types.
 */
export function isRasterImageMimetype(mimetype) {
	if (typeof mimetype !== 'string') {
		return false
	}
	const normalized = mimetype.trim().toLowerCase().split(';')[0]
	return normalized.startsWith(INSPECTABLE_IMAGE_PREFIX) && !NON_RASTER_IMAGE_TYPES.has(normalized)
}

/**
 * Determine whether a MIME type represents visual media (image or video).
 *
 * @param {string|null|undefined} mimetype - MIME type string.
 * @return {boolean} True for image/* or video/* MIME types.
 */
export function isVisualMediaMimetype(mimetype) {
	if (typeof mimetype !== 'string') {
		return false
	}
	const primary = mimetype.trim().toLowerCase().split('/')[0]
	return primary === 'image' || primary === 'video'
}

/**
 * Compute greatest common divisor for positive integers.
 *
 * @param {number} a - First positive integer.
 * @param {number} b - Second positive integer.
 * @return {number} Greatest common divisor.
 */
function gcd(a, b) {
	let x = Math.abs(Math.round(a))
	let y = Math.abs(Math.round(b))
	while (y !== 0) {
		const t = y
		y = x % y
		x = t
	}
	return x || 1
}

/**
 * Compute a concise human-readable aspect ratio label (e.g. '16:9', '4:3', '1:1', '1.85:1').
 *
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @return {string} Formatted aspect ratio or empty string when invalid.
 */
export function computeAspectRatioLabel(width, height) {
	const w = Number(width)
	const h = Number(height)
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return ''
	}
	const roundedW = Math.round(w)
	const roundedH = Math.round(h)
	const divisor = gcd(roundedW, roundedH)
	const rw = roundedW / divisor
	const rh = roundedH / divisor
	if (rw <= 32 && rh <= 32) {
		return `${rw}:${rh}`
	}
	const decimal = Math.round((roundedW / roundedH) * 100) / 100
	return `${decimal}:1`
}

/**
 * Compute formatted megapixels label (e.g. '12.2 MP', '0.31 MP').
 *
 * @param {number} width - Image width in pixels.
 * @param {number} height - Image height in pixels.
 * @return {string} Formatted megapixels label or empty string when invalid.
 */
export function computeMegapixelsLabel(width, height) {
	const w = Number(width)
	const h = Number(height)
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return ''
	}
	const mp = (w * h) / 1000000
	if (mp >= 10) {
		return `${Math.round(mp * 10) / 10} MP`
	}
	if (mp >= 1) {
		return `${Math.round(mp * 100) / 100} MP`
	}
	return `${Math.max(0.01, Math.round(mp * 100) / 100)} MP`
}

/**
 * Classify image orientation from pixel dimensions.
 *
 * @param {number} width - Width in pixels.
 * @param {number} height - Height in pixels.
 * @return {'landscape'|'portrait'|'square'|''} Orientation key.
 */
export function classifyOrientation(width, height) {
	const w = Number(width)
	const h = Number(height)
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return ''
	}
	if (w > h) {
		return 'landscape'
	}
	if (h > w) {
		return 'portrait'
	}
	return 'square'
}

/**
 * Extract normalized pixel dimensions from live inspected data or file metadata.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @param {object|null|undefined} liveDims - Optional live inspected dimensions `{ width, height }`.
 * @return {{
 *   width: number,
 *   height: number,
 *   pixels: number,
 *   megapixels: string,
 *   aspectRatio: string,
 *   orientation: string,
 *   formattedDimensions: string,
 *   source: 'live'|'file'
 * }|null} Normalized dimensions or null when unavailable.
 */
export function extractMediaDimensions(file, liveDims = null) {
	let width = 0
	let height = 0
	let source = 'file'

	const liveW = Number(liveDims?.width)
	const liveH = Number(liveDims?.height)
	if (Number.isFinite(liveW) && Number.isFinite(liveH) && liveW > 0 && liveH > 0) {
		width = Math.round(liveW)
		height = Math.round(liveH)
		source = 'live'
	} else if (file && typeof file === 'object') {
		const candidates = [
			[file.width, file.height],
			[file.dimensions?.width, file.dimensions?.height],
			[file.media?.width, file.media?.height],
			[file.metadata?.width, file.metadata?.height],
			[file.exif?.ExifImageWidth, file.exif?.ExifImageHeight],
			[file.exif?.ImageWidth, file.exif?.ImageHeight],
			[file.exif?.width, file.exif?.height],
		]
		for (const [cw, ch] of candidates) {
			const nw = Number(cw)
			const nh = Number(ch)
			if (Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0) {
				width = Math.round(nw)
				height = Math.round(nh)
				break
			}
		}
	}

	if (width <= 0 || height <= 0) {
		return null
	}

	return {
		width,
		height,
		pixels: width * height,
		megapixels: computeMegapixelsLabel(width, height),
		aspectRatio: computeAspectRatioLabel(width, height),
		orientation: classifyOrientation(width, height),
		formattedDimensions: `${width} x ${height} px`,
		source,
	}
}

/**
 * Evaluate resolution & quality winners across all files in a duplicate group.
 *
 * @param {Array<object>|null|undefined} files - Duplicate group file list.
 * @param {object} [liveDimensionsByKey] - Map of file key -> `{ width, height }`.
 * @return {{
 *   hasVisualMedia: boolean,
 *   hasDimensionData: boolean,
 *   inspectedCount: number,
 *   hasDimensionSpread: boolean,
 *   isExactDimensionMatch: boolean,
 *   hasQualityWinner: boolean,
 *   winnerIndex: number,
 *   maxPixels: number,
 *   perFile: Array<object>
 * }} Group resolution evaluation.
 */
export function evaluateResolutionWinners(files, liveDimensionsByKey = {}) {
	if (!Array.isArray(files) || files.length === 0) {
		return {
			hasVisualMedia: false,
			hasDimensionData: false,
			inspectedCount: 0,
			hasDimensionSpread: false,
			isExactDimensionMatch: false,
			hasQualityWinner: false,
			winnerIndex: -1,
			maxPixels: 0,
			perFile: [],
		}
	}

	const entries = files.map((file, index) => {
		const key = resolveVisualFileKey(file)
		const live = key !== null && liveDimensionsByKey && typeof liveDimensionsByKey === 'object'
			? liveDimensionsByKey[key]
			: null
		const dimensions = extractMediaDimensions(file, live)
		const rawSize = Number(file?.size)
		const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0
		const isVisual = isVisualMediaMimetype(file?.mimetype)
		return { index, file, key, dimensions, sizeBytes, isVisual }
	})

	const hasVisualMedia = entries.some(entry => entry.isVisual)
	const inspected = entries.filter(entry => entry.dimensions !== null)
	const inspectedCount = inspected.length
	const hasDimensionData = inspectedCount > 0

	if (inspectedCount === 0) {
		return {
			hasVisualMedia,
			hasDimensionData: false,
			inspectedCount: 0,
			hasDimensionSpread: false,
			isExactDimensionMatch: false,
			hasQualityWinner: false,
			winnerIndex: -1,
			maxPixels: 0,
			perFile: entries.map(() => ({
				dimensions: null,
				isResolutionWinner: false,
				isLowerResolution: false,
				isExactDimensionMatch: false,
				deltaVsBestPercent: 0,
			})),
		}
	}

	let minPixels = Number.POSITIVE_INFINITY
	let maxPixels = 0
	const dimSignatures = new Set()

	for (const entry of inspected) {
		const px = entry.dimensions.pixels
		if (px < minPixels) {
			minPixels = px
		}
		if (px > maxPixels) {
			maxPixels = px
		}
		dimSignatures.add(`${entry.dimensions.width}x${entry.dimensions.height}`)
	}

	const hasDimensionSpread = inspectedCount >= 2 && minPixels !== maxPixels
	const isExactDimensionMatch = inspectedCount >= 2 && dimSignatures.size === 1

	let winnerIndex = -1
	let hasQualityWinner = false
	if (hasDimensionSpread) {
		hasQualityWinner = true
		let bestEntry = inspected[0]
		for (let i = 1; i < inspected.length; i++) {
			const candidate = inspected[i]
			if (candidate.dimensions.pixels > bestEntry.dimensions.pixels) {
				bestEntry = candidate
			} else if (
				candidate.dimensions.pixels === bestEntry.dimensions.pixels
				&& candidate.sizeBytes > bestEntry.sizeBytes
			) {
				bestEntry = candidate
			}
		}
		winnerIndex = bestEntry.index
	}

	const perFile = entries.map(entry => {
		if (!entry.dimensions) {
			return {
				dimensions: null,
				isResolutionWinner: false,
				isLowerResolution: false,
				isExactDimensionMatch: false,
				deltaVsBestPercent: 0,
			}
		}
		const isResolutionWinner = hasQualityWinner && entry.index === winnerIndex
		const isLowerResolution = hasDimensionSpread && entry.dimensions.pixels < maxPixels
		const deltaVsBestPercent = maxPixels > 0 && entry.dimensions.pixels < maxPixels
			? -Math.round(((maxPixels - entry.dimensions.pixels) / maxPixels) * 100)
			: 0
		return {
			dimensions: entry.dimensions,
			isResolutionWinner,
			isLowerResolution,
			isExactDimensionMatch,
			deltaVsBestPercent,
		}
	})

	return {
		hasVisualMedia,
		hasDimensionData,
		inspectedCount,
		hasDimensionSpread,
		isExactDimensionMatch,
		hasQualityWinner,
		winnerIndex,
		maxPixels,
		perFile,
	}
}

/**
 * Select non-protected lower-resolution file keys for deletion while always keeping
 * the resolution winner and any protected origin copies.
 *
 * @param {Array<object>|null|undefined} files - Duplicate group file entries.
 * @param {object} [liveDimensionsByKey] - Optional inspected dimension map.
 * @return {Array<string|number>} Selection keys of inferior-resolution copies.
 */
export function selectLowerResolutionKeys(files, liveDimensionsByKey = {}) {
	if (!Array.isArray(files) || files.length < 2) {
		return []
	}
	const evaluation = evaluateResolutionWinners(files, liveDimensionsByKey)
	if (!evaluation.hasDimensionSpread || evaluation.winnerIndex === -1) {
		return []
	}

	const keysToSelect = []
	let keptCount = 0

	for (let i = 0; i < files.length; i++) {
		const file = files[i]
		const info = evaluation.perFile[i]
		const isProtected = Boolean(file?.isInOriginFolder)
		const shouldDelete = !isProtected && Boolean(info?.isLowerResolution) && i !== evaluation.winnerIndex
		if (shouldDelete) {
			const key = resolveVisualFileKey(file)
			if (key !== null) {
				keysToSelect.push(key)
			}
		} else {
			keptCount += 1
		}
	}

	return keptCount >= 1 ? keysToSelect : []
}

/**
 * Read an ASCII string slice safely from a DataView.
 *
 * @param {DataView} view - Binary DataView.
 * @param {number} start - Byte offset.
 * @param {number} length - Byte count.
 * @return {string} Extracted ASCII string.
 */
function readAscii(view, start, length) {
	if (start < 0 || start + length > view.byteLength) {
		return ''
	}
	let out = ''
	for (let i = 0; i < length; i++) {
		const code = view.getUint8(start + i)
		if (code === 0) {
			break
		}
		out += String.fromCharCode(code)
	}
	return out.trim()
}

const TIFF_TYPE_SIZES = Object.freeze({
	1: 1, // BYTE
	2: 1, // ASCII
	3: 2, // SHORT
	4: 4, // LONG
	5: 8, // RATIONAL
	7: 1, // UNDEFINED
	9: 4, // SLONG
	10: 8, // SRATIONAL
})

/**
 * Read a single TIFF/EXIF tag value safely with bounds checking.
 *
 * @param {DataView} view - DataView over TIFF buffer.
 * @param {number} tiffStart - Byte offset of TIFF header start.
 * @param {number} entryOffset - Byte offset of IFD entry.
 * @param {boolean} littleEndian - Endianness flag.
 * @return {*} Parsed value or null.
 */
function readTiffTagValue(view, tiffStart, entryOffset, littleEndian) {
	if (entryOffset + 12 > view.byteLength) {
		return null
	}
	const type = view.getUint16(entryOffset + 2, littleEndian)
	const count = view.getUint32(entryOffset + 4, littleEndian)
	const unitSize = TIFF_TYPE_SIZES[type]
	if (!unitSize || count === 0 || count > 4096) {
		return null
	}
	const totalBytes = unitSize * count
	const valueOffset = totalBytes <= 4
		? entryOffset + 8
		: tiffStart + view.getUint32(entryOffset + 8, littleEndian)

	if (valueOffset < tiffStart || valueOffset + totalBytes > view.byteLength) {
		return null
	}

	if (type === 2) {
		return readAscii(view, valueOffset, totalBytes)
	}
	if (type === 3) {
		return view.getUint16(valueOffset, littleEndian)
	}
	if (type === 4) {
		return view.getUint32(valueOffset, littleEndian)
	}
	if (type === 9) {
		return view.getInt32(valueOffset, littleEndian)
	}
	if (type === 5 || type === 10) {
		const num = type === 5
			? view.getUint32(valueOffset, littleEndian)
			: view.getInt32(valueOffset, littleEndian)
		const den = type === 5
			? view.getUint32(valueOffset + 4, littleEndian)
			: view.getInt32(valueOffset + 4, littleEndian)
		if (den === 0) {
			return null
		}
		return num / den
	}
	return null
}

/**
 * Parse a TIFF IFD table safely up to a bounded entry count.
 *
 * @param {DataView} view - Binary DataView.
 * @param {number} tiffStart - TIFF header start offset.
 * @param {number} ifdOffset - Relative IFD offset from tiffStart.
 * @param {boolean} littleEndian - Endianness flag.
 * @return {object} Map of TIFF tag ID to parsed value.
 */
function parseTiffIfd(view, tiffStart, ifdOffset, littleEndian) {
	const tags = {}
	const absOffset = tiffStart + ifdOffset
	if (absOffset < tiffStart || absOffset + 2 > view.byteLength) {
		return tags
	}
	const entryCount = Math.min(256, view.getUint16(absOffset, littleEndian))
	for (let i = 0; i < entryCount; i++) {
		const entryOffset = absOffset + 2 + (i * 12)
		if (entryOffset + 12 > view.byteLength) {
			break
		}
		const tagId = view.getUint16(entryOffset, littleEndian)
		const value = readTiffTagValue(view, tiffStart, entryOffset, littleEndian)
		if (value !== null) {
			tags[tagId] = value
		}
	}
	return tags
}

/**
 * Parse EXIF APP1 TIFF block inside a JPEG payload.
 *
 * @param {DataView} view - Binary DataView.
 * @param {number} tiffStart - Offset right after 'Exif\0\0'.
 * @return {object|null} Extracted raw EXIF fields or null.
 */
function parseExifTiffBlock(view, tiffStart) {
	if (tiffStart + 8 > view.byteLength) {
		return null
	}
	const byteOrder = view.getUint16(tiffStart, false)
	let littleEndian = false
	if (byteOrder === 0x4949) {
		littleEndian = true
	} else if (byteOrder === 0x4d4d) {
		littleEndian = false
	} else {
		return null
	}

	const magic = view.getUint16(tiffStart + 2, littleEndian)
	if (magic !== 42) {
		return null
	}

	const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian)
	const ifd0 = parseTiffIfd(view, tiffStart, ifd0Offset, littleEndian)
	const exifIfdOffset = Number(ifd0[0x8769])
	const exifIfd = Number.isInteger(exifIfdOffset) && exifIfdOffset > 0
		? parseTiffIfd(view, tiffStart, exifIfdOffset, littleEndian)
		: {}
	const gpsIfdOffset = Number(ifd0[0x8825])
	const gpsIfd = Number.isInteger(gpsIfdOffset) && gpsIfdOffset > 0
		? parseTiffIfd(view, tiffStart, gpsIfdOffset, littleEndian)
		: {}

	return {
		make: typeof ifd0[0x010f] === 'string' ? ifd0[0x010f] : '',
		model: typeof ifd0[0x0110] === 'string' ? ifd0[0x0110] : '',
		orientation: Number.isInteger(ifd0[0x0112]) ? ifd0[0x0112] : null,
		dateTaken: typeof exifIfd[0x9003] === 'string'
			? exifIfd[0x9003]
			: (typeof ifd0[0x0132] === 'string' ? ifd0[0x0132] : ''),
		exposureTime: typeof exifIfd[0x829a] === 'number' ? exifIfd[0x829a] : null,
		fNumber: typeof exifIfd[0x829d] === 'number' ? exifIfd[0x829d] : null,
		iso: Number.isInteger(exifIfd[0x8827]) ? exifIfd[0x8827] : null,
		focalLength: typeof exifIfd[0x920a] === 'number' ? exifIfd[0x920a] : null,
		colorSpace: Number.isInteger(exifIfd[0xa001]) ? exifIfd[0xa001] : null,
		exifWidth: Number.isInteger(exifIfd[0xa002]) ? exifIfd[0xa002] : null,
		exifHeight: Number.isInteger(exifIfd[0xa003]) ? exifIfd[0xa003] : null,
		lensModel: typeof exifIfd[0xa434] === 'string' ? exifIfd[0xa434] : '',
		gpsPresent: Object.keys(gpsIfd).length > 0 || Boolean(ifd0[0x8825]),
	}
}

/**
 * Parse binary image headers (PNG, GIF, BMP, WebP, JPEG + EXIF APP1) from an ArrayBuffer or Uint8Array.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} input - Image binary header bytes.
 * @return {{ format: string, width: number, height: number, exif: object|null }|null} Parsed header or null.
 */
export function parseImageHeaderAndExif(input) {
	if (!input) {
		return null
	}
	const bytes = input instanceof Uint8Array
		? input
		: (input instanceof ArrayBuffer ? new Uint8Array(input) : null)
	if (!bytes || bytes.byteLength < 10) {
		return null
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

	// PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
	if (
		bytes.byteLength >= 24
		&& bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
		&& readAscii(view, 12, 4) === 'IHDR'
	) {
		const width = view.getUint32(16, false)
		const height = view.getUint32(20, false)
		if (width > 0 && height > 0) {
			return { format: 'PNG', width, height, exif: null }
		}
	}

	// GIF: GIF87a / GIF89a
	if (bytes.byteLength >= 10 && readAscii(view, 0, 3) === 'GIF') {
		const width = view.getUint16(6, true)
		const height = view.getUint16(8, true)
		if (width > 0 && height > 0) {
			return { format: 'GIF', width, height, exif: null }
		}
	}

	// BMP: 'BM'
	if (bytes.byteLength >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
		const width = Math.abs(view.getInt32(18, true))
		const height = Math.abs(view.getInt32(22, true))
		if (width > 0 && height > 0) {
			return { format: 'BMP', width, height, exif: null }
		}
	}

	// WebP: RIFF....WEBP
	if (
		bytes.byteLength >= 30
		&& readAscii(view, 0, 4) === 'RIFF'
		&& readAscii(view, 8, 4) === 'WEBP'
	) {
		const chunk = readAscii(view, 12, 4)
		if (chunk === 'VP8X' && bytes.byteLength >= 30) {
			const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
			const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
			return { format: 'WEBP', width, height, exif: null }
		}
		if (chunk === 'VP8L' && bytes.byteLength >= 25) {
			const bits = view.getUint32(21, true)
			const width = (bits & 0x3fff) + 1
			const height = ((bits >> 14) & 0x3fff) + 1
			return { format: 'WEBP', width, height, exif: null }
		}
		if (chunk === 'VP8 ' && bytes.byteLength >= 30) {
			const width = view.getUint16(26, true) & 0x3fff
			const height = view.getUint16(28, true) & 0x3fff
			if (width > 0 && height > 0) {
				return { format: 'WEBP', width, height, exif: null }
			}
		}
	}

	// JPEG: FF D8
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2
		let width = 0
		let height = 0
		let exif = null
		let guard = 0

		while (offset + 4 <= bytes.byteLength && guard < 128) {
			guard += 1
			if (bytes[offset] !== 0xff) {
				offset += 1
				continue
			}
			const marker = bytes[offset + 1]
			if (marker === 0xd9 || marker === 0xda) {
				break
			}
			if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8)) {
				offset += 2
				continue
			}
			const segLen = view.getUint16(offset + 2, false)
			if (segLen < 2 || offset + 2 + segLen > bytes.byteLength) {
				break
			}

			// APP1 Exif
			if (marker === 0xe1 && segLen >= 14 && readAscii(view, offset + 4, 4) === 'Exif') {
				exif = parseExifTiffBlock(view, offset + 10)
			}

			// SOF0, SOF1, SOF2 (baseline / extended / progressive JPEG)
			if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && segLen >= 9) {
				height = view.getUint16(offset + 5, false)
				width = view.getUint16(offset + 7, false)
			}

			offset += 2 + segLen
			if (width > 0 && height > 0 && exif !== null) {
				break
			}
		}

		if (width <= 0 && exif?.exifWidth > 0) {
			width = exif.exifWidth
		}
		if (height <= 0 && exif?.exifHeight > 0) {
			height = exif.exifHeight
		}
		if (width > 0 || height > 0 || exif !== null) {
			return { format: 'JPEG', width, height, exif }
		}
	}

	return null
}

/**
 * Format exposure time in seconds as camera shutter string (e.g. '1/250 s', '2.5 s').
 *
 * @param {number|string|null|undefined} exposure - Exposure time in seconds or pre-formatted string.
 * @return {string} Formatted shutter speed or empty string.
 */
function formatExposure(exposure) {
	if (typeof exposure === 'string' && exposure.trim() !== '') {
		return exposure.trim()
	}
	const val = Number(exposure)
	if (!Number.isFinite(val) || val <= 0) {
		return ''
	}
	if (val >= 1) {
		return `${Math.round(val * 10) / 10} s`
	}
	const recip = Math.round(1 / val)
	return recip > 0 ? `1/${recip} s` : `${val} s`
}

const ORIENTATION_LABELS = Object.freeze({
	1: 'Normal (1)',
	2: 'Flip horizontal (2)',
	3: 'Rotate 180 (3)',
	4: 'Flip vertical (4)',
	5: 'Transpose (5)',
	6: 'Rotate 90 CW (6)',
	7: 'Transverse (7)',
	8: 'Rotate 270 CW (8)',
})

const COLOR_SPACE_LABELS = Object.freeze({
	1: 'sRGB',
	2: 'Adobe RGB',
	65535: 'Uncalibrated',
})

/**
 * Normalize EXIF / camera / media metadata from file object and optional parsed header.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @param {object|null|undefined} parsedHeader - Optional result of `parseImageHeaderAndExif`.
 * @return {{
 *   hasExif: boolean,
 *   camera: string,
 *   lens: string,
 *   dateTaken: string,
 *   exposure: string,
 *   aperture: string,
 *   iso: string,
 *   focalLength: string,
 *   captureSettings: string,
 *   colorSpace: string,
 *   orientationLabel: string,
 *   gpsPresent: boolean|null,
 *   gpsLabel: string,
 *   summaryCompact: string
 * }} Normalized EXIF metadata.
 */
export function normalizeExifMetadata(file, parsedHeader = null) {
	const rawExif = {
		...(file && typeof file.metadata === 'object' && file.metadata ? file.metadata : {}),
		...(file && typeof file.exif === 'object' && file.exif ? file.exif : {}),
		...(parsedHeader && typeof parsedHeader.exif === 'object' && parsedHeader.exif ? parsedHeader.exif : {}),
	}

	const make = String(rawExif.make || rawExif.Make || '').trim()
	const model = String(rawExif.model || rawExif.Model || rawExif.camera || '').trim()
	let camera = ''
	if (make && model) {
		camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`
	} else {
		camera = model || make
	}

	const lens = String(rawExif.lensModel || rawExif.LensModel || rawExif.lens || '').trim()
	const dateTaken = String(rawExif.dateTaken || rawExif.DateTimeOriginal || rawExif.CreateDate || '').trim()
	const exposure = formatExposure(rawExif.exposureTime ?? rawExif.ExposureTime ?? rawExif.shutterSpeed)

	const fNumRaw = rawExif.fNumber ?? rawExif.FNumber ?? rawExif.aperture
	let aperture = ''
	if (typeof fNumRaw === 'string' && fNumRaw.trim() !== '') {
		aperture = fNumRaw.trim().startsWith('f/') ? fNumRaw.trim() : `f/${fNumRaw.trim()}`
	} else if (typeof fNumRaw === 'number' && Number.isFinite(fNumRaw) && fNumRaw > 0) {
		aperture = `f/${Math.round(fNumRaw * 10) / 10}`
	}

	const isoRaw = rawExif.iso ?? rawExif.ISOSpeedRatings
	const iso = Number.isFinite(Number(isoRaw)) && Number(isoRaw) > 0
		? `ISO ${Math.round(Number(isoRaw))}`
		: ''

	const focalRaw = rawExif.focalLength ?? rawExif.FocalLength
	let focalLength = ''
	if (typeof focalRaw === 'string' && focalRaw.trim() !== '') {
		focalLength = focalRaw.trim()
	} else if (typeof focalRaw === 'number' && Number.isFinite(focalRaw) && focalRaw > 0) {
		focalLength = `${Math.round(focalRaw * 10) / 10} mm`
	}

	const captureParts = [focalLength, aperture, exposure, iso].filter(Boolean)
	const captureSettings = captureParts.join(' · ')

	const colorRaw = rawExif.colorSpace ?? rawExif.ColorSpace
	let colorSpace = ''
	if (typeof colorRaw === 'string' && colorRaw.trim() !== '') {
		colorSpace = colorRaw.trim()
	} else if (Number.isInteger(Number(colorRaw)) && COLOR_SPACE_LABELS[Number(colorRaw)]) {
		colorSpace = COLOR_SPACE_LABELS[Number(colorRaw)]
	}

	const orientRaw = rawExif.orientation ?? rawExif.Orientation
	const orientationLabel = Number.isInteger(Number(orientRaw)) && ORIENTATION_LABELS[Number(orientRaw)]
		? ORIENTATION_LABELS[Number(orientRaw)]
		: (typeof orientRaw === 'string' ? orientRaw.trim() : '')

	let gpsPresent = null
	if (typeof rawExif.gpsPresent === 'boolean') {
		gpsPresent = rawExif.gpsPresent
	} else if (rawExif.GPSLatitude !== undefined || rawExif.gps !== undefined) {
		gpsPresent = Boolean(rawExif.GPSLatitude ?? rawExif.gps)
	}
	const gpsLabel = gpsPresent === null
		? ''
		: (gpsPresent ? 'GPS metadata present' : 'No GPS metadata')

	const hasExif = Boolean(
		camera || lens || dateTaken || captureSettings || colorSpace || orientationLabel || gpsPresent !== null,
	)

	const summaryCompact = [camera, captureSettings].filter(Boolean).join(' · ')

	return {
		hasExif,
		camera,
		lens,
		dateTaken,
		exposure,
		aperture,
		iso,
		focalLength,
		captureSettings,
		colorSpace,
		orientationLabel,
		gpsPresent,
		gpsLabel,
		summaryCompact,
	}
}

/**
 * Compute a 64-bit perceptual difference hash (dHash) from an RGBA pixel buffer.
 * Resamples the image into a 9x8 grayscale grid and compares horizontal luminance gradients.
 *
 * @param {Uint8ClampedArray|Uint8Array|Array<number>} rgba - RGBA pixel buffer (`width * height * 4`).
 * @param {number} width - Source pixel width.
 * @param {number} height - Source pixel height.
 * @return {{ hex: string, bits: string }|null} 64-bit dHash or null on invalid input.
 */
export function computeDifferenceHash(rgba, width, height) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	if (!rgba || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return null
	}
	if (rgba.length < w * h * 4) {
		return null
	}

	const gridW = 9
	const gridH = 8
	const luma = new Float64Array(gridW * gridH)

	for (let gy = 0; gy < gridH; gy++) {
		const y0 = Math.floor((gy * h) / gridH)
		const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / gridH))
		for (let gx = 0; gx < gridW; gx++) {
			const x0 = Math.floor((gx * w) / gridW)
			const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / gridW))
			let sum = 0
			let count = 0
			for (let py = y0; py < y1; py++) {
				for (let px = x0; px < x1; px++) {
					const idx = (py * w + px) * 4
					const r = rgba[idx]
					const g = rgba[idx + 1]
					const b = rgba[idx + 2]
					sum += (0.299 * r) + (0.587 * g) + (0.114 * b)
					count += 1
				}
			}
			luma[gy * gridW + gx] = count > 0 ? sum / count : 0
		}
	}

	let bits = ''
	let hex = ''
	let nibble = 0
	let nibbleBitCount = 0

	for (let gy = 0; gy < gridH; gy++) {
		for (let gx = 0; gx < 8; gx++) {
			const leftVal = luma[gy * gridW + gx]
			const rightVal = luma[gy * gridW + gx + 1]
			const bit = leftVal > rightVal ? 1 : 0
			bits += bit ? '1' : '0'
			nibble = (nibble << 1) | bit
			nibbleBitCount += 1
			if (nibbleBitCount === 4) {
				hex += nibble.toString(16)
				nibble = 0
				nibbleBitCount = 0
			}
		}
	}

	return { hex, bits }
}

/**
 * Compute Hamming distance and similarity percentage between two 64-bit dHash objects or bitstrings.
 *
 * @param {object|string|null} hashA - First dHash.
 * @param {object|string|null} hashB - Second dHash.
 * @return {{ distance: number, similarityPercent: number }|null} Similarity metric or null.
 */
export function computeHammingSimilarity(hashA, hashB) {
	const toBits = hash => {
		if (!hash) {
			return ''
		}
		if (typeof hash === 'object' && typeof hash.bits === 'string' && hash.bits.length === 64) {
			return hash.bits
		}
		const hexStr = typeof hash === 'string'
			? hash.trim().toLowerCase()
			: (typeof hash.hex === 'string' ? hash.hex.trim().toLowerCase() : '')
		if (!/^[0-9a-f]{16}$/.test(hexStr)) {
			return ''
		}
		let bits = ''
		for (const ch of hexStr) {
			bits += parseInt(ch, 16).toString(2).padStart(4, '0')
		}
		return bits
	}

	const bitsA = toBits(hashA)
	const bitsB = toBits(hashB)
	if (bitsA.length !== 64 || bitsB.length !== 64) {
		return null
	}

	let distance = 0
	for (let i = 0; i < 64; i++) {
		if (bitsA[i] !== bitsB[i]) {
			distance += 1
		}
	}

	const similarityPercent = Math.round(((64 - distance) / 64) * 1000) / 10
	return { distance, similarityPercent }
}

/**
 * Compute pixel-level difference metrics and an RGBA diff-heatmap buffer between two aligned RGBA frames.
 *
 * @param {Uint8ClampedArray|Uint8Array} leftRgba - Left RGBA pixel buffer.
 * @param {Uint8ClampedArray|Uint8Array} rightRgba - Right RGBA pixel buffer.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @param {number} [tolerance=12] - Channel delta threshold (0..255) above which a pixel counts as changed.
 * @return {{
 *   totalPixelCount: number,
 *   changedPixelCount: number,
 *   pixelMatchPercent: number,
 *   meanAbsoluteError: number,
 *   maxChannelDelta: number,
 *   similarityVerdict: 'identical'|'near-identical'|'similar'|'different',
 *   diffRgba: Uint8ClampedArray
 * }|null} Pixel diff metrics and heatmap buffer, or null when invalid.
 */
export function computePixelDiffMetrics(leftRgba, rightRgba, width, height, tolerance = 12) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	if (!leftRgba || !rightRgba || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return null
	}
	const expectedLength = w * h * 4
	if (leftRgba.length < expectedLength || rightRgba.length < expectedLength) {
		return null
	}

	const safeTolerance = Number.isFinite(Number(tolerance)) ? Math.max(0, Math.min(255, Number(tolerance))) : 12
	const totalPixelCount = w * h
	const diffRgba = new Uint8ClampedArray(expectedLength)
	let changedPixelCount = 0
	let deltaSum = 0
	let maxChannelDelta = 0

	for (let i = 0; i < expectedLength; i += 4) {
		const dr = Math.abs(leftRgba[i] - rightRgba[i])
		const dg = Math.abs(leftRgba[i + 1] - rightRgba[i + 1])
		const db = Math.abs(leftRgba[i + 2] - rightRgba[i + 2])
		const maxDelta = Math.max(dr, dg, db)
		const avgDelta = (dr + dg + db) / 3
		deltaSum += avgDelta
		if (maxDelta > maxChannelDelta) {
			maxChannelDelta = maxDelta
		}

		if (maxDelta > safeTolerance) {
			changedPixelCount += 1
			const intensity = Math.min(255, Math.max(140, maxDelta * 2))
			diffRgba[i] = 255
			diffRgba[i + 1] = Math.round(255 - (intensity * 0.78))
			diffRgba[i + 2] = Math.round(intensity * 0.55)
			diffRgba[i + 3] = 255
		} else {
			const gray = Math.round(((0.299 * leftRgba[i]) + (0.587 * leftRgba[i + 1]) + (0.114 * leftRgba[i + 2])) * 0.35)
			diffRgba[i] = gray
			diffRgba[i + 1] = gray
			diffRgba[i + 2] = gray
			diffRgba[i + 3] = 255
		}
	}

	const pixelMatchPercent = Math.round(((totalPixelCount - changedPixelCount) / totalPixelCount) * 1000) / 10
	const meanAbsoluteError = Math.round((deltaSum / totalPixelCount) * 100) / 100

	let similarityVerdict = 'different'
	if (changedPixelCount === 0 && maxChannelDelta === 0) {
		similarityVerdict = 'identical'
	} else if (pixelMatchPercent >= 98) {
		similarityVerdict = 'near-identical'
	} else if (pixelMatchPercent >= 85) {
		similarityVerdict = 'similar'
	}

	return {
		totalPixelCount,
		changedPixelCount,
		pixelMatchPercent,
		meanAbsoluteError,
		maxChannelDelta,
		similarityVerdict,
		diffRgba,
	}
}

/**
 * Build structured visual & EXIF comparison rows for Beyond Compare style diffing.
 *
 * @param {object|null|undefined} leftFile - Left copy file entry.
 * @param {object|null|undefined} rightFile - Right copy file entry.
 * @param {object} [options] - Inspection state options.
 * @param {object|null} [options.leftDimensions] - Evaluated dimensions for left copy.
 * @param {object|null} [options.rightDimensions] - Evaluated dimensions for right copy.
 * @param {object|null} [options.leftExif] - Normalized EXIF metadata for left copy.
 * @param {object|null} [options.rightExif] - Normalized EXIF metadata for right copy.
 * @param {string} [options.leftQualityLabel] - Quality/winner badge text for left copy.
 * @param {string} [options.rightQualityLabel] - Quality/winner badge text for right copy.
 * @param {string} [options.leftDhash] - Perceptual dHash hex for left copy.
 * @param {string} [options.rightDhash] - Perceptual dHash hex for right copy.
 * @param {string} [options.unavailableLabel='Unavailable'] - Fallback text when one side lacks a value.
 * @return {{ rows: Array<{ key: string, leftValue: string, rightValue: string, isDiff: boolean }>, diffCount: number }}
 */
export function buildVisualDiffRows(leftFile, rightFile, options = {}) {
	if (!leftFile && !rightFile) {
		return { rows: [], diffCount: 0 }
	}

	const unavailableLabel = typeof options.unavailableLabel === 'string' && options.unavailableLabel
		? options.unavailableLabel
		: 'Unavailable'

	const leftDim = options.leftDimensions || extractMediaDimensions(leftFile)
	const rightDim = options.rightDimensions || extractMediaDimensions(rightFile)
	const leftExif = options.leftExif || normalizeExifMetadata(leftFile)
	const rightExif = options.rightExif || normalizeExifMetadata(rightFile)

	const rows = []
	const pushRow = (key, leftVal, rightVal) => {
		const l = typeof leftVal === 'string' ? leftVal.trim() : ''
		const r = typeof rightVal === 'string' ? rightVal.trim() : ''
		if (!l && !r) {
			return
		}
		rows.push({
			key,
			leftValue: l || unavailableLabel,
			rightValue: r || unavailableLabel,
			isDiff: l !== r,
		})
	}

	if (leftDim || rightDim) {
		pushRow('dimensions', leftDim?.formattedDimensions || '', rightDim?.formattedDimensions || '')
		pushRow(
			'aspectRatio',
			leftDim ? `${leftDim.aspectRatio} (${leftDim.orientation})` : '',
			rightDim ? `${rightDim.aspectRatio} (${rightDim.orientation})` : '',
		)
		pushRow('megapixels', leftDim?.megapixels || '', rightDim?.megapixels || '')
	}

	pushRow('resolutionQuality', options.leftQualityLabel || '', options.rightQualityLabel || '')

	const leftImageHash = (typeof options.leftDhash === 'string' && options.leftDhash)
		|| (typeof leftFile?.imageHash === 'string' ? leftFile.imageHash : '')
	const rightImageHash = (typeof options.rightDhash === 'string' && options.rightDhash)
		|| (typeof rightFile?.imageHash === 'string' ? rightFile.imageHash : '')
	pushRow('imageHash', leftImageHash, rightImageHash)

	pushRow('camera', leftExif.camera, rightExif.camera)
	pushRow('lens', leftExif.lens, rightExif.lens)
	pushRow('captureSettings', leftExif.captureSettings, rightExif.captureSettings)
	pushRow('dateTaken', leftExif.dateTaken, rightExif.dateTaken)
	pushRow('colorSpace', leftExif.colorSpace, rightExif.colorSpace)
	pushRow('orientation', leftExif.orientationLabel, rightExif.orientationLabel)
	pushRow('gpsMetadata', leftExif.gpsLabel, rightExif.gpsLabel)

	const diffCount = rows.reduce((total, row) => total + (row.isDiff ? 1 : 0), 0)
	return { rows, diffCount }
}

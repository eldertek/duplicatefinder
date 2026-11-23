/**
 * Pure zero-touch duplicate forensic diff, magic-signature coherence,
 * streaming SHA-256 checksum chain verifier, and byte-offset diff engine.
 * Zero DOM dependencies, zero network side effects, CWE-1236-safe CSV export.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'

export const FORENSIC_CHAIN_SCHEMA = 'duplicatefinder.forensic-checksum-chain.v1'
export const FORENSIC_MAX_FULL_HASH_BYTES = 16 * 1024 * 1024
export const FORENSIC_WINDOW_BYTES = 65536
export const FORENSIC_DIFF_CONTEXT_BYTES = 32

export const FORENSIC_SURVIVOR_STRATEGIES = Object.freeze([
	'verified_anchor',
	'oldest',
	'newest',
	'shortest_path',
])

export const FORENSIC_CATEGORIES = Object.freeze([
	'all',
	'drift-detected',
	'signature-anomaly',
	'pending-verify',
	'cleared-ready',
])

export const FORENSIC_SORT_MODES = Object.freeze([
	'risk_desc',
	'reclaim_desc',
	'copies_desc',
	'name_asc',
])

const MAGIC_SIGNATURES = Object.freeze([
	{
		family: 'pdf',
		label: 'PDF Document',
		extensions: ['pdf'],
		match: bytes => bytes.length >= 5
			&& bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D,
	},
	{
		family: 'png',
		label: 'PNG Image',
		extensions: ['png'],
		match: bytes => bytes.length >= 8
			&& bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
			&& bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A,
	},
	{
		family: 'jpeg',
		label: 'JPEG Image',
		extensions: ['jpg', 'jpeg', 'jpe'],
		match: bytes => bytes.length >= 3
			&& bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF,
	},
	{
		family: 'gif',
		label: 'GIF Image',
		extensions: ['gif'],
		match: bytes => bytes.length >= 6
			&& bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
			&& (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61,
	},
	{
		family: 'zip',
		label: 'ZIP / OOXML Container',
		extensions: ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'jar', 'apk', 'cbz', 'whl'],
		match: bytes => bytes.length >= 4
			&& bytes[0] === 0x50 && bytes[1] === 0x4B
			&& ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06)),
	},
	{
		family: 'gzip',
		label: 'GZIP Stream',
		extensions: ['gz', 'tgz'],
		match: bytes => bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B,
	},
	{
		family: '7z',
		label: '7-Zip Archive',
		extensions: ['7z'],
		match: bytes => bytes.length >= 6
			&& bytes[0] === 0x37 && bytes[1] === 0x7A && bytes[2] === 0xBC && bytes[3] === 0xAF
			&& bytes[4] === 0x27 && bytes[5] === 0x1C,
	},
	{
		family: 'rar',
		label: 'RAR Archive',
		extensions: ['rar', 'cbr'],
		match: bytes => bytes.length >= 6
			&& bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21
			&& bytes[4] === 0x1A && bytes[5] === 0x07,
	},
	{
		family: 'sqlite',
		label: 'SQLite Database',
		extensions: ['sqlite', 'sqlite3', 'db'],
		match: bytes => bytes.length >= 15
			&& bytes[0] === 0x53 && bytes[1] === 0x51 && bytes[2] === 0x4C && bytes[3] === 0x69
			&& bytes[4] === 0x74 && bytes[5] === 0x65 && bytes[6] === 0x20 && bytes[7] === 0x66,
	},
	{
		family: 'mp4',
		label: 'ISO BMFF / MP4 / MOV',
		extensions: ['mp4', 'm4v', 'm4a', 'mov', 'heic', 'heif', '3gp'],
		match: bytes => bytes.length >= 8
			&& bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
	},
	{
		family: 'riff',
		label: 'RIFF (WAV / AVI / WebP)',
		extensions: ['wav', 'avi', 'webp'],
		match: bytes => bytes.length >= 12
			&& bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46,
	},
	{
		family: 'elf',
		label: 'ELF Executable',
		extensions: ['so', 'elf', 'bin', 'o'],
		match: bytes => bytes.length >= 4
			&& bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46,
	},
])

const SHA256_K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/**
 * Coerce ArrayBuffer, TypedArray, or byte array into Uint8Array.
 *
 * @param {ArrayBuffer|Uint8Array|Array<number>|null|undefined} input Raw byte source.
 * @return {Uint8Array} Normalized byte view.
 */
export function toUint8Array(input) {
	if (!input) {
		return new Uint8Array(0)
	}
	if (input instanceof Uint8Array) {
		return input
	}
	if (input instanceof ArrayBuffer) {
		return new Uint8Array(input)
	}
	if (ArrayBuffer.isView(input)) {
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
	}
	if (Array.isArray(input)) {
		return Uint8Array.from(input)
	}
	return new Uint8Array(0)
}

/**
 * Compute standard FIPS 180-4 SHA-256 hex digest synchronously in pure JS.
 * Used as a deterministic fallback when WebCrypto crypto.subtle is unavailable.
 *
 * @param {ArrayBuffer|Uint8Array|Array<number>} input Raw bytes.
 * @return {string} Lowercase 64-char hex SHA-256 digest.
 */
export function sha256HexSync(input) {
	const data = toUint8Array(input)
	const bitLen = data.length * 8
	const paddedLen = Math.ceil((data.length + 9) / 64) * 64
	const padded = new Uint8Array(paddedLen)
	padded.set(data, 0)
	padded[data.length] = 0x80

	const highBits = Math.floor(bitLen / 0x100000000)
	const lowBits = bitLen >>> 0
	const view = new DataView(padded.buffer)
	view.setUint32(paddedLen - 8, highBits, false)
	view.setUint32(paddedLen - 4, lowBits, false)

	let h0 = 0x6a09e667
	let h1 = 0xbb67ae85
	let h2 = 0x3c6ef372
	let h3 = 0xa54ff53a
	let h4 = 0x510e527f
	let h5 = 0x9b05688c
	let h6 = 0x1f83d9ab
	let h7 = 0x5be0cd19

	const w = new Uint32Array(64)
	for (let offset = 0; offset < paddedLen; offset += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = view.getUint32(offset + i * 4, false)
		}
		for (let i = 16; i < 64; i++) {
			const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25))
				^ ((w[i - 15] >>> 18) | (w[i - 15] << 14))
				^ (w[i - 15] >>> 3)
			const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15))
				^ ((w[i - 2] >>> 19) | (w[i - 2] << 13))
				^ (w[i - 2] >>> 10)
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
		}

		let a = h0
		let b = h1
		let c = h2
		let d = h3
		let e = h4
		let f = h5
		let g = h6
		let h = h7

		for (let i = 0; i < 64; i++) {
			const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
			const ch = (e & f) ^ ((~e) & g)
			const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
			const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
			const maj = (a & b) ^ (a & c) ^ (b & c)
			const temp2 = (S0 + maj) >>> 0

			h = g
			g = f
			f = e
			e = (d + temp1) >>> 0
			d = c
			c = b
			b = a
			a = (temp1 + temp2) >>> 0
		}

		h0 = (h0 + a) >>> 0
		h1 = (h1 + b) >>> 0
		h2 = (h2 + c) >>> 0
		h3 = (h3 + d) >>> 0
		h4 = (h4 + e) >>> 0
		h5 = (h5 + f) >>> 0
		h6 = (h6 + g) >>> 0
		h7 = (h7 + h) >>> 0
	}

	return [h0, h1, h2, h3, h4, h5, h6, h7]
		.map(word => word.toString(16).padStart(8, '0'))
		.join('')
}

/**
 * Compute SHA-256 hex digest using WebCrypto when available, with pure-JS fallback.
 *
 * @param {ArrayBuffer|Uint8Array|Array<number>} input Raw bytes.
 * @return {Promise<string>} Lowercase 64-char hex SHA-256 digest.
 */
export async function computeSha256Hex(input) {
	const bytes = toUint8Array(input)
	const subtle = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle
		? globalThis.crypto.subtle
		: null

	if (subtle && typeof subtle.digest === 'function') {
		try {
			const copy = new Uint8Array(bytes.byteLength)
			copy.set(bytes)
			const digest = await subtle.digest('SHA-256', copy.buffer)
			const out = new Uint8Array(digest)
			return Array.from(out, b => b.toString(16).padStart(2, '0')).join('')
		} catch (_error) {
			return sha256HexSync(bytes)
		}
	}

	return sha256HexSync(bytes)
}

/**
 * Format up to maxBytes as uppercase spaced hex pairs.
 *
 * @param {Uint8Array} bytes Input bytes.
 * @param {number} [maxBytes=16] Maximum bytes to display.
 * @return {string} Formatted hex string.
 */
export function formatHexPreview(bytes, maxBytes = 16) {
	const slice = toUint8Array(bytes).slice(0, Math.max(0, maxBytes))
	return Array.from(slice, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

/**
 * Classify a recorded database hash string by hex length and format.
 *
 * @param {string|null|undefined} hash Recorded hash string.
 * @return {{ algorithm: string, bits: number, validFormat: boolean, normalized: string }} Hash metadata.
 */
export function classifyHashAlgorithm(hash) {
	const normalized = typeof hash === 'string' ? hash.trim().toLowerCase() : ''
	if (!normalized) {
		return { algorithm: 'missing', bits: 0, validFormat: false, normalized: '' }
	}
	const isHex = /^[0-9a-f]+$/.test(normalized)
	if (!isHex) {
		return { algorithm: 'nonstandard', bits: 0, validFormat: false, normalized }
	}
	if (normalized.length === 16) {
		return { algorithm: 'xxhash64', bits: 64, validFormat: true, normalized }
	}
	if (normalized.length === 32) {
		return { algorithm: 'md5', bits: 128, validFormat: true, normalized }
	}
	if (normalized.length === 40) {
		return { algorithm: 'sha1', bits: 160, validFormat: true, normalized }
	}
	if (normalized.length === 64) {
		return { algorithm: 'sha256', bits: 256, validFormat: true, normalized }
	}
	if (normalized.length === 128) {
		return { algorithm: 'sha512', bits: 512, validFormat: true, normalized }
	}
	return { algorithm: 'custom-hex', bits: normalized.length * 4, validFormat: true, normalized }
}

/**
 * Detect magic container/media signature and null-byte saturation from leading bytes.
 *
 * @param {ArrayBuffer|Uint8Array|Array<number>} input Leading bytes of a file.
 * @return {{ family: string, label: string, hexHeader: string, expectedExtensions: Array<string>, nullByteRatio: number, isAllZero: boolean }} Signature info.
 */
export function detectMagicSignature(input) {
	const bytes = toUint8Array(input)
	const hexHeader = formatHexPreview(bytes, 12)
	let zeroCount = 0
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0) {
			zeroCount += 1
		}
	}
	const nullByteRatio = bytes.length > 0 ? Number((zeroCount / bytes.length).toFixed(4)) : 0
	const isAllZero = bytes.length > 0 && zeroCount === bytes.length

	for (const sig of MAGIC_SIGNATURES) {
		if (sig.match(bytes)) {
			return {
				family: sig.family,
				label: sig.label,
				hexHeader,
				expectedExtensions: [...sig.extensions],
				nullByteRatio,
				isAllZero,
			}
		}
	}

	// Check printable UTF-8 / ASCII text heuristic
	if (bytes.length > 0 && !isAllZero) {
		let printable = 0
		const sampleLen = Math.min(bytes.length, 512)
		for (let i = 0; i < sampleLen; i++) {
			const b = bytes[i]
			if ((b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D || b >= 0x80) {
				printable += 1
			}
		}
		if (printable / sampleLen >= 0.92) {
			return {
				family: 'text',
				label: 'UTF-8 / Text Stream',
				hexHeader,
				expectedExtensions: ['txt', 'md', 'csv', 'json', 'xml', 'html', 'log', 'yml', 'yaml', 'js', 'ts', 'php', 'py', 'sh', 'css'],
				nullByteRatio,
				isAllZero,
			}
		}
	}

	return {
		family: bytes.length === 0 ? 'empty' : 'unknown',
		label: bytes.length === 0 ? 'Empty Payload (0 B)' : 'Opaque Binary Stream',
		hexHeader,
		expectedExtensions: [],
		nullByteRatio,
		isAllZero,
	}
}

/**
 * Verify coherence between a file extension and its detected magic signature.
 *
 * @param {string} path File path or name.
 * @param {object|null|undefined} magicInfo Result of detectMagicSignature.
 * @return {{ coherent: boolean, extension: string, reason: string }} Coherence result.
 */
export function checkExtensionSignatureCoherence(path, magicInfo) {
	const ext = extractFileExtension(path || '')
	if (!magicInfo || magicInfo.family === 'unknown' || magicInfo.family === 'empty') {
		return {
			coherent: magicInfo ? !magicInfo.isAllZero : true,
			extension: ext,
			reason: magicInfo && magicInfo.isAllZero ? 'Payload is 100% zero-filled bytes' : 'No restrictive magic mismatch',
		}
	}
	if (magicInfo.isAllZero) {
		return {
			coherent: false,
			extension: ext,
			reason: 'Payload is 100% zero-filled bytes',
		}
	}
	if (!ext) {
		return {
			coherent: true,
			extension: '',
			reason: 'No extension declared',
		}
	}
	if (magicInfo.expectedExtensions.includes(ext)) {
		return {
			coherent: true,
			extension: ext,
			reason: `Extension .${ext} matches ${magicInfo.label}`,
		}
	}

	// Only flag mismatch when extension belongs to another known binary family
	const knownBinaryExts = new Set(MAGIC_SIGNATURES.flatMap(sig => sig.extensions))
	if (knownBinaryExts.has(ext) || magicInfo.family !== 'text') {
		return {
			coherent: false,
			extension: ext,
			reason: `Extension .${ext} conflicts with ${magicInfo.label} magic header`,
		}
	}

	return {
		coherent: true,
		extension: ext,
		reason: 'Compatible stream format',
	}
}

/**
 * Format bytes in a printable ASCII preview line (non-printable mapped to '.').
 *
 * @param {Uint8Array} bytes Slice of bytes.
 * @return {string} Printable ASCII representation.
 */
function toPrintableAscii(bytes) {
	let out = ''
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i]
		out += b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.'
	}
	return out
}

/**
 * Perform a byte-level forensic diff between two byte buffers (Anchor vs Candidate).
 * Pinpoints the exact first divergence offset and generates an aligned Hex+ASCII window.
 *
 * @param {ArrayBuffer|Uint8Array} bufferA Anchor copy bytes.
 * @param {ArrayBuffer|Uint8Array} bufferB Candidate copy bytes.
 * @param {object} [options] Diff window options.
 * @param {number} [options.contextBytes=32] Width of hex+ASCII diff window.
 * @param {number} [options.baseOffset=0] Starting byte offset when comparing a range slice.
 * @return {object} Forensic byte diff descriptor.
 */
export function compareByteBuffersForensic(bufferA, bufferB, options = {}) {
	const bytesA = toUint8Array(bufferA)
	const bytesB = toUint8Array(bufferB)
	const baseOffset = Math.max(0, Number(options.baseOffset) || 0)
	const contextBytes = Math.max(8, Math.min(64, Number(options.contextBytes) || FORENSIC_DIFF_CONTEXT_BYTES))
	const minLen = Math.min(bytesA.length, bytesB.length)
	const maxLen = Math.max(bytesA.length, bytesB.length)

	let firstDivergenceRelative = -1
	let mismatchedBytes = Math.abs(bytesA.length - bytesB.length)

	for (let i = 0; i < minLen; i++) {
		if (bytesA[i] !== bytesB[i]) {
			if (firstDivergenceRelative === -1) {
				firstDivergenceRelative = i
			}
			mismatchedBytes += 1
		}
	}

	if (firstDivergenceRelative === -1 && bytesA.length !== bytesB.length) {
		firstDivergenceRelative = minLen
	}

	const identical = firstDivergenceRelative === -1
	const firstDivergenceOffset = identical ? -1 : baseOffset + firstDivergenceRelative

	if (identical) {
		return {
			identical: true,
			firstDivergenceOffset: -1,
			mismatchedBytes: 0,
			sizeA: bytesA.length,
			sizeB: bytesB.length,
			sizeDelta: 0,
			windowStartOffset: baseOffset,
			hexA: '',
			hexB: '',
			asciiA: '',
			asciiB: '',
			divergentIndices: [],
		}
	}

	const halfWindow = Math.floor(contextBytes / 2)
	const windowStartRelative = Math.max(0, firstDivergenceRelative - halfWindow)
	const windowEndRelative = Math.min(maxLen, windowStartRelative + contextBytes)

	const sliceA = bytesA.slice(windowStartRelative, Math.min(bytesA.length, windowEndRelative))
	const sliceB = bytesB.slice(windowStartRelative, Math.min(bytesB.length, windowEndRelative))
	const span = Math.max(sliceA.length, sliceB.length)
	const hexTokensA = []
	const hexTokensB = []
	const divergentIndices = []

	for (let i = 0; i < span; i++) {
		const hasA = i < sliceA.length
		const hasB = i < sliceB.length
		const byteA = hasA ? sliceA[i] : null
		const byteB = hasB ? sliceB[i] : null
		hexTokensA.push(byteA === null ? '--' : byteA.toString(16).padStart(2, '0').toUpperCase())
		hexTokensB.push(byteB === null ? '--' : byteB.toString(16).padStart(2, '0').toUpperCase())
		if (byteA !== byteB) {
			divergentIndices.push(i)
		}
	}

	return {
		identical: false,
		firstDivergenceOffset,
		mismatchedBytes,
		sizeA: bytesA.length,
		sizeB: bytesB.length,
		sizeDelta: bytesB.length - bytesA.length,
		windowStartOffset: baseOffset + windowStartRelative,
		hexA: hexTokensA.join(' '),
		hexB: hexTokensB.join(' '),
		asciiA: toPrintableAscii(sliceA),
		asciiB: toPrintableAscii(sliceB),
		divergentIndices,
	}
}

/**
 * Build a live verification record from one or more byte buffers/slices.
 * Pure async helper used for both local ArrayBuffers and HTTP Range/GET responses.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} payload Byte buffer payload.
 * @param {ArrayBuffer|Uint8Array} [payload.fullBuffer] Full file buffer when size <= FORENSIC_MAX_FULL_HASH_BYTES.
 * @param {ArrayBuffer|Uint8Array} [payload.headBuffer] Leading window buffer for large files.
 * @param {ArrayBuffer|Uint8Array} [payload.midBuffer] Mid-stream window buffer for large files.
 * @param {ArrayBuffer|Uint8Array} [payload.tailBuffer] Trailing window buffer for large files.
 * @param {number} [payload.liveSize] Observed Content-Length / byte size.
 * @param {string} [payload.liveEtag] Observed ETag header.
 * @param {string} [payload.probeMode] Explicit probe mode override.
 * @return {Promise<object>} Normalized live verification descriptor.
 */
export async function buildLiveVerificationRecord(file, payload = {}) {
	const fullBytes = payload.fullBuffer ? toUint8Array(payload.fullBuffer) : null
	const headBytes = fullBytes ? fullBytes.slice(0, Math.min(fullBytes.length, FORENSIC_WINDOW_BYTES)) : toUint8Array(payload.headBuffer)
	const midBytes = fullBytes
		? fullBytes.slice(Math.max(0, Math.floor(fullBytes.length / 2) - 512), Math.min(fullBytes.length, Math.floor(fullBytes.length / 2) + 512))
		: toUint8Array(payload.midBuffer)
	const tailBytes = fullBytes
		? fullBytes.slice(Math.max(0, fullBytes.length - FORENSIC_WINDOW_BYTES))
		: toUint8Array(payload.tailBuffer)

	const magicInfo = detectMagicSignature(headBytes.length > 0 ? headBytes : (fullBytes || new Uint8Array(0)))
	const coherence = checkExtensionSignatureCoherence(file && file.path ? file.path : '', magicInfo)

	const liveSha256 = fullBytes ? await computeSha256Hex(fullBytes) : ''
	const headHash = headBytes.length > 0 ? await computeSha256Hex(headBytes) : ''
	const midHash = midBytes.length > 0 ? await computeSha256Hex(midBytes) : ''
	const tailHash = tailBytes.length > 0 ? await computeSha256Hex(tailBytes) : ''

	const observedSize = Number.isFinite(Number(payload.liveSize))
		? Number(payload.liveSize)
		: (fullBytes ? fullBytes.length : Number(file && file.size) || 0)

	return {
		probeMode: payload.probeMode || (fullBytes ? 'full-sha256' : 'range-window'),
		liveSha256,
		headHash,
		midHash,
		tailHash,
		liveSize: observedSize,
		liveEtag: typeof payload.liveEtag === 'string' ? payload.liveEtag.trim() : '',
		magicInfo,
		coherence,
		sampleBytes: fullBytes ? fullBytes.slice(0, 4096) : headBytes.slice(0, 4096),
		fullBuffer: fullBytes,
		verifiedAt: new Date().toISOString(),
		fetchError: '',
	}
}

/**
 * Parse a file timestamp into finite epoch milliseconds, or null.
 *
 * @param {*} raw Raw timestamp input.
 * @return {number|null} Epoch ms or null.
 */
function parseEpochMs(raw) {
	if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
		return null
	}
	const candidate = typeof raw === 'object' && !(raw instanceof Date) && typeof raw.date === 'string'
		? raw.date
		: raw
	if (candidate instanceof Date) {
		const ms = candidate.getTime()
		return Number.isFinite(ms) && ms > 0 ? ms : null
	}
	if (typeof candidate === 'number') {
		if (!Number.isFinite(candidate) || candidate <= 0) {
			return null
		}
		return candidate < 1e11 ? candidate * 1000 : candidate
	}
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed)
			if (!Number.isFinite(num) || num <= 0) {
				return null
			}
			return num < 1e11 ? num * 1000 : num
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null
	}
	return null
}

/**
 * Resolve stable group key for a duplicate group.
 *
 * @param {object} group Duplicate group object.
 * @param {number} [index=0] Fallback index.
 * @return {string} Stable group key.
 */
function resolveGroupKey(group, index = 0) {
	if (group && typeof group.hash === 'string' && group.hash.trim() !== '') {
		return `hash:${group.hash.trim()}`
	}
	if (group && group.id !== null && group.id !== undefined && group.id !== '') {
		return `id:${String(group.id)}`
	}
	return `idx:${index}`
}

/**
 * Select the forensic anchor (survivor) copy according to strategy.
 *
 * @param {Array<object>} copyEntries Evaluated copy entries.
 * @param {string} strategy Survivor strategy ID.
 * @return {object} Selected anchor entry.
 */
function selectForensicAnchor(copyEntries, strategy) {
	const sorted = [...copyEntries].sort((a, b) => {
		if (strategy === 'verified_anchor') {
			const aVerified = a.hasLiveProbe && !a.probeFailed && !a.hasStructuralAnomaly ? 1 : 0
			const bVerified = b.hasLiveProbe && !b.probeFailed && !b.hasStructuralAnomaly ? 1 : 0
			if (aVerified !== bVerified) {
				return bVerified - aVerified
			}
		}

		if (strategy === 'newest') {
			const aTime = a.mtimeMs || 0
			const bTime = b.mtimeMs || 0
			if (aTime !== bTime) {
				return bTime - aTime
			}
		} else if (strategy === 'shortest_path') {
			if (a.pathLength !== b.pathLength) {
				return a.pathLength - b.pathLength
			}
		} else {
			// Default / 'oldest' / tie-breaker for 'verified_anchor'
			const aTime = a.mtimeMs !== null ? a.mtimeMs : Number.MAX_SAFE_INTEGER
			const bTime = b.mtimeMs !== null ? b.mtimeMs : Number.MAX_SAFE_INTEGER
			if (aTime !== bTime) {
				return aTime - bTime
			}
		}

		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0]
}

/**
 * Compare two live verification records for cryptographic and window equivalence.
 *
 * @param {object} anchorLive Anchor live verification record.
 * @param {object} candLive Candidate live verification record.
 * @return {{ matches: boolean, method: string, detail: string, byteDiff: object|null }} Match evaluation.
 */
function evaluateLivePairMatch(anchorLive, candLive) {
	if (!anchorLive || !candLive) {
		return {
			matches: false,
			method: 'pending',
			detail: 'Waiting for live probe on both copies',
			byteDiff: null,
		}
	}
	if (anchorLive.fetchError || candLive.fetchError) {
		return {
			matches: false,
			method: 'probe-error',
			detail: candLive.fetchError || anchorLive.fetchError,
			byteDiff: null,
		}
	}
	if (anchorLive.liveSize !== candLive.liveSize && anchorLive.liveSize > 0 && candLive.liveSize > 0) {
		const byteDiff = anchorLive.fullBuffer && candLive.fullBuffer
			? compareByteBuffersForensic(anchorLive.fullBuffer, candLive.fullBuffer)
			: (anchorLive.sampleBytes && candLive.sampleBytes
				? compareByteBuffersForensic(anchorLive.sampleBytes, candLive.sampleBytes)
				: null)
		return {
			matches: false,
			method: 'size-drift',
			detail: `Live byte length drift (${formatBytes(anchorLive.liveSize)} vs ${formatBytes(candLive.liveSize)})`,
			byteDiff,
		}
	}

	if (anchorLive.liveSha256 && candLive.liveSha256) {
		if (anchorLive.liveSha256 === candLive.liveSha256) {
			return {
				matches: true,
				method: 'sha256-exact',
				detail: `Full SHA-256 verified (${anchorLive.liveSha256.slice(0, 12)}...)`,
				byteDiff: null,
			}
		}
		const byteDiff = anchorLive.fullBuffer && candLive.fullBuffer
			? compareByteBuffersForensic(anchorLive.fullBuffer, candLive.fullBuffer)
			: (anchorLive.sampleBytes && candLive.sampleBytes
				? compareByteBuffersForensic(anchorLive.sampleBytes, candLive.sampleBytes)
				: null)
		return {
			matches: false,
			method: 'sha256-mismatch',
			detail: byteDiff && byteDiff.firstDivergenceOffset >= 0
				? `SHA-256 mismatch at byte offset 0x${byteDiff.firstDivergenceOffset.toString(16).toUpperCase()} (${byteDiff.firstDivergenceOffset})`
				: 'Full SHA-256 digest mismatch between copies',
			byteDiff,
		}
	}

	// Range-window comparison (head + mid + tail)
	const headOk = Boolean(anchorLive.headHash && candLive.headHash && anchorLive.headHash === candLive.headHash)
	const midOk = !anchorLive.midHash || !candLive.midHash || anchorLive.midHash === candLive.midHash
	const tailOk = !anchorLive.tailHash || !candLive.tailHash || anchorLive.tailHash === candLive.tailHash

	if (headOk && midOk && tailOk) {
		return {
			matches: true,
			method: 'range-window-match',
			detail: 'Head/Mid/Tail 64 KiB SHA-256 windows match',
			byteDiff: null,
		}
	}

	const byteDiff = anchorLive.sampleBytes && candLive.sampleBytes
		? compareByteBuffersForensic(anchorLive.sampleBytes, candLive.sampleBytes)
		: null

	return {
		matches: false,
		method: 'window-mismatch',
		detail: !headOk
			? 'Leading 64 KiB header window differs'
			: (!midOk ? 'Mid-stream 64 KiB window differs' : 'Trailing 64 KiB tail window differs'),
		byteDiff,
	}
}

/**
 * Analyze duplicate groups into a deterministic Zero-Touch Forensic Checksum Chain Report.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [options] Analysis configuration.
 * @param {object} [options.liveVerificationsByKey] Map of selectionKey -> liveVerificationRecord.
 * @param {string} [options.strategy='verified_anchor'] Anchor selection strategy.
 * @param {string} [options.category='all'] Category filter.
 * @param {string} [options.sortMode='risk_desc'] Sort mode.
 * @param {string} [options.searchQuery=''] Search filter.
 * @param {boolean} [options.strictVerifiedOnly=true] Require live SHA-256/window match before clearing deletion.
 * @param {boolean} [options.blockSignatureMismatch=true] Block groups with extension/magic signature conflict.
 * @return {object} Complete forensic audit report.
 */
export function analyzeForensicChecksumChain(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const liveMap = options.liveVerificationsByKey && typeof options.liveVerificationsByKey === 'object'
		? options.liveVerificationsByKey
		: {}
	const strategy = FORENSIC_SURVIVOR_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'verified_anchor'
	const category = FORENSIC_CATEGORIES.includes(options.category)
		? options.category
		: 'all'
	const sortMode = FORENSIC_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'risk_desc'
	const searchQuery = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase()
		: ''
	const strictVerifiedOnly = options.strictVerifiedOnly !== false
	const blockSignatureMismatch = options.blockSignatureMismatch !== false

	const allItems = []
	const categoryCounts = {
		all: 0,
		'drift-detected': 0,
		'signature-anomaly': 0,
		'pending-verify': 0,
		'cleared-ready': 0,
	}

	let totalWastedBytes = 0
	let clearedReclaimableBytes = 0
	let blockedGroupCount = 0
	let clearedGroupCount = 0
	let pendingGroupCount = 0
	let verifiedFileCount = 0
	let driftFileCount = 0

	for (let idx = 0; idx < list.length; idx++) {
		const group = list[idx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const groupKey = resolveGroupKey(group, idx)
		const recordedHash = typeof group.hash === 'string' ? group.hash.trim() : ''
		const hashMeta = classifyHashAlgorithm(recordedHash)
		const canonicalSize = Math.max(0, Number(group.size) || Number(group.files[0] && group.files[0].size) || 0)
		const scannedAtMs = parseEpochMs(group.scannedAt || group.lastScannedAt || group.createdAt)

		const copyEntries = group.files
			.filter(Boolean)
			.map((raw, fileIndex) => {
				const selectionKey = getFileSelectionKey(raw, fileIndex)
				const path = typeof raw.path === 'string' ? raw.path : String(raw.name || `copy-${fileIndex}`)
				const normalizedPath = normalizePathForDiff(path)
				const fileSize = Math.max(0, Number(raw.size) || canonicalSize)
				const mtimeMs = parseEpochMs(raw.mtime || raw.modified || raw.updatedAt || raw.lastModified)
				const live = liveMap[selectionKey] || null
				const probeFailed = Boolean(live && live.fetchError)
				const hasLiveProbe = Boolean(live && !probeFailed)

				const sizeAnomaly = canonicalSize > 0 && fileSize !== canonicalSize
				const zeroByteAnomaly = fileSize === 0
				const postScanMtimeDrift = Boolean(scannedAtMs && mtimeMs && mtimeMs > scannedAtMs + 1000)
				const signatureMismatch = Boolean(
					live && live.coherence && !live.coherence.coherent
				)
				const allZeroPayload = Boolean(
					live && live.magicInfo && live.magicInfo.isAllZero
				)
				const hasStructuralAnomaly = sizeAnomaly || zeroByteAnomaly || signatureMismatch || allZeroPayload

				return {
					selectionKey,
					raw,
					path,
					normalizedPath,
					pathLength: normalizedPath.length,
					fileName: normalizedPath.split('/').pop() || normalizedPath,
					extension: extractFileExtension(path),
					sizeBytes: fileSize,
					sizeFormatted: formatBytes(fileSize),
					mtimeMs,
					mtimeFormatted: formatFileModifiedTime(raw),
					etag: typeof raw.etag === 'string' ? raw.etag : '',
					recordedHash: typeof raw.fileHash === 'string' && raw.fileHash ? raw.fileHash : recordedHash,
					live,
					hasLiveProbe,
					probeFailed,
					sizeAnomaly,
					zeroByteAnomaly,
					postScanMtimeDrift,
					signatureMismatch,
					allZeroPayload,
					hasStructuralAnomaly,
					copyChainState: 'unverified-pending',
					matchInfo: null,
					chainSteps: [],
				}
			})

		if (copyEntries.length < 2) {
			continue
		}

		const anchor = selectForensicAnchor(copyEntries, strategy)
		const candidates = copyEntries.filter(entry => entry.selectionKey !== anchor.selectionKey)

		let groupHasDrift = false
		let groupHasAnomaly = false
		let verifiedIdenticalCount = 0

		for (const entry of copyEntries) {
			const isAnchor = entry.selectionKey === anchor.selectionKey
			if (entry.sizeAnomaly || entry.postScanMtimeDrift) {
				groupHasDrift = true
			}
			if (entry.zeroByteAnomaly || entry.allZeroPayload || entry.probeFailed) {
				groupHasAnomaly = true
			}
			if (entry.signatureMismatch && blockSignatureMismatch) {
				groupHasAnomaly = true
			}

			if (entry.probeFailed) {
				entry.copyChainState = 'probe-failed'
			} else if (entry.sizeAnomaly) {
				entry.copyChainState = 'drift-mismatch'
				driftFileCount += 1
			} else if (entry.zeroByteAnomaly || entry.allZeroPayload || (entry.signatureMismatch && blockSignatureMismatch)) {
				entry.copyChainState = 'signature-anomaly'
			} else if (isAnchor) {
				if (entry.hasLiveProbe) {
					entry.copyChainState = 'verified-anchor'
					verifiedFileCount += 1
				} else {
					entry.copyChainState = 'unverified-anchor'
				}
			} else if (entry.hasLiveProbe && anchor.hasLiveProbe) {
				const matchInfo = evaluateLivePairMatch(anchor.live, entry.live)
				entry.matchInfo = matchInfo
				if (matchInfo.matches) {
					entry.copyChainState = 'verified-identical'
					verifiedIdenticalCount += 1
					verifiedFileCount += 1
				} else {
					entry.copyChainState = 'drift-mismatch'
					groupHasDrift = true
					driftFileCount += 1
				}
			} else {
				entry.copyChainState = 'unverified-pending'
			}

			entry.chainSteps = [
				{
					id: 'index-hash',
					label: hashMeta.validFormat ? `${hashMeta.algorithm.toUpperCase()} Index` : 'Weak/Missing Index',
					status: hashMeta.validFormat ? 'ok' : 'warn',
				},
				{
					id: 'size-mtime',
					label: entry.sizeAnomaly
						? 'Size Drift'
						: (entry.postScanMtimeDrift ? 'Post-Scan Edit' : 'Size & Mtime OK'),
					status: entry.sizeAnomaly || entry.postScanMtimeDrift ? 'fail' : 'ok',
				},
				{
					id: 'magic-sig',
					label: entry.live && entry.live.magicInfo
						? entry.live.magicInfo.label
						: 'Magic Pending',
					status: entry.signatureMismatch || entry.allZeroPayload || entry.zeroByteAnomaly
						? 'fail'
						: (entry.live && entry.live.magicInfo ? 'ok' : 'pending'),
				},
				{
					id: 'live-sha256',
					label: entry.live && entry.live.liveSha256
						? `SHA-256 ${entry.live.liveSha256.slice(0, 8)}...`
						: (entry.hasLiveProbe ? 'Window Digest OK' : 'Not Probed'),
					status: entry.copyChainState === 'drift-mismatch' || entry.copyChainState === 'probe-failed'
						? 'fail'
						: (entry.hasLiveProbe ? 'ok' : 'pending'),
				},
			]
		}

		let verdict = 'needs-live-verify'
		if (groupHasDrift) {
			verdict = 'blocked-drift'
		} else if (groupHasAnomaly) {
			verdict = 'blocked-anomaly'
		} else if (verifiedIdenticalCount >= 1) {
			verdict = 'cleared'
		} else if (!strictVerifiedOnly && hashMeta.validFormat) {
			verdict = 'cleared'
		}

		const reclaimableBytes = Math.max(0, canonicalSize * Math.max(0, candidates.length))
		totalWastedBytes += reclaimableBytes

		if (verdict === 'cleared') {
			clearedGroupCount += 1
			const safeCandidateCount = strictVerifiedOnly
				? candidates.filter(c => c.copyChainState === 'verified-identical').length
				: candidates.length
			clearedReclaimableBytes += canonicalSize * safeCandidateCount
		} else if (verdict === 'blocked-drift' || verdict === 'blocked-anomaly') {
			blockedGroupCount += 1
		} else {
			pendingGroupCount += 1
		}

		let groupCategory = 'pending-verify'
		if (verdict === 'blocked-drift') {
			groupCategory = 'drift-detected'
		} else if (verdict === 'blocked-anomaly') {
			groupCategory = 'signature-anomaly'
		} else if (verdict === 'cleared') {
			groupCategory = 'cleared-ready'
		}

		const riskScore = (verdict === 'blocked-drift' ? 100 : 0)
			+ (verdict === 'blocked-anomaly' ? 80 : 0)
			+ (verdict === 'needs-live-verify' ? 35 : 0)
			+ (hashMeta.validFormat ? 0 : 25)
			+ Math.min(20, candidates.length * 4)

		const firstDiff = candidates.find(c => c.matchInfo && c.matchInfo.byteDiff)
			? candidates.find(c => c.matchInfo && c.matchInfo.byteDiff).matchInfo.byteDiff
			: null

		categoryCounts.all += 1
		categoryCounts[groupCategory] += 1

		allItems.push({
			groupId: group.id !== undefined && group.id !== null ? group.id : groupKey,
			groupKey,
			rawGroup: group,
			recordedHash,
			hashMeta,
			canonicalSize,
			canonicalSizeFormatted: formatBytes(canonicalSize),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			verdict,
			groupCategory,
			riskScore,
			copyCount: copyEntries.length,
			verifiedIdenticalCount,
			anchor,
			candidates,
			allCopies: copyEntries,
			firstByteDiff: firstDiff,
		})
	}

	const filtered = allItems.filter(item => {
		if (category !== 'all' && item.groupCategory !== category) {
			return false
		}
		if (searchQuery) {
			const hay = [
				item.recordedHash,
				item.hashMeta.algorithm,
				...item.allCopies.map(c => c.normalizedPath),
			].join(' ').toLowerCase()
			if (!hay.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filtered.sort((a, b) => {
		if (sortMode === 'reclaim_desc') {
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
		} else if (sortMode === 'copies_desc') {
			if (b.copyCount !== a.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (sortMode === 'name_asc') {
			return a.anchor.fileName.localeCompare(b.anchor.fileName)
		} else {
			if (b.riskScore !== a.riskScore) {
				return b.riskScore - a.riskScore
			}
		}
		return b.reclaimableBytes - a.reclaimableBytes
	})

	return {
		schema: FORENSIC_CHAIN_SCHEMA,
		strategy,
		category,
		sortMode,
		strictVerifiedOnly,
		items: filtered,
		allItems,
		summary: {
			totalGroups: allItems.length,
			filteredGroups: filtered.length,
			clearedGroupCount,
			blockedGroupCount,
			pendingGroupCount,
			verifiedFileCount,
			driftFileCount,
			totalWastedBytes,
			totalWastedFormatted: formatBytes(totalWastedBytes),
			clearedReclaimableBytes,
			clearedReclaimableFormatted: formatBytes(clearedReclaimableBytes),
			categoryCounts,
		},
	}
}

/**
 * Collect ONLY forensically cleared redundant copies eligible for safe deletion.
 *
 * @param {object} report Result of analyzeForensicChecksumChain.
 * @param {object} [options] Selection scope options.
 * @param {string|null} [options.groupKey] Restrict to a single groupKey if provided.
 * @return {{ files: Array<object>, totalBytes: number, totalFormatted: string, groupCount: number }} Safe deletion payload.
 */
export function collectForensicClearedSelection(report, options = {}) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const targetGroupKey = options.groupKey || null
	const strictVerifiedOnly = report ? report.strictVerifiedOnly !== false : true

	const files = []
	let totalBytes = 0
	const touchedGroups = new Set()

	for (const group of items) {
		if (targetGroupKey && group.groupKey !== targetGroupKey) {
			continue
		}
		if (group.verdict !== 'cleared') {
			continue
		}
		for (const cand of group.candidates) {
			if (strictVerifiedOnly && cand.copyChainState !== 'verified-identical') {
				continue
			}
			if (!strictVerifiedOnly && (cand.copyChainState === 'drift-mismatch' || cand.copyChainState === 'signature-anomaly' || cand.copyChainState === 'probe-failed')) {
				continue
			}
			files.push(cand.raw)
			totalBytes += cand.sizeBytes
			touchedGroups.add(group.groupKey)
		}
	}

	return {
		files,
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
		groupCount: touchedGroups.size,
	}
}

/**
 * Build a JSON forensic checksum chain certificate for audit compliance.
 *
 * @param {object} report Result of analyzeForensicChecksumChain.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildForensicChecksumManifest(report) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const payload = {
		schema: FORENSIC_CHAIN_SCHEMA,
		generatedAt: new Date().toISOString(),
		strategy: report ? report.strategy : 'verified_anchor',
		strictVerifiedOnly: report ? Boolean(report.strictVerifiedOnly) : true,
		summary: report ? report.summary : {},
		groups: items.map(group => ({
			groupId: group.groupId,
			groupKey: group.groupKey,
			verdict: group.verdict,
			recordedHash: group.recordedHash,
			hashAlgorithm: group.hashMeta.algorithm,
			canonicalSizeBytes: group.canonicalSize,
			anchorPath: group.anchor.normalizedPath,
			copies: group.allCopies.map(copy => ({
				role: copy.selectionKey === group.anchor.selectionKey ? 'anchor' : 'candidate',
				path: copy.normalizedPath,
				sizeBytes: copy.sizeBytes,
				chainState: copy.copyChainState,
				liveSha256: copy.live ? copy.live.liveSha256 : '',
				headHash: copy.live ? copy.live.headHash : '',
				magicSignature: copy.live && copy.live.magicInfo ? copy.live.magicInfo.label : '',
				firstDivergenceOffset: copy.matchInfo && copy.matchInfo.byteDiff
					? copy.matchInfo.byteDiff.firstDivergenceOffset
					: -1,
			})),
		})),
	}

	return JSON.stringify(payload, null, 2)
}

/**
 * Build a standard `sha256sum -c` compatible verification manifest.
 *
 * @param {object} report Result of analyzeForensicChecksumChain.
 * @return {string} SHA-256 sums manifest text.
 */
export function buildForensicSha256SumsFile(report) {
	const items = report && Array.isArray(report.items) ? report.items : []
	const lines = [
		'# DuplicateFinder Zero-Touch Forensic SHA-256 Checksum Chain',
		`# Schema: ${FORENSIC_CHAIN_SCHEMA}`,
		`# Generated: ${new Date().toISOString()}`,
		'',
	]

	for (const group of items) {
		lines.push(`# Group ${group.groupId} | Verdict: ${group.verdict} | Index(${group.hashMeta.algorithm}): ${group.recordedHash || 'none'}`)
		for (const copy of group.allCopies) {
			const cleanPath = copy.normalizedPath.replace(/[\r\n]/g, ' ')
			if (copy.live && copy.live.liveSha256) {
				lines.push(`${copy.live.liveSha256}  ${cleanPath}`)
			} else {
				lines.push(`# [${copy.copyChainState.toUpperCase()}] ${cleanPath}`)
			}
		}
		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236-safe CSV forensic audit ledger.
 *
 * @param {object} report Result of analyzeForensicChecksumChain.
 * @return {string} RFC-4180 CSV ledger.
 */
export function buildForensicAuditCsv(report) {
	const headers = [
		'Group ID',
		'Group Verdict',
		'Copy Role',
		'Chain State',
		'Path',
		'Size Bytes',
		'Index Hash',
		'Index Algorithm',
		'Live SHA-256',
		'Magic Signature',
		'First Divergence Offset',
	]
	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	const items = report && Array.isArray(report.items) ? report.items : []

	for (const group of items) {
		for (const copy of group.allCopies) {
			const role = copy.selectionKey === group.anchor.selectionKey ? 'anchor' : 'candidate'
			const row = [
				group.groupId,
				group.verdict,
				role,
				copy.copyChainState,
				copy.normalizedPath,
				copy.sizeBytes,
				group.recordedHash,
				group.hashMeta.algorithm,
				copy.live ? copy.live.liveSha256 : '',
				copy.live && copy.live.magicInfo ? copy.live.magicInfo.label : '',
				copy.matchInfo && copy.matchInfo.byteDiff
					? copy.matchInfo.byteDiff.firstDivergenceOffset
					: -1,
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\n')
}

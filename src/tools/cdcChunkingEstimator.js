/**
 * Pure Content-Defined Chunking (CDC), ZFS DDT, Restic & Object-Storage
 * Sub-File Savings Estimator.
 * Models file-level vs fixed-block vs FastCDC variable-block deduplication
 * efficiency on large VM images, ISOs, Maildir/tar archives, and SQLite/DB dumps.
 * Includes a deterministic Gear-hash FastCDC rolling-window engine for raw byte
 * buffers and synthetic byte-shift probes, plus ZFS DDT RAM sizing, compressed
 * boundary trap detection, dry-run-first verification scripts, and CWE-1236
 * safe CSV/JSON exports.
 * Zero DOM dependencies, zero XSS sinks, zero network side effects.
 */

import { extractFileExtension } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const CDC_ESTIMATOR_SCHEMA = 'duplicatefinder.cdc-savings-estimator.v1'

export const CDC_WORKLOAD_CLASSES = Object.freeze([
	'all',
	'vm_image',
	'sqlite_db',
	'maildir_archive',
	'compressed_trap',
	'exact_duplicate',
	'general_large',
])

export const CDC_SORT_MODES = Object.freeze([
	'cdc_reclaim_desc',
	'cdc_gain_over_file_desc',
	'ratio_desc',
	'ddt_ram_desc',
	'name_asc',
])

export const AVG_CHUNK_OPTIONS = Object.freeze([
	8192,
	16384,
	65536,
	262144,
	1048576,
	4194304,
])

export const FIXED_BLOCK_OPTIONS = Object.freeze([
	4096,
	16384,
	65536,
	131072,
])

export const CDC_BACKEND_PROFILES = Object.freeze({
	restic_s3: {
		id: 'restic_s3',
		label: 'Restic / Borg (FastCDC + S3)',
		defaultAvgChunkBytes: 1048576,
		fixedBaselineBytes: 65536,
		chunkIndexBytesPerEntry: 44,
		ddtRamBytesPerEntry: 0,
		supportsSubFile: true,
		commandTool: 'restic',
	},
	zfs_dedup: {
		id: 'zfs_dedup',
		label: 'ZFS Dedup (DDT / zdb -S)',
		defaultAvgChunkBytes: 16384,
		fixedBaselineBytes: 16384,
		chunkIndexBytesPerEntry: 32,
		ddtRamBytesPerEntry: 320,
		supportsSubFile: true,
		commandTool: 'zfs',
	},
	btrfs_reflink: {
		id: 'btrfs_reflink',
		label: 'Btrfs / XFS Extent (duperemove)',
		defaultAvgChunkBytes: 16384,
		fixedBaselineBytes: 4096,
		chunkIndexBytesPerEntry: 24,
		ddtRamBytesPerEntry: 0,
		supportsSubFile: true,
		commandTool: 'duperemove',
	},
	s3_cdc_gateway: {
		id: 's3_cdc_gateway',
		label: 'Object-Storage CDC Gateway',
		defaultAvgChunkBytes: 262144,
		fixedBaselineBytes: 131072,
		chunkIndexBytesPerEntry: 48,
		ddtRamBytesPerEntry: 0,
		supportsSubFile: true,
		commandTool: 's3_cdc',
	},
})

const VM_IMAGE_EXTS = new Set([
	'qcow2', 'qcow', 'vmdk', 'vdi', 'vhd', 'vhdx', 'raw', 'img', 'ova', 'ovf', 'qed',
])

const SQLITE_DB_EXTS = new Set([
	'sqlite', 'sqlite3', 'db', 'db3', 'wal', 'db-wal', 'sql', 'dump', 'mdb', 'accdb', 'fdb',
])

const MAILDIR_ARCHIVE_EXTS = new Set([
	'mbox', 'eml', 'pst', 'ost', 'mbx', 'tar', 'iso', 'cpio', 'wim', 'udf',
])

const COMPRESSED_TRAP_EXTS = new Set([
	'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'tzst', 'zip', '7z', 'rar', 'lz4', 'br',
])

const DATED_STEM_RE = /(?:[-_.\s]+(?:\d{4}[-_.]?\d{2}[-_.]?\d{2}(?:[T_-]\d{4,6})?|\d{8,14}|v\d+(?:\.\d+)?|rev\d+|snap\d*|snapshot\d*|backup\d*|bak\d*|copy(?:\s*\d+)?|wal|shm|journal|old|prev|pre[-_]?upgrade))+$/i
const COPY_PAREN_RE = /(?:\s*\(\d+\))+$/
const RSYNCABLE_HINT_RE = /(?:^|[-_.])(rsyncable|uncompressed)(?:[-_.]|$)/i
const PATH_VM_HINT_RE = /(?:^|\/)(?:vms?|libvirt|qemu|proxmox|virtualbox|images?|disks?)(?:\/|$)/i
const PATH_DB_HINT_RE = /(?:^|\/)(?:databases?|db|sqlite|dumps?|pg_dump|mysqldump)(?:\/|$)/i
const PATH_MAIL_HINT_RE = /(?:^|\/)(?:maildir|mail|mbox|imap|archives?|isos?)(?:\/|$)/i

const MAX_BYTE_INSPECT_LIMIT = 16 * 1024 * 1024

/**
 * Deterministic 256-entry 32-bit Gear hash lookup table for FastCDC.
 */
const GEAR_TABLE = (() => {
	const table = new Uint32Array(256)
	let state = 0x9e3779b9
	for (let i = 0; i < 256; i++) {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		table[i] = state >>> 0
	}
	return table
})()

/**
 * Strip ASCII control characters and normalize whitespace for safe plain-text display.
 *
 * @param {*} raw - Candidate text value.
 * @param {number} [maxLen=240] - Maximum output length.
 * @return {string} Sanitized plain-text string.
 */
export function sanitizeCdcText(raw, maxLen = 240) {
	if (raw === null || raw === undefined) {
		return ''
	}
	let cleaned = ''
	const str = String(raw)
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i)
		if ((code >= 0 && code <= 31) || (code >= 127 && code <= 159)) {
			cleaned += ' '
		} else {
			cleaned += str[i]
		}
	}
	cleaned = cleaned.replace(/\s+/g, ' ').trim()
	if (Number.isFinite(maxLen) && maxLen > 0 && cleaned.length > maxLen) {
		return cleaned.slice(0, maxLen)
	}
	return cleaned
}

/**
 * Escape a shell argument safely using POSIX single-quoting.
 *
 * @param {*} value - Raw argument value.
 * @return {string} Single-quoted POSIX shell literal.
 */
export function escapePosixShellArg(value) {
	const safe = sanitizeCdcText(value, 1024)
	return `'${safe.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Parse a file size safely into non-negative finite bytes.
 *
 * @param {*} value - Raw size value.
 * @return {number} Non-negative finite byte count.
 */
function toSafeBytes(value) {
	const num = Number(value)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return Math.floor(num)
}

/**
 * Extract normalized basename from a file path.
 *
 * @param {*} rawPath - File path.
 * @return {string} Basename or empty string.
 */
function extractBaseName(rawPath) {
	const normalized = normalizePathForDiff(rawPath || '')
	if (!normalized) {
		return ''
	}
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Resolve extension without leading dot, including compound tar.* suffixes.
 *
 * @param {*} rawPath - File path.
 * @return {string} Lowercase extension.
 */
function extractCdcExtension(rawPath) {
	const base = extractBaseName(rawPath).toLowerCase()
	if (base.endsWith('.tar.gz')) {
		return 'tgz'
	}
	if (base.endsWith('.tar.bz2')) {
		return 'tbz2'
	}
	if (base.endsWith('.tar.xz')) {
		return 'txz'
	}
	if (base.endsWith('.tar.zst')) {
		return 'tzst'
	}
	if (base.endsWith('-wal') || base.endsWith('.db-wal')) {
		return 'wal'
	}
	return extractFileExtension(rawPath || '')
}

/**
 * Extract normalized lineage stem for clustering sibling snapshots/dumps.
 *
 * @param {*} rawPath - File path.
 * @return {string} Normalized lowercase stem.
 */
export function extractCdcStem(rawPath) {
	const base = extractBaseName(rawPath)
	if (!base) {
		return ''
	}
	let stem = base.toLowerCase()
	for (const compound of ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst', '.db-wal', '.db-shm']) {
		if (stem.endsWith(compound)) {
			stem = stem.slice(0, stem.length - compound.length)
			break
		}
	}
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}
	stem = stem.replace(COPY_PAREN_RE, '')
	stem = stem.replace(DATED_STEM_RE, '')
	stem = stem.replace(/[-_.\s]+$/g, '')
	return stem || base.toLowerCase()
}

/**
 * Classify a file into its CDC storage workload profile.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {object} Workload profile metadata.
 */
export function classifyCdcWorkload(file) {
	const rawPath = (file && (file.path || file.name)) || ''
	const normalizedPath = normalizePathForDiff(rawPath)
	const ext = extractCdcExtension(rawPath)
	const lowerName = extractBaseName(rawPath).toLowerCase()

	if (COMPRESSED_TRAP_EXTS.has(ext) && !RSYNCABLE_HINT_RE.test(lowerName)) {
		return {
			workloadClass: 'compressed_trap',
			label: 'Compressed Archive Trap',
			extension: ext || 'bin',
			isCompressedTrap: true,
			supportsSubFile: false,
			baseCdcReuseRatio: 0.11,
			baseFixedReuseRatio: 0.04,
			zeroBlockRatio: 0.01,
			shiftSensitivity: 0.94,
		}
	}

	if (VM_IMAGE_EXTS.has(ext) || PATH_VM_HINT_RE.test(normalizedPath)) {
		return {
			workloadClass: 'vm_image',
			label: 'VM / Disk Image',
			extension: ext || 'img',
			isCompressedTrap: false,
			supportsSubFile: true,
			baseCdcReuseRatio: 0.74,
			baseFixedReuseRatio: 0.24,
			zeroBlockRatio: 0.18,
			shiftSensitivity: 0.78,
		}
	}

	if (SQLITE_DB_EXTS.has(ext) || PATH_DB_HINT_RE.test(normalizedPath)) {
		return {
			workloadClass: 'sqlite_db',
			label: 'SQLite / DB Dump',
			extension: ext || 'db',
			isCompressedTrap: false,
			supportsSubFile: true,
			baseCdcReuseRatio: 0.64,
			baseFixedReuseRatio: 0.19,
			zeroBlockRatio: 0.05,
			shiftSensitivity: 0.82,
		}
	}

	if (MAILDIR_ARCHIVE_EXTS.has(ext) || PATH_MAIL_HINT_RE.test(normalizedPath)) {
		return {
			workloadClass: 'maildir_archive',
			label: 'Maildir / Tar / ISO',
			extension: ext || 'tar',
			isCompressedTrap: false,
			supportsSubFile: true,
			baseCdcReuseRatio: 0.68,
			baseFixedReuseRatio: 0.14,
			zeroBlockRatio: 0.04,
			shiftSensitivity: 0.88,
		}
	}

	return {
		workloadClass: 'general_large',
		label: 'General Binary / Asset',
		extension: ext || 'bin',
		isCompressedTrap: false,
		supportsSubFile: true,
		baseCdcReuseRatio: 0.42,
		baseFixedReuseRatio: 0.16,
		zeroBlockRatio: 0.03,
		shiftSensitivity: 0.65,
	}
}

/**
 * Normalize raw byte input into a bounded Uint8Array or null.
 *
 * @param {*} raw - Candidate byte payload.
 * @return {Uint8Array|null} Normalized byte view or null.
 */
function normalizeBytePayload(raw) {
	if (!raw) {
		return null
	}
	let view = null
	if (raw instanceof Uint8Array) {
		view = raw
	} else if (raw instanceof ArrayBuffer) {
		view = new Uint8Array(raw)
	} else if (ArrayBuffer.isView(raw)) {
		view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
	}
	if (!view || view.byteLength === 0) {
		return null
	}
	if (view.byteLength > MAX_BYTE_INSPECT_LIMIT) {
		return view.subarray(0, MAX_BYTE_INSPECT_LIMIT)
	}
	return view
}

/**
 * Compute deterministic 64-bit FNV-1a hex digest and all-zero detection for a byte range.
 *
 * @param {Uint8Array} bytes - Input byte buffer.
 * @param {number} start - Inclusive start offset.
 * @param {number} end - Exclusive end offset.
 * @return {{ hash: string, isZero: boolean }} 16-char hex digest and zero flag.
 */
export function fnv1a64Hex(bytes, start, end) {
	let h1 = 0x811c9dc5
	let h2 = 0x9e3779b9
	let isZero = true
	for (let i = start; i < end; i++) {
		const b = bytes[i]
		if (b !== 0) {
			isZero = false
		}
		h1 ^= b
		h1 = Math.imul(h1, 0x01000193) >>> 0
		h2 ^= (b ^ ((i - start) & 0xff))
		h2 = Math.imul(h2, 0x01000193) >>> 0
	}
	const hex1 = h1.toString(16).padStart(8, '0')
	const hex2 = h2.toString(16).padStart(8, '0')
	return {
		hash: `${hex1}${hex2}`,
		isZero,
	}
}

/**
 * Build a FastCDC bitmask with k active bits in the top bits of a 32-bit word.
 *
 * @param {number} bits - Target bit count.
 * @return {number} Unsigned 32-bit mask.
 */
function buildFastCdcMask(bits) {
	const clamped = Math.max(4, Math.min(24, Math.round(bits)))
	// Spread mask bits across upper positions for uniform Gear-hash boundary hits
	return ((0xffffffff >>> (32 - clamped)) << (32 - clamped)) >>> 0
}

/**
 * Run normalized FastCDC Gear-hash content-defined chunking on raw bytes.
 *
 * @param {Uint8Array|ArrayBuffer} rawBytes - Input payload.
 * @param {object} [options] - Chunking parameters.
 * @param {number} [options.avgChunkBytes=16384] - Target average chunk size.
 * @return {object} Chunk summary and chunk descriptors.
 */
export function chunkBytesFastCdc(rawBytes, options = {}) {
	const bytes = normalizeBytePayload(rawBytes)
	if (!bytes) {
		return {
			totalBytes: 0,
			chunkCount: 0,
			minObserved: 0,
			maxObserved: 0,
			avgObserved: 0,
			zeroChunks: 0,
			chunks: [],
		}
	}

	const rawAvg = Number(options.avgChunkBytes)
	const avgChunkBytes = Number.isFinite(rawAvg) && rawAvg >= 256
		? Math.min(4194304, Math.floor(rawAvg))
		: 16384
	const minChunkBytes = Math.max(64, Math.floor(avgChunkBytes / 4))
	const maxChunkBytes = Math.max(minChunkBytes * 2, avgChunkBytes * 4)

	const avgBits = Math.max(6, Math.round(Math.log2(avgChunkBytes)))
	const maskStrong = buildFastCdcMask(avgBits + 1)
	const maskLarge = buildFastCdcMask(Math.max(4, avgBits - 1))

	const totalBytes = bytes.byteLength
	const chunks = []
	let offset = 0
	let zeroChunks = 0
	let minObserved = Number.POSITIVE_INFINITY
	let maxObserved = 0

	while (offset < totalBytes) {
		const remaining = totalBytes - offset
		if (remaining <= minChunkBytes) {
			const fp = fnv1a64Hex(bytes, offset, totalBytes)
			if (fp.isZero) {
				zeroChunks += 1
			}
			chunks.push({ offset, length: remaining, hash: fp.hash, isZero: fp.isZero })
			minObserved = Math.min(minObserved, remaining)
			maxObserved = Math.max(maxObserved, remaining)
			break
		}

		const normalSize = Math.min(avgChunkBytes, remaining)
		const limitMax = Math.min(maxChunkBytes, remaining)

		// Detect sparse zero-filled prefix run so zero pages isolate into dedicated zero chunks
		let prefixAllZero = true
		for (let z = 0; z < minChunkBytes; z++) {
			if (bytes[offset + z] !== 0) {
				prefixAllZero = false
				break
			}
		}
		if (prefixAllZero) {
			let zEnd = minChunkBytes
			while (zEnd < limitMax && bytes[offset + zEnd] === 0) {
				zEnd += 1
			}
			const end = offset + zEnd
			const fp = fnv1a64Hex(bytes, offset, end)
			if (fp.isZero) {
				zeroChunks += 1
			}
			chunks.push({ offset, length: zEnd, hash: fp.hash, isZero: fp.isZero })
			minObserved = Math.min(minObserved, zEnd)
			maxObserved = Math.max(maxObserved, zEnd)
			offset = end
			continue
		}

		let cursor = minChunkBytes
		let fingerprint = 0
		let cutLength = limitMax
		let zeroRun = 0

		// Phase 1: normalized strong mask before target average size
		while (cursor < normalSize) {
			const byteVal = bytes[offset + cursor]
			zeroRun = byteVal === 0 ? zeroRun + 1 : 0
			fingerprint = ((fingerprint << 1) + GEAR_TABLE[byteVal]) >>> 0
			if (zeroRun >= 64 || (fingerprint & maskStrong) === 0) {
				cutLength = cursor + 1
				break
			}
			cursor += 1
		}

		// Phase 2: relaxed mask between normalSize and maxChunkBytes
		if (cutLength === limitMax && cursor < limitMax) {
			while (cursor < limitMax) {
				const byteVal = bytes[offset + cursor]
				zeroRun = byteVal === 0 ? zeroRun + 1 : 0
				fingerprint = ((fingerprint << 1) + GEAR_TABLE[byteVal]) >>> 0
				if (zeroRun >= 64 || (fingerprint & maskLarge) === 0) {
					cutLength = cursor + 1
					break
				}
				cursor += 1
			}
		}

		const end = offset + cutLength
		const fp = fnv1a64Hex(bytes, offset, end)
		if (fp.isZero) {
			zeroChunks += 1
		}
		chunks.push({ offset, length: cutLength, hash: fp.hash, isZero: fp.isZero })
		minObserved = Math.min(minObserved, cutLength)
		maxObserved = Math.max(maxObserved, cutLength)
		offset = end
	}

	return {
		totalBytes,
		chunkCount: chunks.length,
		minObserved: chunks.length > 0 ? minObserved : 0,
		maxObserved,
		avgObserved: chunks.length > 0 ? Math.round(totalBytes / chunks.length) : 0,
		zeroChunks,
		chunks,
	}
}

/**
 * Run fixed-size block chunking on raw bytes for shift-sensitivity comparison.
 *
 * @param {Uint8Array|ArrayBuffer} rawBytes - Input payload.
 * @param {number} [blockSize=4096] - Fixed block size in bytes.
 * @return {object} Fixed block breakdown.
 */
export function chunkBytesFixed(rawBytes, blockSize = 4096) {
	const bytes = normalizeBytePayload(rawBytes)
	if (!bytes) {
		return {
			totalBytes: 0,
			blockCount: 0,
			zeroBlocks: 0,
			blocks: [],
		}
	}
	const safeBlock = Number.isFinite(Number(blockSize)) && Number(blockSize) >= 64
		? Math.min(4194304, Math.floor(Number(blockSize)))
		: 4096
	const blocks = []
	let zeroBlocks = 0
	for (let offset = 0; offset < bytes.byteLength; offset += safeBlock) {
		const end = Math.min(bytes.byteLength, offset + safeBlock)
		const fp = fnv1a64Hex(bytes, offset, end)
		if (fp.isZero) {
			zeroBlocks += 1
		}
		blocks.push({
			offset,
			length: end - offset,
			hash: fp.hash,
			isZero: fp.isZero,
		})
	}
	return {
		totalBytes: bytes.byteLength,
		blockCount: blocks.length,
		zeroBlocks,
		blocks,
	}
}

/**
 * Deduplicate a list of chunked payloads and compute unique vs saved bytes.
 *
 * @param {Array<Array<object>>} chunkLists - Chunk arrays per file.
 * @return {object} Unique/shared chunk metrics.
 */
function summarizeDeduplicatedChunks(chunkLists) {
	const seen = new Map()
	let totalChunks = 0
	let logicalBytes = 0
	let uniqueBytes = 0
	let zeroChunks = 0
	let zeroBytes = 0

	for (const list of chunkLists) {
		for (const chunk of list) {
			totalChunks += 1
			logicalBytes += chunk.length
			if (chunk.isZero) {
				zeroChunks += 1
				zeroBytes += chunk.length
			}
			const key = `${chunk.hash}:${chunk.length}`
			if (!seen.has(key)) {
				seen.set(key, chunk.length)
				uniqueBytes += chunk.length
			}
		}
	}

	const savedBytes = Math.max(0, logicalBytes - uniqueBytes)
	const dedupRatio = uniqueBytes > 0 ? Math.round((logicalBytes / uniqueBytes) * 100) / 100 : 1
	const reusePct = logicalBytes > 0 ? Math.round((savedBytes / logicalBytes) * 1000) / 10 : 0

	return {
		totalChunks,
		uniqueChunks: seen.size,
		logicalBytes,
		uniqueBytes,
		savedBytes,
		zeroChunks,
		zeroBytes,
		dedupRatio,
		reusePct,
	}
}

/**
 * Empirically compare Fixed-Block vs FastCDC across raw byte payloads.
 *
 * @param {Array<object>} buffers - Payloads to compare.
 * @param {object} [options] - Chunking sizes.
 * @param {number} [options.avgChunkBytes=4096] - FastCDC average chunk size.
 * @param {number} [options.fixedBlockBytes=4096] - Fixed block size.
 * @return {object} Empirical fixed vs FastCDC metrics.
 */
export function compareFixedVsFastCdcBytes(buffers, options = {}) {
	const list = Array.isArray(buffers) ? buffers.filter(item => item && item.bytes) : []
	const avgChunkBytes = Number(options.avgChunkBytes) || 4096
	const fixedBlockBytes = Number(options.fixedBlockBytes) || 4096

	const fixedLists = []
	const cdcLists = []
	for (const entry of list) {
		fixedLists.push(chunkBytesFixed(entry.bytes, fixedBlockBytes).blocks)
		cdcLists.push(chunkBytesFastCdc(entry.bytes, { avgChunkBytes }).chunks)
	}

	const fixed = summarizeDeduplicatedChunks(fixedLists)
	const fastcdc = summarizeDeduplicatedChunks(cdcLists)
	const cdcAdvantageBytes = Math.max(0, fastcdc.savedBytes - fixed.savedBytes)
	const cdcAdvantagePct = fixed.logicalBytes > 0
		? Math.round((cdcAdvantageBytes / fixed.logicalBytes) * 1000) / 10
		: 0

	return {
		payloadCount: list.length,
		logicalBytes: fastcdc.logicalBytes,
		avgChunkBytes,
		fixedBlockBytes,
		fixed,
		fastcdc,
		cdcAdvantageBytes,
		cdcAdvantagePct,
	}
}

/**
 * Run a deterministic synthetic byte-shift probe (base payload vs prepended-header payload)
 * demonstrating why Fixed-Block collapses on byte insertion while FastCDC re-synchronizes.
 *
 * @param {object} [options] - Probe parameters.
 * @param {number} [options.shiftBytes=64] - Prepended header shift bytes.
 * @param {number} [options.avgChunkBytes=2048] - FastCDC target average chunk size.
 * @param {number} [options.fixedBlockBytes=2048] - Fixed block size.
 * @param {number} [options.payloadBytes=65536] - Base synthetic payload size.
 * @return {object} Empirical byte-shift probe results.
 */
export function buildSyntheticShiftProbe(options = {}) {
	const rawShift = Number(options.shiftBytes)
	const shiftBytes = Number.isFinite(rawShift) ? Math.max(0, Math.min(8192, Math.floor(rawShift))) : 64
	const rawPayload = Number(options.payloadBytes)
	const payloadBytes = Number.isFinite(rawPayload) ? Math.max(8192, Math.min(262144, Math.floor(rawPayload))) : 65536
	const avgChunkBytes = Number(options.avgChunkBytes) || 2048
	const fixedBlockBytes = Number(options.fixedBlockBytes) || 2048

	const base = new Uint8Array(payloadBytes)
	let rng = 0x13579bdf
	for (let i = 0; i < payloadBytes; i++) {
		// Include periodic zero-page region (simulated sparse VM block)
		if (i >= 16384 && i < 24576) {
			base[i] = 0
		} else {
			rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
			base[i] = (rng >>> 16) & 0xff
		}
	}

	const shifted = new Uint8Array(shiftBytes + payloadBytes)
	for (let i = 0; i < shiftBytes; i++) {
		shifted[i] = (0xa5 + i) & 0xff
	}
	shifted.set(base, shiftBytes)
	// Mutate a small 256-byte WAL/metadata slice in the middle
	const patchStart = Math.min(shifted.byteLength - 256, shiftBytes + 32768)
	for (let i = 0; i < 256; i++) {
		shifted[patchStart + i] = (shifted[patchStart + i] ^ 0x5a) & 0xff
	}

	const comparison = compareFixedVsFastCdcBytes(
		[
			{ label: 'base.img', bytes: base },
			{ label: 'snapshot_shifted.img', bytes: shifted },
		],
		{ avgChunkBytes, fixedBlockBytes },
	)

	return {
		shiftBytes,
		payloadBytes,
		...comparison,
	}
}

/**
 * Resolve effective options for a given backend profile.
 *
 * @param {object} [options] - Estimator options.
 * @return {object} Resolved configuration.
 */
function resolveEstimatorConfig(options = {}) {
	const backendId = CDC_BACKEND_PROFILES[options.backendId]
		? options.backendId
		: 'restic_s3'
	const profile = CDC_BACKEND_PROFILES[backendId]
	const rawAvg = Number(options.avgChunkBytes)
	const avgChunkBytes = Number.isFinite(rawAvg) && rawAvg >= 256
		? Math.min(4194304, Math.floor(rawAvg))
		: profile.defaultAvgChunkBytes
	const rawFixed = Number(options.fixedBlockBytes)
	const fixedBlockBytes = Number.isFinite(rawFixed) && rawFixed >= 512
		? Math.min(1048576, Math.floor(rawFixed))
		: profile.fixedBaselineBytes
	const rawRamGb = Number(options.ddtRamBudgetGb)
	const ddtRamBudgetGb = Number.isFinite(rawRamGb) && rawRamGb > 0
		? Math.min(2048, rawRamGb)
		: 16
	return {
		backendId,
		profile,
		avgChunkBytes,
		fixedBlockBytes,
		ddtRamBudgetGb,
		ddtRamBudgetBytes: Math.round(ddtRamBudgetGb * 1024 * 1024 * 1024),
	}
}

/**
 * Estimate chunk-granularity efficiency multiplier.
 * Smaller CDC chunk sizes capture finer DB/VM deltas at higher index metadata cost.
 *
 * @param {string} workloadClass - Workload classification id.
 * @param {number} avgChunkBytes - Target average chunk size.
 * @return {number} Multiplier in [0.55, 1.12].
 */
function computeChunkGranularityFactor(workloadClass, avgChunkBytes) {
	if (workloadClass === 'compressed_trap') {
		return avgChunkBytes <= 16384 ? 1.05 : 0.72
	}
	if (workloadClass === 'sqlite_db') {
		if (avgChunkBytes <= 16384) {
			return 1.08
		}
		if (avgChunkBytes <= 65536) {
			return 0.94
		}
		if (avgChunkBytes <= 262144) {
			return 0.78
		}
		return 0.61
	}
	if (workloadClass === 'vm_image') {
		if (avgChunkBytes <= 65536) {
			return 1.04
		}
		if (avgChunkBytes <= 262144) {
			return 0.95
		}
		return 0.82
	}
	if (workloadClass === 'maildir_archive') {
		if (avgChunkBytes <= 65536) {
			return 1.03
		}
		return 0.85
	}
	return avgChunkBytes <= 65536 ? 1.0 : 0.84
}

/**
 * Estimate file-level, fixed-block, FastCDC, and ZFS DDT metrics for a single cluster.
 *
 * @param {object} cluster - Cluster input containing files and metadata.
 * @param {object} [options] - Estimator configuration.
 * @return {object} Comprehensive cluster deduplication assessment.
 */
export function estimateClusterDeduplication(cluster, options = {}) {
	const cfg = resolveEstimatorConfig(options)
	const files = Array.isArray(cluster && cluster.files) ? cluster.files.filter(Boolean) : []
	const normalizedFiles = files.map((file, idx) => {
		const path = normalizePathForDiff(file.path || file.name || `/file-${idx}`)
		const size = toSafeBytes(file.size)
		const hash = typeof file.hash === 'string' && file.hash.trim() ? file.hash.trim() : ''
		const bytes = normalizeBytePayload(file.sampleBytes || file.bytes || file.content)
		const workload = classifyCdcWorkload({ ...file, path })
		return {
			id: getFileSelectionKey(file) || `${path}:${idx}`,
			rawFile: file,
			path,
			name: sanitizeCdcText(extractBaseName(path) || `file-${idx}`, 120),
			size,
			hash,
			bytes,
			workload,
			mtime: Number(file.mtime) || 0,
		}
	})

	const totalFiles = normalizedFiles.length
	const logicalBytes = normalizedFiles.reduce((sum, f) => sum + f.size, 0)
	const primaryFile = normalizedFiles[0] || {
		name: 'empty',
		path: '/',
		workload: classifyCdcWorkload({}),
	}

	// Determine if all files are byte-identical (exact duplicate hash group)
	const hashCounts = new Map()
	let uniqueHashBytes = 0
	for (const f of normalizedFiles) {
		const hashKey = f.hash || `unique:${f.path}:${f.size}`
		if (!hashCounts.has(hashKey)) {
			hashCounts.set(hashKey, f.size)
			uniqueHashBytes += f.size
		}
	}
	const isExactDuplicateGroup = totalFiles > 1 && hashCounts.size === 1 && normalizedFiles[0].hash !== ''
	const fileLevelSavedBytes = Math.max(0, logicalBytes - uniqueHashBytes)
	const fileLevelRatio = uniqueHashBytes > 0
		? Math.round((logicalBytes / uniqueHashBytes) * 100) / 100
		: 1

	// Determine dominant workload
	let dominantWorkload = primaryFile.workload
	if (isExactDuplicateGroup && primaryFile.workload.workloadClass === 'general_large') {
		dominantWorkload = {
			...primaryFile.workload,
			workloadClass: 'exact_duplicate',
			label: 'Exact Duplicate Set',
		}
	}

	const byteAttachedFiles = normalizedFiles.filter(f => f.bytes && f.bytes.byteLength > 0)
	const hasEmpiricalBytes = byteAttachedFiles.length === totalFiles && totalFiles > 0

	let fixedSavedBytes = 0
	let fixedUniqueBytes = logicalBytes
	let fixedTotalBlocks = Math.max(1, Math.ceil(logicalBytes / cfg.fixedBlockBytes))
	let fixedUniqueBlocks = fixedTotalBlocks

	let cdcTotalChunks = Math.max(1, Math.ceil(logicalBytes / cfg.avgChunkBytes))
	let cdcUniqueChunks = cdcTotalChunks
	let cdcRawUniqueBytes = logicalBytes
	let cdcSavedBytes = 0
	let zeroBlockBytes = 0

	if (hasEmpiricalBytes && byteAttachedFiles.every(f => f.size === 0 || f.bytes.byteLength === f.size)) {
		const emp = compareFixedVsFastCdcBytes(
			byteAttachedFiles.map(f => ({ label: f.name, bytes: f.bytes })),
			{ avgChunkBytes: cfg.avgChunkBytes, fixedBlockBytes: cfg.fixedBlockBytes },
		)
		fixedTotalBlocks = emp.fixed.totalChunks
		fixedUniqueBlocks = emp.fixed.uniqueChunks
		fixedUniqueBytes = emp.fixed.uniqueBytes
		fixedSavedBytes = emp.fixed.savedBytes

		cdcTotalChunks = emp.fastcdc.totalChunks
		cdcUniqueChunks = emp.fastcdc.uniqueChunks
		cdcRawUniqueBytes = emp.fastcdc.uniqueBytes
		cdcSavedBytes = emp.fastcdc.savedBytes
		zeroBlockBytes = emp.fastcdc.zeroBytes
	} else if (logicalBytes > 0) {
		const maxSingleSize = normalizedFiles.reduce((m, f) => Math.max(m, f.size), 0)
		zeroBlockBytes = Math.round(logicalBytes * dominantWorkload.zeroBlockRatio)

		if (isExactDuplicateGroup) {
			// Exact copies: fixed-block & FastCDC both collapse copies down to 1 unique copy minus zero blocks
			fixedUniqueBytes = Math.max(0, maxSingleSize - Math.round(maxSingleSize * dominantWorkload.zeroBlockRatio))
			fixedSavedBytes = Math.max(0, logicalBytes - fixedUniqueBytes)
			fixedUniqueBlocks = Math.max(1, Math.ceil(fixedUniqueBytes / cfg.fixedBlockBytes))

			cdcRawUniqueBytes = fixedUniqueBytes
			cdcSavedBytes = fixedSavedBytes
			cdcUniqueChunks = Math.max(1, Math.ceil(cdcRawUniqueBytes / cfg.avgChunkBytes))
		} else if (totalFiles >= 2) {
			const extraBytes = Math.max(0, logicalBytes - maxSingleSize)
			const granularity = computeChunkGranularityFactor(dominantWorkload.workloadClass, cfg.avgChunkBytes)
			const effectiveCdcReuse = Math.min(0.92, Math.max(0.04, dominantWorkload.baseCdcReuseRatio * granularity))
			const effectiveFixedReuse = Math.min(
				effectiveCdcReuse,
				Math.max(0.02, dominantWorkload.baseFixedReuseRatio * (cfg.fixedBlockBytes <= 16384 ? 1.02 : 0.85)),
			)

			const fixedExtraSaved = Math.round(extraBytes * effectiveFixedReuse)
			const fixedZeroSaved = Math.round(maxSingleSize * dominantWorkload.zeroBlockRatio * 0.65)
			fixedSavedBytes = Math.min(logicalBytes, fixedExtraSaved + fixedZeroSaved)
			fixedUniqueBytes = Math.max(0, logicalBytes - fixedSavedBytes)
			fixedUniqueBlocks = Math.max(1, Math.ceil(fixedUniqueBytes / cfg.fixedBlockBytes))

			const cdcExtraSaved = Math.round(extraBytes * effectiveCdcReuse)
			const cdcZeroSaved = Math.round(maxSingleSize * dominantWorkload.zeroBlockRatio * 0.85)
			cdcSavedBytes = Math.min(logicalBytes, Math.max(fileLevelSavedBytes, cdcExtraSaved + cdcZeroSaved))
			cdcRawUniqueBytes = Math.max(0, logicalBytes - cdcSavedBytes)
			cdcUniqueChunks = Math.max(1, Math.ceil(cdcRawUniqueBytes / cfg.avgChunkBytes))
		} else {
			// Single large file: intra-file zero-block / self-dedup estimate only
			const intraReuse = dominantWorkload.workloadClass === 'vm_image' ? 0.18 : 0.04
			fixedSavedBytes = Math.round(logicalBytes * intraReuse * 0.7)
			fixedUniqueBytes = Math.max(0, logicalBytes - fixedSavedBytes)
			fixedUniqueBlocks = Math.max(1, Math.ceil(fixedUniqueBytes / cfg.fixedBlockBytes))

			cdcSavedBytes = Math.round(logicalBytes * intraReuse)
			cdcRawUniqueBytes = Math.max(0, logicalBytes - cdcSavedBytes)
			cdcUniqueChunks = Math.max(1, Math.ceil(cdcRawUniqueBytes / cfg.avgChunkBytes))
		}
	}

	const indexOverheadBytes = cdcUniqueChunks * cfg.profile.chunkIndexBytesPerEntry
	const cdcNetSavedBytes = Math.max(0, cdcSavedBytes - indexOverheadBytes)
	const cdcNetUniqueBytes = Math.max(0, logicalBytes - cdcNetSavedBytes)
	const cdcRatio = cdcNetUniqueBytes > 0
		? Math.round((logicalBytes / cdcNetUniqueBytes) * 100) / 100
		: 1
	const fixedRatio = fixedUniqueBytes > 0
		? Math.round((logicalBytes / fixedUniqueBytes) * 100) / 100
		: 1

	const cdcGainOverFileBytes = Math.max(0, cdcNetSavedBytes - fileLevelSavedBytes)
	const cdcAdvantageOverFixedBytes = Math.max(0, cdcNetSavedBytes - fixedSavedBytes)

	// ZFS DDT modeling
	const ddtRecordSize = cfg.backendId === 'zfs_dedup' ? cfg.avgChunkBytes : Math.min(cfg.avgChunkBytes, 131072)
	const ddtEntries = Math.max(1, Math.ceil(cdcRawUniqueBytes / Math.max(4096, ddtRecordSize)))
	const ddtRamBytes = ddtEntries * 320

	// Advisories and verdict
	const advisories = []
	let verdict = 'cdc-moderate-gain'

	if (dominantWorkload.isCompressedTrap) {
		verdict = 'compressed-trap'
		advisories.push('Compressed container (.gz/.zip/.zst/.7z) scrambles byte offsets on minor edits; re-pack with gzip --rsyncable or store uncompressed tar before CDC.')
	} else if (cfg.backendId === 'zfs_dedup' && (ddtRamBytes > cfg.ddtRamBudgetBytes * 0.25 || cdcRatio < 1.5)) {
		verdict = 'ddt-ram-risk'
		advisories.push(`ZFS DDT requires ${formatBytes(ddtRamBytes)} RAM for ${ddtEntries} entries; verify with zdb -S before enabling dedup=on.`)
	} else if (isExactDuplicateGroup && cdcGainOverFileBytes <= indexOverheadBytes * 2) {
		verdict = 'file-sufficient'
		advisories.push('Exact hash duplicates: deleting extra copies reclaims 100% with zero chunk-index or DDT RAM overhead.')
	} else if (cdcGainOverFileBytes > 0 && cdcRatio >= 1.65) {
		verdict = 'cdc-high-gain'
		advisories.push(`FastCDC reclaims ${formatBytes(cdcGainOverFileBytes)} beyond whole-file dedup (${cdcRatio}x ratio) and avoids fixed-block boundary collapse.`)
	} else {
		verdict = 'cdc-moderate-gain'
		advisories.push(`FastCDC achieves ${cdcRatio}x ratio across ${totalFiles} file(s) at ${formatBytes(cfg.avgChunkBytes)} average chunking.`)
	}

	if (dominantWorkload.workloadClass === 'sqlite_db' && cfg.avgChunkBytes > 65536) {
		advisories.push('SQLite/DB pages mutate in 4-16 KiB frames; lower avg chunk size to 8-16 KiB for higher page reuse.')
	}
	if (dominantWorkload.workloadClass === 'vm_image' && zeroBlockBytes > 0) {
		advisories.push(`Detected ~${formatBytes(zeroBlockBytes)} sparse/zero regions eligible for discard/fstrim or Restic zero-chunk collapse.`)
	}

	const s3PutSavingsPct = logicalBytes > 0
		? Math.round((cdcNetSavedBytes / logicalBytes) * 1000) / 10
		: 0

	return {
		clusterKey: sanitizeCdcText(cluster && cluster.clusterKey ? cluster.clusterKey : primaryFile.path, 200),
		rawGroup: (cluster && cluster.rawGroup) || null,
		primaryName: primaryFile.name,
		primaryPath: primaryFile.path,
		stem: extractCdcStem(primaryFile.path),
		workloadClass: dominantWorkload.workloadClass,
		workloadLabel: dominantWorkload.label,
		extension: dominantWorkload.extension,
		isCompressedTrap: dominantWorkload.isCompressedTrap,
		isExactDuplicateGroup,
		hasEmpiricalBytes,
		fileCount: totalFiles,
		files: normalizedFiles,
		logicalBytes,
		logicalFormatted: formatBytes(logicalBytes),
		fileLevelSavedBytes,
		fileLevelSavedFormatted: formatBytes(fileLevelSavedBytes),
		fileLevelRatio,
		fixedBlockBytes: cfg.fixedBlockBytes,
		fixedTotalBlocks,
		fixedUniqueBlocks,
		fixedSavedBytes,
		fixedSavedFormatted: formatBytes(fixedSavedBytes),
		fixedRatio,
		avgChunkBytes: cfg.avgChunkBytes,
		cdcTotalChunks,
		cdcUniqueChunks,
		indexOverheadBytes,
		indexOverheadFormatted: formatBytes(indexOverheadBytes),
		cdcSavedBytes,
		cdcNetSavedBytes,
		cdcNetSavedFormatted: formatBytes(cdcNetSavedBytes),
		cdcRatio,
		cdcGainOverFileBytes,
		cdcGainOverFileFormatted: formatBytes(cdcGainOverFileBytes),
		cdcAdvantageOverFixedBytes,
		cdcAdvantageOverFixedFormatted: formatBytes(cdcAdvantageOverFixedBytes),
		zeroBlockBytes,
		zeroBlockFormatted: formatBytes(zeroBlockBytes),
		ddtEntries,
		ddtRamBytes,
		ddtRamFormatted: formatBytes(ddtRamBytes),
		s3PutSavingsPct,
		verdict,
		advisories,
	}
}

/**
 * Group duplicate groups and sibling lineage assets into sub-file CDC clusters.
 *
 * @param {Array<object>} duplicateGroups - Duplicate groups from store/props.
 * @param {object} [options] - Clustering options.
 * @return {Array<object>} Raw cluster descriptors.
 */
function buildCdcClusters(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const clusterByStem = options.clusterByStem !== false
	const clusters = []
	const stemBuckets = new Map()

	groups.forEach((group, gIdx) => {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length === 0) {
			return
		}
		if (files.length > 1) {
			clusters.push({
				clusterKey: `group:${group.id !== undefined && group.id !== null ? group.id : gIdx}`,
				rawGroup: group,
				files,
			})
			return
		}
		// Single-file entry: cluster by lineage stem + workload class if clusterByStem is enabled
		const single = files[0]
		if (!clusterByStem) {
			clusters.push({
				clusterKey: `single:${group.id !== undefined && group.id !== null ? group.id : gIdx}`,
				rawGroup: group,
				files: [single],
			})
			return
		}
		const workload = classifyCdcWorkload(single)
		const stem = extractCdcStem(single.path || single.name || '') || `item-${gIdx}`
		const bucketKey = `${workload.workloadClass}:${stem}`
		if (!stemBuckets.has(bucketKey)) {
			stemBuckets.set(bucketKey, {
				clusterKey: `lineage:${bucketKey}`,
				rawGroup: group,
				files: [],
			})
		}
		stemBuckets.get(bucketKey).files.push(single)
	})

	for (const bucket of stemBuckets.values()) {
		clusters.push(bucket)
	}
	return clusters
}

/**
 * Sort assessed CDC clusters deterministically.
 *
 * @param {Array<object>} items - Cluster assessments.
 * @param {string} sortMode - Sort mode identifier.
 * @return {Array<object>} Sorted copy.
 */
function sortCdcItems(items, sortMode) {
	const list = [...items]
	list.sort((a, b) => {
		if (sortMode === 'cdc_gain_over_file_desc') {
			if (b.cdcGainOverFileBytes !== a.cdcGainOverFileBytes) {
				return b.cdcGainOverFileBytes - a.cdcGainOverFileBytes
			}
		} else if (sortMode === 'ratio_desc') {
			if (b.cdcRatio !== a.cdcRatio) {
				return b.cdcRatio - a.cdcRatio
			}
		} else if (sortMode === 'ddt_ram_desc') {
			if (b.ddtRamBytes !== a.ddtRamBytes) {
				return b.ddtRamBytes - a.ddtRamBytes
			}
		} else if (sortMode === 'name_asc') {
			const cmp = a.primaryName.localeCompare(b.primaryName)
			if (cmp !== 0) {
				return cmp
			}
		}
		if (b.cdcNetSavedBytes !== a.cdcNetSavedBytes) {
			return b.cdcNetSavedBytes - a.cdcNetSavedBytes
		}
		return a.clusterKey.localeCompare(b.clusterKey)
	})
	return list
}

/**
 * Build a complete Content-Defined Chunking & Sub-File Savings portfolio report.
 *
 * @param {Array<object>} duplicateGroups - Source duplicate groups.
 * @param {object} [options] - Simulation & filter parameters.
 * @return {object} Complete portfolio report.
 */
export function buildCdcSavingsReport(duplicateGroups, options = {}) {
	const cfg = resolveEstimatorConfig(options)
	const workloadFilter = CDC_WORKLOAD_CLASSES.includes(options.workloadFilter)
		? options.workloadFilter
		: 'all'
	const sortMode = CDC_SORT_MODES.includes(options.sortMode)
		? options.sortMode
		: 'cdc_reclaim_desc'
	const searchQuery = sanitizeCdcText(options.searchQuery || '', 120).toLowerCase()
	const minFileSizeBytes = toSafeBytes(options.minFileSizeBytes)

	const rawClusters = buildCdcClusters(duplicateGroups, options)
	const allAssessed = rawClusters.map(cluster => estimateClusterDeduplication(cluster, cfg))

	const filtered = allAssessed.filter((item) => {
		if (minFileSizeBytes > 0) {
			const maxUnit = item.files.reduce((m, f) => Math.max(m, f.size), 0)
			if (maxUnit < minFileSizeBytes) {
				return false
			}
		}
		if (workloadFilter !== 'all' && item.workloadClass !== workloadFilter) {
			return false
		}
		if (searchQuery) {
			const haystack = [
				item.primaryName,
				item.primaryPath,
				item.workloadLabel,
				item.extension,
				...item.files.map(f => f.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	const sorted = sortCdcItems(filtered, sortMode)

	let totalFiles = 0
	let logicalBytes = 0
	let fileLevelSavedBytes = 0
	let fixedBlockSavedBytes = 0
	let cdcNetSavedBytes = 0
	let cdcGainOverFileBytes = 0
	let totalCdcChunks = 0
	let uniqueCdcChunks = 0
	let indexOverheadBytes = 0
	let ddtEntriesTotal = 0
	let ddtRamBytes = 0
	let compressedTrapCount = 0
	let compressedTrapBytes = 0
	let empiricalClusters = 0

	const workloadMap = new Map()

	for (const item of sorted) {
		totalFiles += item.fileCount
		logicalBytes += item.logicalBytes
		fileLevelSavedBytes += item.fileLevelSavedBytes
		fixedBlockSavedBytes += item.fixedSavedBytes
		cdcNetSavedBytes += item.cdcNetSavedBytes
		cdcGainOverFileBytes += item.cdcGainOverFileBytes
		totalCdcChunks += item.cdcTotalChunks
		uniqueCdcChunks += item.cdcUniqueChunks
		indexOverheadBytes += item.indexOverheadBytes
		ddtEntriesTotal += item.ddtEntries
		ddtRamBytes += item.ddtRamBytes
		if (item.hasEmpiricalBytes) {
			empiricalClusters += 1
		}
		if (item.isCompressedTrap) {
			compressedTrapCount += 1
			compressedTrapBytes += item.logicalBytes
		}
		if (!workloadMap.has(item.workloadClass)) {
			workloadMap.set(item.workloadClass, {
				workloadClass: item.workloadClass,
				label: item.workloadLabel,
				clusters: 0,
				files: 0,
				logicalBytes: 0,
				cdcNetSavedBytes: 0,
				fileLevelSavedBytes: 0,
				fixedSavedBytes: 0,
			})
		}
		const bucket = workloadMap.get(item.workloadClass)
		bucket.clusters += 1
		bucket.files += item.fileCount
		bucket.logicalBytes += item.logicalBytes
		bucket.cdcNetSavedBytes += item.cdcNetSavedBytes
		bucket.fileLevelSavedBytes += item.fileLevelSavedBytes
		bucket.fixedSavedBytes += item.fixedSavedBytes
	}

	const fileLevelUnique = Math.max(0, logicalBytes - fileLevelSavedBytes)
	const fixedUnique = Math.max(0, logicalBytes - fixedBlockSavedBytes)
	const cdcUnique = Math.max(0, logicalBytes - cdcNetSavedBytes)

	const fileLevelRatio = fileLevelUnique > 0 ? Math.round((logicalBytes / fileLevelUnique) * 100) / 100 : 1
	const fixedBlockRatio = fixedUnique > 0 ? Math.round((logicalBytes / fixedUnique) * 100) / 100 : 1
	const cdcRatio = cdcUnique > 0 ? Math.round((logicalBytes / cdcUnique) * 100) / 100 : 1
	const ddtBudgetUtilizationPct = cfg.ddtRamBudgetBytes > 0
		? Math.round((ddtRamBytes / cfg.ddtRamBudgetBytes) * 1000) / 10
		: 0
	const s3PutReductionPct = logicalBytes > 0
		? Math.round((cdcNetSavedBytes / logicalBytes) * 1000) / 10
		: 0

	const workloadBreakdown = Array.from(workloadMap.values()).map(b => ({
		...b,
		logicalFormatted: formatBytes(b.logicalBytes),
		cdcNetSavedFormatted: formatBytes(b.cdcNetSavedBytes),
		efficiencyPct: b.logicalBytes > 0 ? Math.round((b.cdcNetSavedBytes / b.logicalBytes) * 1000) / 10 : 0,
	})).sort((a, b) => b.cdcNetSavedBytes - a.cdcNetSavedBytes)

	return {
		schema: CDC_ESTIMATOR_SCHEMA,
		backendId: cfg.backendId,
		backendProfile: cfg.profile,
		avgChunkBytes: cfg.avgChunkBytes,
		fixedBlockBytes: cfg.fixedBlockBytes,
		ddtRamBudgetGb: cfg.ddtRamBudgetGb,
		ddtRamBudgetBytes: cfg.ddtRamBudgetBytes,
		summary: {
			totalClusters: sorted.length,
			unfilteredClusters: allAssessed.length,
			totalFiles,
			empiricalClusters,
			logicalBytes,
			logicalFormatted: formatBytes(logicalBytes),
			fileLevelSavedBytes,
			fileLevelSavedFormatted: formatBytes(fileLevelSavedBytes),
			fileLevelRatio,
			fixedBlockSavedBytes,
			fixedBlockSavedFormatted: formatBytes(fixedBlockSavedBytes),
			fixedBlockRatio,
			cdcNetSavedBytes,
			cdcNetSavedFormatted: formatBytes(cdcNetSavedBytes),
			cdcRatio,
			cdcGainOverFileBytes,
			cdcGainOverFileFormatted: formatBytes(cdcGainOverFileBytes),
			totalCdcChunks,
			uniqueCdcChunks,
			indexOverheadBytes,
			indexOverheadFormatted: formatBytes(indexOverheadBytes),
			ddtEntriesTotal,
			ddtRamBytes,
			ddtRamFormatted: formatBytes(ddtRamBytes),
			ddtBudgetExceeded: ddtRamBytes > cfg.ddtRamBudgetBytes,
			ddtBudgetUtilizationPct,
			compressedTrapCount,
			compressedTrapBytes,
			compressedTrapFormatted: formatBytes(compressedTrapBytes),
			s3PutReductionPct,
		},
		workloadBreakdown,
		items: sorted,
	}
}

/**
 * Generate a dry-run-first CDC / ZFS / Restic / Btrfs verification and execution script.
 *
 * @param {object} report - Output from buildCdcSavingsReport.
 * @param {object} [options] - Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] - Nextcloud data root.
 * @param {string} [options.zfsPool='ncpool/data'] - Target ZFS dataset.
 * @param {string} [options.resticRepo='s3:s3.internal.example/nc-dedup-repo'] - Target Restic repository.
 * @return {string} POSIX bash script.
 */
export function buildCdcVerificationScript(report, options = {}) {
	const dataRoot = sanitizeCdcText(options.dataRoot || '/var/www/nextcloud/data', 256) || '/var/www/nextcloud/data'
	const zfsPool = sanitizeCdcText(options.zfsPool || 'ncpool/data', 128) || 'ncpool/data'
	const resticRepo = sanitizeCdcText(options.resticRepo || 's3:s3.internal.example/nc-dedup-repo', 256) || 's3:s3.internal.example/nc-dedup-repo'
	const backendId = (report && report.backendId) || 'restic_s3'
	const summary = (report && report.summary) || {}
	const items = Array.isArray(report && report.items) ? report.items.slice(0, 25) : []

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Content-Defined Chunking (CDC) & Sub-File Savings Verification Runbook',
		`# Backend: ${sanitizeCdcText((report && report.backendProfile && report.backendProfile.label) || backendId, 120)}`,
		`# Target Avg Chunk: ${formatBytes((report && report.avgChunkBytes) || 16384)} | Fixed Baseline: ${formatBytes((report && report.fixedBlockBytes) || 16384)}`,
		`# Estimated Logical: ${summary.logicalFormatted || '0 B'} | FastCDC Net Reclaim: ${summary.cdcNetSavedFormatted || '0 B'} (${summary.cdcRatio || 1}x)`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		`NC_DATA_ROOT=${escapePosixShellArg(dataRoot)}`,
		'',
		'echo "[INFO] DRY_RUN=$DRY_RUN | Backend=' + sanitizeCdcText(backendId, 40) + '"',
		'',
	]

	if (backendId === 'zfs_dedup') {
		lines.push(
			`ZFS_DATASET=${escapePosixShellArg(zfsPool)}`,
			'echo "[1/3] Running read-only ZFS DDT simulation (zdb -S)..."',
			'zdb -S "$ZFS_DATASET"',
			'zfs get dedup,recordsize,compression,special_small_blocks "$ZFS_DATASET"',
			'if [ "$DRY_RUN" = "0" ]; then',
			'  echo "[2/3] Applying ZFS dataset tuning (verify DDT RAM budget first)..."',
			`  zfs set recordsize=${Math.max(4096, Math.min(1048576, Number((report && report.avgChunkBytes) || 16384)))} "$ZFS_DATASET"`,
			'  zfs set compression=zstd "$ZFS_DATASET"',
			'else',
			'  echo "[DRY_RUN=1] Skipping zfs set dedup=on. Review DDT RAM estimate: ' + sanitizeCdcText(summary.ddtRamFormatted || '0 B', 40) + '"',
			'fi',
		)
	} else if (backendId === 'btrfs_reflink') {
		lines.push(
			'echo "[1/3] Scanning candidate paths with duperemove (read-only hash check)..."',
			'if [ "$DRY_RUN" = "0" ]; then',
			`  duperemove -rdh --blocksize=${Math.max(4096, Math.min(1048576, Number((report && report.avgChunkBytes) || 16384)))} "$NC_DATA_ROOT"`,
			'else',
			`  duperemove -rh --blocksize=${Math.max(4096, Math.min(1048576, Number((report && report.avgChunkBytes) || 16384)))} "$NC_DATA_ROOT"`,
			'fi',
		)
	} else {
		lines.push(
			`export RESTIC_REPOSITORY=${escapePosixShellArg(resticRepo)}`,
			'echo "[1/3] Running Restic FastCDC dry-run backup & pack sizing estimate..."',
			'if [ "$DRY_RUN" = "0" ]; then',
			'  restic backup --compression auto --verbose "$NC_DATA_ROOT"',
			'else',
			'  restic backup --dry-run --compression auto --verbose "$NC_DATA_ROOT"',
			'fi',
			'restic stats --mode raw-data || true',
		)
	}

	lines.push('', '# Sample top CDC candidate paths (max 25):')
	for (const item of items) {
		lines.push(
			`# - [${item.workloadClass}] ${item.primaryName} | FastCDC=${item.cdcNetSavedFormatted} (${item.cdcRatio}x) | Path=${escapePosixShellArg(item.primaryPath)}`,
		)
	}

	lines.push(
		'',
		'echo "[3/3] Refresh Nextcloud filecache if extents/files changed:"',
		'echo "sudo -u www-data php occ files:scan --all"',
		'',
	)
	return lines.join('\n')
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV ledger from a CDC savings report.
 *
 * @param {object} report - Output from buildCdcSavingsReport.
 * @return {string} CSV document.
 */
export function buildCdcAuditCsv(report) {
	const header = [
		'Cluster Key',
		'Primary Name',
		'Workload Class',
		'File Count',
		'Logical Bytes',
		'File-Level Saved Bytes',
		'Fixed-Block Saved Bytes',
		'FastCDC Net Saved Bytes',
		'FastCDC Gain Over File Bytes',
		'FastCDC Ratio',
		'FastCDC Unique Chunks',
		'Index Overhead Bytes',
		'ZFS DDT RAM Bytes',
		'Verdict',
		'Primary Path',
	].map(escapeCsvCell).join(',')

	const items = Array.isArray(report && report.items) ? report.items : []
	const rows = items.map(item => [
		item.clusterKey,
		item.primaryName,
		item.workloadClass,
		item.fileCount,
		item.logicalBytes,
		item.fileLevelSavedBytes,
		item.fixedSavedBytes,
		item.cdcNetSavedBytes,
		item.cdcGainOverFileBytes,
		item.cdcRatio,
		item.cdcUniqueChunks,
		item.indexOverheadBytes,
		item.ddtRamBytes,
		item.verdict,
		item.primaryPath,
	].map(escapeCsvCell).join(','))

	return [header, ...rows].join('\r\n')
}

/**
 * Build a JSON-serializable audit payload from a CDC savings report.
 *
 * @param {object} report - Output from buildCdcSavingsReport.
 * @return {object} Serializable JSON report.
 */
export function buildCdcAuditJson(report) {
	const items = Array.isArray(report && report.items) ? report.items : []
	return {
		schema: CDC_ESTIMATOR_SCHEMA,
		generatedAt: new Date().toISOString(),
		backendId: report ? report.backendId : 'restic_s3',
		avgChunkBytes: report ? report.avgChunkBytes : 1048576,
		fixedBlockBytes: report ? report.fixedBlockBytes : 65536,
		ddtRamBudgetGb: report ? report.ddtRamBudgetGb : 16,
		summary: report ? report.summary : {},
		workloadBreakdown: report ? report.workloadBreakdown : [],
		items: items.map(item => ({
			clusterKey: item.clusterKey,
			primaryName: item.primaryName,
			primaryPath: item.primaryPath,
			workloadClass: item.workloadClass,
			fileCount: item.fileCount,
			logicalBytes: item.logicalBytes,
			fileLevelSavedBytes: item.fileLevelSavedBytes,
			fixedSavedBytes: item.fixedSavedBytes,
			cdcNetSavedBytes: item.cdcNetSavedBytes,
			cdcGainOverFileBytes: item.cdcGainOverFileBytes,
			cdcRatio: item.cdcRatio,
			cdcUniqueChunks: item.cdcUniqueChunks,
			indexOverheadBytes: item.indexOverheadBytes,
			ddtEntries: item.ddtEntries,
			ddtRamBytes: item.ddtRamBytes,
			verdict: item.verdict,
			advisories: item.advisories,
		})),
	}
}

/**
 * Pure Speech, Bioacoustics & Multilingual ASR Alignment Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Speech & Bioacoustics Vault families:
 * - LDC/ELRA Holds, Consent & Lexicons (.lex, .dict, .phones, .arpa, .klm, .fst, .g2p, .stm, .uem, .glm, plus wav.scp/utt2spk/spk2utt/segments/XML/JSON/YAML/SQLite in speech/ASR/ethics-hold context)
 * - Verified Audio, Bioacoustics & Alignment Masters (.TextGrid, .rttm, .ctm, .trs, .eaf, .praat, .guano, .rwav, .wds.tar.zst, .wds.tar, .ark, .aud, plus .flac/.wav/.opus/.wv/.h5/.hdf5/.zarr in speech/bioacoustics context)
 * - Redundant Spectrograms, Transcripts & PCM Re-encodes (.png, .jpg, .svg, .pdf, .csv, .tsv, .txt, .srt, .vtt, .json, .jsonl, .xlsx, .pcm, .raw, .aiff, .mp3 in speech/bioacoustics export context)
 * - Kaldi, MFA, Whisper & Feature Scratch (kaldi_tmp/, mfa_scratch/, whisper_cache/, espnet_dump/, fairseq_tmp/, nemo_cache/, fbank_tmp/, mfcc_cache/, vad_staging/, diar_tmp/, align_scratch/, .ark.tmp, .flac.part, .TextGrid.bak, .lck)
 *
 * Enforces strict LDC/ELRA/IRB Ethics Hold, Pronunciation Lexicon/LM, and Audio/Bioacoustic/Alignment Master defaults:
 * - Strictly conserves LDC, ELRA, IRB consent, GDPR voice-hold, clinical speech, and blind-eval holds
 * - Strictly conserves pronunciation lexicons, ARPA/KenLM/OpenFST G2P models, and Kaldi lang/ corpus index tables
 * - Strictly conserves verified FLAC/WAV/Opus/WavPack/GUANO audio, WebDataset shards, and TextGrid/RTTM/CTM/ELAN alignments
 * - Detects redundant spectrogram renders, transcript/SRT/VTT exports, and lossy/uncompressed PCM re-encodes when a verified Speech/Bioacoustic anchor exists
 * - Blocks pruning of derived spectrograms/transcripts lacking a verified Speech or Bioacoustics master anchor when guard is active
 * - Blocks hardlinks on mutable lexicons, TextGrid/RTTM/ELAN alignments, CSV/JSON/SRT exports, and ASR feature scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SPEECH_ASR_BIOACOUSTICS_VAULT_SCHEMA = 'duplicatefinder.speech-asr-bioacoustics-vault-auditor.v1'

export const SPEECH_ASR_BIOACOUSTICS_FAMILIES = Object.freeze([
	'all',
	'speech-ethics-lexicon-holds',
	'speech-bioacoustic-alignment-masters',
	'redundant-spectrogram-transcript-exports',
	'asr-mfa-kaldi-feature-scratch',
])

export const SPEECH_ASR_BIOACOUSTICS_FAMILY_META = Object.freeze({
	'speech-ethics-lexicon-holds': {
		id: 'speech-ethics-lexicon-holds',
		label: 'LDC, Lexicons & Ethics Holds',
		shortLabel: 'Consent Holds, Pronunciation Lexicons, ARPA/FST LMs & Corpus Indexes (.lex, .arpa, .fst, wav.scp, utt2spk)',
	},
	'speech-bioacoustic-alignment-masters': {
		id: 'speech-bioacoustic-alignment-masters',
		label: 'Audio, Bioacoustic & Alignments',
		shortLabel: 'Verified Masters (.flac, .wav, .TextGrid, .rttm, .ctm, .eaf, .guano, .rwav, .wds.tar.zst, .ark)',
	},
	'redundant-spectrogram-transcript-exports': {
		id: 'redundant-spectrogram-transcript-exports',
		label: 'Spectrograms & Transcripts',
		shortLabel: 'Derived Mel/Pitch Plots, SRT/VTT/JSONL Transcripts & PCM/MP3 Re-encodes (.png, .srt, .vtt, .jsonl, .mp3)',
	},
	'asr-mfa-kaldi-feature-scratch': {
		id: 'asr-mfa-kaldi-feature-scratch',
		label: 'Kaldi, MFA & Feature Scratch',
		shortLabel: 'Alignment & Feature Scratch (kaldi_tmp/, mfa_scratch/, whisper_cache/, fbank_tmp/, .ark.tmp, .flac.part)',
	},
})

export const SPEECH_ASR_BIOACOUSTICS_STRATEGIES = Object.freeze([
	'prune-exports-and-feature-scratch',
	'hardlink-immutable-flac-and-webdataset',
	'quarantine-exports-and-feature-scratch',
])

export const SPEECH_ASR_BIOACOUSTICS_SURVIVOR_RULES = Object.freeze([
	'speech-lexicon-master-first',
	'oldest-recording-first',
	'newest-alignment-pass-first',
	'shortest-path',
])

export const SPEECH_ASR_BIOACOUSTICS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'speech-lexicon-index-protected',
	'audio-alignment-master-protected',
	'ethics-consent-hold-protected',
	'speech-export-redundant',
	'asr-feature-scratch',
	'shielded',
])

export const SPEECH_ASR_BIOACOUSTICS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const SPEECH_ASR_BIOACOUSTICS_PRESETS = Object.freeze([
	{
		id: 'all-speech-asr-bioacoustics-audit',
		name: 'All Speech & ASR Vaults',
		description: 'Audit LDC/ELRA/IRB holds, lexicons, FLAC/WAV/GUANO/TextGrid/RTTM masters, redundant spectrograms/transcripts, and Kaldi/MFA feature scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-feature-scratch',
		survivorRule: 'speech-lexicon-master-first',
		protectLexiconsAndHolds: true,
		protectAudioAndAlignmentMasters: true,
		protectEthicsAndConsentHolds: true,
		requireSpeechAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'kaldi-mfa-feature-scratch-cleanup',
		name: 'Kaldi, MFA & Feature Scratch',
		description: 'Reclaim kaldi_tmp/, mfa_scratch/, whisper_cache/, espnet_dump/, fbank_tmp/, and .ark.tmp/.flac.part scratch older than the active training window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-feature-scratch',
		survivorRule: 'speech-lexicon-master-first',
		protectLexiconsAndHolds: true,
		protectAudioAndAlignmentMasters: true,
		protectEthicsAndConsentHolds: true,
		requireSpeechAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-spectrograms-vs-masters',
		name: 'Spectrograms & Transcripts vs Masters',
		description: 'Detect derived mel/pitch plots, SRT/VTT/JSONL hypotheses, and MP3/PCM re-encodes backed by a verified FLAC, WAV, TextGrid, RTTM, or GUANO anchor.',
		familyFilter: 'redundant-spectrogram-transcript-exports',
		strategy: 'quarantine-exports-and-feature-scratch',
		survivorRule: 'speech-lexicon-master-first',
		protectLexiconsAndHolds: true,
		protectAudioAndAlignmentMasters: true,
		protectEthicsAndConsentHolds: true,
		requireSpeechAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'ldc-elra-lexicon-hold-shield',
		name: 'LDC, ELRA & Lexicon Holds Shield',
		description: 'Inspect IRB/GDPR voice consent holds, LDC/ELRA blind eval sets, pronunciation lexicons, and ARPA/OpenFST LMs under strict conservation shield.',
		familyFilter: 'speech-ethics-lexicon-holds',
		strategy: 'hardlink-immutable-flac-and-webdataset',
		survivorRule: 'speech-lexicon-master-first',
		protectLexiconsAndHolds: true,
		protectAudioAndAlignmentMasters: true,
		protectEthicsAndConsentHolds: true,
		requireSpeechAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-audio-bioacoustic-alignment-masters',
		name: 'Audio, Bioacoustic & Alignment Masters',
		description: 'Audit verified FLAC/WAV/Opus/GUANO acoustic captures, WebDataset shards, Kaldi archives, and Praat TextGrid/RTTM/CTM/ELAN alignment masters.',
		familyFilter: 'speech-bioacoustic-alignment-masters',
		strategy: 'hardlink-immutable-flac-and-webdataset',
		survivorRule: 'speech-lexicon-master-first',
		protectLexiconsAndHolds: true,
		protectAudioAndAlignmentMasters: true,
		protectEthicsAndConsentHolds: true,
		requireSpeechAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-speech-asr-bioacoustics-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-feature-scratch',
	survivorRule: 'speech-lexicon-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectLexiconsAndHolds: true,
	protectAudioAndAlignmentMasters: true,
	protectEthicsAndConsentHolds: true,
	requireSpeechAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_SPEECH_LEXICON_EXT_RE = /\.(?:lex|dict|phones|arpa|klm|fst|g2p|stm|uem|glm)$/i
const KALDI_INDEX_BASENAME_RE = /^(?:wav\.scp|utt2spk|spk2utt|segments|reco2file_and_channel|cmvn\.scp|feats\.scp|lexicon\.txt|phones\.txt|nonsilence_phones\.txt|silence_phones\.txt)$/i
const CONTEXT_SPEECH_LEXICON_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|txt|tsv)$/i
const STRICT_SPEECH_MASTER_EXT_RE = /\.(?:textgrid|rttm|ctm|trs|eaf|praat|guano|rwav|wds\.tar\.zst|wds\.tar|ark|aud)$/i
const CONTEXT_SPEECH_AUDIO_EXT_RE = /\.(?:flac|wav|opus|wv|h5|hdf5|zarr)$/i
const CONTEXT_SPEECH_EXPORT_EXT_RE = /\.(?:png|jpg|jpeg|webp|svg|pdf|csv|tsv|txt|srt|vtt|json|jsonl|xlsx|pcm|raw|aiff|mp3)$/i
const STRICT_SPEECH_SCRATCH_EXT_RE = /\.(?:ark\.tmp|scp\.tmp|flac\.part|wav\.tmp|textgrid\.bak|textgrid\.tmp|rttm\.tmp|eaf\.tmp|wds\.part|fbank\.tmp|mfcc\.tmp|h5\.lock|h5\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_SPEECH_EXCLUSION_RE = /(?:railway|etcs|ertms|cbtc|otmr|railml|eurobalise|interlocking|quantum|qubit|qasm|bluefors|geant4|cmssw|cern|synchrotron|orbital|ccsds|neuro|electrophys|bids|dicom|nifti|hydrograph|multibeam|seismic|segy|qiskit|laboneq|rosbag|gazebo|autoware|bms_can|hil_dyno|ev_powertrain|tbm_tunnel|geosensor|inclinometer|photoshop|lightroom|premiere|davinci|protools|logicpro|ableton|cubase|vst3|gdsii|oasis)/i
const SPEECH_CONTEXT_HINT_RE = /(?:speech|asr|bioacoustic|bioacoustics|phoneme|phonetic|textgrid|forced_?align|kaldi|espnet|whisper|montreal_?forced|diariz|diarization|rttm|ctm|elan|praat|guano|ultrasonic|echolocation|cetacean|avian|bat_?call|spectrogram|mel_?spec|formant|lexicon|g2p|arpa|kenlm|webdataset|ldc|elra|librispeech|commonvoice|voxceleb|fbank|mfcc|vad)/i
const SPEECH_ETHICS_HOLD_PATH_RE = /(?:ldc_?hold|elra_?hold|irb_?consent|irb_?hold|gdpr_?voice_?hold|speaker_?consent|ethics_?hold|clinical_?speech_?hold|forensic_?voice_?hold|corpus_?freeze|eval_?blind_?hold|pii_?voice_?hold)/i
const SPEECH_BASELINE_PATH_RE = /(?:00_lexicon|00_ldc|00_elra|00_lang|00_kaldi_lang|g2p_models|arpa_baselines|pronunciation_lexicons|annotation_guidelines|corpus_manifests)/i
const SPEECH_SCRATCH_PATH_RE = /(?:kaldi_tmp|mfa_scratch|whisper_cache|espnet_dump|fairseq_tmp|nemo_cache|fbank_tmp|mfcc_cache|vad_staging|diar_tmp|align_scratch|praat_cache|bioacoustic_tmp|asr_scratch)/i
const SPEECH_INTERMEDIATE_PREFIX_RE = /^(?:tmp_kaldi_|tmp_mfa_|tmp_whisper_|tmp_espnet_|tmp_fbank_|tmp_mfcc_|tmp_vad_|tmp_align_|cache_asr_|spill_ark_)/i
const SPEECH_INTERMEDIATE_SUFFIX_RE = /(?:_kaldi_tmp|_mfa_tmp|_whisper_tmp|_fbank_tmp|_diar_tmp|_staging)$/i
const SPEECH_EXPORT_PATH_RE = /(?:spectrogram_exports|pitch_plots|formant_plots|callogram_renders|transcript_exports|asr_hypotheses|diarization_json|pcm_reencodes|_spectrogram|_mel_plot|_pitch_track|_transcript|_asr_json|_diar_export|_callogram)/i
const CANONICAL_SPEECH_VAULT_PATH_RE = /(?:00_raw|00_audio|00_flac|00_alignments|00_bioacoustics|00_masters|canonical|corpus_archive|bioacoustic_archive|speech_archive)/i

/**
 * Normalize configuration values for Speech, Bioacoustics & ASR Alignment auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeSpeechAsrConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = SPEECH_ASR_BIOACOUSTICS_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.familyFilter
	const verdictFilter = SPEECH_ASR_BIOACOUSTICS_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.verdictFilter
	const strategy = SPEECH_ASR_BIOACOUSTICS_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.strategy
	const survivorRule = SPEECH_ASR_BIOACOUSTICS_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.survivorRule
	const sortMode = SPEECH_ASR_BIOACOUSTICS_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectLexiconsAndHolds: cfg.protectLexiconsAndHolds !== undefined ? Boolean(cfg.protectLexiconsAndHolds) : true,
		protectAudioAndAlignmentMasters: cfg.protectAudioAndAlignmentMasters !== undefined ? Boolean(cfg.protectAudioAndAlignmentMasters) : true,
		protectEthicsAndConsentHolds: cfg.protectEthicsAndConsentHolds !== undefined ? Boolean(cfg.protectEthicsAndConsentHolds) : true,
		requireSpeechAnchorForPrune: cfg.requireSpeechAnchorForPrune !== undefined ? Boolean(cfg.requireSpeechAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized utterance, session, or bioacoustic recording stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized speech/bioacoustic session stem.
 */
export function extractSpeechAsrStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:ark\.tmp|scp\.tmp|flac\.part|wav\.tmp|textgrid\.bak|textgrid\.tmp|rttm\.tmp|eaf\.tmp|wds\.part|wds\.tar\.zst|wds\.tar|fbank\.tmp|mfcc\.tmp|h5\.lock|h5\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(SPEECH_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(SPEECH_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:spectrogram|mel_plot|pitch_track|formant_plot|callogram|transcript|asr_json|diar_export|hypothesis|srt|vtt|reencode|mp3|pcm|plot|summary|export|csv|jsonl|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'speech-session'
}

/**
 * Extract canonical anchor key linking derived spectrograms/transcripts/re-encodes to verified Speech or Bioacoustic anchors.
 *
 * @param {string} sessionStem Extracted speech/bioacoustic session stem.
 * @return {string} Canonical anchor key.
 */
export function extractSpeechAsrAnchorKey(sessionStem) {
	return String(sessionStem || 'speech-session')
		.toLowerCase()
		.replace(/(?:[-_](?:flac|wav|opus|wv|textgrid|rttm|ctm|trs|eaf|praat|guano|rwav|wds|ark|aud|lex|dict|arpa|klm|fst|g2p|stm|uem|spectrogram|transcript|srt|vtt|plot|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'speech-session'
}

/**
 * Detect Speech, Bioacoustics & ASR toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ speechToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractSpeechToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let speechToolchain = ''
	if (/\.(?:textgrid|praat)\b|montreal_?forced|mfa_?scratch/.test(text)) {
		speechToolchain = 'Praat / Montreal Forced Aligner (MFA)'
	} else if (/\.(?:ark)\b|wav\.scp|utt2spk|spk2utt|kaldi|espnet/.test(text)) {
		speechToolchain = 'Kaldi / ESPnet ASR Pipeline'
	} else if (/\.wds\.tar|\.(?:stm|uem|glm)\b|whisper|fairseq|nemo/.test(text)) {
		speechToolchain = 'WebDataset / Whisper / NeMo Corpus'
	} else if (/\.(?:rttm|ctm|trs|eaf)\b|diariz|elan/.test(text)) {
		speechToolchain = 'ELAN / RTTM / CTM Diarization & Transcripts'
	} else if (/\.(?:guano|rwav)\b|bioacoustic|ultrasonic|echolocation|cetacean|bat_?call|callogram/.test(text)) {
		speechToolchain = 'GUANO / Raven Bioacoustics'
	} else if (/\.(?:lex|dict|phones|arpa|klm|fst|g2p)\b|lexicon|g2p/.test(text)) {
		speechToolchain = 'SRILM / KenLM / OpenFST G2P & Lexicon'
	} else if (/ldc|elra|irb_?consent|gdpr_?voice|speaker_?consent/.test(text)) {
		speechToolchain = 'LDC / ELRA / IRB Speech Compliance'
	} else if (/\.(?:flac|wav|opus|wv)\b/.test(text)) {
		speechToolchain = 'Lossless Speech & Acoustic Master'
	}

	let workflowStage = ''
	if (SPEECH_ETHICS_HOLD_PATH_RE.test(text)) {
		workflowStage = 'LDC / ELRA / IRB Ethics Hold'
	} else if (STRICT_SPEECH_LEXICON_EXT_RE.test(basename) || KALDI_INDEX_BASENAME_RE.test(basename) || SPEECH_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'Pronunciation Lexicon, LM & Corpus Index'
	} else if (SPEECH_SCRATCH_PATH_RE.test(text) || STRICT_SPEECH_SCRATCH_EXT_RE.test(basename) || SPEECH_INTERMEDIATE_PREFIX_RE.test(basename) || SPEECH_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Kaldi / MFA / Whisper Feature Scratch'
	} else if (SPEECH_EXPORT_PATH_RE.test(text) || (CONTEXT_SPEECH_EXPORT_EXT_RE.test(basename) && SPEECH_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Spectrogram, Transcript or Re-encode'
	} else if (STRICT_SPEECH_MASTER_EXT_RE.test(basename) || (CONTEXT_SPEECH_AUDIO_EXT_RE.test(basename) && (SPEECH_CONTEXT_HINT_RE.test(text) || CANONICAL_SPEECH_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified Audio, Bioacoustic or Alignment Master'
	}

	return { speechToolchain, workflowStage }
}

/**
 * Extract concise Speech & Bioacoustics domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractSpeechDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (SPEECH_ETHICS_HOLD_PATH_RE.test(text)) {
		return 'LDC / IRB HOLD'
	}
	if (/\.(?:lex|dict|phones|arpa|klm|fst|g2p)\b/.test(lowerBase) || KALDI_INDEX_BASENAME_RE.test(lowerBase)) {
		return 'LEXICON / LM'
	}
	if (/\.(?:textgrid|praat|eaf|trs)\b/.test(lowerBase)) {
		return 'FORCED ALIGNMENT'
	}
	if (/\.(?:rttm|ctm|stm|uem|glm)\b/.test(lowerBase)) {
		return 'DIARIZATION / CTM'
	}
	if (/\.(?:guano|rwav)\b/.test(lowerBase)) {
		return 'BIOACOUSTICS / GUANO'
	}
	if (/\.wds\.tar(?:\.zst)?$|\.ark$/i.test(lowerBase)) {
		return 'WDS / KALDI ARCHIVE'
	}
	if (/\.(?:flac|wav|opus|wv|h5|hdf5|zarr)\b/.test(lowerBase) && (SPEECH_CONTEXT_HINT_RE.test(text) || CANONICAL_SPEECH_VAULT_PATH_RE.test(text))) {
		return 'LOSSLESS AUDIO MASTER'
	}
	if (STRICT_SPEECH_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'ASR / FEATURE SCRATCH'
	}
	return ''
}

/**
 * Parse file mtime into epoch milliseconds and age in days.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} referenceNowMs Reference current time in ms.
 * @return {{ mtimeMs: number|null, ageDays: number|null, formattedMtime: string }} Parsed timestamps.
 */
function parseFileTime(file, referenceNowMs) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	let mtimeMs = null
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		mtimeMs = raw < 1e12 ? raw * 1000 : raw
	} else if (typeof raw === 'string') {
		const num = Number(raw)
		if (Number.isFinite(num) && raw.trim() !== '') {
			mtimeMs = num < 1e12 ? num * 1000 : num
		} else {
			const parsed = Date.parse(raw)
			if (Number.isFinite(parsed)) {
				mtimeMs = parsed
			}
		}
	}
	if (mtimeMs === null || !Number.isFinite(mtimeMs)) {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	const ageDays = Math.max(0, Math.floor((referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)))
	const formattedMtime = formatFileModifiedTime(Math.floor(mtimeMs / 1000)) || ''
	return { mtimeMs, ageDays, formattedMtime }
}

/**
 * Classify a single file within the Speech, Bioacoustics & Multilingual ASR Alignment domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifySpeechAsrFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_SPEECH_EXCLUSION_RE.test(lower)
	const hasSpeechContext = !hasExcludedContext && SPEECH_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && SPEECH_BASELINE_PATH_RE.test(lower)
	const isEthicsHoldPath = !hasExcludedContext && SPEECH_ETHICS_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_SPEECH_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && SPEECH_SCRATCH_PATH_RE.test(lower)
	const isSpeechExportPath = !hasExcludedContext && SPEECH_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_SPEECH_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (SPEECH_INTERMEDIATE_PREFIX_RE.test(lowerBase) || SPEECH_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isLexiconOrCorpusHold = !hasExcludedContext && (
		STRICT_SPEECH_LEXICON_EXT_RE.test(lowerBase)
		|| (KALDI_INDEX_BASENAME_RE.test(lowerBase) && (hasSpeechContext || isBaselinePath || isEthicsHoldPath || isCanonicalVaultPath || isScratchPath))
		|| (CONTEXT_SPEECH_LEXICON_EXT_RE.test(lowerBase) && !isSpeechExportPath && (isBaselinePath || isEthicsHoldPath))
	)

	const isContextAudioMaster = CONTEXT_SPEECH_AUDIO_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasSpeechContext || isCanonicalVaultPath)
	const isStrictSpeechMaster = !hasExcludedContext && (
		STRICT_SPEECH_MASTER_EXT_RE.test(lowerBase)
		|| isContextAudioMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictSpeechMaster
		&& !isLexiconOrCorpusHold
		&& CONTEXT_SPEECH_EXPORT_EXT_RE.test(lowerBase)
		&& (hasSpeechContext || isSpeechExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Speech & Bioacoustics Vault'
	let isProtectedLexiconHold = false
	let isProtectedAudioAlignmentMaster = false
	let isProtectedEthicsHold = false
	let isSpeechMasterAnchor = false
	let isRedundantSpeechExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictSpeechMaster || isLexiconOrCorpusHold))
		|| (isIntermediateSubfile && (isStrictSpeechMaster || isContextExport || hasSpeechContext))
		|| (isGenericScratchExt && hasSpeechContext && !isBaselinePath && !isEthicsHoldPath)
	) {
		family = 'asr-mfa-kaldi-feature-scratch'
		artifactKind = isStrictScratchExt
			? 'Kaldi / TextGrid / FLAC / Feature Scratch'
			: (isIntermediateSubfile ? 'MFA / Whisper / ESPnet Intermediate Cache' : 'ASR Alignment & Feature Scratch')
		vaultRole = 'Kaldi, MFA, Whisper or Bioacoustic Feature Scratch'
		isMutableFile = true
	} else if (isEthicsHoldPath && (isLexiconOrCorpusHold || isStrictSpeechMaster || isContextExport || hasSpeechContext)) {
		family = 'speech-ethics-lexicon-holds'
		artifactKind = 'LDC / ELRA / IRB Consent Hold'
		vaultRole = 'Protected Ethics, Consent or Blind-Eval Speech Hold'
		isProtectedEthicsHold = true
		isProtectedLexiconHold = true
		isSpeechMasterAnchor = isStrictSpeechMaster || isLexiconOrCorpusHold
		isMutableFile = true
	} else if (isLexiconOrCorpusHold) {
		family = 'speech-ethics-lexicon-holds'
		if (/\.(?:lex|dict|phones|g2p)$/i.test(lowerBase)) {
			artifactKind = 'Pronunciation Lexicon / G2P Baseline'
			vaultRole = 'Canonical Grapheme-to-Phoneme & Lexicon Table'
		} else if (/\.(?:arpa|klm|fst)$/i.test(lowerBase)) {
			artifactKind = 'ARPA / KenLM / OpenFST Language Model'
			vaultRole = 'Canonical Decoding Graph & N-Gram Language Model'
		} else if (/\.(?:stm|uem|glm)$/i.test(lowerBase)) {
			artifactKind = 'NIST STM / UEM / GLM Evaluation Reference'
			vaultRole = 'Canonical Speech Scoring & Reference Segment Map'
		} else {
			artifactKind = 'Kaldi Corpus Index / Consent Manifest'
			vaultRole = 'Canonical wav.scp / utt2spk / Corpus Metadata Table'
		}
		isProtectedLexiconHold = true
		isSpeechMasterAnchor = true
		isMutableFile = true
	} else if (isStrictSpeechMaster) {
		family = 'speech-bioacoustic-alignment-masters'
		if (/\.(?:textgrid|praat|eaf|trs)$/i.test(lowerBase)) {
			artifactKind = 'Forced Alignment / ELAN Annotation Master'
			vaultRole = 'Mutable Phoneme, Word & Tier Time-Alignment Master'
			isMutableFile = true
		} else if (/\.(?:rttm|ctm|aud)$/i.test(lowerBase)) {
			artifactKind = 'RTTM / CTM Diarization & Time-Aligned Master'
			vaultRole = 'Mutable Speaker Turn & Word Timestamp Master'
			isMutableFile = true
		} else if (/\.ark$/i.test(lowerBase)) {
			artifactKind = 'Kaldi Archive Master (.ark)'
			vaultRole = 'Kaldi Feature or Lattice Archive Master'
			isMutableFile = true
		} else if (/\.(?:guano|rwav)$/i.test(lowerBase)) {
			artifactKind = 'Bioacoustic GUANO / Ultrasonic Master'
			vaultRole = 'Immutable Field Bioacoustic Metadata & Waveform Master'
			isMutableFile = false
		} else if (/\.wds\.tar(?:\.zst)?$/i.test(lowerBase)) {
			artifactKind = 'WebDataset ASR Shard Archive'
			vaultRole = 'Immutable Sharded Speech Corpus Training Master'
			isMutableFile = false
		} else {
			artifactKind = 'Lossless Speech / Acoustic Master'
			vaultRole = 'Immutable FLAC, WAV, Opus, WavPack or HDF5 Master'
			isMutableFile = false
		}
		isProtectedAudioAlignmentMaster = true
		isSpeechMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-spectrogram-transcript-exports'
		if (/\.(?:png|jpg|jpeg|webp|svg|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Spectrogram / Pitch / Callogram Render'
		} else if (/\.(?:pcm|raw|aiff|mp3)$/i.test(lowerBase)) {
			artifactKind = 'Redundant PCM / MP3 Audio Re-encode'
		} else {
			artifactKind = 'Derived Transcript / SRT / VTT / JSONL Export'
		}
		vaultRole = 'Derived Spectrogram Render, Transcript or Audio Re-encode'
		isRedundantSpeechExport = true
		isMutableFile = true
	}

	const { speechToolchain, workflowStage } = extractSpeechToolchainAndStage(normalized, basename)
	const sessionStem = extractSpeechAsrStem(basename, normalized)
	const speechAnchorKey = extractSpeechAsrAnchorKey(sessionStem)
	const speechTag = extractSpeechDomainTag(lowerBase, lower)

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
		speechToolchain,
		workflowStage,
		sessionStem,
		speechAnchorKey,
		speechTag,
		isProtectedLexiconHold,
		isProtectedAudioAlignmentMaster,
		isProtectedEthicsHold,
		isSpeechMasterAnchor,
		isRedundantSpeechExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'asr-mfa-kaldi-feature-scratch') || (isGenericScratchExt && hasSpeechContext && family === 'asr-mfa-kaldi-feature-scratch'),
		isBaselinePath,
		isEthicsHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Speech, Bioacoustics & ASR Alignment domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isSpeechAsrGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifySpeechAsrFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Lexicon/FLAC/WAV/GUANO/TextGrid/RTTM anchors
 * to derived spectrogram renders, transcripts, and PCM/MP3 re-encodes.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildSpeechAsrCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifySpeechAsrFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isSpeechMasterAnchor) {
				anchorStems.add(meta.sessionStem)
				anchorKeys.add(meta.speechAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Speech & Bioacoustics cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'speech-ethics-lexicon-holds')) {
		return 'speech-ethics-lexicon-holds'
	}
	if (members.some(m => m.family === 'speech-bioacoustic-alignment-masters')) {
		return 'speech-bioacoustic-alignment-masters'
	}
	if (members.some(m => m.family === 'redundant-spectrogram-transcript-exports')) {
		return 'redundant-spectrogram-transcript-exports'
	}
	return 'asr-mfa-kaldi-feature-scratch'
}

/**
 * Compute deterministic survivor priority score for a Speech & Bioacoustics vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-recording-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedEthicsHold ? 100000 : 0)
			+ (member.isProtectedLexiconHold ? 97000 : 0)
			+ (member.isProtectedAudioAlignmentMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantSpeechExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-alignment-pass-first') {
		return (member.isProtectedEthicsHold ? 100000 : 0)
			+ (member.isProtectedLexiconHold ? 97000 : 0)
			+ (member.isProtectedAudioAlignmentMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantSpeechExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedEthicsHold ? 52000 : 0)
			+ (member.isProtectedLexiconHold ? 50000 : 0)
			+ (member.isProtectedAudioAlignmentMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedEthicsHold ? 100000 : 0)
		+ (member.isProtectedLexiconHold ? 97000 : 0)
		+ (member.isProtectedAudioAlignmentMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantSpeechExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Speech, Bioacoustics & ASR Alignment duplicate cluster.
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
		const meta = classifySpeechAsrFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.speechToolchain)?.speechToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].sessionStem || extractSpeechAsrStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].speechAnchorKey || extractSpeechAsrAnchorKey(primaryStem)

	const hasSpeechMasterAnchor = Boolean(
		rawMembers.some(m => m.isSpeechMasterAnchor)
		|| correlationIndex.anchorStems.has(primaryStem)
		|| correlationIndex.anchorKeys.has(primaryAnchorKey)
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

		const isRedundantSpeechExportMember = member.isRedundantSpeechExport && hasSpeechMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantSpeechExport) {
			redundancyReason = isRedundantSpeechExportMember
				? 'Derived spectrogram, transcript, or PCM/MP3 re-encode duplicates verified FLAC, WAV, TextGrid, RTTM, or GUANO master'
				: 'Derived spectrogram or transcript export without verified Speech or Bioacoustics anchor'
		}

		let governanceTier = 'asr-feature-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedEthicsHold
				? 'ethics-consent-hold-protected'
				: (member.isProtectedLexiconHold
					? 'speech-lexicon-index-protected'
					: (member.isProtectedAudioAlignmentMaster
						? 'audio-alignment-master-protected'
						: (member.isRedundantSpeechExport
							? 'speech-export-redundant'
							: 'asr-feature-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedEthicsHold && config.protectEthicsAndConsentHolds) {
			governanceTier = 'ethics-consent-hold-protected'
			shielded = true
			protectedReason = 'LDC, ELRA, IRB consent, GDPR voice, or blind-eval hold strictly conserved'
		} else if (member.isProtectedLexiconHold && config.protectLexiconsAndHolds) {
			governanceTier = 'speech-lexicon-index-protected'
			shielded = true
			protectedReason = 'Pronunciation lexicon, ARPA/KenLM/OpenFST LM, NIST STM, or Kaldi index strictly conserved'
		} else if (member.isProtectedAudioAlignmentMaster && config.protectAudioAndAlignmentMasters) {
			governanceTier = 'audio-alignment-master-protected'
			shielded = true
			protectedReason = 'Verified FLAC/WAV/GUANO audio, WebDataset shard, or TextGrid/RTTM/ELAN master strictly conserved'
		} else if (isSurvivor && !isRedundantSpeechExportMember) {
			governanceTier = member.isProtectedEthicsHold
				? 'ethics-consent-hold-protected'
				: (member.isProtectedLexiconHold
					? 'speech-lexicon-index-protected'
					: (member.isProtectedAudioAlignmentMaster
						? 'audio-alignment-master-protected'
						: (member.isRedundantSpeechExport
							? 'speech-export-redundant'
							: 'asr-feature-scratch')))
			shielded = true
			protectedReason = 'Canonical Speech & Bioacoustics vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantSpeechExport
				? 'speech-export-redundant'
				: (member.isProtectedLexiconHold
					? 'speech-lexicon-index-protected'
					: 'asr-feature-scratch')
			action = config.strategy === 'hardlink-immutable-flac-and-webdataset' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentRunDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentRunDays
		) {
			governanceTier = 'asr-feature-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active ASR training or alignment grace window`
		} else if (member.isRedundantSpeechExport) {
			governanceTier = 'speech-export-redundant'
			if (config.requireSpeechAnchorForPrune && !hasSpeechMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified FLAC, WAV, TextGrid, RTTM, or GUANO anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'asr-feature-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Kaldi, MFA, Whisper, ESPnet, or acoustic feature scratch eligible for cleanup'
		} else if (member.isProtectedAudioAlignmentMaster || member.isProtectedLexiconHold) {
			governanceTier = member.isProtectedLexiconHold ? 'speech-lexicon-index-protected' : 'audio-alignment-master-protected'
			action = config.strategy === 'hardlink-immutable-flac-and-webdataset' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-flac-and-webdataset' && !member.isMutableFile) {
			governanceTier = 'audio-alignment-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'asr-feature-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantSpeechExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantSpeechExport = members.some(m => m.isRedundantSpeechExportMember || m.isRedundantSpeechExport)
	const hasProtectedEthicsHold = members.some(m => m.governanceTier === 'ethics-consent-hold-protected' && m.shielded)
	const hasProtectedLexiconHold = members.some(m => m.governanceTier === 'speech-lexicon-index-protected' && m.shielded)
	const hasProtectedAudioAlignmentMaster = members.some(m => m.governanceTier === 'audio-alignment-master-protected' && m.shielded)
	const hasAsrFeatureScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantSpeechExportMember && !m.shielded)) {
			clusterVerdict = 'speech-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'asr-feature-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedEthicsHold) {
		clusterVerdict = 'ethics-consent-hold-protected'
	} else if (hasProtectedLexiconHold) {
		clusterVerdict = 'speech-lexicon-index-protected'
	} else if (hasProtectedAudioAlignmentMaster) {
		clusterVerdict = 'audio-alignment-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantSpeechExport ? 95 : 85
	} else if (hasProtectedEthicsHold) {
		priorityScore = 60
	} else if (hasProtectedLexiconHold) {
		priorityScore = 50
	}

	const speechTags = [...new Set(members.map(m => m.speechTag).filter(Boolean))]
	const familyMeta = SPEECH_ASR_BIOACOUSTICS_FAMILY_META[family] || SPEECH_ASR_BIOACOUSTICS_FAMILY_META['asr-mfa-kaldi-feature-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		speechToolchain: primaryToolchain,
		workflowStage: primaryStage,
		sessionStem: primaryStem,
		speechAnchorKey: primaryAnchorKey,
		family,
		familyLabel: familyMeta.label,
		clusterVerdict,
		priorityScore,
		copyCount: members.length,
		unitBytes,
		totalBytes,
		reclaimableBytes,
		hardlinkSavingsBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		formattedTotalBytes: formatBytes(totalBytes),
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		survivorKey,
		survivorPath: survivor.normalized,
		hasProtectedLexiconHold,
		hasProtectedAudioAlignmentMaster,
		hasProtectedEthicsHold,
		hasRedundantSpeechExport,
		hasAsrFeatureScratch,
		hasSpeechMasterAnchor,
		speechTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Speech, Bioacoustics & Multilingual ASR Alignment Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Speech & Bioacoustics vault audit report.
 */
export function auditSpeechAsrVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeSpeechAsrConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isSpeechAsrGroup)
	const correlationIndex = buildSpeechAsrCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'speech-ethics-lexicon-holds': 0,
		'speech-bioacoustic-alignment-masters': 0,
		'redundant-spectrogram-transcript-exports': 0,
		'asr-mfa-kaldi-feature-scratch': 0,
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
		if (config.verdictFilter === 'reclaimable' && cluster.reclaimableBytes <= 0) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.reclaimableBytes > 0) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query) {
			const haystacks = [
				cluster.name,
				cluster.speechToolchain,
				cluster.workflowStage,
				cluster.sessionStem,
				cluster.speechAnchorKey,
				cluster.familyLabel,
				...cluster.speechTags,
				...cluster.members.map(m => `${m.normalized} ${m.artifactKind} ${m.vaultRole}`),
			]
			if (!haystacks.some(val => String(val || '').toLowerCase().includes(query))) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.priorityScore - a.priorityScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.priorityScore - a.priorityScore) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalLexiconIndexClusters = 0
	let totalAudioAlignmentClusters = 0
	let totalEthicsHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalFeatureScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedLexiconHold) {
			totalLexiconIndexClusters += 1
		}
		if (cluster.hasProtectedAudioAlignmentMaster) {
			totalAudioAlignmentClusters += 1
		}
		if (cluster.hasProtectedEthicsHold) {
			totalEthicsHoldClusters += 1
		}
		if (cluster.hasRedundantSpeechExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasAsrFeatureScratch) {
			totalFeatureScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = SPEECH_ASR_BIOACOUSTICS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: SPEECH_ASR_BIOACOUSTICS_FAMILY_META[id].label,
			shortLabel: SPEECH_ASR_BIOACOUSTICS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: SPEECH_ASR_BIOACOUSTICS_VAULT_SCHEMA,
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
			totalLexiconIndexClusters,
			totalAudioAlignmentClusters,
			totalEthicsHoldClusters,
			totalRedundantExportClusters,
			totalFeatureScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Speech & Bioacoustics Vaults.
 * Strictly blocks deletion or hardlinking of shielded LDC/ELRA holds, lexicons,
 * and verified FLAC/WAV/GUANO/TextGrid/RTTM masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditSpeechAsrVault.
 * @return {string} POSIX bash script.
 */
export function buildSpeechAsrRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Speech, Bioacoustics & Multilingual ASR Alignment Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./speech-asr-bioacoustics-vault-reclaim.sh only after verifying FLAC, WAV, TextGrid, RTTM, and GUANO anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.speech-asr-feature-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-feature-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-exports-and-feature-scratch' && (target.isRedundantSpeechExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable exports or ASR scratch under active Speech, Lexicon & LDC/IRB shields.\\n"')
	} else {
		lines.push(`printf "Completed Speech & Bioacoustics Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditSpeechAsrVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildSpeechAsrCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'speech_toolchain',
		'workflow_stage',
		'session_stem',
		'speech_anchor_key',
		'family',
		'cluster_verdict',
		'has_speech_master_anchor',
		'is_redundant_speech_export',
		'is_asr_feature_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'speech_tag',
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
				cluster.speechToolchain || '',
				cluster.workflowStage || '',
				cluster.sessionStem,
				cluster.speechAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasSpeechMasterAnchor ? 'true' : 'false',
				member.isRedundantSpeechExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.speechTag || '',
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
 * @param {object} auditResult Result from auditSpeechAsrVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildSpeechAsrJsonManifest(auditResult) {
	const payload = {
		schema: SPEECH_ASR_BIOACOUSTICS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || SPEECH_ASR_BIOACOUSTICS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			speechToolchain: cluster.speechToolchain,
			workflowStage: cluster.workflowStage,
			sessionStem: cluster.sessionStem,
			speechAnchorKey: cluster.speechAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedLexiconHold: cluster.hasProtectedLexiconHold,
			hasProtectedAudioAlignmentMaster: cluster.hasProtectedAudioAlignmentMaster,
			hasProtectedEthicsHold: cluster.hasProtectedEthicsHold,
			hasRedundantSpeechExport: cluster.hasRedundantSpeechExport,
			hasAsrFeatureScratch: cluster.hasAsrFeatureScratch,
			hasSpeechMasterAnchor: cluster.hasSpeechMasterAnchor,
			speechTags: cluster.speechTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				speechTag: member.speechTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantSpeechExportMember: member.isRedundantSpeechExportMember,
				isScratchPath: member.isScratchPath,
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
 * cloud sync of Kaldi, MFA, Whisper, ESPnet, and acoustic feature extraction scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildSpeechAsrSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Speech, Bioacoustics & ASR Alignment Vaults',
		'kaldi_tmp/',
		'mfa_scratch/',
		'whisper_cache/',
		'espnet_dump/',
		'fairseq_tmp/',
		'nemo_cache/',
		'fbank_tmp/',
		'mfcc_cache/',
		'vad_staging/',
		'diar_tmp/',
		'align_scratch/',
		'praat_cache/',
		'bioacoustic_tmp/',
		'asr_scratch/',
		'tmp_kaldi_*',
		'tmp_mfa_*',
		'tmp_whisper_*',
		'tmp_espnet_*',
		'tmp_fbank_*',
		'tmp_mfcc_*',
		'tmp_vad_*',
		'tmp_align_*',
		'cache_asr_*',
		'spill_ark_*',
		'*.ark.tmp',
		'*.scp.tmp',
		'*.flac.part',
		'*.wav.tmp',
		'*.TextGrid.bak',
		'*.TextGrid.tmp',
		'*.rttm.tmp',
		'*.eaf.tmp',
		'*.wds.part',
		'*.fbank.tmp',
		'*.mfcc.tmp',
		'*.h5.lock',
		'*.h5.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}

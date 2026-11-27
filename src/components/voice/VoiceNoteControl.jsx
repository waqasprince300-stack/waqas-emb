import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '../../services/api';
import { useApp } from '../../context/AppContext';

let activePlayerControl = null;

function formatVoiceDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function pickAudioRecorderMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore unsupported probe */
    }
  }
  return '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio'));
    reader.readAsDataURL(blob);
  });
}

function readAudioFileDuration(dataUrl) {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    let timeoutId = null;
    const done = (val) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      audio.src = '';
      resolve(Number.isFinite(val) && val > 0 ? Math.round(val) : 0);
    };
    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity) {
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          done(audio.duration);
        };
        try {
          audio.currentTime = 1e101;
        } catch {
          done(0);
        }
      } else {
        done(audio.duration);
      }
    };
    audio.onerror = () => done(0);
    timeoutId = setTimeout(() => done(0), 2500);
    audio.src = dataUrl;
  });
}

// Tiny silent WAV frame so iOS Safari unlocks HTMLAudioElement synchronously inside the tap handler before async fetch.
const SILENT_WAV_DATA_URL = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
const MAX_AUDIO_DATA_URL_CHARS = 11.5 * 1024 * 1024;
const AUDIO_EXT_MIME_MAP = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
  '3gp': 'audio/3gpp',
  amr: 'audio/amr',
};

function normalizeUploadedAudioDataUrl(dataUrl, fallbackMime = 'audio/mpeg') {
  const s = String(dataUrl || '').trim();
  if (!s.startsWith('data:')) return s;
  if (/^data:audio\//i.test(s)) return s;
  if (/^data:video\/webm/i.test(s)) return s.replace(/^data:video\/webm/i, 'data:audio/webm');
  if (/^data:video\/mp4/i.test(s)) return s.replace(/^data:video\/mp4/i, 'data:audio/mp4');
  if (/^data:application\/ogg/i.test(s)) return s.replace(/^data:application\/ogg/i, 'data:audio/ogg');
  if (/^data:application\/octet-stream/i.test(s)) {
    return s.replace(/^data:application\/octet-stream/i, `data:${fallbackMime}`);
  }
  if (/^data:(?:;)?base64,/i.test(s)) {
    return s.replace(/^data:(?:;)?base64,/i, `data:${fallbackMime};base64,`);
  }
  return s;
}

/**
 * Compact playable voice-note pill with single-active playback and lazy fetch when audio isn't hydrated yet.
 */
export function VoiceNotePlayerPill({
  lotId,
  src = '',
  hasVoiceNote = false,
  duration = 0,
  label = 'Voice',
  roleTone = 'party', // 'party' | 'admin'
  businessOwnerId,
  isParty = false,
  locked = false,
  compact = false,
}) {
  const { patchLotVoiceNotes } = useApp();
  const [localSrc, setLocalSrc] = useState(src || '');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(Number(duration) || 0);
  const [errorMsg, setErrorMsg] = useState('');
  const audioRef = useRef(null);
  const mountedRef = useRef(true);
  const localSrcRef = useRef(src || '');
  const identityRef = useRef(`${lotId || ''}:${roleTone}`);
  const playTokenRef = useRef(0);

  const stopAudio = useCallback(() => {
    playTokenRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setPlaying(false);
    if (activePlayerControl?.audio === audio) {
      activePlayerControl = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (activePlayerControl?.audio === audio) {
        activePlayerControl = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextIdentity = `${lotId || ''}:${roleTone}`;
    const sameIdentity = identityRef.current === nextIdentity;
    identityRef.current = nextIdentity;
    const nextSrc = src || '';
    // Do not pause/reset playback when our own lazy-fetch populates the `src` prop for the audio already loaded.
    const isSelfHydratedEcho =
      sameIdentity &&
      hasVoiceNote &&
      Boolean(nextSrc) &&
      nextSrc === localSrcRef.current;

    if (!isSelfHydratedEcho) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      if (activePlayerControl?.audio === audio) {
        activePlayerControl = null;
      }
      setPlaying(false);
      setCurrentTime(0);
      setErrorMsg('');
      localSrcRef.current = nextSrc;
      setLocalSrc(nextSrc);
    }
    setResolvedDuration((prev) =>
      Number(duration) > 0 ? Math.round(Number(duration)) : (isSelfHydratedEcho ? prev : 0)
    );
  }, [src, hasVoiceNote, lotId, roleTone, duration]);

  if (!hasVoiceNote && !localSrc) return null;

  const ensureSrcAndPlay = async () => {
    setErrorMsg('');
    if (playing) {
      stopAudio();
      return;
    }

    const myToken = ++playTokenRef.current;
    if (activePlayerControl && activePlayerControl.audio !== audioRef.current) {
      activePlayerControl.stop?.();
    }

    // Create/unlock HTMLAudioElement synchronously inside tap gesture for iOS Safari first-tap playback.
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;
    }

    let playSrc = localSrc;
    if (!playSrc && lotId) {
      try {
        audio.src = SILENT_WAV_DATA_URL;
        const unlockP = audio.play();
        if (unlockP && typeof unlockP.then === 'function') {
          unlockP.then(() => {
            if (!audio.dataset.srcKey) audio.pause();
          }).catch(() => {});
        }
      } catch {
        /* ignore unlock pre-warm */
      }

      setLoading(true);
      try {
        const row = await apiService.getPartyEditByLotId(lotId, {
          includeVoiceNotes: true,
          businessOwnerId: businessOwnerId || undefined,
          skipTenantHeader: isParty,
        });
        if (!mountedRef.current || playTokenRef.current !== myToken) return;
        const field = roleTone === 'admin' ? 'adminVoiceNote' : 'partyVoiceNote';
        const durField =
          roleTone === 'admin' ? 'adminVoiceNoteDuration' : 'partyVoiceNoteDuration';
        const hasField =
          roleTone === 'admin' ? 'hasAdminVoiceNote' : 'hasPartyVoiceNote';
        playSrc = String(row?.[field] || '').trim();
        const serverDur = Number(row?.[durField] || 0);
        if (playSrc) {
          localSrcRef.current = playSrc;
          setLocalSrc(playSrc);
          if (serverDur > 0) setResolvedDuration(Math.round(serverDur));
        }
        if (row) {
          patchLotVoiceNotes?.(lotId, {
            ...(row.partyVoiceNote !== undefined
              ? {
                  partyVoiceNote: row.partyVoiceNote,
                  partyVoiceNoteDuration: row.partyVoiceNoteDuration,
                }
              : {}),
            ...(row.adminVoiceNote !== undefined
              ? {
                  adminVoiceNote: row.adminVoiceNote,
                  adminVoiceNoteDuration: row.adminVoiceNoteDuration,
                }
              : {}),
          });
        }
        if (!playSrc) {
          patchLotVoiceNotes?.(lotId, {
            [field]: '',
            [durField]: 0,
            [hasField]: false,
          });
          localSrcRef.current = '';
          setLocalSrc('');
          setErrorMsg('Voice note not found');
          return;
        }
      } catch (err) {
        if (mountedRef.current && playTokenRef.current === myToken) {
          setErrorMsg(err?.message || 'Could not load voice note');
        }
        return;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    if (!playSrc || !mountedRef.current || playTokenRef.current !== myToken) return;
    if (activePlayerControl && activePlayerControl.audio !== audio) {
      activePlayerControl.stop?.();
    }

    const srcKey = `${playSrc.length}:${playSrc.slice(0, 64)}:${playSrc.slice(-64)}`;
    if (audio.dataset.srcKey !== srcKey) {
      audio.pause();
      audio.dataset.srcKey = srcKey;
      audio.ontimeupdate = () => {
        if (!mountedRef.current) return;
        setCurrentTime(audio.currentTime || 0);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setResolvedDuration((prev) => (prev > 0 ? prev : Math.round(audio.duration)));
        }
      };
      audio.onloadedmetadata = () => {
        if (!mountedRef.current) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setResolvedDuration((prev) => (prev > 0 ? prev : Math.round(audio.duration)));
        }
      };
      audio.onended = () => {
        if (!mountedRef.current) return;
        setPlaying(false);
        setCurrentTime(0);
        if (activePlayerControl?.audio === audio) activePlayerControl = null;
      };
      audio.onerror = () => {
        if (!mountedRef.current) return;
        setPlaying(false);
        setErrorMsg('Cannot play audio');
        if (activePlayerControl?.audio === audio) activePlayerControl = null;
      };
      audio.src = playSrc;
    }

    try {
      activePlayerControl = { audio, stop: stopAudio };
      await audio.play();
      if (!mountedRef.current) {
        audio.pause();
        return;
      }
      setPlaying(true);
    } catch {
      if (mountedRef.current) {
        setErrorMsg('Playback blocked or unsupported format');
      }
      stopAudio();
    }
  };

  const totalSec = resolvedDuration || (Number.isFinite(audioRef.current?.duration) ? Math.round(audioRef.current.duration) : 0);
  const progressPct = totalSec > 0 ? Math.min(100, (currentTime / totalSec) * 100) : 0;

  const isAdminTone = roleTone === 'admin';
  const accent = isAdminTone ? 'var(--primary, #1e40af)' : 'var(--success, #15803d)';
  const btnText = isAdminTone ? 'var(--primary-text, #ffffff)' : 'var(--on-success-text, #ffffff)';
  const bg = isAdminTone ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--success-bg, rgba(22, 163, 74, 0.08))';
  const border = isAdminTone ? 'var(--border, rgba(37, 99, 235, 0.25))' : 'rgba(22, 163, 74, 0.25)';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, maxWidth: '100%', minWidth: 0 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 8,
          padding: compact ? '3px 8px' : '5px 10px',
          borderRadius: 999,
          background: bg,
          border: `1px solid ${border}`,
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void ensureSrcAndPlay();
          }}
          disabled={loading}
          title={playing ? 'Pause voice note' : 'Play voice note'}
          style={{
            width: compact ? 22 : 26,
            height: compact ? 22 : 26,
            minWidth: compact ? 22 : 26,
            borderRadius: '50%',
            border: 'none',
            background: accent,
            color: btnText,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: compact ? 10 : 11,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          {loading ? '…' : playing ? '❚❚' : '▶'}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: compact ? 10.5 : 11, fontWeight: 700, color: accent, lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.88, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {playing ? `${formatVoiceDuration(currentTime)} / ` : ''}
              {formatVoiceDuration(totalSec)}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 999, background: 'rgba(148, 163, 184, 0.25)', overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: accent, transition: 'width 0.15s linear' }} />
          </div>
        </div>
        {locked && (
          <span title="Locked after approval" style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>
            🔒
          </span>
        )}
      </div>
      {errorMsg && (
        <span style={{ fontSize: 10.5, color: 'var(--danger, #dc2626)' }}>{errorMsg}</span>
      )}
    </div>
  );
}

/**
 * Shared recording / file-upload state hook used by inline composer and standalone field.
 */
function useVoiceRecorderControl(onChange) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recError, setRecError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);
  const startingRef = useRef(false);
  const elapsedRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const startRecording = async () => {
    if (startingRef.current || recording || processing) return;
    activePlayerControl?.stop?.();
    setRecError('');
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setRecError('Mic recording requires HTTPS (or localhost). Click the clip (📎) icon to upload an audio file.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setRecError('Voice recording is not supported in this browser. Click the clip (📎) icon to upload an audio file.');
      return;
    }
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;
      elapsedRef.current = 0;
      setElapsedSec(0);

      const mimeType = pickAudioRecorderMimeType();
      const isMp4 = mimeType.includes('mp4');
      const options = mimeType
        ? isMp4
          ? { mimeType }
          : { mimeType, audioBitsPerSecond: 24000 }
        : { audioBitsPerSecond: 24000 };
      let recorder;
      try {
        recorder = new window.MediaRecorder(stream, options);
      } catch {
        recorder = mimeType
          ? new window.MediaRecorder(stream, { mimeType })
          : new window.MediaRecorder(stream);
      }
      recorderRef.current = recorder;

      stream.getTracks().forEach((t) => {
        t.onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            try {
              recorderRef.current.stop();
            } catch {
              /* ignore */
            }
          }
        };
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onerror = () => {
        cleanupMedia();
        if (!mountedRef.current) return;
        setRecording(false);
        setProcessing(false);
        setRecError('Microphone recording interrupted. Try again or upload audio (📎).');
      };

      recorder.onstop = async () => {
        const finalSec = Math.max(1, elapsedRef.current);
        const wasCancelled = cancelledRef.current;
        const chunks = [...chunksRef.current];
        const rawMime = String(chunks[0]?.type || recorder.mimeType || mimeType || 'audio/webm').trim();
        const recMime = /^video\/mp4/i.test(rawMime)
          ? rawMime.replace(/^video\/mp4/i, 'audio/mp4')
          : /^video\/webm/i.test(rawMime)
            ? rawMime.replace(/^video\/webm/i, 'audio/webm')
            : !rawMime || /^application\/octet-stream/i.test(rawMime)
              ? 'audio/webm'
              : rawMime;
        cleanupMedia();
        if (!mountedRef.current) return;
        setRecording(false);
        if (wasCancelled) {
          setProcessing(false);
          return;
        }
        if (chunks.length === 0) {
          setProcessing(false);
          setRecError('Recording was empty — please record a little longer and try again.');
          return;
        }

        setProcessing(true);
        try {
          const blob = new Blob(chunks, { type: recMime });
          if (blob.size === 0) {
            setRecError('Recording was empty — please record a little longer and try again.');
            return;
          }
          const dataUrl = normalizeUploadedAudioDataUrl(await blobToDataUrl(blob), recMime);
          if (!mountedRef.current) return;
          if (dataUrl.length > MAX_AUDIO_DATA_URL_CHARS) {
            setRecError('Recording is too large for one database record.');
            return;
          }
          onChange?.(dataUrl, finalSec);
        } catch {
          if (mountedRef.current) setRecError('Could not process recording.');
        } finally {
          if (mountedRef.current) setProcessing(false);
        }
      };

      if (isMp4) {
        recorder.start();
      } else {
        try {
          recorder.start(500);
        } catch {
          recorder.start();
        }
      }
      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        elapsedRef.current = secs;
        setElapsedSec(secs);
      }, 300);
    } catch (err) {
      cleanupMedia();
      if (!mountedRef.current) return;
      setRecording(false);
      setProcessing(false);
      const code = String(err?.name || '');
      if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
        setRecError('No microphone detected on this PC. Connect a mic or use the clip (📎) icon to upload audio.');
      } else if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
        setRecError('Microphone permission denied. Allow mic in browser settings, or upload audio (📎).');
      } else if (code === 'NotReadableError' || code === 'TrackStartError') {
        setRecError('Microphone is busy or blocked by Windows Privacy Settings. Check mic settings or upload audio (📎).');
      } else if (code === 'SecurityError') {
        setRecError('Microphone requires HTTPS (or localhost). Upload audio (📎) instead.');
      } else {
        setRecError(
          `Could not start microphone (${code || err?.message || 'unknown error'}). Use clip (📎) to upload audio.`
        );
      }
    } finally {
      startingRef.current = false;
    }
  };

  const stopAndAttach = () => {
    cancelledRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      setProcessing(true);
      try {
        if (typeof recorderRef.current.requestData === 'function' && recorderRef.current.state === 'recording') {
          recorderRef.current.requestData();
        }
      } catch {
        /* ignore requestData unsupported */
      }
      recorderRef.current.stop();
    } else {
      cleanupMedia();
      setRecording(false);
      setProcessing(false);
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupMedia();
      setRecording(false);
      setProcessing(false);
    }
  };

  const handleAudioUpload = async (file) => {
    if (!file) return;
    setRecError('');
    if (file.size === 0) {
      setRecError('Selected audio file is empty.');
      return;
    }
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const extMime = AUDIO_EXT_MIME_MAP[ext] || '';
    const ftype = String(file.type || '').toLowerCase();
    const isAudioType =
      ftype.startsWith('audio/') ||
      ((ftype === '' ||
        ftype === 'application/ogg' ||
        ftype === 'video/mp4' ||
        ftype === 'video/webm' ||
        ftype === 'application/octet-stream') &&
        Boolean(extMime));
    if (!isAudioType) {
      setRecError('Please select a valid audio file.');
      return;
    }
    setProcessing(true);
    try {
      const rawUrl = await blobToDataUrl(file);
      const dataUrl = normalizeUploadedAudioDataUrl(rawUrl, extMime || 'audio/mpeg');
      if (!mountedRef.current) return;
      if (dataUrl.length > MAX_AUDIO_DATA_URL_CHARS) {
        setRecError('Audio file is too large (max ~8.5 MB file size).');
        return;
      }
      const dur = await readAudioFileDuration(dataUrl);
      if (!mountedRef.current) return;
      onChange?.(dataUrl, dur);
    } catch {
      if (mountedRef.current) setRecError('Could not read audio file.');
    } finally {
      if (mountedRef.current) setProcessing(false);
    }
  };

  return {
    recording,
    processing,
    elapsedSec,
    recError,
    startRecording,
    stopAndAttach,
    cancelRecording,
    handleAudioUpload,
  };
}

function MicSvg({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function ClipSvg({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function TrashOrCloseSvg({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Unified minimalist Written Note + Voice Note composer inside a single clean textarea box.
 */
export function NoteWithVoiceField({
  label = 'Notes',
  placeholder = 'Write optional note...',
  textValue = '',
  onTextChange,
  voiceValue = '',
  hasVoiceNote = false,
  duration = 0,
  onVoiceChange,
  lotId,
  businessOwnerId,
  isParty = false,
  locked = false,
  readOnly = false,
  roleTone = 'party',
  rows = 2,
  pillLabel,
  onBusyChange,
}) {
  const fileInputRef = useRef(null);
  const {
    recording,
    processing,
    elapsedSec,
    recError,
    startRecording,
    stopAndAttach,
    cancelRecording,
    handleAudioUpload,
  } = useVoiceRecorderControl(onVoiceChange);

  useEffect(() => {
    onBusyChange?.(Boolean(recording || processing));
  }, [recording, processing, onBusyChange]);

  const hasAttached = Boolean(voiceValue) || Boolean(hasVoiceNote);
  const canModify = !locked && !readOnly;
  const effectivePillLabel = pillLabel || (roleTone === 'admin' ? 'Admin Voice' : 'Party Voice');

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <label className="form-label" style={{ margin: 0 }}>
          {label}
        </label>
        {locked && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--warning, #92400e)',
              background: 'var(--warning-bg, #fef3c7)',
              padding: '1.5px 8px',
              borderRadius: 999,
              border: '1px solid rgba(245, 158, 11, 0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            🔒 Approved · Locked
          </span>
        )}
      </div>

      <div className={`nv-composer${locked ? ' nv-composer--locked' : ''}`}>
        <textarea
          className="nv-textarea"
          rows={rows}
          disabled={locked || readOnly}
          value={textValue}
          onChange={(e) => onTextChange?.(e.target.value)}
          placeholder={placeholder}
        />

        {(recording || processing || hasAttached || canModify) && (
          <div
            className={`nv-toolbar${
              recording || processing
                ? ' nv-toolbar--recording'
                : hasAttached
                  ? ' nv-toolbar--attached'
                  : ''
            }`}
          >
            {recording ? (
              <>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--danger, #dc2626)',
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
                  Recording {formatVoiceDuration(elapsedSec)}
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <button
                    type="button"
                    className="nv-stop-btn"
                    onClick={stopAndAttach}
                  >
                    Stop &amp; Save
                  </button>
                  <button
                    type="button"
                    className="nv-icon-btn nv-icon-btn--danger"
                    title="Cancel recording"
                    aria-label="Cancel recording"
                    onClick={cancelRecording}
                  >
                    <TrashOrCloseSvg size={13} />
                  </button>
                </div>
              </>
            ) : processing ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Processing audio…
              </span>
            ) : hasAttached ? (
              <>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <VoiceNotePlayerPill
                    compact
                    lotId={lotId}
                    src={voiceValue}
                    hasVoiceNote={hasAttached}
                    duration={duration}
                    label={effectivePillLabel}
                    roleTone={roleTone}
                    businessOwnerId={businessOwnerId}
                    isParty={isParty}
                    locked={locked}
                  />
                </div>
                {canModify && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="nv-icon-btn"
                      title="Re-record voice note"
                      aria-label="Re-record voice note"
                      onClick={() => void startRecording()}
                    >
                      <MicSvg size={14} />
                    </button>
                    <button
                      type="button"
                      className="nv-icon-btn"
                      title="Replace with audio file"
                      aria-label="Replace with audio file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ClipSvg size={13} />
                    </button>
                    <button
                      type="button"
                      className="nv-icon-btn nv-icon-btn--danger"
                      title="Remove voice note"
                      aria-label="Remove voice note"
                      onClick={() => onVoiceChange?.('', 0)}
                    >
                      <TrashOrCloseSvg size={13} />
                    </button>
                  </div>
                )}
              </>
            ) : canModify ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="nv-icon-btn"
                  title="Record Voice Note"
                  aria-label="Record Voice Note"
                  onClick={() => void startRecording()}
                >
                  <MicSvg size={15} />
                </button>
                <button
                  type="button"
                  className="nv-icon-btn"
                  title="Upload Audio"
                  aria-label="Upload Audio"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ClipSvg size={14} />
                </button>
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm,.amr,.3gp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleAudioUpload(f);
              }}
            />
          </div>
        )}
      </div>

      {recError && (
        <div style={{ fontSize: 11.5, color: 'var(--danger, #dc2626)', marginTop: 5 }}>
          {recError}
        </div>
      )}
    </div>
  );
}

/**
 * Compact unified preview box combining written note + playable voice pill (used in read-only panels and mobile cards).
 */
export function NoteReadOnlyBox({
  title = '',
  text = '',
  lotId,
  voiceSrc = '',
  hasVoiceNote = false,
  duration = 0,
  voiceLabel = 'Voice',
  roleTone = 'party',
  businessOwnerId,
  isParty = false,
  locked = false,
  compact = false,
}) {
  const hasAudio = Boolean(voiceSrc || hasVoiceNote);
  if (!text && !hasAudio) return null;

  return (
    <div
      className={`nv-preview-box nv-preview-box--${roleTone === 'admin' ? 'admin' : 'party'}`}
      style={compact ? { padding: '6px 8px' } : undefined}
    >
      {(title || text) && (
        <div
          style={{
            color: roleTone === 'admin' ? 'var(--primary, #1e40af)' : 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {title ? <strong style={{ marginRight: 4 }}>{title}:</strong> : null}
          {text}
        </div>
      )}
      {hasAudio && (
        <div>
          <VoiceNotePlayerPill
            compact
            lotId={lotId}
            src={voiceSrc}
            hasVoiceNote={hasAudio}
            duration={duration}
            label={voiceLabel}
            roleTone={roleTone}
            businessOwnerId={businessOwnerId}
            isParty={isParty}
            locked={locked}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Standalone voice-note recorder / attached player field (retained for backwards compatibility).
 */
export function VoiceNoteField({
  label = 'Voice Note',
  value = '',
  hasVoiceNote = false,
  duration = 0,
  onChange,
  onDelete,
  lotId,
  businessOwnerId,
  isParty = false,
  locked = false,
  lockedHint = 'Approved — cannot be edited by party without admin permission.',
  readOnly = false,
  roleTone = 'party',
  helperText = '',
  onBusyChange,
}) {
  const fileInputRef = useRef(null);
  const {
    recording,
    processing,
    elapsedSec,
    recError,
    startRecording,
    stopAndAttach,
    cancelRecording,
    handleAudioUpload,
  } = useVoiceRecorderControl(onChange);

  useEffect(() => {
    onBusyChange?.(Boolean(recording || processing));
  }, [recording, processing, onBusyChange]);

  const hasAttached = Boolean(value) || Boolean(hasVoiceNote);
  const canModify = !locked && !readOnly;

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--border, #e2e8f0)',
        background: 'var(--primary-bg, #f8fafc)',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
          🎙️ {label}
        </span>
        {locked && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--warning, #92400e)',
              background: 'var(--warning-bg, #fef3c7)',
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid rgba(245, 158, 11, 0.35)',
            }}
          >
            🔒 Approved · Locked
          </span>
        )}
      </div>

      {recording ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'rgba(220, 38, 38, 0.1)',
              color: 'var(--danger, #dc2626)',
              fontSize: 12.5,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            Recording {formatVoiceDuration(elapsedSec)}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={stopAndAttach}
          >
            Stop &amp; Attach
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={cancelRecording}
          >
            Cancel
          </button>
        </div>
      ) : processing ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Processing audio…
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {hasAttached ? (
            <>
              <VoiceNotePlayerPill
                lotId={lotId}
                src={value}
                hasVoiceNote={hasAttached}
                duration={duration}
                label={roleTone === 'admin' ? 'Admin Voice' : 'Party Voice'}
                roleTone={roleTone}
                businessOwnerId={businessOwnerId}
                isParty={isParty}
                locked={locked}
              />
              {canModify && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void startRecording()}
                    style={{ fontSize: 12 }}
                  >
                    🎙️ Re-record
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      onChange?.('', 0);
                      onDelete?.();
                    }}
                    style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}
                  >
                    Delete
                  </button>
                </>
              )}
            </>
          ) : canModify ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void startRecording()}
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card-bg)',
                  fontWeight: 600,
                }}
              >
                🎙️ Record Voice Note
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm,.amr,.3gp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleAudioUpload(f);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              >
                📎 Upload Audio
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No voice note attached
            </span>
          )}
        </div>
      )}

      {locked && lockedHint && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
          {lockedHint}
        </div>
      )}
      {!locked && helperText && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
          {helperText}
        </div>
      )}
      {recError && (
        <div style={{ fontSize: 12, color: 'var(--danger, #dc2626)', marginTop: 6 }}>
          {recError}
        </div>
      )}
    </div>
  );
}

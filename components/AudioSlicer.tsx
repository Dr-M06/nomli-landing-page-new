"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"

type AudioSlicerProps = {
  startSec: number
  durationSec: number
  totalDurationSec: number | null
  previewUrl?: string | null
  minDurationSec?: number
  onChangeStartSec: (value: number) => void
  onChangeDurationSec: (value: number) => void
  disabled?: boolean
}

export function AudioSlicer({
  startSec,
  durationSec,
  totalDurationSec,
  previewUrl = null,
  minDurationSec = 30,
  onChangeStartSec,
  onChangeDurationSec,
  disabled = false,
}: AudioSlicerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const safeTotal = totalDurationSec ?? 0
  const maxStart = safeTotal > 0 ? Math.max(0, safeTotal - 1) : 0
  const maxDuration = safeTotal > 0 ? Math.max(minDurationSec, safeTotal - Math.max(0, startSec)) : 120
  const safeStart = Math.min(Math.max(0, startSec), Math.max(0, maxStart))
  const safeLen = Math.min(Math.max(minDurationSec, durationSec), Math.max(minDurationSec, maxDuration))
  const clipEnd = safeStart + safeLen
  const canPreview = Boolean(previewUrl && totalDurationSec !== null && !disabled)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePreviewClip = async () => {
    if (!canPreview || !previewUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl)
    } else {
      audioRef.current.src = previewUrl
    }
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }

    const stopAt = clipEnd
    audio.currentTime = safeStart
    setPlaying(true)
    await audio.play().catch(() => {
      setPlaying(false)
    })

    const onTimeUpdate = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause()
        setPlaying(false)
        audio.removeEventListener("timeupdate", onTimeUpdate)
      }
    }
    const onEnded = () => {
      setPlaying(false)
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
    }
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
  }

  return (
    <div className="rounded-md border border-white/10 bg-[#141014] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white/80">Audio Slicer</p>
        {totalDurationSec !== null ? (
          <p className="text-[11px] text-white/60">Track: {totalDurationSec}s</p>
        ) : (
          <p className="text-[11px] text-white/45">Select file to enable</p>
        )}
      </div>

      <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/60">Selected portion</p>
          <p className="text-xs font-semibold text-[#E07A8F]">
            {safeStart}s - {clipEnd}s ({safeLen}s)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handlePreviewClip()}
          disabled={!canPreview}
          className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 disabled:opacity-45"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : "Preview"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
            <span>Start</span>
            <span>{safeStart}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, maxStart)}
            step={1}
            value={safeStart}
            onChange={(e) => onChangeStartSec(Math.max(0, Number(e.target.value) || 0))}
            disabled={disabled || totalDurationSec === null}
            className="w-full accent-[#D6526A] disabled:opacity-50"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/70">
            <span>Length</span>
            <span>{safeLen}s</span>
          </div>
          <input
            type="range"
            min={minDurationSec}
            max={Math.max(minDurationSec, maxDuration)}
            step={1}
            value={safeLen}
            onChange={(e) => onChangeDurationSec(Math.max(minDurationSec, Number(e.target.value) || minDurationSec))}
            disabled={disabled || totalDurationSec === null}
            className="w-full accent-[#D6526A] disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  )
}


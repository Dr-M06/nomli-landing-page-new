"use client"

import { StoreRedirectOverlay, useDelayedStoreRedirect } from "@/components/store-redirect"

type Props = {
  playStoreUrl: string
  appStoreUrl: string
}

export function LandingDownloadButtons({ playStoreUrl, appStoreUrl }: Props) {
  const { redirecting, openAfterDelay } = useDelayedStoreRedirect()
  const busy = redirecting !== null

  return (
    <>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => openAfterDelay(playStoreUrl, "play")}
          className="inline-flex h-12 min-w-[140px] items-center justify-center rounded-lg bg-neutral-950 px-8 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-70"
        >
          Google Play
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => openAfterDelay(appStoreUrl, "ios")}
          className="inline-flex h-12 min-w-[140px] items-center justify-center rounded-lg border border-fuchsia-400/35 bg-white px-8 text-sm font-medium text-neutral-900 transition-colors hover:border-fuchsia-400/50 hover:bg-fuchsia-50/40 disabled:opacity-70"
        >
          App Store
        </button>
      </div>
      <StoreRedirectOverlay redirecting={redirecting} />
    </>
  )
}

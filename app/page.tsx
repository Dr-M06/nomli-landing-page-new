import { Header } from "@/components/Header"
import { HeroSection } from "@/components/hero-section"
import { NomliMusicSection } from "@/components/nomli-music-section"
import { CreatorMonetizationSection } from "@/components/creator-monetization-section"
import { SocialShowcaseSection } from "@/components/social-showcase-section"
import { FeaturesSection } from "@/components/features-section"
import { FaqSection } from "@/components/faq-section"
import { DownloadCta } from "@/components/download-cta"
import { Footer } from "@/components/footer"
import { LoadingScreen } from "@/components/loading-screen"
import WebWalletPopup from "@/components/web-wallet-popup"

export default function Home() {
  return (
    <main id="main-content" className="relative overflow-x-clip">
      <LoadingScreen />
      <WebWalletPopup />
      <Header />
      <HeroSection />
      <NomliMusicSection />
      <CreatorMonetizationSection />
      <SocialShowcaseSection videoUrl="/promo%20video.mp4" />
      <FeaturesSection />
      <FaqSection />
      <DownloadCta />
      <Footer />
    </main>
  )
}

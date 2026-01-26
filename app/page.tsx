import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { FeaturesSection } from "@/components/features-section"
import { AppPreviewSection } from "@/components/app-preview-section"
import { LivestreamSection } from "@/components/livestream-section"
import { SafetySection } from "@/components/safety-section"
import { WalletSection } from "@/components/wallet-section"
import { BrandStatement } from "@/components/brand-statement"
import { ChallengeSection } from "@/components/challenge-section"
import { DownloadCta } from "@/components/download-cta"
import { Footer } from "@/components/footer"
import { LoadingScreen } from "@/components/loading-screen"

export default function Home() {
  return (
    <main id="main-content" className="relative">
      <LoadingScreen />
      <Header />
      <HeroSection />
      <FeaturesSection />
      <AppPreviewSection />
      <LivestreamSection />
      <SafetySection />
      <WalletSection />
      <BrandStatement />
      <ChallengeSection />
      <DownloadCta />
      <Footer />
    </main>
  )
}

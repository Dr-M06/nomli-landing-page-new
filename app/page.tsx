import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { FeaturesSection } from "@/components/features-section"
import { FaqSection } from "@/components/faq-section"
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
      <FaqSection />
      <DownloadCta />
      <Footer />
    </main>
  )
}

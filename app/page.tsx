import { Header } from "@/components/Header"
import { LandingSimple } from "@/components/landing-simple"
import { FooterSimple } from "@/components/footer-simple"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f6f3]">
      <Header variant="social" />
      <LandingSimple />
      <FooterSimple />
    </div>
  )
}

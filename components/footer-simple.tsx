import Link from "next/link"
import Image from "next/image"

const columns = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Download", href: "/#download" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Nomli Tech", href: "https://www.nomli.cc/", external: true },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  {
    title: "Support",
    links: [{ label: "Email", href: "mailto:support@nomlimingle.com" }],
  },
] as const

export function FooterSimple() {
  return (
    <footer className="border-t border-neutral-200/80 bg-[#f7f6f3]">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="relative h-8 w-8 flex-shrink-0">
                <Image src="/icon.png" alt="" fill className="object-contain" sizes="32px" unoptimized />
              </div>
              <span className="font-semibold tracking-tight text-neutral-950">Nomli Mingle</span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-neutral-600">
              Social feed and chat in one calm app—clarity over noise.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((item) => (
                  <li key={item.label}>
                    {"external" in item && item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-neutral-600 transition-colors hover:text-neutral-950"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className="text-sm text-neutral-600 transition-colors hover:text-neutral-950">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-neutral-200/80 pt-8 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} Nomli Mingle
          </p>
          <a
            href="https://www.nomli.cc/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-800 hover:underline"
          >
            Nomli Tech Limited — parent company
          </a>
        </div>
      </div>
    </footer>
  )
}

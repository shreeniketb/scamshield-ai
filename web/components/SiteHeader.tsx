import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/family", label: "Family" },
  { href: "/community", label: "Community" },
  { href: "/demo", label: "Demo" },
  { href: "/styleguide", label: "Styleguide" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="font-display text-xl text-brand">
          scamshield.ai
        </Link>
        <nav className="flex flex-wrap gap-1" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-12 items-center rounded-pill px-3 text-sm text-ink hover:bg-brand-soft"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 space-y-12">
      <section>
        <p className="text-sm font-medium tracking-wide text-brand">scamshield.tech</p>
        <h1 className="mt-2 font-display text-4xl text-ink md:text-5xl">
          Scammers isolate. ScamShield brings family back in.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Every scam says “don’t tell anyone.” ScamShield makes sure you do.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/family"
            className="inline-flex min-h-12 items-center rounded-pill bg-brand px-5 text-white"
          >
            Open family app
          </Link>
          <Link
            href="/community"
            className="inline-flex min-h-12 items-center rounded-pill bg-brand-soft px-5 text-brand"
          >
            See Community Watch
          </Link>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl">FBI IC3 2025</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          <li className="rounded-card bg-surface p-5 shadow-card">
            <p className="font-display text-4xl tabular-nums">$7.75B</p>
            <p className="text-muted">lost by Americans 60+</p>
          </li>
          <li className="rounded-card bg-surface p-5 shadow-card">
            <p className="font-display text-4xl tabular-nums">+59%</p>
            <p className="text-muted">vs 2024</p>
          </li>
          <li className="rounded-card bg-surface p-5 shadow-card">
            <p className="font-display text-2xl">Loneliness exploited</p>
            <p className="text-muted">scams isolate on purpose</p>
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted">Source: FBI IC3 2025 Elder Fraud Report.</p>
      </section>

      <section>
        <h2 className="font-display text-2xl">How it works</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-4">
          <li className="rounded-card bg-surface p-5 shadow-card">1. Listens</li>
          <li className="rounded-card bg-surface p-5 shadow-card">2. Verifies with family</li>
          <li className="rounded-card bg-surface p-5 shadow-card">3. Holds the money</li>
          <li className="rounded-card bg-surface p-5 shadow-card">4. Warns the community</li>
        </ol>
      </section>

      <section>
        <h2 className="font-display text-2xl">Team</h2>
        <p className="text-muted">Shreeniket Bhat · Kale Maxwell · Subhajit · Raj</p>
      </section>
    </div>
  );
}

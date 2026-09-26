# ScamShield — Build Plan (execute ONE phase per request)

**Rules for the agent:**
- Read docs/DESIGN_SPEC.md, contract/CONTRACT.md and .cursor/rules before every phase.
- Execute ONLY the phase you are asked for. When it's done, stop and report:
  (1) what you built, in plain English,
  (2) exactly how to test it (URLs, clicks, screen widths),
  (3) anything you couldn't do.
- Don't start the next phase until asked.
- Don't run git commands unless asked. Work on Shree-Branch (web-only) or Shreekale (web + desktop integration).

---

## Phase 1 — Foundation: data layer, shells, navigation (≈1 h)

Rebuild the foundation — replace the current placeholder pages; they were not good enough.

1. **Install now everything all later phases need**, so no later phase installs packages: recharts, maplibre-gl, lucide-react, d3-geo, d3-scale, topojson-client, us-atlas, motion (plus @types where needed). Explain each in one line.
2. **Data layer** exactly as in spec §8:
   - web/lib/types.ts
   - web/lib/api.ts (mock/real switch via NEXT_PUBLIC_USE_MOCKS)
   - web/lib/mock/ with the FULL rich seed dataset listed in §8
   - the BroadcastChannel("scamshield") mock event bus
   - Set NEXT_PUBLIC_USE_MOCKS=true in web/.env.local.
3. **Call reports.** Read contract/samples/call_report.sample.json. This is the "call report" format our desktop app produces when a call ends.
   - Add a CallReport TypeScript type matching it exactly in web/lib/types.ts.
   - Build the Incident model from CallReport, with this mapping:

     | CallReport field | Used for |
     |---|---|
     | timeline | RiskOverTimeChart (risk + voice_synthetic; labels as annotations) |
     | transcript + evidence | highlighted transcript excerpts (speaker labels) |
     | signals + signal_labels | "What ScamShield noticed", grouped Voice / Words / Caller / Money |
     | audio_forensics.detectors | a "How we knew" panel (skipped detectors shown with their reason) |
     | protection | the story timeline |
     | family_summary | the incident summary |
     | community | the link to the matching campaign |

   - In the mock seed, create all 8 incidents from spec §8 as CallReports. Text-message incidents use the same shape with channel "whatsapp_message", no audio_forensics, and transcript holding the message text.
   - The voice-clone incident must use the sample file exactly.
4. **Contract.** Add to contract/CONTRACT.md: "POST /api/events/call_report — sent by the desktop app when a call or message analysis is complete. Body = contract/samples/call_report.sample.json shape. The live POST /api/events/call_analysis chunks remain for real-time triggers (verify, safe word, warnings) during the call."
5. **Shells:**
   - **AppShell for /family:**
     - TopBar + BottomTabBar (Home, Activity, Circle, Community; icons + labels; active state; iPhone safe-area padding).
     - Max content width 480 px, centred on desktop with the paper background around it.
   - **DashboardShell for /community:**
     - A slim top nav (logo, "Community Watch", links to Family app and Demo).
     - A 12-column grid, max width 1440.
6. **Routes.** Create every route in spec §3 with its real section headings (no lorem ipsum), wired to the data layer, even if sections are simple for now.
7. **VerifyTakeover.** Add it globally in the /family layout (spec §5.6), fully built and polished. It listens to the mock bus and to polling.

**Acceptance:**
- All tabs navigate at 375 px.
- /family shows real seeded content.
- Triggering a voice-clone call from /demo in another tab (a temporary button is fine) makes the takeover appear in the /family tab.

---

## Phase 2 — Family Home + Activity + Incident detail (≈2 h)

Build /family Home (§5.1), /family/activity (§5.2) and /family/activity/[incidentId] (§5.3) to the full spec and the quality bar (§9).

- **Status hero** switches between its 3 states based on data:
  - critical if an unresolved threat exists
  - attention if a payment is held
  - otherwise safe
- **PaymentCosignCard:**
  - factor bars
  - Call Nani first / Decline / Approve, with optimistic updates and a toast
  - a collapsed "Declined by Priya · $500 protected" state
- **Incident detail:**
  - the story timeline (from protection)
  - RiskOverTimeChart with two series, a threshold line and annotations (§6.5)
  - "What ScamShield noticed"
  - "How we knew" (detectors)
  - transcript excerpts with scam phrases highlighted

  The voice-clone incident is the showcase and must feel premium.

Test at 375 px and 430 px. Tell me which incident to open to see the showcase.

---

## Phase 3 — Circle: contacts, safe word, rules, health (≈1.5 h)

Build /family/circle (§5.4) and flows F3 and F4 (§4).

- **SetupChecklist** with a progress ring; each item opens the right bottom sheet.
- **MemberRow + MemberSheet** (add/edit):
  - priority reordering with Move up/down (accessible, not drag-only)
  - tel: and sms: buttons
- **SafeWordCard:**
  - explainer → set → "Set ••••" with last-used info
  - a Change flow with confirmation
  - never display the word
  - a "Share how it works" sheet with a copy-link button
- **RulesCard:** plain-language toggles + a 15 / 30 / 60 s segmented control.
- **CircleHealthChart:** 8-week bars, a goal line at 1 call/week, and the nudge message.

Everything persists in the mock store, and calls the real API when mocks are off.

---

## Phase 4 — Community Watch dashboard (≈2.5 h)

Build /community (§5.7) with the viz specs in §6.1, §6.3 and §6.4. This must look like a best-in-class data product (Stripe / Linear / FT data desk quality), not a template.

1. **KpiStrip** with the hero tile, deltas and sparklines.
2. **Live campaigns list** with sorting and linked highlighting with the Atlanta map: hover a card → its ZIPs highlight; hover a ZIP → its campaigns highlight.
3. **AtlantaMap:** MapLibre + OpenFreeMap liberty, client-only, graduated circles, legend, tooltips with neighbourhood names.
4. **WarningNetwork (§6.3):**
   - deterministic radial SVG layout
   - campaign selector
   - animated edges (reduced-motion safe)
   - legend with counts, and the insight line
5. **ScamTypeBars:** sorted, direct-labelled.
6. **UsChoropleth (§6.4):**
   - us-atlas + d3-geo, rendered as SVG
   - quantile legend
   - Losses / Complaints toggle
   - hover + pin
   - StateTable side panel
   - a "Placeholder figures" tag
7. **Time-range control** (24h / 7d / 30d) filters the data.
8. **Footer** with sources and the privacy statement.

Check at 1280, 1536 and 375 px. Tell me what to look at first.

---

## Phase 5 — Campaign page + Mutation Map (≈2 h)

Build /community/campaign/[id] (§5.8) with the Mutation Map exactly per §6.2. This is the hero visual for the judges.

- **Scatter:** 2D, coloured by variant; convex hulls with centroid labels; hover grow; tooltip.
- **Time playback:**
  - Play/Pause + scrubber
  - dots appear in first_seen order over ~8 s, with a date counter
  - with reduced motion, show the final state with a usable scrubber
- **Dot click:** a side panel with the full redacted message and a TextDiff against its variant's first message.
- **VariantCards** with TextDiff highlighting.
- **Reports-over-time area chart** with annotations where new variants appeared.
- **ProtectionOutcomeBar** and a mini map.
- **"Download briefing"** opens a clean one-page print view.

Use the grandparent voice-clone campaign (camp_grandparent_voice) as the showcase, with 3 clearly distinct variants. Link it from the voice-clone incident's community section.

---

## Phase 6 — Demo control room + Landing (≈1.5 h)

Build /demo (§5.9) and / (§5.10).

**/demo:**
- A PhoneFrame with an iframe of /family?member=u_aarav.
- ScenarioButtons 1–4 that post the exact contract example events: via the mock bus in mock mode, via real /api when mocks are off. The voice-clone scenario also delivers the sample call report at the end.
- EventLog and a connection status indicator.
- Collapsible presenter notes with this script:
  1. Scam message arrives.
  2. A voice-cloned grandson calls — ScamShield asks the real Aarav.
  3. He taps NOT me — Nani is told to hang up.
  4. Nani tries to buy $500 in gift cards — paused for Priya.
  5. Community Watch warns 38 families before the scam reaches them.

**Landing:**
- hero, and three FBI IC3 2025 stats with source
- a 4-step How-it-works diagram
- CTAs
- a team strip (Shreeniket Bhat, Kale Maxwell, Subhajit, Raj)

The whole demo must run on one laptop with no server.

---

## Phase 7 — Polish pass (≈1 h; repeat before feature freeze)

Audit every route at 375, 768, 1280 and 1536 px against spec §9, and fix:
- spacing rhythm, typographic hierarchy, alignment
- contrast, focus states, aria-labels, tap targets
- loading / empty / error states
- layout shift, horizontal scroll
- copy tone

Make the motion feel premium but subtle. List every change you made, grouped by page.

---

## Phase 8 — Real server (after the UI is approved)

Implement every endpoint in contract/CONTRACT.md (including /api/events/call_report) as Next.js API routes on MongoDB (database "kin", cached client in web/lib/db.ts), with CORS on all /api routes.

- Seed circle_nani on the first request, and in /api/demo/reset.
- Keep web/lib/api.ts as the only place the UI fetches data, so switching NEXT_PUBLIC_USE_MOCKS to false changes nothing visually.

Tell me how to test each flow against the real API.

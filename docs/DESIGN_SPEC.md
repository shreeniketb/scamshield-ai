# ScamShield — Design Spec (source of truth for all UI)

## 1. Product in one paragraph
ScamShield protects older adults from scams by bringing their family into the moment of decision.
- Nani's laptop runs the ScamShield desktop app (built by Kale). It listens to WhatsApp calls and messages.
- When a scam is suspected — including AI voice clones pretending to be family — ScamShield:
  - asks the real family member "Is this you?",
  - prompts Nani for the family safe word,
  - holds risky payments until family co-signs.
- Reports from every family feed Community Watch, which warns other families before the same scam reaches them.
- Pitch line: "Every scam says 'don't tell anyone.' ScamShield makes sure you do."

## 2. Personas and surfaces
| Persona | Device | Surface | Core job |
|---|---|---|---|
| Aarav (grandson), Priya (daughter) | Phone | /family (mobile-first app) | Respond fast when Nani is targeted; keep Nani's protection set up |
| Community organiser / judge | Laptop | /community (desktop dashboard) | See what scams are spreading, where, how they mutate, how warnings travel |
| Presenter | Laptop | /demo (control room) | Run the live demo reliably |
| Visitor / judge | Any | / (landing) | Understand ScamShield in 10 seconds |

## 3. Information architecture (routes)
/                                   Landing
/family                             Family app shell — bottom tab bar: Home · Activity · Circle · Community
/family                             Home
/family/activity                    Activity (calls + messages + payments timeline)
/family/activity/[incidentId]       Incident detail (the "story" of one call/message)
/family/circle                      Circle: people, emergency contacts, safe word, protection rules, circle health
/family/community                   Nani's neighbourhood summary + link to full Community Watch
/community                          Community Watch dashboard (desktop-first)
/community/campaign/[id]            Campaign detail + Mutation Map
/demo                               Demo control room
/styleguide                         Component gallery (hidden)
GLOBAL (inside /family): the "Is this you?" takeover can appear on any tab.

## 4. Key user flows (must work end-to-end)
F1. VOICE-CLONE CALL (the climax)
  1. Event arrives.
  2. Aarav's phone shows the full-screen "Is this you?" takeover, with haptic + 30 s countdown.
  3. He taps NOT me.
  4. Confirmation: "Nani has been told to hang up" + Call Nani button.
  5. Home shows a critical incident card.
  6. The Activity entry opens the Incident detail with the full story.
F2. PAYMENT HOLD
  1. Nani attempts $500 in gift cards.
  2. Home shows a "Payment paused" card at the top: amount, why (factor bars), three actions.
  3. Priya taps Decline.
  4. Toast confirms; the card collapses to "Declined by Priya · $500 protected".
F3. SET UP PROTECTION (first run, or from Circle)
  1. Circle shows a setup checklist: Add emergency contacts ✓ · Set family safe word · Choose protection rules · Invite family.
  2. Each item opens a bottom sheet.
  3. The checklist shows progress (3/4).
F4. SAFE WORD
  1. Circle › Safe word card: explainer → set → afterwards only "Set ••••" + last-used info ("Asked on a call 2 days ago — passed").
  2. It is never displayed again.
  3. A shareable "How to use your family safe word" sheet can be sent to family (copy link).
F5. COMMUNITY
  1. Home shows "Scams near Nani this week" (2 campaigns).
  2. Tap → the campaign in /community.
  3. "Warn my circle" → toast.
  4. From /community the organiser explores the map, the network and the mutation map, then downloads a briefing.

## 5. Screen specs

### 5.1 /family Home (mobile, 375–430 px)
Top to bottom:
1. **Header:** "Nani's protection" (Fraunces 28) + Nani avatar + live status dot ("Desktop app connected · 2 min ago").
2. **Status hero card** — three states:
   - "All clear — Nani is protected" (safe)
   - "Needs attention" (attention)
   - "Active threat" (critical)
   Shows one-line reason + primary action.
3. **Action queue** (only if items exist): pending payment co-sign cards, expired or unanswered verifications. Most urgent first.
4. **Quick actions row** (4 icon buttons with labels): Call Nani · Safe word · Contacts · Warn circle.
5. **"This week" stats:** 3 compact StatTiles — threats stopped, $ protected, family calls with Nani (7-day sparkline).
6. **Recent activity:** last 3 incidents (IncidentRow) + "See all".
7. **Scams near Nani:** 2 CampaignMini cards.

### 5.2 /family/activity
- Filter chips: All · Calls · Messages · Payments · Verifications.
- Grouped by day ("Today", "Yesterday", "Mon 21 Sep").
- **IncidentRow:** channel icon, title ("Call from unknown number claiming to be Aarav"), time, risk badge, outcome chip ("Blocked · NOT me", "Passed safe word", "Low risk").
- Search box (sender/number/text).

### 5.3 /family/activity/[incidentId] — Incident detail
1. **Header:** outcome headline ("Voice-clone call stopped"), risk badge, date/time, duration, caller number, channel.
2. **Story timeline** (vertical stepper, timestamped):
   call started → voice flagged (87% likely synthetic) → claimed to be Aarav → safe word prompted → Aarav answered NOT me → Nani hung up → payment attempt paused → Priya declined.
3. **Risk over the call:** a line chart. x = seconds, y = 0–1.
   - Two series: "Voice synthetic score", "Overall risk".
   - Threshold line at 0.7 labelled "Warning".
   - Annotation markers for key moments ("asked for bail", "asked to keep secret").
4. **What ScamShield noticed:** cue chips grouped as Voice / Words / Caller / Money, each with a plain-English explanation ("Asked to keep it secret from family — a classic scam signal").
5. **Transcript excerpts:** 3–5 lines, with the scam phrases highlighted in attention colour. Label "Transcribed automatically".
6. **Actions:** Report to Community (on by default) · Call Nani · Share summary with family.

### 5.4 /family/circle
1. **Setup checklist card** (progress ring, 4 items).
2. **People:** Nani (senior) + members. Each MemberRow shows avatar, name, relation, priority number, "Can verify calls" badge, buttons Call / Text (tel:/sms: links), overflow menu Edit / Remove / Move up / Move down. "Add person" opens a bottom sheet form (name, relation, phone, email, notify via app/email, can verify).
3. **Emergency order:** a small numbered list explaining "If Nani is in danger and nobody answers, we alert in this order".
4. **Family safe word card** (see F4).
5. **Protection rules:** 3 toggles in plain language + "Wait for family reply" segmented control (15 / 30 / 60 s).
6. **Circle health:** a bar chart of family calls with Nani over the last 8 weeks, with the goal line "1 call/week", and a nudge: "It's been 6 days since anyone called Nani. Scammers target isolation — a 5-minute call helps."

### 5.5 /family/community
- Nani's area (ZIP 30318) summary.
- The top 3 campaigns nearby.
- "Your circle's network" mini visual: "Your circle is connected to 42 families in Atlanta · 3 warnings reached you before the scam did".
- Link to full Community Watch.

### 5.6 Global: "Is this you?" takeover
- Full-screen sheet over everything.
- ScamShield logo, "Is this you?" (Fraunces 32), reason (20 px), 30 s countdown ring.
- Two buttons in the thumb zone: "NOT me — protect Nani" (critical, 64 px) and "Yes, it's me" (secondary, 56 px).
- Haptic buzz on appear.
- Confirmation states: NOT me / confirmed / expired.

### 5.7 /community — Community Watch (desktop 1280–1600 px; responsive down to 375)
**Layout:** 12-column grid, 24 px gutters, max-width 1440.

**Row 0 — Header:**
- Left: "Community Watch · Atlanta" + a "Live" pulse + "Updated 1 min ago".
- Right: time-range segmented control (24h / 7d / 30d) · DemoDataTag · "Download briefing".

**Row 1 — KPI strip (4 tiles):**
- **HERO:** "Families warned before the scam reached them" — big number + % + sparkline, brand-soft background, 2-col wide.
- Active campaigns.
- $ protected.
- Voice clones caught.
- Every tile has a delta vs previous period (▲ 12% with an accessible label).

**Row 2:**
- **Left 7 cols — Live campaigns list:**
  - Sortable: Fastest growing / Most reports / Newest.
  - CampaignCard: name, severity badge, channel pills, reports + sparkline, "first seen 9 h ago", area chips, redacted example in a quote block, "How to spot it", buttons "Warn my circle" and "Details →".
- **Right 5 cols, sticky — Atlanta map (MapLibre, OpenFreeMap liberty style):**
  - Graduated circles per ZIP, sized by reports.
  - Hovering a campaign card highlights its ZIPs on the map, and vice versa.
  - Legend with circle sizes.
  - Tooltip: ZIP, neighbourhood name, reports, top campaign.

**Row 3:**
- **Left 7 cols — "How warnings travel" network** (see §6.3).
- **Right 5 cols — "Scam types this week":** a horizontal bar chart of reports by scam type, sorted, direct-labelled.

**Row 4 — National context (full width):**
- IC3 2025 elder-fraud choropleth of US states (see §6.4), plus a side panel of the top 10 states table.
- Toggle: Losses ($) / Complaints.
- Source line.

**Footer:** data sources, simulated-data statement, privacy statement ("No names, numbers or links are ever shown. Areas appear only after 5+ reports.").

### 5.8 /community/campaign/[id]
1. **Header:** name, severity, channels, first seen, total reports, "How to spot it" callout, "Warn my circle", "Download briefing".
2. **Reports over time:** area chart, 72 h, with annotations at the moments new variants appeared.
3. **MUTATION MAP** (see §6.2) — the hero visual of this page.
4. **Variant cards** (one per variant): name ("Variant B — adds urgency deadline"), first seen, share of reports, an example with **words that changed vs Variant A highlighted** (added = attention underline, removed = strikethrough muted).
5. **Where it's spreading:** a small map of this campaign's ZIPs.
6. **Protection outcome:** "38 of 52 exposed families were warned first" as a stacked progress bar (warned before / warned after / not in network).

### 5.9 /demo — Demo control room (laptop)
- **Left 40%:** a realistic phone frame (iPhone-like, 390×844, rounded 48 px, notch) containing an iframe of /family?member=u_aarav.
- **Right 60%:**
  - "Scenario" steps as big numbered buttons: 1 Scam WhatsApp message · 2 Voice-clone grandson call (3 chunks, 2 s apart) · 3 Nani tries $500 gift cards · 4 Reset.
  - A live event log (monospace, newest first, colour-coded).
  - A connection status dot for API / mock mode.
- A "Presenter notes" collapsible panel with the 90-second script.

### 5.10 / — Landing
- **Hero:** "Scammers isolate. ScamShield brings family back in." + subline + two CTAs (Open family app · See Community Watch).
- **Three FBI IC3 2025 stats**, each with source: $7.75B lost by Americans 60+ · +59% vs 2024 · loneliness exploited.
- **"How it works":** a 4-step horizontal diagram — Listens → Verifies with family → Holds the money → Warns the community.
- Team + built-with strip.

## 6. Data-visualisation specs

### 6.0 Principles (apply to every chart)
- **Title = the insight, not the metric.** ("Warnings reached 38 families before the scam did", not "Warnings chart".)
- Direct labels over legends where possible. Units on axes. A source line under the chart.
- Colour-blind-safe palette: #0072B2 #E69F00 #009E73 #CC79A7 #56B4E9 #D55E00. Critical red only for true danger.
- No pie charts, no 3D, no gradients on data marks. Gridlines light (#E7E1D6), axes muted.
- Every chart has: loading skeleton, empty state, accessible description (aria-label summarising the takeaway), keyboard-reachable tooltips.
- Numbers in tabular figures; abbreviate ($8.4K, 1.2M).
- Charts are responsive; on mobile they simplify (fewer ticks, no secondary series).

### 6.1 Sparklines and small multiples
- 24-point lines, 2 px stroke, last point dotted with its value.

### 6.2 Mutation Map (campaign page)
- **Chart:** a scatter in 2D embedding space. Axes hidden (meaningless units), with a subtle frame.
- **Points:** each dot = one reported message. Colour = variant. Size = 6 px; hover grows to 10 px.
- **Variant region:** a convex hull per variant, 8% fill + 1 px stroke, labelled with the variant name at its centroid.
- **Time playback:**
  - A slider plus a Play button under the chart.
  - Dots appear in first_seen order, with a 72 h window compressed to ~8 s.
  - A counter shows the date/time.
  - The chart shows variants emerging and branching — this is the "wow" moment.
- **Tooltip:** redacted text, variant, first seen, ZIP.
- **Side panel:** clicking a dot shows the full redacted message and "closest variant A message" with the words that changed highlighted.
- **Caption:** "Each dot is a reported message, positioned by meaning using AI text embeddings. Clusters are variants — the same scam reworded to slip past filters."

### 6.3 "How warnings travel" network (community page)
- **Layout:** an ego-style radial network, legible, max ~45 nodes. NO hairball.
  - Centre node = the selected campaign's first-reporting circle ("First report · 30318").
  - Ring 1 = circles warned automatically (brand).
  - Ring 2 = circles exposed later (safe = warned before exposure, attention = warned after, muted = outside ScamShield).
- **Edges:** thin, curved, animate outward on load (respect reduced motion).
- **Campaign selector** (dropdown) re-draws it.
- **Right-hand legend** with counts per category, and a one-line insight: "1 report protected 38 families within 2 hours."
- **Implementation:** compute positions deterministically (angles by index; no physics jitter). Render SVG.

### 6.4 IC3 national choropleth
- **Map:** US states via us-atlas states-10m TopoJSON + topojson-client + d3-geo (geoAlbersUsa), rendered as SVG.
- **Colour:** sequential 5-class scale (light to brand teal) with quantile breaks and a labelled legend. "No data" = hatched grey.
- **Interaction:** hover shows state, losses, complaints, rank. Clicking a state pins it in the side table.
- **Toggle:** Losses ($) / Complaints.
- **Source line:** "FBI IC3 2025 Elder Fraud Report." Until Raj provides the real numbers, data carries a "TODO: replace with IC3 2025" flag and the chart shows a small "Placeholder figures" tag.

### 6.5 Incident risk chart
- As in §5.3: line chart + threshold + annotations. Colour: voice score #0072B2, overall risk #D55E00, threshold dashed muted.

## 7. Component inventory (web/components)
- **UI primitives (have):** Card, StatTile, Badge, Button, Sheet, Sparkline, SectionHeader, EmptyState, Skeleton, DemoDataTag, Toast.
- **Add:**
  - AppShell (family), BottomTabBar, TopBar, StatusHero, ActionQueueItem, PaymentCosignCard, VerifyTakeover
  - IncidentRow, IncidentTimeline (stepper), RiskOverTimeChart, CueChips, TranscriptExcerpt
  - MemberRow, MemberSheet, SafeWordCard, RulesCard, SetupChecklist, CircleHealthChart
  - CampaignCard, CampaignMini, KpiStrip, AtlantaMap, ScamTypeBars, WarningNetwork, UsChoropleth, StateTable
  - MutationMap, VariantCard, TextDiff, ProtectionOutcomeBar
  - PhoneFrame, EventLog, ScenarioButton, DashboardShell (desktop), SegmentedControl, FilterChips, Tooltip

## 8. Data layer
- `web/lib/types.ts`: TypeScript types for every shape in contract/CONTRACT.md, plus Incident (a grouped view of events by call/message id, with timeline steps).
- `web/lib/api.ts`: every data function. If NEXT_PUBLIC_USE_MOCKS === "true", it uses the mock store; otherwise it calls /api/*.
- `web/lib/mock/`: a rich seed dataset and an in-browser mock store. Demo events posted from /demo in mock mode are broadcast to other tabs with BroadcastChannel("scamshield"), so the laptop-only demo works with no server.
- **Mock seed must include:**
  - Circle: Nani + Aarav (p1) + Priya (p2) + Uncle Raj (p3, can_verify false). Safe word set (last used 2 days ago, passed).
  - 8 incidents over 14 days:
    1. Voice-clone grandson call (stopped)
    2. Georgia Power text (flagged)
    3. Priya's normal call (low risk)
    4. Medicare call (safe word failed → blocked)
    5. Bank fraud text
    6. Peach Pass toll text
    7. Delivery text (low)
    8. Unknown caller who passed the safe word (a real cousin — shows it works both ways)
  - 1 held payment.
  - 8 weeks of circle-health call counts.
  - 7 community campaigns with 72 h hourly trends.
  - 25 Atlanta ZIPs with neighbourhood names, lat/lon, reports.
  - 60–120 mutation points per campaign in 2–4 variants with realistic reworded texts.
  - A warning network per campaign (~40 nodes).
  - 50 states (placeholder IC3 values flagged TODO).
  - Scam-type totals.

## 9. Quality bar (definition of done for every screen)
- Looks right at 375 px (phone), 768 px, 1280 px and 1536 px.
- Every state designed: loading, empty, error, success.
- Keyboard navigable; visible focus; aria-labels; contrast AA; tap targets ≥ 48 px.
- No layout shift on load; no horizontal scroll on mobile.
- Copy is warm, specific, and never shaming. No lorem ipsum.
- Real-looking content everywhere (names, times, amounts, redacted texts).

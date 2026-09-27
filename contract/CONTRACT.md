ScamShield API contract (shared with Kale's desktop app — do not change without telling the team)

Base URL: https://scamshield.tech/api — all JSON, all times ISO-8601 UTC. Demo circle: id "circle_nani". Senior u_nani (Nani). Members u_aarav (Kale, grandson, priority 1), u_priya (Vanessa, daughter, priority 2), u_raj (Shreeniket, close friend, priority 3). IDs stay the same so the desktop app does not break.

Events from Kale's desktop app
POST /api/events/message_check

Request: {"id":"msg_001","circle_id":"circle_nani","senior_id":"u_nani","channel":"whatsapp","sender":"+1 404 555 0199", "text":"Grandma it's me, I'm in trouble, please don't tell mom","scam_probability":0.94,"scam_type":"grandparent_distress", "red_flags":["urgency","asks for secrecy","unknown number"], "explanation":"This looks like a scam. Real grandchildren don't ask you to keep secrets from family.", "claimed_identity":"grandson","created_at":"2026-09-26T14:02:11Z"}

POST /api/events/call_report — sent by the desktop app when a call or message analysis is complete. Body = contract/samples/call_report.sample.json shape. The live POST /api/events/call_analysis chunks remain for real-time triggers (verify, safe word, warnings) during the call.

POST /api/events/call_analysis (sent every few seconds during a call)

Request: {"id":"call_001","circle_id":"circle_nani","senior_id":"u_nani","channel":"whatsapp_call","caller":"+1 678 555 0142", "caller_id_status":"not_applicable","chunk_index":3,"voice_synthetic_score":0.87,"manipulation_type":"tts", "transcript_snippet":"it's me grandma, I'm on a friend's phone, I need bail money", "script_cues":["claimed_family","new_number_excuse","bail","secrecy"],"claimed_identity":"grandson","risk":0.9, "created_at":"2026-09-26T14:05:40Z"} caller_id_status ∈ passed | failed | not_verified | not_applicable.

Response to BOTH event types

{"ok":true,"risk":0.9,"actions":[ {"type":"prompt_safe_word","message":"Ask the caller for your family safe word."}, {"type":"verify_member","member_id":"u_aarav","verify_id":"ver_001"}, {"type":"show_warning","severity":"critical","message":"This voice may be computer-generated."}]}

Rules:

Always store the event and create an alert (severity by risk: <0.4 info, <0.7 warning, else critical).
verify_member: if claimed_identity maps to a member by relation (grandson→u_aarav, daughter→u_priya) AND that member has can_verify=true AND risk ≥ 0.6 → create a verify request (expires after rules.verify_timeout_s), unless one is already pending for the same event id. Also create it when the caller's number matches a member but the text or transcript asks for money.
prompt_safe_word: when a safe word is set AND any enabled rule matches: unknown_caller_asks_money (caller not in members' phones AND script_cues include bail/money/gift_cards), voice_clone_score_above_0.7, claims_family (claimed_identity present).
show_warning: when risk ≥ 0.7.
Verification
GET /api/verify/pending?member_id=u_aarav → the newest pending request or null (expire any past expires_at first; expiry → critical alert).
GET /api/verify/{id} → the request.
POST /api/verify/{id}/respond body {"response":"me"|"not_me"} → updated request. "not_me" → critical alert. Verify request shape: {"id":"ver_001","circle_id":"circle_nani","senior_id":"u_nani","claimed_member_id":"u_aarav","claimed_member_name":"Kale", "reason":"Someone claiming to be you is on a WhatsApp call with Nani right now.","source_event_id":"call_001", "status":"pending","created_at":"...","expires_at":"...","responded_at":null} status ∈ pending | confirmed | denied | expired.
Payments
POST /api/payments/attempt body {"circle_id","senior_id","merchant","method","amount"} situation_risk (capped at 1) = +0.35 if method ∈ gift_card|crypto|wire; +0.30 if a flagged event (risk ≥ 0.6) in the last 30 min; +0.25 if a verify was denied or expired in the last 30 min; +0.10 if amount > 200. status "held" if ≥ 0.6, else "auto_ok". Held → attention alert.
POST /api/payments/{id}/decide body {"member_id":"u_priya","decision":"approved"|"declined"}
GET /api/payments?circle_id=circle_nani Payment shape: {"id":"pay_001","circle_id":"circle_nani","senior_id":"u_nani","merchant":"Gift cards (online)","method":"gift_card","amount":500, "situation_risk":0.91,"top_factors":[{"label":"Gift-card payment","weight":0.35},{"label":"11 minutes after a flagged call","weight":0.30}, {"label":"Aarav said 'NOT me'","weight":0.25}],"status":"held","decided_by":null,"created_at":"..."}
Alerts
GET /api/alerts?circle_id=circle_nani → newest first. Alert shape: {"id":"al_001","circle_id":"circle_nani","kind":"message|call|verify|payment|campaign","severity":"info|warning|critical", "title":"Possible voice-clone call to Nani","body":"A caller claiming to be Aarav asked for bail money.","ref_id":"call_001", "created_at":"...","seen":false}
Circle, settings, safe word
GET /api/circle/{id} → {"id","senior":{"id","name"},"members":[...],"safe_word_set":bool, "health":{"last_contact_days":6,"calls_this_week":1,"threats_caught_30d":4,"payments_held_30d":1,"dollars_protected_30d":500}}
GET/PUT /api/circle/{id}/settings → {"circle_id","members":[{"id","name","relation","phone","email","priority","notify_via":["app","email"],"can_verify":true}], "safe_word_set":bool, "rules":{"protection_method":"safe_word"|"verify_member","prompt_safe_word_when":["unknown_caller_asks_money","voice_clone_score_above_0.7","claims_family"], "verify_timeout_s":30,"hold_payments_after_flag_min":30}} Pick exactly one protection_method. NEVER include the safe word itself.
PUT /api/circle/{id}/safe-word body {"safe_word":"..."} → {"ok":true,"safe_word_set":true}
GET /api/circle/{id}/safe-word-check-material (header X-Device-Token must equal env DEVICE_TOKEN, else 401) → {"safe_word":"..."}
POST /api/events/safe_word_result body {"call_id":"call_001","result":"passed"|"failed"|"not_asked"} → failed = critical alert.
Community (demo baseline plus live reports — see Additions below)
GET /api/community/summary → {"active_campaigns_24h":7,"circles_warned_before_exposure":38,"payments_held":12,"dollars_protected":8400,"voice_clones_caught":5,"data_label":"Demo data"}
GET /api/community/campaigns → [{"id","name","channels":["sms","call","voice"],"reports_24h":14,"trend":[24 hourly numbers], "first_seen","areas":["30318"],"example_redacted":"... [link] ...","how_to_spot":"...","severity":"info|warning|critical"}]
GET /api/community/campaigns/{id}/points → {"campaign_id","points":[{"x","y","variant":0,"text_redacted","first_seen"}]}
GET /api/community/map → [{"zip":"30318","lat":33.79,"lon":-84.44,"reports_24h":6}]
GET /api/community/states → [{"state":"FL","losses_usd":0,"complaints":0}]
Demo
POST /api/demo/reset → clears events, alerts, verifies, payments; re-seeds circle_nani with default members and rules, no safe word.
Seeding also happens automatically on the first request if the circle doesn't exist.
Reset and seeding keep the circle and member IDs. Old dummy incidents are removed so Activity shows live desktop calls only.

Additions (Phase 8 — additive only, nothing above changed)

Optional extra fields the desktop app MAY send on POST /api/events/call_analysis: "scam_type" (e.g. "family_impersonation", "bank_impersonation", "utility_shutoff", "medicare", "toll", "delivery", "irs_refund", "government_impersonation", "tech_support"), "explanation" (one plain sentence for the family), "recommended_action" (what Nani was told). script_cues may also use Grok's reason categories (urgency_or_pressure, secrecy_or_isolation, unusual_payment_method, impersonation, threats, sensitive_information_request, too_good_to_be_true, unexpected_debt_or_problem).
Full example of what the desktop app sends after each Grok verdict: contract/samples/call_analysis.desktop.sample.json. Where each field comes from:
- From Grok (add to its JSON schema): risk = scam_likelihood / 100, explanation = summary, reasons (+ script_cues = their categories), recommended_action, scam_type, claimed_identity (grandson | daughter | … | null), claimed_organization, requested_amount, payment_method (gift_cards | cash | wire | crypto | bank_transfer | payment_app | null). transcript_snippet = the newest caller quote. The desktop may send "" / "none" / 0 for "not given" (Grok's strict schema has no null); the server stores those as null.
- From the desktop app (ScamShieldApi.cs + DashboardBridge.cs at the repo root on main): id (one per call), chunk_index, caller, caller_id_status, created_at (UTC), started_at (UTC, when recording began), duration_s (elapsed seconds on the desktop, not from Grok), transcript (full AssemblyAI text so far), voice_synthetic_score (from Kale's AI voice detector when it ran). After each Grok verdict the app POSTs this body, then polls GET /api/verify/{id} so Nani is told if family answers "NOT me".
POST /api/community/campaigns body {"call_id"} → creates a Community Watch campaign from that call's Grok summary (or returns the one already created).
- From the server, never sent by the desktop: Nani's location (circle profile, ZIP 30318), money protected (held/declined payments), verify and safe-word outcomes, all statistics.
scam_type values: family_impersonation, bank_impersonation, government_impersonation, irs_refund, medicare, utility_shutoff, toll, delivery, tech_support, prize_lottery, investment_crypto, romance. Gift cards and cash are payment_method values, not scam types.
Repeated chunks for the same call id return the same verify_member verify_id (one "Is this you?" per call); poll GET /api/verify/{id} for the answer. Alerts: one per call/message id, updated (and resurfaced) when severity rises.
GET /api/reports?circle_id=circle_nani → CallReport[] newest first: every stored call_report, plus entries built live from call_analysis / message_check events that have no call_report yet (status "in_progress" while chunks keep arriving).
GET /api/circle/{id}/health-weeks → [{"week_label":"W1","calls":1}, ...8 weeks]
GET /api/community/scam-types → [{"type":"Bank impersonation","reports":18}] sorted by reports.
GET /api/community/campaigns/{id}/network → {"campaign_id","insight","nodes":[{"id","ring":0|1|2,"status":"first|warned|before|after|outside","label"}],"edges":[{"from","to"}]}
Community figures = demo baseline (web/lib/mock/community.ts, labelled "Demo data") + live desktop reports added on top (summary, campaign reports_24h, map ZIP of the circle, scam types).

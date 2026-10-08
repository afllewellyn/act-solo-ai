# PRD: ActSolo.AI 2026 Growth & Experience Optimization

_Last updated: Oct 2026_

## 1. Overview & Strategy

ActSolo.AI is expanding from a rehearsal tool into the go-to **AI scene partner and self-tape reader** for actors. This roadmap covers:

- Commercial expansion (virtual human coaching)
- Search acquisition (high-intent keywords and a comparison guide)
- Marketing conversion (differentiator pillars, voice preview, future demo video)
- Authenticated app refinements (script library and rehearsal teleprompter)

Public website work is grouped first (Group A) so styling, routing, and marketing copy ship in one cohesive pass before touching authenticated app areas (Group B).

### Core differentiators (anchor all messaging)

Competitor roundups don't highlight these:

1. **Real-time conversational voice** — the reader listens and answers on cue. No button presses, no awkward silence timers.
2. **Per-character AI voice casting** — a distinct voice (age, accent, tone) for each character in multi-person scenes.
3. **Actor-specific eye-line teleprompter** — active cue pinned near the camera lens so eyes don't wander.

### Competitive contrast

| Competitor type | Their gap | ActSolo contrast |
| --- | --- | --- |
| Line-learning apps | Pre-recorded or robotic voices, no dynamic turn-taking | Real-time conversational voice |
| Traditional teleprompters | Scroll text but don't talk back or cue you | Teleprompter synced to live dialogue |
| Human reader platforms | $15–$30/session, scheduling, readers can flake | Instant multi-character casting, 24/7 |

### Target keywords

- Primary: `AI scene partner` (performance intent), `self-tape reader` (urgent utility intent)
- Secondary: `run lines solo`, `audition reader app`, `teleprompter for actors`, `online acting rehearsal`

Scope note: web app only. No App Store work (not a native app yet).

---

## 2. Implementation Sequence

### Group A: Public Website & Marketing Expansion

#### Step 1: Public Coaching Page (`/coaching`)

- New page `src/pages/Coaching.tsx`, route registered in `src/App.tsx` above the catch-all.
- Match Landing styling exactly: cream `#FFFDF9`, `bg-white` / `bg-black` / `bg-secondary` bands, `rounded-2xl` cards, black buttons, shadcn `Button` + `Accordion`, lucide icons.
- External booking URL (used for every booking button, `<Button asChild><a target="_blank" rel="noopener noreferrer">`):
  `https://www.cameraoncreative.com/shop/p/coaching?utm_source=actsolo`
- Header: wordmark to `/`, "Home", "Coaching" (active, underlined), outline "Log In".
- Footer: same as Landing, descriptor adds "Coaching is offered through Camera On Creative."
- SEO: title "Acting Coaching – ActSolo.AI"; description "Practice with AI, then polish with a human. Book one-on-one online acting coaching for auditions and self-tapes."; `setCanonical("/coaching")`; restore on cleanup; add to `public/sitemap.xml`.

Sections, in order:

1. **Hero (cream, split)** — Eyebrow "HUMAN COACHING FOR ACTORS"; H1 "Practice with AI. Polish with a human."; paragraph "ActSolo gets you off-book and reading with a scene partner at 11pm. A coach helps you decide what to do with the scene. Book one-on-one time with a working actor before your next audition or self-tape."; buttons "Book a coaching session →" (external) and outline "See how it works" (smooth scroll to `#how`); Anna Cameron image (`/lovable-uploads/3ab4d7e5-4b52-482a-befb-3ffd1a49772a.png`, `rounded-3xl shadow-2xl aspect-[3/4]`, same alt text).
2. **How It Works (`id="how"`, `bg-black`, centered)** — Eyebrow "HOW IT WORKS"; H2 "Rehearse with ActSolo. Refine with a coach."; sub copy "Use ActSolo to run lines and get the take on its feet. Then bring it to a session for feedback on the choices only a person can see."; two `border-white/20 rounded-2xl` cards:
   - "Step 1 – Rehearse in ActSolo": "Paste your sides, assign AI voices, and run the scene until it moves."
   - "Step 2 – Get a coach's eye": "Choices, energy, and self-tape polish from a working actor."
3. **What We Work On (cream)** — Eyebrow "WHAT WE WORK ON"; H2 "Coaching built around your next audition"; 2-column grid of white `rounded-2xl` cards with icon tiles (`bg-primary/10 rounded-xl`):
   - Audition prep (Drama icon): "Theatre, TV, film, and commercial, plus singing and modeling."
   - Monologue selection (FileText): "Find pieces that fit your type and show your range."
   - Self-tape review (Video): "Your read, your framing, your take."
   - Brand overview (Star): "Type assessment, headshot recommendations, resume, and reel review."
4. **Why Pair Them (`bg-white`, narrow)** — Eyebrow "WHY PAIR THEM"; H2 "AI gets you ready. A coach gets you booked."; Check list:
   - Show up to the session already off-book and warmed up
   - Spend coaching time on choices and story, not line-feeding
   - Walk away with notes you can apply to your very next take
   - Closing (semibold): "Online, one-on-one, and built around the audition in front of you."
5. **Pricing (`bg-secondary`, centered)** — Eyebrow "PRICING"; H2 "One session. One clear price."; white `rounded-3xl shadow-xl` card "$150 / hour-long session" with checks "Virtual sessions, wherever you are", "One-on-one with Anna Cameron, working actor and acting coach", "Audition prep, monologues, self-tape review, and brand overview"; black "Book a session →" (external); muted note "Reschedule up to 24 hours ahead. Cancellations inside 24 hours may be non-refundable. No booking is guaranteed. Coaching is provided by Camera On Creative."
6. **FAQ (`bg-white`, Accordion + FAQPage JSON-LD id `faq-jsonld-coaching`, removed on cleanup)**:
   - "Do I need to use ActSolo to book coaching?" → "No. Coaching is open to any actor, but ActSolo users can arrive with scenes already rehearsed."
   - "How are sessions held?" → "Sessions are held virtually, so you can book from anywhere."
   - "Who is coaching for?" → "Actors preparing for theatre, TV, film, or commercial auditions. Sessions can also cover singing, modeling, and your brand overview."
7. **Final CTA (cream, centered)** — Eyebrow "GET STARTED"; H2 "Take your next self-tape further"; copy "Rehearse with ActSolo. Then bring it to someone who can tell you what's working."; buttons "Book a coaching session →" (external) and outline "Run lines with AI now" (`Link` to `/login`).

Internal linking:

- Landing header: "Coaching" text link left of Log In (hide below `sm` if crowded).
- Landing footer: "Coaching" before "Terms".
- Landing: slim `bg-black` banner above FAQ — eyebrow "COACHING", "Want a human eye on your self-tape?", white "Explore coaching →" to `/coaching`.
- Terms / Privacy / Contact / Help footers: add "Coaching" only if they already render a shared footer link row.

Quality: responsive (16px gutters, no horizontal scroll), keyboard accessible, visible focus, virtual only (never mention in-person), no changes to auth/practice/scripts/Supabase/ElevenLabs.

#### Step 2: SEO & Keyword Refresh

- `index.html` + `Landing.tsx`:
  - Title: "ActSolo.AI — AI Scene Partner & Self-Tape Reader for Actors"
  - Description: "The AI scene partner and responsive self-tape reader for actors. Rehearse sides solo, get instant cue pickups, and record auditions without needing a human reader."
  - OG/Twitter: "Your responsive AI scene partner & self-tape reader. Rehearse sides and nail auditions solo."
- Hero eyebrow "THE AI SCENE PARTNER & SELF-TAPE READER"; H1 "Your On-Demand AI Scene Partner & Self-Tape Reader".
- Problem section H2: "The Self-Tape Reader That Never Cancels on You".
- FAQ addition: "Can ActSolo replace a human self-tape reader?" → "Yes. ActSolo acts as an on-demand self-tape reader. It listens for your lines and delivers your partner's cues with natural pacing so your scene rhythm stays intact."

#### Step 3: Comparison & Authority Guide (`/best-ai-self-taping-app-2026`)

- Long-form page: "The Best AI Self-Taping App in 2026", aimed at solopreneur "top AI tools" listicles.
- Outline:
  1. The 2026 audition landscape — remote self-tapes and the reader problem
  2. Three types of reader tools — line memorizers vs. human reader networks vs. conversational AI partners
  3. Why turn-taking speed and eye-line matter
  4. Feature comparison matrix (turn-taking, per-character voices, eye-line teleprompter, 24/7 availability, cost)
  5. Verdict + "Run lines with AI now" CTA
- Keep claims about competitors factual and verifiable; review before publishing.
- Add to sitemap and footer. Can grow into a `/blog` section later if more articles follow.

#### Step 4: Homepage Differentiators & Voice Preview

- Hero subhead weaving in the three differentiators: "The AI scene partner and self-tape reader with real-time conversational voice, per-character voice casting, and an eye-line teleprompter—so you can rehearse and tape solo without breaking flow."
- **3 Pillars section** below hero:
  1. "A Reader That Listens, Not Just a Timer That Waits."
  2. "Multi-Character Casting in Seconds."
  3. "Stay in the Scene Without Breaking Eye Contact."
- Optional comparison matrix: "Why Actors Switch to ActSolo".
- **Voice soundboard** chips below the hero to hear sample readers (short pre-generated clips, not live calls).
- **Demo video (deferred):** no video asset yet. Do not add an empty slot or placeholder. Keep the current hero image. When the 20–30s clip is ready, add a "▶ Watch 30-sec demo" button beside the main CTA that opens a lightbox (no impact on page speed).

### Group B: Authenticated App Experience

#### Step 5: Script Management Redesign ("Studio Desk")

Problems today: nested borders (card in card in card), tab split between library and creation, saving leaves the user on a blank form, stray headings ("Manage Scripts Below", empty heading).

Solution:

- Clean library: flat cards with character list, last updated, preview, prominent "Rehearse Now ▶", secondary delete menu.
- Header with "My Scripts (N)" and an always-visible "+ New Script" button; remove tabs.
- Slide-over creator: borderless title input, single clean script canvas, formatting hint (Italic = AI partner, Bold = You), live detected-character chips, "Save & Start Rehearsal →" that goes straight to `/practice/:id`.

#### Step 6: Rehearsal Teleprompter & Minimal Studio HUD

- Pin the active cue in the upper third (camera eye-line); dim past lines, soften upcoming lines.
- Clear listening / AI-speaking indicators visible from a distance.
- Collapse settings and voice controls into a drawer; keep a slim top bar: back, scene title, take counter + timer, A-/A+ text size, Stop.

---

## 3. Sequence Summary

| Step | Scope | Group |
| --- | --- | --- |
| 1 | Coaching page + site links | A – Public |
| 2 | SEO & keyword refresh | A – Public |
| 3 | "Best AI Self-Taping App 2026" guide | A – Public |
| 4 | Homepage pillars, voice preview, video-ready hero | A – Public |
| 5 | Script library "Studio Desk" redesign | B – App |
| 6 | Eye-line teleprompter + studio HUD | B – App |

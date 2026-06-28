# CLAUDE.md — Wolf's Garage Coding Agent Manual

Drop this in the root of every Wolf's Garage repo (`wolfs-garage-site`, `wolfs-garage-community`, `Wolfs-admin`, `wolfsgarage-growth-engine`). Any agent that opens the repo reads this first. Full context lives in `WOLFS_GARAGE_KNOWLEDGE_BASE.md` (project knowledge base) — read it when you need brand, business, or history detail.

---

## WHO / WHAT

Wolf's Garage LLC — Portland OR hot rod brand. Owner: John ("Wolf" in public copy). Mobile-only (Samsung Galaxy, Chrome). Solo, ADHD, time-poor. **Lead with the action, no preamble.**

**Hard separation:** Wolf's Garage ≠ the buy/sell/trade side hustle ("Hustle & Flow"). Never mix code, data, or branding. If a task is side-hustle, stop and say so.

---

## SESSION-START AUDIT (run before any work)

1. Confirm WHICH repo + file is actually live. Never assume from prior context.
2. Vercel `list_deployments` → get the live deployment ID and version.
3. Check the repo HEAD (`raw.githubusercontent.com` reads are more reliable than `api.github.com`).
4. Post a one-line status: what exists, where it's deployed, what version, last change.
5. If a version already exists, work on THAT one. Never start a parallel build without John confirming.

---

## DON'T-BREAK RULES

- **Smallest useful change.** Don't rewrite working pages. Don't rename storage keys, routes, files, or functions unless required.
- **Bump the version every delivery.** Never ship the same version twice.
- **No deploy before visual approval.** John reviews a real `https://` preview on phone Chrome first. Local screenshots don't count.
- **Same task fails twice → stop.** Report what failed + which file/command, suggest the safer next move.
- **Architecture-First (AFR-001):** if a feature needs infrastructure that doesn't exist, or the current architecture is the wrong foundation, stop and say so before writing code.

---

## JS SAFETY (HR-007) — before pushing any HTML

Any file with `<script type="module">`: extract the module body to a `.mjs`, run `node --check`. Unescaped apostrophes in single-quoted JS strings silently abort the whole module. Run `node --check` on classic `<script>` blocks too.

---

## DEPLOY / PUSH

- **Vercel only.** Never suggest Netlify or GitHub Pages.
- `Wolfs-admin` serves via `raw.githack.com` — after a push give a cache-busted URL (`?v=N`) and note ~60s CDN delay.
- Supabase function URLs are NOT reachable from the sandbox — deploy those via a standalone deployer HTML John opens in Chrome.

**Git push pattern (agent pushes; John never touches GitHub):**
```bash
git remote set-url origin https://<PAT>@github.com/wolfsgarage-hub/[REPO].git
git config user.email "claude@anthropic.com" && git config user.name "Claude"
git add -A && git commit -m "vX.X - description" && git push origin main
git remote set-url origin https://github.com/wolfsgarage-hub/[REPO].git   # scrub token
echo "Token scrubbed."
```
`<PAT>` comes from the secrets store at push time. NEVER commit it to any file.

---

## BRAND QUICK-REF (full system in knowledge base §4)

- Colors: bg black `#0A0A0A` · red `#CC0000` · bone `#F5F1E8` · copper `#C8922A` (**text/hairlines only**, never fills/badges/backgrounds).
- Forbidden: orange, yellow, teal (except health blocks), sage, gold/light backgrounds.
- Fonts: Bebas Neue / Oswald (headers), Work Sans (body), Special Elite (accents).
- Logo: real wolf reference only, upper RIGHT in headers. Never AI-generate a substitute.
- Pinstriping on every page (under header, between sections, above footer). Black bg → red + white. White bg → red + black.

---

## REPO MAP

| Repo | Serves | Host | Vercel project | Notes |
|---|---|---|---|---|
| `wolfs-garage-site` | wolfsgarage.com | Vercel `wolfsgarage` | `prj_xkSqPioBA9MnFkIOPt9A8ths2379` | Main marketing site. v1.41. |
| `wolfs-garage-community` | Hot Rodder Directory | Vercel `wolfsgarage` | `prj_07ZQNcTf2xB0RmkPoYp1slYrydk6` | Directory live at /directory. v3.21.8. Firebase `wolfs-garage-directory`. |
| `Wolfs-admin` | Admin + Quick Add | raw.githack.com | — | Daily-driver = `main/index.html` (NOT community/admin.html). Quick Add = `main/quick.html`. Post gen = `wg-post-generator-v6.3.html`. |
| `wolfsgarage-growth-engine` | Growth Engine PWA | Vercel `wolfsgaragenw-9926` | `prj_4uKh5iqJeRauAFgPIdyXYbaIUTyO` | Branch `rebuild/growth-engine-core`. v2.13.0. Parallel actor pushes here — fetch HEAD before push, never force-push. |

Stack notes: Firebase compat SDK (`wolfs-garage-directory`), Cloudinary (cloud `dancaaglf`, preset `wolfs-garage`), Supabase proxy "awarewolf" (`github-proxy` edge function), Shopify Basic (apparel, POD via Printful/Printify — edit variants there first, never in Shopify directly).

---

## BUILD REPORT FORMAT (every build, no exceptions)

One copy/paste block, in order: LIVE VERSION · COMMIT · VERCEL DEPLOYMENT · BRANCH · FILES CHANGED · FEATURES COMPLETED · TESTS PASSED · BUGS FOUND · BUGS FIXED · WHAT WAS PRESERVED · NEEDS ANDROID TAP TESTING · EXACT ANDROID TEST STEPS · KNOWN LIMITS.

Never say "All done," "Should work," or "Looks good." Use evidence: exact preview URL, device, flows clicked, command run.

---

## OUTPUT STYLE (John is on a phone)

URLs = tappable markdown links. Copy/paste text = code blocks. Never swap them. Order: link → copy block → next action. Every reply referencing a versioned file or the live/preview site includes a tappable link to the current URL. Base64-image HTML won't render in Claude's preview iframe — tell John to open in Chrome.

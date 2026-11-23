# Smallfold creative direction

Source of facts: `marketing/brand-brief.md` (section 3 = never say, section 8 = the look). Scripts: `marketing/scripts/concept-a.md`, `concept-b.md`. Spoken lines are quoted word for word from the scripts and are never rewritten.

## 1. Visual style rules

- Dim, quiet room. One warm desk lamp is the only light source. Soft film grain over everything.
- Wood desk, plain cream wall, nothing on the wall. No posters, no windows, no plants, no shelves.
- Palette: muted browns, creams, blacks. Exactly one small cobalt-blue object in frame: a blue notebook, with a blue pen on it. Blue is never a background and never a second object.
- Natural, not glossy. No lens flares, no neon, no sparkles, no heavy skin smoothing.
- Concept A feels like a phone filmed it: handheld, small natural sway, chest-up, eye contact.
- Concept B is steadier and slower: tripod-like push-ins and gentle drifts, hands only, no faces.
- Nothing readable anywhere: no logos, no brand names, no letters, no screens showing interfaces, no YouTube logo. The camera on the tripod has a blank body and a blank lens ring.
- No real person's likeness, no celebrity or creator look-alikes, no copyrighted characters or music.
- Colour reference (for the grade, not for painting in): cream `#F1EFEB`, ink `#0E0E0E`, pen blue `#2B44D6`. Warm lamp glow sits between cream and soft amber.
- Captions, logo and end card are added afterwards from real files. Generated frames stay clean.

## 2. Presenter design (Concept A only)

"The presenter": one invented adult. A neutral description, not modelled on anyone.

- Woman, early 30s. Light olive skin, natural texture, no heavy make-up.
- Dark brown hair, shoulder length, worn down, parted slightly off-centre, a few loose strands.
- Plain charcoal crew-neck knit sweater, no print, no logo, no jewellery except tiny plain stud earrings.
- Expression: calm, direct, quietly confident, a hint of a smile. Not performing, not salesy.
- Setting: seated at a wood desk, chest-up, warm lamp at her left (frame right of her), plain cream wall behind, a small blue notebook with a blue pen at the lower edge of frame. Phone-camera framing, eye contact.
- The presenter is an AI presenter who explains the service. She never says "I" or "we", never claims to be a creator, customer or staff member.

## 3. Concept A shot list (talking presenter, 9:16)

Two generated clips, both with the presenter. Clip 1 is 11 s, clip 2 is 13 s, total 24 s. Generated audio is on, so the lip-sync comes from the model.

| Clip | Time | Framing | Action | Spoken line | On-screen caption (added later) |
|---|---|---|---|---|---|
| 1 | 0-2.5 s | Chest-up, handheld, eye contact | Already in frame at frame 1, looking into the lens, calm and direct | "No list. No algorithm. A person chooses." | No list. No algorithm. |
| 1 | 2.5-5.5 s | Same, tiny lean toward camera | Leans in slightly | "Finding sponsors takes time from your videos." | Finding sponsors takes time. |
| 1 | 5.5-11 s | Same | Holds up one finger on "you apply" | "With Smallfold, you apply with your channel link, topic and subscriber count." | 1. You apply |
| 2 | 11-17.5 s | Same framing, same pose as clip 1's last frame | Small nod, then a single gentle gesture on "chooses" | "A person looks at your channel and chooses a sponsor to suggest. You say yes or no." | 2. A person chooses / 3. You say yes or no |
| 2 | 17.5-21.5 s | Same | Steady, open hand palm up | "Nothing goes ahead without your yes. No deal, no commission." | Nothing without your yes. / No deal, no commission. |
| 2 | 21.5-24 s | Same | Points gently downward, then holds still | "Joining is free. Apply." | Apply |
| End | after 24 s | - | End card (real file) | - | Apply / Joining is free. |

Also added afterwards: small label "AI presenter" bottom corner for the whole video (end card: "Made with AI"), logo top-left.

The scripts list quick inserts (empty desk with camera, hands writing, blank cards with a hand choosing). These are not generated inside the presenter clips. They are optional cutaways borrowed from the Concept B b-roll in the edit.

## 4. Concept B shot list (voice-over on desk and hands, 9:16)

Voice-over is the master timeline (about 23 s). Five silent clips, about 25 s of footage in total, trimmed to fit the voice.

| Shot | Time | What we see | Camera movement | Voice-over line | On-screen text (added later) |
|---|---|---|---|---|---|
| B1 | 0-5 s | Dim room, one warm lamp. Camera on a small tripod on a wooden desk, blue notebook at the edge of frame | Slow push-in | "Smallfold looks at the small ones." | We look at the small ones. |
| B2 | 5-11 s | A hand rests on the camera, then turns a blank card over on the desk | Slow, steady, almost still | "It was started by a YouTube creator with a small channel, who found that sponsors only looked at big ones." | Started by a small channel |
| B3 | 11-17 s | Blank cards laid out on a table; a hand looks along them, then chooses one | Gentle drift along the row | "A person looks at your channel and chooses a sponsor to suggest, by hand." | A person chooses. By hand. |
| B4 | 17-21 s | A hand rests flat on the chosen card, then sets the blue pen on the blue notebook | Static, shallow focus | "Only small channels. Nothing goes ahead without your yes." | Only small channels. / Nothing without your yes. |
| B5 | 21-25 s | Empty lamp-lit desk, notebook and pen, lamp glow | Very slow pull-back; fades to end card | "Joining is free. Apply." | Apply |
| End | after | End card (real file) | - | - | Apply / For channels with 1,000 to 50,000 subscribers. |

Also added afterwards: "Made with AI" label bottom corner, logo top-left.

## 5. Static ads (no generation needed)

The three static ads are already built from the website's own Higgsfield pictures with real type and logo:

1. `band.jpg`
2. `difference-3.jpg`
3. `difference-2.jpg`

Nothing has to be generated. Optional, only if the owner wants fresh pictures: one prompt each (nano_banana_pro, 9:16, resolution 2k, `use_unlim: true`). The prompts are written to the brand look; if a website picture shows something different, adjust the object list but keep the rules. Each leaves empty space in the upper third for real type later.

- Static 1 (band.jpg): "Quiet dim room, one warm desk lamp, wooden desk, plain cream wall. A small camera on a tiny tripod on the desk, blank body, no logos. A small blue notebook with a blue pen at the lower edge. Soft film grain, muted browns, creams and blacks. Empty space in the upper third. No text, no letters, no people."
- Static 2 (difference-3.jpg): "Overhead view of a wooden table in a dim room lit by one warm lamp. Several blank cream cards laid out in a row, a hand reaching in to choose one. One small blue pen beside the cards. Film grain, muted browns and creams. No text, no logos, no face."
- Static 3 (difference-2.jpg): "Close view of hands from behind at a wooden desk, warm lamp light, cream wall. One hand holds a blue pen over a blue notebook with blank pages. Film grain, muted browns, creams and blacks. Empty space above. No text, no letters, no face."

## 6. Consistency checklist

Check across all clips before assembling.

- [ ] Same presenter in clips 1 and 2 (hair length and parting, face shape, charcoal sweater, stud earrings)
- [ ] Same room: wood desk, plain cream wall, lamp on the same side
- [ ] Exactly one blue object (notebook with pen). No second blue item appears
- [ ] Same warm grade and film grain in every clip, no clip brighter or cooler
- [ ] Same camera on a tripod in B1 and B2 (blank, no logo)
- [ ] Same wood tone and card colour in B2, B3 and B4
- [ ] Presenter's last frame in clip 1 matches the first frame of clip 2 (pose, light)
- [ ] Voice in clip 2 matches clip 1 (same pitch, pace, accent)

## 7. AI-mistake checklist for review

Watch each clip at full size, then at half speed, before approving.

- [ ] Hands: five fingers, natural joints, no fused or extra fingers, no pen passing through a hand
- [ ] Eyes: both look into the lens, no drifting or mismatched gaze, no odd blinking
- [ ] Teeth: natural, not a single bright block, no extra teeth when she speaks
- [ ] Lip-sync: mouth shapes match every word, no talking over a closed mouth, spoken words exactly as in the script
- [ ] Stray text: no letters on the camera, notebook, cards, sweater or wall; no subtitles baked in; no logo or brand name
- [ ] Warped objects: tripod legs, lamp, pen, notebook and cards keep their shape; cards do not melt or multiply
- [ ] Flicker: no light pulsing, no skin or hair texture crawling, no sudden colour jumps
- [ ] Background: wall stays plain, no new objects pop in
- [ ] Nothing claims earnings, numbers of creators or deals, or a testimonial (brief section 3)
- [ ] Audio: no music, no artefacts, no clipped first or last word

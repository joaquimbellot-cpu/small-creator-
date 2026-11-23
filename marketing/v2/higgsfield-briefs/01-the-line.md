# Higgsfield brief 01: The Line (outtakes version)

Status: PLAN AND QUOTE ONLY. Nothing has been generated and no credits were spent. Nothing starts until the owner says "go".
Prepared 23 Nov 2026. Sources: product-brief.md (sections 2 and 9), selection.md (concept 1 and "One visual style"), sketches/style.md.
Balance checked today: **7.6 credits** (plan: ultra, but this Claude Code session cannot use the unlimited allowance, so `use_unlim` is never passed and every job costs credits).

Format: vertical 9:16 for YouTube Shorts and Instagram Reels. English. Music: none.

Exact spoken words (do not change): "This video is sponsored by." / "Cut." / "This video is sponsored." / "No. Again." / "Sponsored by." / "Got one thousand to fifty thousand subs? Apply for a sponsor. It's free. A person picks a sponsor to suggest. You can say no. No deal, no commission."

## 0. Approach: direct generate_video calls, not the ugc-video workflow

I read the ugc-video workflow. It is built for product UGC: GPT Image boards, Seedream cleanup, inspection, then Seedance 2.5 clips, a stitched file and captions through video-montage. It has no product here (nothing to put on a board), it wants one long monologue, it has no place for jump-cut takes that break on purpose, and its own rule forbids any generated text while we need a hard-edged post style that is not Higgsfield's caption look. Its useful parts (Seedance 2.5, omni_reference, native speech, check actual duration and frames after each clip) are exactly what direct calls give us, without the extra board jobs. Decision: **direct calls**: one portrait still, then four separate clips, one per take, then local assembly.

Verified today with models_explore:
- seedance_2_5: modes t2v / omni_reference / video_edit / video_extension; omni_reference takes start_image, end_image, image_references (max 30), video_references, audio_references (max 10); duration 4 to 30 whole seconds; 480p, 720p, 1080p, 4k; generate_audio default true; `draft: true` gives a 480p draft that can be finalised within 7 days (`draft_job_id`, billed for the draft's full duration); aspect 9:16 supported.
- seedance_2_0: mode std (480p to 4k) or fast (480p and 720p only); duration 4 to 15; start_image, image_references, audio_references (2 to 15 s each, need an image reference).
- No sound-effect model is usable here: Mirelo Text to Audio is "game pipeline only". The audio models found are speech (text2speech_v2, elevenlabs_v4, seed_audio, qwen_audio_tts) and music (not wanted).

## 1. Step 0: the presenter portrait (the identity anchor)

The person is **invented**. She must not resemble any real person, actor or creator; if a result looks like someone real, discard it and re-roll. She is an adult in her early 20s. This image is used as `start_image` and as `image_references` for every clip, so the person and the room stay identical.

| Field | Value |
|---|---|
| Model | soul_2 (realistic UGC portraits). Best option: nano_banana_pro 2k |
| Aspect ratio | 9:16 |
| Quality | 2k (model default) |
| count | 1 (one candidate; re-roll only if it fails the checks) |
| Quote | soul_2 = 0.12 credits (shown as 1 credit rounded up; exact 0.12). nano_banana_pro 2k = 2 credits |

Prompt:
```
Photorealistic vertical phone-style portrait of an invented young woman in her early 20s, short wavy dark-brown hair, light freckles, mustard-yellow hoodie, sitting at a desk in a bright lived-in bedroom studio. Daylight from a window on the left, sage-green wall behind her, a ring light and a camera on a tripod beside her, a mug and a small plant on the desk, laptop shown only as a closed lid. Medium shot, eyes at 45% of frame height, relaxed neutral closed-mouth expression, looking at the lens. Candid UGC look. No text, no logos, no screens visible.
```
Check before accepting: not a real or famous face; both hands and fingers correct (or hands out of frame); no lettering anywhere; daylight, not moody; headroom in the top 10% and clear bottom 20%.

## 2. Clip list

Durations are the shortest that fit the words at no more than 2.3 words per second plus the acting beats, in whole seconds. Total generated: 27 s. All clips: model **seedance_2_5**, mode **omni_reference**, aspect **9:16**, **generate_audio: true**, media roles: portrait as `start_image` and as `image_references`; for clips 2 to 4 also the accepted audio of clip 1 as `audio_references` (see section 3). The tier (resolution/draft) depends on the option in section 6.

Shared voice line used in every prompt: "warm, light, slightly husky early-20s American female voice, relaxed". Shared look line: "same young woman as the reference image, same room, same mustard hoodie, bright daylight, locked-off medium shot".

| Clip | Purpose | Duration | Words spoken |
|---|---|---|---|
| 1 Take 1 | Hook. Confident start, freezes after "by" | 5 s | 6 |
| 2 Take 2 | Trips over it | 5 s | 5 |
| 3 Take 3 | Slow, the long beat, looks into the lens | 5 s | 2 |
| 4 The offer | Relaxed talk to the viewer | 12 s | 29 |

**Clip 1 prompt**
```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. She says confidently, in a warm, light, slightly husky early-20s American female voice: "This video is sponsored by" then runs out of sentence and freezes, mouth slightly open, eyes flicking off-camera. She winces, closes her mouth, and says flatly: "Cut." One hand waves at the camera. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```
**Clip 2 prompt**
```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. She shakes her head, breathes out, resets her shoulders, then starts too fast in a warm, light, slightly husky early-20s American female voice: "This video is sponsored" and trips over it, stumbling. She grimaces, eyes up, and says: "No. Again." Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```
**Clip 3 prompt**
```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. Slow and careful this time. She says, in a warm, light, slightly husky early-20s American female voice: "Sponsored by" and stops at the same word. A long silent beat of about two seconds: she drops the act and looks straight into the lens, calm, slightly tired. She does not say another word. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```
**Clip 4 prompt**
```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. Relaxed, no act, talking straight to the viewer in a warm, light, slightly husky early-20s American female voice, at an easy pace: "Got one thousand to fifty thousand subs? Apply for a sponsor. It's free. A person picks a sponsor to suggest. You can say no. No deal, no commission." Small natural nods, one friendly open-palm gesture. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```
(All four are under 120 words. Word counts: clip 1 about 88, clip 2 about 82, clip 3 about 84, clip 4 about 88.)

## 3. Voice consistency across clips

Options: (a) same portrait and the same written voice line in every prompt; (b) a Take 1 voice sample passed as `audio_references` to clips 2 to 4; (c) a separate text-to-speech voice track (text2speech_v2 or elevenlabs_v4 with one fixed voice) laid over silent clips.
Recommendation: **(a) plus (b)**. Generate clip 1 first; when its voice is accepted, pass that clip as `audio_references` (and `video_references` is not needed) for clips 2 to 4. Fall back to (c) only if the voice drifts across takes; it costs more jobs and needs lip-sync repair, so avoid it. Note: the quotes below do not include an audio reference because a quote cannot take media that does not exist yet; whether an audio reference changes the price is **not quoted** and must be re-quoted with the real clip 1 id before clips 2 to 4 are submitted. Because the room, hoodie and portrait are the same, minor voice drift between takes reads as natural in outtakes; the offer clip is the one that must match.

## 4. Post-production (no music, only sound effects)

Tool recommendation: **local ffmpeg** (or ffmpeg through Higgsfield's sandbox_exec, which can read the clips without the owner opening downloads). Reason: the style needs exact plates, pill labels, chips, positions and the pen-blue blank, which the video-montage caption look does not guarantee, and ffmpeg costs 0 credits. Use Higgsfield's **video-montage** workflow only as a fallback if neither works; its price is **not quoted** (the workflow was not opened). The caption fonts are Inter or Montserrat ExtraBold. Palette from style.md: pen blue #2B44D6, ink #0E0E0E, cream #F1EFEB, yellow #FFD21F, coral #FF6B57.

Edit list (trim each clip to its useful part; target about 24 s with end card):
1. Order: Take 1, Take 2, Take 3, offer, end card. Hard cuts only, no fades.
2. Each jump cut: 2-frame white flash plus a clapper snap. The take counter snaps over on the same frame: "TAKE 1", "TAKE 2", "TAKE 3" (pill, x 66%, y 10.5%).
3. Red recording dot beside the counter through the three takes; it disappears on the cut to the offer.
4. Half a second of resetting (breath, head shake, hair) is kept at the head of takes 2 and 3 from the generated footage.
5. Captions, cream plate, ink text, one per spoken line, pop in over 2 frames, leave on the cut: "This video is sponsored by ____" (take 1, blank in pen blue #2B44D6, thick underline, never filled), "Cut." , "This video is sponsored ____" and "No. Again." (take 2), "Sponsored by ____" (take 3). Offer lines: "Got 1,000 to 50,000 subs?", "Apply for a sponsor.", "It's free.", "A person picks a sponsor to suggest.", "You can say no.", "No deal, no commission." (at most 8 words, 2 lines each).
6. Labels: "AI actor" (cream pill, x 6%, y 10.5%) on every shot with the person from its first frame. "Pretend" (coral pill, y 14.3%) on takes 1 to 3, appearing at least 0.4 s before the first spoken word of each take. No Pretend on the offer clip. Neither label on the end card.
7. Chips (pen blue pill, cream text): "Sponsor offer. Free to apply." from the first frame (y 18.4% during takes, y 14.3% once Pretend leaves); "1,000 to 50,000 subs" arrives at second 2 and stays through the takes; in the offer it becomes the yellow headline when the range is spoken.
8. A cut or a new caption at least every 2.0 s; punch-in (100% to 125% and back) on any shot that holds longer.
9. Shared end card, 3.0 s, cream, from style.md section 8: "Made with AI", real logo file, "Sponsored by ____" (blank blinking at 1 Hz), Apply button, "Free to apply.", "For YouTube channels with 1,000 to 50,000 subs.", "Applying doesn't promise a sponsor."

Sound effects (no music; no Higgsfield model can make them here):
| Sound | Source | Cost |
|---|---|---|
| Voice and room tone | Generated inside each Seedance clip (generate_audio) | Included in the clip price |
| Clapper snap on each cut | Original, synthesised in ffmpeg (short noise burst) or recorded by the team | 0 credits |
| Dry bubble pop on each "by" (signature sound) | Original, synthesised in ffmpeg | 0 credits |
| Soft tick on each caption pop; light snap-and-clap beat that drops out at the offer | Original, synthesised in ffmpeg | 0 credits |
| Two-note sting on the end card | Original, synthesised in ffmpeg | 0 credits |
| Higgsfield audio model for sound effects | Mirelo Text to Audio exists but is "game pipeline only" | not quoted, not used |

## 5. Quality notes per clip

All clips: same person as the reference image; same room, hoodie and light; no extra fingers or merged hands; no text, numbers or logos anywhere; bright daylight, nothing moody; no readable screen; mouth closed at the end of each clip; no real person's likeness; the sentence is never finished and no name or brand is ever spoken.
- Clip 1: she must stop right after "by"; reject if she says any name or completes the line. "Cut." must be audible and clear.
- Clip 2: the stumble must be natural, not garbled speech; "No. Again." intact.
- Clip 3: only "Sponsored by", then about 2 s of silence and a direct look into the lens; reject if she keeps talking.
- Clip 4: all 29 words in order with no added or dropped word; "one thousand to fifty thousand" spoken clearly; no promise or extra claim (no "you will get"); frame stays steady; hands are clean on the gesture.
- After each clip: check actual duration, frames for stray lettering, and that audio has no music.

## 6. THE QUOTE

All numbers below come from estimate_video_cost / estimate_image_cost calls made on 23 Nov 2026, with aspect 9:16, generate_audio true, use_unlim false, and no media attached (media ids do not exist yet).

### Individual quotes
| Job | Parameters | Credits |
|---|---|---|
| Portrait | soul_2, 9:16, 2k | 0.12 |
| Portrait (best) | nano_banana_pro, 9:16, 2k | 2 |
| Video, per 5 s | seedance_2_0 fast 480p | 5 |
| Video, per 12 s | seedance_2_0 fast 480p | 12 |
| Video, per 5 s | seedance_2_0 fast 720p | 12.5 |
| Video, per 12 s | seedance_2_0 fast 720p | 30 |
| Video, per 5 s | seedance_2_5 omni_reference 480p draft | 15 |
| Video, per 12 s | seedance_2_5 omni_reference 480p draft | 36 |
| Video, per 5 s | seedance_2_5 omni_reference 720p | 35 |
| Video, per 12 s | seedance_2_5 omni_reference 720p | 84 |
| Video, per 5 s | seedance_2_5 omni_reference 1080p | 80 |
| Video, per 12 s | seedance_2_5 omni_reference 1080p | 192 |
| Video, 12 s, 1:1 | seedance_2_5 omni_reference 720p | 84 |
| Video, 12 s, 16:9 | seedance_2_5 omni_reference 720p | 84 |
| Finalising a 2.5 draft at 720p | needs a real draft job id | not quoted |
| Audio reference effect on price | needs a real clip id | not quoted |
| Reframe tool (1:1, 16:9) | no estimate tool for it | not quoted |
| Sound effects | local ffmpeg | 0 |

### Option A: Draft test (seedance_2_0 fast 480p, no retries)
Cheapest way to see the whole ad moving. Lower quality and speech accuracy; it is not for publishing, and its voice will not carry over to a later 2.5 run.
| Job | Credits |
|---|---|
| Portrait, soul_2 | 0.12 |
| Clip 1, 5 s | 5 |
| Clip 2, 5 s | 5 |
| Clip 3, 5 s | 5 |
| Clip 4, 12 s | 12 |
| **Total** | **27.12** |
Balance 7.6: **19.52 credits must be added.**

### Option B: Standard (seedance_2_5 omni_reference 720p; plus one retry of clip 4 and clip 3)
Riskiest clips: clip 4 (29 words must be exact) and clip 3 (must stop and stay silent).
| Job | Credits |
|---|---|
| Portrait, soul_2 | 0.12 |
| Clip 1, 5 s | 35 |
| Clip 2, 5 s | 35 |
| Clip 3, 5 s | 35 |
| Clip 4, 12 s | 84 |
| Subtotal, no retries | 189.12 |
| Retry clip 4 | 84 |
| Retry clip 3 | 35 |
| **Total** | **308.12** |
Balance 7.6: **300.52 credits must be added.** (Without retries: 181.52 to add.)

### Option C: Best (seedance_2_5 omni_reference 1080p; portrait with nano_banana_pro; one retry per clip and for the portrait)
| Job | Credits |
|---|---|
| Portrait, nano_banana_pro 2k | 2 |
| Clip 1, 5 s | 80 |
| Clip 2, 5 s | 80 |
| Clip 3, 5 s | 80 |
| Clip 4, 12 s | 192 |
| Subtotal, no retries | 434 |
| Retry portrait | 2 |
| Retry clip 1 | 80 |
| Retry clip 2 | 80 |
| Retry clip 3 | 80 |
| Retry clip 4 | 192 |
| **Total** | **868** |
Balance 7.6: **860.40 credits must be added.**

### Later costs (quoted separately, not in the totals above)
| Item | Option A settings | Option B settings (720p, 2.5) | Option C settings (1080p, 2.5) |
|---|---|---|---|
| Two extra hook variants (two new takes 1, 5 s each) | 10 | 70 | 160 |
| 1:1 version, regenerated natively (all four clips) | 27 (fast 480p, 5 s and 12 s quoted for 9:16) | 189 (12 s quoted at 84 for 1:1; the 5 s clips are assumed equal to their 9:16 price of 35, not quoted for 1:1) | 432 (assumed equal to 9:16, not quoted for 1:1) |
| 16:9 version, regenerated natively (all four clips) | 27 (same note) | 189 (12 s quoted at 84 for 16:9; same note) | 432 (same note) |
| 1:1 by cropping the 9:16 masters in ffmpeg | 0 | 0 | 0 |
| Reframe tool, 1:1 and 16:9 | not quoted | not quoted | not quoted |

Notes: a centred 1:1 crop of the 9:16 footage works free because the person sits at 45% height with headroom, but graphics must be re-laid for 1:1. A 16:9 version cannot be cropped from vertical; it needs the native regeneration above, or the reframe tool (price not quoted; re-quote before use).

### Summary against the balance of 7.6
| Option | Total | Credits to add |
|---|---|---|
| A Draft test | 27.12 | 19.52 |
| B Standard (with 2 retries) | 308.12 | 300.52 |
| C Best (with retry per clip) | 868 | 860.40 |

Recommendation: **Option B**, run in the stop-and-show order below. If the owner wants to cap spend, run A first (19.52 to add) to check the script and timing; its cost is a pure extra if B follows (total A plus B = 335.24).

## 7. Order of work after "go", with stop points

1. Confirm the option, the credits added (balance re-checked with the balance tool), and that no use_unlim is used.
2. Portrait (0.12 for soul_2). **Stop: show the portrait.** Owner approves the invented person and room.
3. Clip 1 only (35 at B). **Stop: show clip 1.** Check face match, voice, the freeze after "by", "Cut."
4. Clips 2 and 3 with the clip 1 audio as audio_references (re-quote first). **Stop: show both.** Retry only a failed clip.
5. Clip 4 (84 at B). **Stop: show it.** Check all 29 words. Retry once if a word is wrong.
6. Local assembly with ffmpeg (0 credits): cuts, flashes, snaps, counter, dot, captions, labels, chips, end card, sound effects. Needs downloads from Higgsfield's hosts allowed, or run it in sandbox_exec. **Stop: show the cut** and check it against the owner's rules (labels present, line never finished, "Applying doesn't promise a sponsor." on the end card).
7. Only then, hook variants and the 1:1 and 16:9 versions, each re-quoted and approved first.
8. After every job, add a row to assets-log.md.

## 8. Job log (copy of the table in assets-log.md; keep that file as the master)

| date | job id | model | clip | credits quoted | credits charged | result | status |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

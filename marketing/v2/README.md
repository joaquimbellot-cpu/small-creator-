# Marketing, version 2

Ads that sell the creator offer: **a sponsor chosen for your small YouTube channel, free to apply.** Nothing here has been published. The owner publishes.

Version 1 is archived in `marketing/v1/` and its ideas are not reused.

## What is in this folder

| File or folder | What it is |
|---|---|
| `product-brief.md` | The only source of facts for the ads, and the hard rules |
| `research.md` | Winning patterns in the category (from search summaries; each marked with its evidence) |
| `angles.md` | Desires, fears, objections and five selling angles |
| `references.md` | The owner gave no reference links |
| `ideas.md` | All 30 concepts from two brainstorm rounds |
| `scorecard.md` | The Critic's scores, both rounds and the final check |
| `selection.md` | The leader's final choice: four videos and one static, with final scripts |
| `sketches/` | Storyboards, the visual style and the sketch page (`sketches/index.html`) |
| `higgsfield-briefs/` | Production briefs with every prompt and quote |
| `assets/` | Finished static ads (`static/`) and the Higgsfield pictures they are built from (`source/`) |
| `compliance-report.md` | The honesty and quality check of the finished static ads |
| `assets-log.md` | Every Higgsfield job and what it cost |
| `tools/` | The scripts that add type and logo to the generated pictures |
| `posters/` | **The poster series (24 November): seven posters in two sizes, in `posters/out/`.** Brief, concepts, selection, design system, sources and render tool are beside them |

## Where things stand (23 November 2026)

- **Approved by the owner:** concept 1, **The Line**, as an outtakes reel ("cut and redo, like it was an error").
- **Parked, no decision yet:** Missing Sponsor, The Credits, The Gap (videos) and Next First (static).
- **The Line's video is not generated yet.** The owner will generate the clips later on Higgsfield, with the prompts below.
- **Pictures made on 23 November** with the owner's remaining credits (3.44 spent, 4.16 left): five static ads in `assets/static/`. **The owner rejected them on 24 November** ("this is not the intro to a video"): they were phone selfies with captions on top. They are kept only as a record.
- **The poster series (24 November)** replaces them: seven designed posters, each in 1080 x 1350 and 1080 x 1920, in `posters/out/`. They are built from real type and drawn shapes, so they cost no Higgsfield credits. See `posters/selection.md` for the choice and `posters/critique.md` for the check.
- **Higgsfield:** on 24 November the account showed the **free** plan (it showed Ultra the day before), and Higgsfield refused to generate ("Requires basic plan or higher"). Two poster photographs (an empty plinth and a blank box) could not be made, so the plinth poster is drawn and the box poster was later cut. Balance: 4.16 credits.
- **The presenter's portrait for the video still has to be made** (Step 1 below). The portraits generated here came out as selfies with a raised hand, not the calm medium shot the video needs.

---

## How to make The Line's video on Higgsfield

Doing this on Higgsfield's website (or in a normal Claude chat with Higgsfield connected) should let the Ultra plan's unlimited allowance apply. It does not apply from Claude Code. Button names on the website may differ slightly; the model names and settings were verified through the Higgsfield tools.

### Step 1: the presenter's picture

1. Open **Image** and choose the model **Higgsfield Soul 2.0**.
2. Aspect ratio **9:16**, quality **2K**.
3. Paste this prompt and generate.

```
Photorealistic vertical phone-style portrait of an invented young woman in her early 20s, short wavy dark-brown hair, light freckles, mustard-yellow hoodie, sitting at a desk in a bright lived-in bedroom studio. Daylight from a window on the left, sage-green wall behind her, a ring light and a camera on a tripod beside her, a mug and a small plant on the desk, laptop shown only as a closed lid. Medium shot, eyes at 45% of frame height, relaxed neutral closed-mouth expression, looking at the lens. Candid UGC look. No text, no logos, no screens visible.
```

4. Keep it only if she does not look like a real or famous person, her hands look right, and there are no letters anywhere.

### Step 2: the four clips

1. Open **Video** and choose the model **Seedance 2.5**.
2. Add the portrait as the **start image** (first frame). If there is also a reference-image slot, add it there too.
3. Settings for every clip: aspect ratio **9:16**, resolution **720p**, **audio on**.
4. Generate the clips one at a time, in order.

**Clip 1, take 1 (5 seconds)**

```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. She says confidently, in a warm, light, slightly husky early-20s American female voice: "This video is sponsored by" then runs out of sentence and freezes, mouth slightly open, eyes flicking off-camera. She winces, closes her mouth, and says flatly: "Cut." One hand waves at the camera. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```

**Clip 2, take 2 (5 seconds)**

```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. She shakes her head, breathes out, resets her shoulders, then starts too fast in a warm, light, slightly husky early-20s American female voice: "This video is sponsored" and trips over it, stumbling. She grimaces, eyes up, and says: "No. Again." Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```

**Clip 3, take 3 (5 seconds)**

```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. Slow and careful this time. She says, in a warm, light, slightly husky early-20s American female voice: "Sponsored by" and stops at the same word. A long silent beat of about two seconds: she drops the act and looks straight into the lens, calm, slightly tired. She does not say another word. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```

**Clip 4, the offer (12 seconds)**

```
Same young woman as the reference image, same bedroom, same mustard hoodie, bright daylight, locked-off medium shot. Relaxed, no act, talking straight to the viewer in a warm, light, slightly husky early-20s American female voice, at an easy pace: "Got one thousand to fifty thousand subs? Apply for a sponsor. It's free. A person picks a sponsor to suggest. You can say no. No deal, no commission." Small natural nods, one friendly open-palm gesture. Mouth closed at the end. Natural room sound only. No on-screen text, no subtitles, no logos, no music, no readable screens.
```

### Step 3: check each clip before the next

- Same person and room as the portrait, in the same hoodie.
- The words are exact. In clips 1 to 3 she never finishes the sentence and never says a name.
- No text or logos anywhere in the picture.
- Hands and mouth look normal, and her mouth is closed at the end.
- If clips 2 to 4 sound like a different person, add clip 1 as an **audio reference** when you regenerate, if the page offers that slot.

### Step 4: hand the clips back

Download the four clips and upload them into a Claude Code chat on this project. Claude then adds, at no credit cost: the jump cuts with a white flash and clapper snap, the "TAKE 1 / 2 / 3" counter, the red recording dot, the captions with the blank, the "AI actor" and "Pretend" tags, the offer text and the end card. The shot-by-shot plan is in `sketches/01-the-line.md`.

### Cost, if it is not free

Check the cost shown next to the generate button. If the unlimited allowance covers Seedance 2.5, it should show as free. Otherwise the four clips were quoted at **189 credits** in total at 720p (35 for each 5-second clip, 84 for the 12-second clip), and the portrait at 0.12. All quotes are in `higgsfield-briefs/01-the-line.md`.

### When publishing

Turn on the platform's AI-content label (YouTube "altered or synthetic content", Instagram "AI info"). Claude never publishes and never spends ad money.

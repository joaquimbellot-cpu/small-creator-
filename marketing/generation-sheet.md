# Smallfold video generation sheet

Paste everything below into a Claude chat that has the Higgsfield tools.

---

## Read this first (for Claude)

You are helping me make two short vertical ad videos for Smallfold, a service that finds sponsors for small YouTube channels. You know nothing else about the project, and you do not need to. Everything you need is in this sheet. Follow the steps in order.

Rules for every step:

1. Use the Higgsfield tools only.
2. Pass `use_unlim: true` on every generation request. It uses my unlimited allowance and makes exactly one result per request.
3. Before each step, run the matching estimate tool (`estimate_image_cost`, `estimate_video_cost` or `estimate_audio_cost`). If anything would cost credits, STOP and tell me before generating.
4. Never publish or post anything anywhere.
5. Never add logos, captions or text to generated frames. Logo, captions and the end card are added in Step 4 from real files.
6. Do not rewrite, shorten or "improve" the spoken lines. Use the exact words in the quotes.
7. No real person's likeness, no brand names, no readable text, no copyrighted music.
8. Show me each result and wait for my OK before moving on. If a result has a flaw (extra fingers, odd eyes, stray letters, flicker, lip-sync off), say so and offer to try again.

---

## Step 1: Presenter portrait

Make one still of an invented presenter. It becomes the reference image for every Concept A clip. Keep its media id.

- Tool: image generation, model `soul_2`
- Parameters: aspect_ratio `9:16`, quality `2k`, `use_unlim: true`

```
Realistic phone-camera portrait of a woman in her early 30s, light olive skin with natural texture, dark brown shoulder-length hair worn down with a slightly off-centre parting, small plain stud earrings, plain charcoal crew-neck knit sweater with no print or logo. Seated at a wooden desk, chest-up, looking straight into the lens, calm direct expression with a hint of a smile, mouth closed. Dim quiet room, one warm desk lamp to her left, plain cream wall behind, a small blue notebook with a blue pen at the lower edge of the frame. Soft film grain, muted browns, creams and blacks. Natural, not glossy. No text, no logos, no letters.
```

Show me the portrait. Do not continue until I approve it.

---

## Step 2: Concept A, two clips with the presenter

- Tool: video generation, model `seedance_2_5`, mode `omni_reference`
- Media: `start_image` = the approved portrait. For clip 2, also use the approved portrait as an `image_references` entry.
- Parameters: aspect_ratio `9:16`, resolution `720p`, generate_audio `true`, `use_unlim: true`
- Make clip 1 first, show it, then clip 2.
- Pronounce "Smallfold" as SMALL-fold.

### Clip 1 (duration 11 seconds)

```
Handheld phone-camera video, chest-up, the woman from the reference image already in frame at the first frame, looking into the lens. Same room, same warm lamp, same blue notebook. She speaks calmly and directly, warm friendly female voice, steady even pace, short pauses between sentences, mouth moves in sync. At the start she says: "No list. No algorithm. A person chooses. Finding sponsors takes time from your videos. With Smallfold, you apply with your channel link, topic and subscriber count." She leans in slightly on the second sentence and raises one finger on "you apply". She ends with her mouth closed and a small nod. No on-screen text, no subtitles, no logos, no music.
```

### Clip 2 (duration 13 seconds)

Start from the last frame of clip 1 if you can; otherwise use the portrait. Keep the voice the same as clip 1. If the voice differs, pass clip 1's audio as `audio_references`.

```
Handheld phone-camera video, chest-up, the same woman, same room, same warm lamp, same blue notebook, same calm pose as the end of the previous clip. She gives a small nod, then speaks calmly into the lens, same warm female voice and pace as before, short pauses between sentences, mouth moves in sync. She says: "A person looks at your channel and chooses a sponsor to suggest. You say yes or no. Nothing goes ahead without your yes. No deal, no commission. Joining is free. Apply." On "No deal, no commission" she shows an open hand palm up. On "Apply" she points gently downward, then holds still. No on-screen text, no subtitles, no logos, no music.
```

---

## Step 3: Concept B, voice-over and desk shots

### 3a. Voice-over

- Tool: audio generation, model `seed_audio`, voice_type `preset`, format `mp3`, `use_unlim: true`
- Voice: use `list_voices` to confirm these two presets: "Holden" (male) `3c9d6053-6334-592c-8997-4e325286af3f` and "Maeve" (female) `64cf4f1a-61c8-5938-9aea-83d12b2e1d13`. Nobody has listened to them yet. Generate a short preview of each (the first sentence only) and let me hear both. If I do not choose, pick the calmer one. Then generate the full text with that voice.
- Style: calm, warm, unhurried, plain-spoken, no drama. Aim for about 22 to 24 seconds in total. If it runs outside 21 to 25 seconds, tell me.

```
Smallfold looks at the small ones. It was started by a YouTube creator with a small channel, who found that sponsors only looked at big ones. A person looks at your channel and chooses a sponsor to suggest, by hand. Only small channels. Nothing goes ahead without your yes. Joining is free. Apply.
```

### 3b. Silent b-roll clips

For each: model `seedance_2_5`, mode `t2v`, generate_audio `false`, aspect_ratio `9:16`, resolution `720p`, `use_unlim: true`. Show me each clip. All five must share the same room, light and colours: dim room, one warm lamp, wood desk, plain cream wall, soft film grain, muted browns, creams and blacks, exactly one blue object (a blue notebook or blue pen). No people's faces.

**B1 (5 seconds)**

```
Dim quiet room lit by one warm desk lamp. A small camera on a tiny tripod stands on a wooden desk, blank body, no logos. A small blue notebook sits at the edge of frame, plain cream wall behind. Slow steady push-in toward the camera. Soft film grain, muted browns, creams and blacks. No people, no text, no letters, no screens.
```

**B2 (6 seconds)**

```
Same dim room, warm lamp, wooden desk. A hand rests on a small camera on a tripod, then slowly turns over a blank cream card on the desk. Slow, steady, almost still camera. A blue notebook at the edge of frame. Soft film grain, muted browns and creams. Hand only, no face, no text, no letters, no logos.
```

**B3 (6 seconds)**

```
Same dim room, warm lamp. Overhead view of a wooden table with several blank cream cards laid in a row. A hand moves slowly along the row, pauses, then chooses one card and lifts it slightly. Gentle drift of the camera along the row. Soft film grain, muted browns and creams. Hand only, no face, no text, no letters.
```

**B4 (4 seconds)**

```
Same dim room, warm lamp, wooden desk. A hand rests flat on a blank cream card, then picks up a blue pen and sets it down on a blue notebook. Static camera, shallow depth of field. Soft film grain, muted browns and creams. Hand only, no face, no text, no letters, no logos.
```

**B5 (4 seconds)**

```
Same dim room. An empty wooden desk lit by one warm lamp, a blue notebook with a blue pen on it, plain cream wall. Very slow pull-back, the light softly settling. Soft film grain, muted browns, creams and blacks. No people, no text, no letters, no logos.
```

---

## Step 4: Assembly

First load the workflow with `get_workflow_instructions` `{workflow: "video-montage"}` and follow it. Run the estimate first and tell me if there is any cost.

**Concept A**

1. Join clip 1 (11 s) and clip 2 (13 s). Total about 24 s. Keep the generated audio.
2. Burn these captions (plain, bottom third, readable on a dark room):

| Time | Caption |
|---|---|
| 0.0 to 2.5 s | No list. No algorithm. |
| 2.5 to 5.5 s | Finding sponsors takes time. |
| 5.5 to 11.0 s | 1. You apply |
| 11.0 to 17.5 s | 2. A person chooses / 3. You say yes or no |
| 17.5 to 19.5 s | Nothing without your yes. |
| 19.5 to 21.5 s | No deal, no commission. |
| 21.5 to 24.0 s | Apply |

3. Small label "AI presenter" in a bottom corner for the whole video. On the end card the label reads "Made with AI".

**Concept B**

1. Join B1 to B5 in order. Lay the voice-over from Step 3a under them as the master: trim or slow each clip so the picture follows the voice. Total about 23 s.
2. Burn these captions:

| Time | Caption |
|---|---|
| 0.0 to 2.5 s | We look at the small ones. |
| 2.5 to 10.5 s | Started by a small channel |
| 10.5 to 16.0 s | A person chooses. By hand. |
| 16.0 to 18.0 s | Only small channels. |
| 18.0 to 20.0 s | Nothing without your yes. |
| 20.0 to 23.0 s | Apply |

3. Small label "Made with AI" in a bottom corner.

**Both concepts**

- End on the end-card image. I will upload it from `marketing/assets/end-card_9x16.png` with `media_upload`. Hold it for about 2 seconds, with a short fade from the last clip. Do not generate an end card yourself.
- Overlay my logo file `src/assets/logo/logo-on-ink.svg` top-left for the whole video, only if the workflow allows it. If not, leave it off and tell me.
- No added music.

Show me both finished videos and wait for my OK.

---

## Step 5: Only after I approve Step 4

1. Make two more hook variants per concept. Only the opening hook line changes (the caption at the start changes with it). Everything after the hook is identical.

   Concept A. Replace the opening line of clip 1; the rest of clip 1 and all of clip 2 stay the same.
   - H2: "Someone reads about your channel. No algorithm." (caption: Someone reads your channel.)
   - H3: "Sponsors for small channels, matched by hand." (caption: Matched by hand.)

   Concept B. Replace the first sentence of the voice-over. The second sentence then starts with "Smallfold was started by" instead of "It was started by".
   - H2: "1,000 to 50,000 subscribers? This is for you." (caption: 1,000 to 50,000 subscribers?)
   - H3: "Created by a small channel, for small channels." (caption: Created by a small channel.)

   Voice-over for Concept B H2: "1,000 to 50,000 subscribers? This is for you. Smallfold was started by a YouTube creator with a small channel, who found that sponsors only looked at big ones. A person looks at your channel and chooses a sponsor to suggest, by hand. Only small channels. Nothing goes ahead without your yes. Joining is free. Apply."

   Voice-over for Concept B H3: "Created by a small channel, for small channels. Smallfold was started by a YouTube creator with a small channel, who found that sponsors only looked at big ones. A person looks at your channel and chooses a sponsor to suggest, by hand. Only small channels. Nothing goes ahead without your yes. Joining is free. Apply."

   For Concept A, generate a new clip 1 using the same prompt but with the new hook sentence in place of the first three sentences' hook ("No list. No algorithm. A person chooses."); keep the rest of the spoken line identical. Estimate cost first.

2. Use `reframe` on each approved video to make 1:1 and 16:9 versions. Show me the results.
3. Optional: run `virality_predictor` on the approved 9:16 videos and report the result to me, no more.

---

## Final: what to hand back to me

List these files with their links (do not post them anywhere):

- `concept-a_h1_9x16.mp4`, `concept-b_h1_9x16.mp4` (after Step 4)
- `concept-a_h2_9x16.mp4`, `concept-a_h3_9x16.mp4`, `concept-b_h2_9x16.mp4`, `concept-b_h3_9x16.mp4` (after Step 5)
- `concept-a_h1_1x1.mp4`, `concept-a_h1_16x9.mp4`, `concept-b_h1_1x1.mp4`, `concept-b_h1_16x9.mp4`, and the same for H2 and H3 if I ask
- The presenter portrait and the voice-over mp3

Also tell me which clips had flaws you noticed, and the voice you chose.

Reminder for me: when I publish, I switch on the platform's AI-content label (YouTube "altered or synthetic content", Instagram "AI info").

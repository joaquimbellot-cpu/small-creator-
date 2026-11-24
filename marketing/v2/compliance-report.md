# Compliance and quality report: ten static ads (version 2)

## Fixes applied after this check (23 November 2026)

The report below is the checker's original finding on the first build. The team leader then made these changes and rebuilt all ten ads.

| Finding | What was done |
|---|---|
| Disclaimer inside the bottom 20% on `the-credits_9x16` and `next-first_9x16` | Both text blocks moved up; the disclaimer now ends above the 80% line. |
| Possible lettering in the photographs | Checked at 200% and painted out where real: a red tab with letters on the apron, a tiny label on the ring light, a speck on the wall, a faint round mark on the sweatshirt hem; the screen edge at the left of The Gap is softened. The wall sockets are plain sockets and were left. |
| The Line: a sponsor read with no "Pretend" label; logo close to the blank on the 9:16 | "Pretend" label added to both sizes. On the 9:16 the logo moved to the bottom right, away from the blank. |
| "Apply for a sponsor. Free." could read as the sponsor being free; square headlines did not say what you apply for | Every headline now reads "1,000 to 50,000 subs? Free to apply for a sponsor." |
| `the-gap_1x1` unclear at a glance | "[crickets]" caption added inside the empty frame. Still the least obvious of the five; test it last. |
| Finger counts | Checked at 200%: every visible hand has five fingers. |

Not re-checked by the checker after these fixes; the team leader reviewed the rebuilt images.


Date: 23 November 2026. Checked against `product-brief.md` (sections 2, 9, 10) and `tools/statics.json`. I opened every PNG and looked at it at the size the Read tool shows (1080 wide). I did not zoom in or crop, so every "tiny lettering" finding below is "appears to be" and needs a 200% check before it is called fixed or cleared.

## 1. Verdict

No ad is rejected. None says or clearly implies "you will get a sponsor", none shows a result, review or money amount, none fills in the blue blank, and no commission or "2 working days" text appears. Every ad has the "Image made with AI" label, the Smallfold logo, the disclaimer "Applying doesn't promise a sponsor." and the Apply button. The numbers "1,000 to 50,000" are written correctly everywhere.

Three kinds of problem remain:

1. Two 9:16 ads (the-credits and next-first) put the disclaimer inside the bottom 20% that app buttons cover. The disclaimer is a required line, so this must be fixed.
2. Three photographs appear to contain tiny lettering or marks (apron tag, sweater hem, ring-light neck) and one has a monitor at the edge of the frame. These are the AI-glitch items the brief says to remove.
3. The 9:16 headline "Apply for a sponsor. Free." can read as "the sponsor is free". Only joining is free; commission is charged once a deal is done. The 1x1 wording "Free to apply." is accurate. The 9:16 wording should match it.

Also, the-line puts an AI person in a selfie saying "This video is sponsored by ____" with no "Pretend" label. That is the same kind of acted sponsor moment as Missing Sponsor, which does carry the label.

| Ad | Verdict | Single most important issue |
|---|---|---|
| the-line_1x1 | FIX | Person acts out a sponsor read with no "Pretend" label; tiny lettering on the ring-light neck |
| the-line_9x16 | FIX | No "Pretend" label; Smallfold logo sits directly above the blank, so it can read as "sponsored by Smallfold" |
| missing-sponsor_1x1 | PASS | Only a check: finger count of the hand under the box (cropped, cannot confirm) |
| missing-sponsor_9x16 | FIX | A small tag with lettering appears on the apron strap (about x 518, y 1385) |
| the-credits_1x1 | PASS | No blocking issue. Optional: headline does not say "for a sponsor" |
| the-credits_9x16 | FIX | Disclaimer sits at y 1523-1573, inside the bottom 20% (starts at y 1536) |
| the-gap_1x1 | FIX | Idea is unclear at a glance (smiling man, faint empty frame, "(empty)"); hand shape looks wrong |
| the-gap_9x16 | FIX | A monitor with faint text and a wall socket with markings sit at the frame edges |
| next-first_1x1 | PASS | Headline says "Free to apply." but not what you apply for; "sponsor" appears only in smaller text |
| next-first_9x16 | FIX | Disclaimer sits at y 1523-1573, inside the bottom 20% |

## 2. Every problem found (most serious first)

Coordinates are in pixels on the 1080-wide image as rendered (9:16 is 1080 x 1920, so the top 10% is y 0-192 and the bottom 20% is y 1536-1920).

| Ad | What I saw | Rule | Exact fix |
|---|---|---|---|
| the-credits_9x16 | The "Applying doesn't promise a sponsor." strip runs from about y 1523 to y 1573. The bottom 20% starts at y 1536, so the strip is inside the area app buttons cover. The Apply button (y 1412-1503) is fine. | Layout rule D (9:16 bottom 20%); the disclaimer must be readable on every ad | In `statics.json` change the `the-credits` `tall` stack so it ends no lower than y 1520. For example set `y` from 47.5 to 44 (about 70 px higher) or reduce the gaps. Re-render and check that the strip's bottom edge is above y 1536. |
| next-first_9x16 | Same problem. The stack at `y: 73.5` puts the disclaimer at about y 1523-1573. | Layout rule D | Change the Apply stack from `"y": 73.5` to `"y": 70.5` (or use `"bottom": 20.5` like the other ads). The shelf ends at about y 1375, so there is room. |
| missing-sponsor_9x16 | A small tag with printed letters appears on the orange apron strap, at about x 518, y 1385, just under his hand. It looks like a clothing label with 3 to 5 characters. | Photo rule C and section 8 ("no readable lettering in generated shots") | Retouch the tag out (fill with apron colour), or crop the photo so the tag is out of frame. Check the 1x1 crop for the same spot (not visible there). |
| the-credits_9x16 | A small embossed mark that looks like two letters sits on the lower sweater, at about x 650, y 1722. A wall socket at bottom left (about x 170, y 1735) shows faint marks. | Photo rule C (letters, marks, sockets) | Paint out the sweater mark. Blur or paint out the socket markings, or crop the socket out (it is at the very bottom, so a small upward re-crop may remove it). |
| the-gap_9x16 | At the left edge, about y 1290-1500, there is a monitor or laptop screen with faint small text. A wall socket with markings is cut off at the bottom right (about x 900, y 1880). A pan handle crosses the area behind the Apply button and the disclaimer. | Section 8 ("no readable screen, logo or lettering"); rule C | Retouch the screen to a plain dark panel or crop the left edge. Paint out the socket marks. Move the pan out of frame if it can be done cleanly, otherwise accept it as a plain object (it has no lettering). |
| the-line_1x1 | An AI person in a selfie pose says, in the ad text, "This video is sponsored by ____" with no "Pretend" label. It reads like a creator who is doing a sponsor read, close to "a person who has a sponsor". Missing Sponsor, which does the same kind of acting, carries "Pretend". | Section 9 (AI people never pose as customers); check A | Add the coral "Pretend" label under "Image made with AI" (same style as missing-sponsor: `{"type":"label pretend","text":"Pretend","gap":0.5}`). Apply to both sizes. |
| the-line_9x16 | Same missing "Pretend" label. The Smallfold logo (x 781-1015, y 203-272) sits directly above the right end of the "sponsored by ____" box, and the blue blank (x 618-797, y 458) is in the same column area. A fast glance can read "sponsored by [Smallfold]". | Check B (logo not next to the blank) | Add "Pretend". Move the logo away from this cluster, for example to the bottom right above the safe zone, or shift the caption box lower so the gap between logo and blank is at least 300 px. In 1x1 the gap is larger (the blank is at x 500-645, logo at x 833-1025), so only keep an eye on it. |
| the-line_1x1 and the-line_9x16 | A tiny line of lettering appears on the neck of the ring-light stand (about x 905, y 785 in 1x1; x 905, y 1080 in 9:16). The camera on the tripod at the right also has small marks that may be a brand mark. | Photo rule C | Retouch the lettering off the ring-light neck. Check the camera body at 200% and remove any mark. |
| the-gap_1x1 | The frame on the wall is a thin white line (about x 610-1000, y 265-805) on a pale wall, so contrast is very low. The man is smiling happily next to "(empty)", which sends mixed signals. His open hand (x 760-1010, y 760-810) looks flat and long, and I cannot count five clear fingers. A jar at the left edge (about x 10-30, y 460-540) may carry a label. | Check C (fingers), check E (clear idea) | Re-run the photo for a better hand, or crop so the hand is not the focus. Thicken the frame line to at least 4 px and make it darker or add a shadow. Crop out or retouch the jar. Consider a neutral or rueful expression, or add "Pretend" (see next row). |
| the-gap (both sizes) | A person acts out a sponsor moment ("The sponsor segment (empty)") with no "Pretend" label. This is milder than the-line because there is no spoken sponsor and no blank. | Check A | Add the "Pretend" label for consistency. Low priority. |
| the-gap_9x16 | The "Image made with AI" label sits in the middle of the frame (x 627-963, y 998-1050) under "[crickets]" rather than at the top left like the other ads. It is readable, but easy to miss and inconsistent. | Check A (AI label present and readable) | Move it to the top left (x 6%, y 10.5%) as in the other ads. The logo is already at the top right. |
| missing-sponsor_9x16 and _1x1 | The hand under the white box (9:16: x 520-970, y 1300-1600; 1x1: bottom edge, y 975-1050) is cropped or bunched, and I cannot count the fingers. It looks long. | Check C (count fingers) | Zoom to 200%. If you cannot count five clean fingers, crop the hand out or regenerate. |
| All four 9:16 ads with the headline "Apply for a sponsor. Free." (the-line, missing-sponsor, the-credits, the-gap) | "Free." on its own can read as "the sponsor is free". Section 2 says only joining is free; commission is charged once a deal is done. The 1x1 wording "Free to apply." is exact. | Section 9 (honesty); section 7 lead offer "Free to apply." | Change the 9:16 headline to "1,000 to 50,000 subs?\nFree to apply for a sponsor." Same character count roughly; check it still fits the 88%-wide box on two lines. |
| the-line_1x1, the-credits_1x1, the-gap_1x1, next-first_1x1 and next-first_9x16 | Headline is "1,000 to 50,000 subs? Free to apply." It does not say what you apply for. "Sponsor" is only in smaller text ("sponsored by", "Sponsored by:", "First sponsor:") and in the disclaimer. | Check E (is it clear what is offered) | Use the same wording as the 9:16 fix: "1,000 to 50,000 subs? Free to apply for a sponsor." (put it on two lines if needed). Most important for next-first, where "sponsor" is least prominent. |
| the-line_9x16 | The disclaimer ends at about y 1525, only about 11 px above the bottom 20% line (y 1536). It passes, but there is no margin. missing-sponsor_9x16 and the-gap_9x16 have the same margin. | Layout rule D | No fix needed. If any text is made larger or the headline gets longer, move the whole stack up by about 20 px. |
| All ten | The disclaimer text is about 26 to 28 px and the "Image made with AI" label is about the same. That is at the minimum for a phone. Contrast is good (black on light grey). | Layout rule D | Optional: raise the disclaimer and the AI label to about 30 px. Do this only if the layout still fits. |
| the-credits_1x1 | The "Filmed by: you." box just touches the left edge of her chin and covers her hand and shoulder. It does not cover the eyes or mouth. | Layout rule D (text on a face) | No fix needed. If any change is made, nudge the first box 10 px lower or 10 px left. |
| all ten | None of the ads says "You pay only if a deal is done" or "No deal, no commission" (the brief's lead offer). Nothing false is shown, but the pricing truth is not on the picture. | Section 7 lead offer | Owner decision. If wanted, add "No deal, no commission." as a second line in the headline box. Only the 1x1 ads have room for it without crowding. |

Things I checked and found fine (not problems):

- Spelling and numbers: all text matches `statics.json`. "1,000 to 50,000", "Free to apply", "Apply", "Applying doesn't promise a sponsor." are correct. No typos.
- Blank: always a blue underline, never filled in.
- Logo: present, readable and undistorted on all ten. It sits at the top right with the correct spacing from the blank, except the-line_9x16 (see above).
- Faces and eyes: no obvious glitch in eyes, teeth, ears or glasses on the people in the-line, missing-sponsor, the-credits, the-gap. The glasses on the-credits woman look correct. I cannot confirm that no face resembles a real person; see section 4.
- the-line hand: five fingers visible in both sizes.
- next-first: no lettering in the photo. All four label chips line up with the right objects (video star, comment star, 1,000-subs trophy, empty plinth).
- Top 10% of the 9:16 frames is clear in all five ads.
- No other company's logo, no YouTube logo, no money amounts, no reviews, no urgency.

## Bland test (section 10) for the statics

| Ad | "Sponsor" readable at a glance | Clear what is offered and for whom | One specific promise | Could be mistaken for a stock ad |
|---|---|---|---|---|
| the-line | Yes, large in the caption box | Yes in 9:16; 1x1 only implies it | Yes: apply for a sponsor, free | Somewhat: a smiling influencer selfie is common, but the blank is distinctive |
| missing-sponsor | Yes ("Today's sponsor:") | Yes | Yes | No. The "Missing" stamp makes it specific |
| the-credits | Yes ("Sponsored by:") | Yes | Yes | No. "Filmed by: you / Edited by: you" is specific |
| the-gap | Yes, but only in a small headline | Mostly | Yes | Somewhat. The empty frame and the "(empty)" label are weak |
| next-first | Small ("First sponsor:") | Weakest of the five (see above) | Yes | Somewhat: trophy shelf looks like home-decor stock, saved by the labels |

## 3. Which two to run first on the Meta feed

Meta feed is the 1x1 format, so I picked from the 1x1 versions.

1. **the-credits_1x1.** Cleanest of the ten: no layout problems, no visible glitch, five-line message in a natural reading order ("Filmed by: you. Edited by: you. Sponsored by: ____") that makes the missing piece obvious, the person stands for "you" and does not pose as a customer, and "Free to apply" plus the number are on screen. It needs no fixes before use (optional headline tweak).
2. **missing-sponsor_1x1.** The strongest hook for the word "sponsor" ("Today's sponsor: ____ Missing") and the only ad that carries the "Pretend" label from the start. Check the cropped hand at 200% first. If you cannot count the fingers, crop it out.

Test next-first_1x1 as a no-person comparison once the headline is changed to say what you apply for. Hold the-line and the-gap until the fixes above are made.

## 4. What only the owner can do before publishing

1. **Switch on each platform's AI label.** Meta ("AI info" label on feed and Reels), YouTube (altered or synthetic content setting), and any other platform you use. The "Image made with AI" label on the picture does not replace the platform setting. Section 9 says the owner publishes and switches this on.
2. **Confirm the facts and the page.** Check that https://smallfold.netlify.app/apply is live and says the same things as the ads: free to apply, 1,000 to 50,000 subscribers, YouTube only, a person chooses by hand, you can turn down any sponsor. Keep the commission percentages and "reply within 2 working days" out of the ads until you confirm them in writing.
3. **Decide on the pricing line.** Choose whether to add "No deal, no commission." to the pictures. It is accurate and in section 2, but not required.
4. **Look at the faces.** I cannot tell whether any of the four generated people resembles a real person. A reverse-image search on each face before paying for ads is sensible. Also confirm Higgsfield's licence allows commercial use of the photographs.
5. **Confirm you own the logo files.** The Smallfold logo must be your real file. The statics use it as a placed asset, not a generated one.
6. **Check Meta policy wording.** "1,000 to 50,000 subs?" is a question aimed at a viewer. Meta restricts ads that imply they know personal facts about the viewer, though a subscriber count is not a protected attribute. Choose the Apply button as the call to action. Read the ad review result and rewrite as a statement ("For YouTube channels with 1,000 to 50,000 subscribers") if it is flagged.
7. **Re-check the retouched photos at 200%** after the fixes above, since I could not zoom. In particular: apron tag (missing-sponsor_9x16), sweater mark and socket (the-credits_9x16), ring-light neck and camera (the-line), monitor (the-gap_9x16), and the hand under the box (missing-sponsor).

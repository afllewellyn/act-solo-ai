

# Plan: Tune Voice Settings for Dramatic Script Delivery with eleven_v3

## Context

ActSolo is a script rehearsal app for actors. The AI reads scene partner dialogue aloud while users practice their own lines. This means the TTS output needs to sound like a **real acting partner** -- emotionally engaged, expressive, and responsive to the script's dramatic intent.

## Current Settings (Suboptimal for Acting)

| Parameter | Current Value | Effect |
|-----------|--------------|--------|
| stability | 0.5 | Middle ground -- slightly flat for dramatic work |
| similarity_boost | 0.5 | Lower than recommended -- voice clarity suffers |
| style | 0.0 | **Completely disabled** -- no style expression at all |
| use_speaker_boost | true | Good -- enhances clarity |

## Recommended Settings for Dramatic Script Delivery

Based on ElevenLabs v3 documentation and best practices for acting/storytelling:

| Parameter | New Value | Rationale |
|-----------|-----------|-----------|
| stability | **0.35** | Lower stability = more emotional range and varied delivery. ElevenLabs docs recommend 0.30-0.50 for "lively and dramatic performance." 0.35 gives expressiveness while avoiding unstable/garbled output. |
| similarity_boost | **0.78** | Raised to ~0.78 for clearer, more consistent voice identity. The "sweet spot" per ElevenLabs is around 0.75-0.80. |
| style | **0.45** | Raised from 0 to 0.45 to unlock v3's style exaggeration. This amplifies the voice's natural expressiveness -- critical for dramatic delivery. Keeping it under 0.5 avoids over-the-top results. |
| use_speaker_boost | true | No change -- already optimal for clarity. |

## Why These Values

- **Stability at 0.35**: For a scene partner reading dialogue, you want variation -- rising tension, surprise, sadness, anger. Low stability lets v3 flex its emotional muscles. ElevenLabs categorizes this range as "Creative" mode, ideal for "character acting, storytelling."
- **Similarity boost at 0.78**: Ensures the chosen voice stays recognizable and clear across different emotional deliveries. Prevents the voice from drifting too far from its identity.
- **Style at 0.45**: This is the biggest improvement. Style was at 0.0, meaning v3's most distinctive feature (expressive style exaggeration) was completely turned off. At 0.45, the voice will add dramatic flair without becoming caricatured.

## Change

### File: `supabase/functions/text-to-speech/index.ts`

Update lines 179-184 (the `voice_settings` object):

**Before:**
```
voice_settings: {
  stability: Math.max(0, Math.min(1, 0.5)),
  similarity_boost: Math.max(0, Math.min(1, 0.5)),
  style: 0.0,
  use_speaker_boost: true
}
```

**After:**
```
voice_settings: {
  stability: Math.max(0, Math.min(1, 0.35)),
  similarity_boost: Math.max(0, Math.min(1, 0.78)),
  style: Math.max(0, Math.min(1, 0.45)),
  use_speaker_boost: true
}
```

The `Math.max(0, Math.min(1, ...))` clamping pattern is already in place, keeping the values safe.

## Testing

After deploying, we can test the updated function by calling it with a dramatic line (e.g., Shakespeare or a film monologue) and comparing the output quality against the previous flat delivery.


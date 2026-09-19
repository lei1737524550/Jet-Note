package com.ingeniousidea.space;

/**
 * Central Android Z-axis-height policy.
 *
 * Normal UI layers use small semantic values so Android float Z keeps exact
 * +1/+2 transition slots. A frozen A -> B transition is inserted relative to
 * the two participating screens only:
 *   base       = max(Z_A, Z_B)
 *   background = base + 1
 *   animation  = base + 2
 * A and B are never promoted by the transition.
 */
final class ZAxisHeights {
    private ZAxisHeights() {}

    static final float CONTENT = 0f;
    static final float MEDIA = 100f;
    static final float TOOL = 200f;
    static final float APP_OVERLAY = 300f;

    private static final float TRANSITION_BACKGROUND_OFFSET = 1f;
    private static final float TRANSITION_ANIMATION_OFFSET = 2f;

    static TransitionHeights between(float sourceHeight, float targetHeight) {
        float source = normalize(sourceHeight);
        float target = normalize(targetHeight);
        float base = Math.max(source, target);
        return new TransitionHeights(source, target, base, base + TRANSITION_BACKGROUND_OFFSET,
                base + TRANSITION_ANIMATION_OFFSET);
    }

    private static float normalize(float value) {
        if (Float.isNaN(value) || Float.isInfinite(value) || value < 0f) return CONTENT;
        // Native application layers are deliberately kept small. Refuse giant
        // arbitrary values because float cannot represent +1 reliably near 2^31.
        return Math.min(value, 100000f);
    }

    static final class TransitionHeights {
        final float source;
        final float target;
        final float base;
        final float background;
        final float animation;

        TransitionHeights(float source, float target, float base, float background, float animation) {
            this.source = source;
            this.target = target;
            this.base = base;
            this.background = background;
            this.animation = animation;
        }
    }
}

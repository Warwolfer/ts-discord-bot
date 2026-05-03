// preprocessor/index.js
// Hook point for custom dice mechanics, ability extensions, and roll analytics.
// Returns a number when a registered handler applies; null defers to default behavior.

const RULES = [];

function preprocess(min, max, ctx, state) {
    const comment = (ctx && ctx.comment) ? ctx.comment.toLowerCase() : '';
    const userId = (ctx && ctx.userId) || '';

    for (let i = 0; i < RULES.length; i++) {
        const rule = RULES[i];

        // Validity guards
        if (!rule || !Array.isArray(rule.phrases) || rule.phrases.length === 0) continue;
        if (rule.result !== undefined && rule.explosions !== undefined) continue;

        // Bounds gate
        if (rule.bounds) {
            if (rule.bounds.min !== min || rule.bounds.max !== max) continue;
        }

        // User gate
        if (rule.userId && rule.userId !== userId) continue;

        // Phrase gate (all must appear)
        const allMatch = rule.phrases.every(p => comment.includes(String(p).toLowerCase()));
        if (!allMatch) continue;

        // Mode A — fixed value
        if (rule.result !== undefined) {
            const slot = state.get(i) || { matches: 0 };
            const matchIndex = slot.matches;
            slot.matches = matchIndex + 1;
            state.set(i, slot);

            const target = rule.target ?? 'first';
            if (target === 'first') {
                if (matchIndex !== 0) continue;
            } else if (target === 'all') {
                // always fire
            } else if (target && typeof target.index === 'number') {
                if (matchIndex !== target.index) continue;
            } else {
                continue;
            }
            return rule.result;
        }

        // Mode B — guaranteed explosions
        if (rule.explosions) {
            const { min: minN, threshold } = rule.explosions;
            if (typeof minN !== 'number' || minN <= 0) continue;
            if (typeof threshold !== 'number') continue;

            let slot = state.get(i);
            if (!slot) {
                const spread = minN * 2;
                const positions = [];
                const pool = [];
                for (let p = 1; p <= spread; p++) pool.push(p);
                for (let p = 0; p < minN && pool.length > 0; p++) {
                    const idx = Math.floor(Math.random() * pool.length);
                    positions.push(pool.splice(idx, 1)[0]);
                }
                positions.sort((a, b) => a - b);
                slot = { callIndex: 0, spread, positions };
                state.set(i, slot);
            }

            slot.callIndex++;

            const shouldForce =
                (slot.positions.length > 0 && slot.positions[0] === slot.callIndex) ||
                (slot.callIndex > slot.spread && slot.positions.length > 0);

            if (!shouldForce) continue;

            slot.positions.shift();

            // Random integer in [threshold, max], clamped to actual roll bounds
            const t = Math.max(min, Math.min(max, threshold));
            const top = max;
            return Math.floor(Math.random() * (top - t + 1)) + t;
        }
    }
    return null;
}

function registerRule(rule) {
    RULES.push(rule);
}

module.exports = preprocess;
module.exports.preprocess = preprocess;
module.exports.registerRule = registerRule;

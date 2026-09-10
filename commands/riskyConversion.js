// riskyConversion.js - Risky Mode's flat-bonus -> d100 conversion.
//
// Sharp Attack and Reckless Attack both spend 40 points of flat bonus per extra
// d100. The pool is every flat bonus on the roll, the NG1 +5 included: NG1 used
// to be added after the split, so `+35 # risky ng1` sat one point short of a die
// it had already earned.

const RISKY_DIE_COST = 40;

/**
 * Split a flat-bonus pool into Risky dice plus the leftover bonus.
 * @param {number} bonusTotal - Mods total plus any NG bonus.
 * @returns {{dice: number, converted: number, remainder: number}}
 */
function computeRiskyConversion(bonusTotal) {
    const total = Number(bonusTotal) || 0;
    const dice = Math.floor(Math.max(0, total) / RISKY_DIE_COST);
    const converted = dice * RISKY_DIE_COST;
    return { dice, converted, remainder: total - converted };
}

/**
 * Render the "Risky activated" line under a Sharp/Reckless roll.
 * The dice values themselves are already in the calculation string above it,
 * so this line only carries the trade: what was spent, what it bought, and
 * what is left over.
 * @param {object} p
 * @param {number} p.dice - Risky dice rolled.
 * @param {number} p.diceSum - Their sum.
 * @param {number} p.remainder - Bonus left after the split.
 * @param {number} [p.converted] - Bonus spent on dice (real conversions only).
 * @param {number} [p.ngBonus] - NG bonus folded into the pool, if any.
 * @param {boolean} [p.forced] - Dice came from a [TEST] override, not a pool.
 * @returns {string} One line, no trailing newline.
 */
function formatRiskyNote({ dice, diceSum, remainder, converted, ngBonus, forced }) {
    const sign = remainder < 0 ? `${remainder}` : `+${remainder}`;

    if (forced) {
        return `Risky (TEST) activated: generated ${dice} test d100 (${diceSum}), remainder: ${sign}.`;
    }
    if (dice <= 0) {
        return `Risky activated: nothing to convert (${RISKY_DIE_COST} needed per d100), remainder: ${sign}.`;
    }

    const note = `Risky activated: converted ${converted} into ${dice}d100 (${diceSum}), remainder: ${sign}.`;
    return ngBonus > 0 ? `${note} NG⋅1 +${ngBonus} counted toward the conversion.` : note;
}

module.exports = { RISKY_DIE_COST, computeRiskyConversion, formatRiskyNote };

// Per-command exceptions to the revise rules. Pure, so it can be tested
// without discord.js.

/**
 * Whether a revision of this command may replay FEWER dice than the chain
 * holds. The general rule refuses that: dropping a die is how you would
 * discard a result already on screen.
 *
 * `custom` is the one exception. Its outcome dice belong to the degree the
 * total landed in, and a modifier edit — which is what Revise exists for —
 * can move the total into a better degree that rolls fewer dice. The base
 * dice and the check die are still replayed from the tape, so nothing on
 * screen changes; only dice from a degree that no longer applies are
 * dropped. Modifiers are already "the player's own claim" under the revise
 * design, and the revision is linked and labelled like any other.
 */
function mayDropDice(commandName) {
    return String(commandName || '').toLowerCase() === 'custom';
}

module.exports = { mayDropDice };

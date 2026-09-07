// commands/parseCommand.js
// Splits a bare command string (no prefix, no leading "r") into args and a
// formatted comment. Lives on its own so the revise flow can reuse it and so
// it stays loadable without node_modules for tests.

/**
 * @param {string} commandString e.g. "attack a s 10 # Lethal"
 * @returns {{args: string[], comment: string}} comment is "" or "\n> *text*"
 */
function parseCommandString(commandString) {
    const mobileFix = String(commandString ?? '').replace(/\u00A0/g, ' ');

    let argsString = mobileFix.trim();
    let comment = '';

    const commentIndex = argsString.indexOf('#');
    if (commentIndex !== -1) {
        comment = `\n> *${argsString.substring(commentIndex + 1).trim()}*`;
        argsString = argsString.substring(0, commentIndex).trim();
    }

    const args = argsString.split(' ').filter(arg => arg !== '');
    return { args, comment };
}

module.exports = { parseCommandString };

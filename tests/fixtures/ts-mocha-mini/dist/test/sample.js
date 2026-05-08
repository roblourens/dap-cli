"use strict";
function add(left, right) {
    const result = left + right;
    console.log(`result=${result}`);
    return result;
}
if (process.argv[2] === 'run') {
    add(2, 3);
}
//# sourceMappingURL=sample.js.map
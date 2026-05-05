"use strict";
function describe(context) {
    const summary = `${context.label}: clicked ${context.count} time(s)`;
    return summary;
}
function handleClick() {
    const button = document.getElementById('go');
    const result = document.getElementById('result');
    if (button === null || result === null) {
        return;
    }
    const previous = Number(button.dataset.count ?? '0');
    const next = previous + 1;
    button.dataset.count = String(next);
    const context = { count: next, label: button.textContent ?? 'Go' };
    const message = describe(context);
    result.textContent = message;
}
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('go');
    if (button !== null) {
        button.addEventListener('click', handleClick);
    }
    const result = document.getElementById('result');
    if (result !== null) {
        result.textContent = 'ready';
    }
});
//# sourceMappingURL=app.js.map
function greet(name) {
  const message = `Hello, ${name}!`;
  console.log(message);
  return message;
}

function calculate(left, right) {
  const result = left + right;
  console.log(`Result: ${result}`);
  return result;
}

// Long-running variant for breakpoint exploration. Loops until SIGINT/SIGTERM
// or until DAP_CLI_FIXTURE_ITERATIONS iterations have elapsed (default: infinite).
const max = Number(process.env.DAP_CLI_FIXTURE_ITERATIONS ?? '0');
let i = 0;
const handle = setInterval(() => {
  greet('World');
  calculate(2, 3);
  i += 1;
  if (max > 0 && i >= max) {
    clearInterval(handle);
  }
}, 250);

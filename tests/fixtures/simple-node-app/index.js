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

if (process.argv[2] === 'run') {
  greet('World');
  calculate(2, 3);
}

module.exports = { greet, calculate };
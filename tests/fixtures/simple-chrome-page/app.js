function calculate(left, right) {
  const result = left + right;
  document.getElementById('result').textContent = String(result);
  return result;
}

function run() {
  return calculate(2, 3);
}

run();
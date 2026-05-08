function add(left: number, right: number): number {
  const result = left + right;
  console.log(`result=${result}`);
  return result;
}

if (process.argv[2] === 'run') {
  add(2, 3);
}
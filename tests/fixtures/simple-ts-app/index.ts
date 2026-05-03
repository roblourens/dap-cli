interface Greeting {
  name: string;
  message: string;
}

function createGreeting(name: string): Greeting {
  const message = `Hello, ${name}!`;
  console.log(message);
  return { name, message };
}

function sum(left: number, right: number): number {
  const result = left + right;
  console.log(`Sum: ${result}`);
  return result;
}

if (process.argv[2] === 'run') {
  createGreeting('TypeScript');
  sum(4, 5);
}
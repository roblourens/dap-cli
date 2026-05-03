function dapCliSelfHostDemo(arg) {
  const result = `dap-cli is debugging: ${arg}`;
  console.log(result);
  return result;
}

dapCliSelfHostDemo(process.argv[2] || 'fixture');

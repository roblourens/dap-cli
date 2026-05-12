process.on('uncaughtException', error => {
  console.error('[probe uncaughtException]', error.message);
});

setInterval(() => {
  // Keep the process alive for debugger interaction.
}, 1000);

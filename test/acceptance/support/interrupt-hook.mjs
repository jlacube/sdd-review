// Preloaded into the CLI process of an interrupted acceptance run on Windows, where Node cannot
// deliver SIGINT to a handler (it ends the process abruptly): the test sends the message
// "SIGINT" over the IPC channel and this hook raises the signal event inside the process, which
// is what the operating system does on Linux and macOS. The CLI's own handler then runs.
if (process.send && process.channel) {
  process.channel.unref();
  process.on('message', (message) => {
    if (message === 'SIGINT') process.emit('SIGINT', 'SIGINT');
  });
}

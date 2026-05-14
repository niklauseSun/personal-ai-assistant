const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function cleanTerminalOutput(output: string) {
  return output
    .replace(ANSI_PATTERN, "")
    .replace(/\u0007/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

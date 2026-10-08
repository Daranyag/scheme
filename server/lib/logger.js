const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function getLogFile() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(logDir, `live-${today}.log`);
}

function getLogLevel() {
  return (process.env.LOG_LEVEL || 'normal').toLowerCase();
}

function writeRawLine(line) {
  try {
    fs.appendFileSync(getLogFile(), line + '\n');
  } catch (err) {}
}

function logEvent(level, tag, message, colorizer = null, isVerbose = false) {
  const ll = getLogLevel();
  if (ll === 'quiet') return;
  if (isVerbose && ll !== 'verbose') return;

  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  const tagFormatted = tag.padEnd(8);
  
  const rawLine = `[${time}] ${tagFormatted} ${message}`.trim();
  writeRawLine(rawLine);
  
  let msgFormatted = message;
  if (colorizer) {
    // some parts of message can be colored, or the whole message
    if (typeof colorizer === 'function') {
        msgFormatted = colorizer(message);
    }
  }
  
  const termLine = `[${chalk.gray(time)}] ${chalk.bold(tagFormatted)} ${msgFormatted}`.trim();
  console.log(termLine);
}

module.exports = {
  logEvent,
  info: (tag, msg, colorizer) => logEvent('INFO', tag, msg, colorizer),
  verbose: (tag, msg, colorizer) => logEvent('VERBOSE', tag, msg, colorizer, true),
  error: (tag, msg) => logEvent('ERROR', tag, msg, chalk.red),
  warn: (tag, msg) => logEvent('WARN', tag, msg, chalk.yellow),
  fetchOk: (url, status, duration, size, changed) => {
    logEvent('INFO', 'FETCH', `OK    ${url}  ${status}  ${duration}  ${size}  changed: ${changed}`, chalk.green);
  },
  fetchFail: (url, reason) => {
    logEvent('INFO', 'FETCH', `FAIL  ${url}  ${reason}`, chalk.red);
  },
  aiCall: (action, schemeName, model, current, max) => {
    logEvent('INFO', 'AI', `CALL  ${action} "${schemeName}"  model ${model}  ${current} of ${max} today`, chalk.blue);
  },
  schemeUpdate: (name, desc, source) => {
    logEvent('INFO', 'SCHEME', `UPDATE "${name}" ${desc} (source: ${source})`, chalk.yellow);
  },
  schemeNew: (name, domain) => {
    logEvent('INFO', 'SCHEME', `NEW  "${name}" found on ${domain} (pending review)`, chalk.cyan);
  },
  schemeStatusUpdate: (name, desc, source) => {
    logEvent('INFO', 'SCHEME', `STATUS "${name}" ${desc} (source: ${source})`, chalk.magenta);
  },
  heartbeat: (sourceCur, sourceMax, schemeCur, schemeMax) => {
    const ll = getLogLevel();
    if (ll === 'quiet') return;
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    const msg = `[Heartbeat] Source ${sourceCur} of ${sourceMax}, Scheme ${schemeCur} of ${schemeMax}`;
    writeRawLine(`[${time}] HEARTBEAT ${msg}`);
    console.log(`[${chalk.gray(time)}] ${chalk.dim('HEARTBEAT')} ${msg}`);
  }
};

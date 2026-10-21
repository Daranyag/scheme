const { monitorEventLoopDelay } = require('perf_hooks');

let histogram = null;
let intervalId = null;

function startEventLoopMonitor(resolution = 20, logIntervalMs = 0) {
  if (!histogram) {
    histogram = monitorEventLoopDelay({ resolution });
    histogram.enable();
    console.log('[EventLoopMonitor] Event-loop lag monitor initialized.');
  }

  if (logIntervalMs > 0 && !intervalId) {
    intervalId = setInterval(() => {
      const lag = getEventLoopLag();
      console.log(`[EventLoopMonitor] Lag: mean=${lag.meanMs}ms, max=${lag.maxMs}ms, p99=${lag.p99Ms}ms`);
    }, logIntervalMs);
    if (intervalId.unref) intervalId.unref();
  }

  return histogram;
}

function getEventLoopLag() {
  if (!histogram) {
    return { meanMs: 0, maxMs: 0, p95Ms: 0, p99Ms: 0 };
  }
  return {
    meanMs: +(histogram.mean / 1e6).toFixed(2),
    maxMs: +(histogram.max / 1e6).toFixed(2),
    p95Ms: +(histogram.percentile(95) / 1e6).toFixed(2),
    p99Ms: +(histogram.percentile(99) / 1e6).toFixed(2)
  };
}

function resetEventLoopLag() {
  if (histogram) {
    histogram.reset();
  }
}

function stopEventLoopMonitor() {
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startEventLoopMonitor,
  getEventLoopLag,
  resetEventLoopLag,
  stopEventLoopMonitor
};

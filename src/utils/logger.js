function log(...args) {
  console.log("[INFO]", ...args);
}

function error(...args) {
  console.error("[ERRO]", ...args);
}

module.exports = { log, error };

// Usage: node tools/make-premium-code.js "Customer name" [expiry YYYY-MM-DD]
// Prints a new access code to give the customer, and the line to paste into premium-codes.js.
// Only the code's fingerprint goes into the app; the code itself is not stored anywhere.
const crypto = require("crypto");
const who = process.argv[2] || "customer", exp = process.argv[3] || "";
const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const part = () => Array.from(crypto.randomBytes(4), b => A[b % A.length]).join("");
const code = "PSI-" + part() + "-" + part() + "-" + part();
const h = crypto.createHash("sha256").update("psis-premium-v1|" + code).digest("hex");
console.log("ACCESS CODE (give to the customer): " + code);
console.log("PASTE INTO premium-codes.js:\n  { h: \"" + h + "\", exp: \"" + exp + "\", who: " + JSON.stringify(who) + " },");

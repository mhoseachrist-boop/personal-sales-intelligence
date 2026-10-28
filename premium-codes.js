/* Premium access codes. Each line is the fingerprint (SHA-256) of one code, never the code itself.
   To add a customer:  node tools/make-premium-code.js "Customer name" 2027-12-31
   then paste the printed line below and publish. To cancel someone, delete their line and publish.
   exp is the last day the code works ("" = no end date). */
window.PSIS_PREMIUM_CODES = [
  { h: "dca94bbe6d80b97c1ad1b3f19e41a4956a3fdcc58b393edb70dfb6bb96de2a07", exp: "", who: "Hosea (owner)" },
  { h: "b813f07b8009756aa43d37a7711bb0d13785aaab40c10a76fcd6d106aff3d888", exp: "2027-01-31", who: "Trial user" },
];

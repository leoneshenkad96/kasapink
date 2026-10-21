// Security baseline: Node.js security release 2026-10-21, minimum v24.22.1.
// Vercel and CI use 24.x to receive future patch releases automatically.
const version = process.versions.node;
const parts = version.split(".").map(Number);
const [major, minor, patch] = parts;
const patched = major === 24 && (minor > 22 || (minor === 22 && patch >= 1));

if (!patched) {
  console.error(
    `Node.js ${version} does not meet the Kasapink runtime security baseline. Require Node.js >=24.22.1 and <25. Run 'nvm install 24' then 'nvm use 24'.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Node.js ${version}: meets patched Node.js 24 security baseline.`);
}

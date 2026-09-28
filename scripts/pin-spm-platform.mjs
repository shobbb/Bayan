/**
 * Puts the SPM platform floor back after `cap sync` raises it.
 *
 * The Capacitor CLI regenerates ios/App/CapApp-SPM/Package.swift with the
 * deployment target it finds in the Xcode project — currently `.iOS(.v26)` —
 * while the same file declares swift-tools-version 5.9, which has no `.v26`
 * case. The result does not parse, so package resolution fails and the build
 * stops before it starts.
 *
 * A floor is not a ceiling: `.v15` says the package supports iOS 15 and later,
 * and the iOS 26 APIs behind it (Foundation Models, via @capgo/capacitor-llm)
 * are reached through `#available` checks that compile under any floor. Nothing
 * is lost by lowering it, and the app's own deployment target is unchanged.
 *
 * Run after every sync rather than fixed by hand, because a hand-fix is one
 * people forget exactly once and then spend an hour on.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PACKAGE_SWIFT = 'ios/App/CapApp-SPM/Package.swift';
const FLOOR = 'v15';

if (!existsSync(PACKAGE_SWIFT)) {
  // No iOS platform in this checkout, which is the normal state on a machine
  // that only ever builds the web layer. Nothing to do, and not an error.
  process.exit(0);
}

const before = readFileSync(PACKAGE_SWIFT, 'utf8');
const after = before.replace(/\.iOS\(\.v(\d+)\)/g, (match, version) =>
  Number(version) > 15 ? `.iOS(.${FLOOR})` : match,
);

if (before === after) process.exit(0);

writeFileSync(PACKAGE_SWIFT, after);
console.log(`Pinned the SPM platform floor back to .${FLOOR} in ${PACKAGE_SWIFT}.`);

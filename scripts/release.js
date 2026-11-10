import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = {
  package: path.join(root, "package.json"),
  packageLock: path.join(root, "package-lock.json"),
  tauri: path.join(root, "src-tauri", "tauri.conf.json"),
  cargo: path.join(root, "src-tauri", "Cargo.toml"),
  cargoLock: path.join(root, "src-tauri", "Cargo.lock"),
};

function fail(message) {
  console.error(`\\n❌ Release stopped: ${message}\\n`);
  process.exit(1);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail(`Cannot read ${path.relative(root, file)}: ${error.message}`); }
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    }).trim();
  } catch (error) {
    fail(`Command failed: ${command} ${args.join(" ")}\\n${error.stderr?.toString() || error.message}`);
  }
}

function cargoPackageVersion(content) {
  const packageBlock = content.match(/^\\[package\\]\\s*([\\s\\S]*?)(?=^\\[|\\s*$)/m);
  const match = packageBlock?.[1].match(/^version\\s*=\\s*"([^"]+)"/m);
  if (!match) fail('Could not find [package].version in src-tauri/Cargo.toml.');
  return match[1];
}

function cargoLockPackageVersion(content) {
  const escapedName = "sm-erp";
  const blocks = content.split(/(?=^\\[\\[package\\]\\]\\s*$)/m);
  const block = blocks.find((item) => /^name\\s*=\\s*"sm-erp"\\s*$/m.test(item));
  const match = block?.match(/^version\\s*=\\s*"([^"]+)"\\s*$/m);
  if (!match) fail('Could not find the local sm-erp package in src-tauri/Cargo.lock.');
  return match[1];
}

function validate(expectedTag) {
  const pkg = readJson(files.package);
  const lock = readJson(files.packageLock);
  const tauri = readJson(files.tauri);
  const cargo = fs.readFileSync(files.cargo, "utf8");
  const cargoLock = fs.readFileSync(files.cargoLock, "utf8");
  const versions = {
    "package.json": pkg.version,
    "package-lock.json root": lock.version,
    "package-lock.json packages[\"\"]": lock.packages?.[""]?.version,
    "tauri.conf.json": tauri.version,
    "Cargo.toml [package]": cargoPackageVersion(cargo),
    "Cargo.lock local sm-erp": cargoLockPackageVersion(cargoLock),
  };
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1 || Object.values(versions).some((v) => !v)) {
    console.error("\\nVersion mismatch detected:");
    for (const [file, version] of Object.entries(versions)) console.error(`  ${file}: ${version ?? "MISSING"}`);
    fail("All application version fields must match.");
  }
  const version = pkg.version;
  if (!/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Invalid semantic version: ${version}`);
  }
  if (expectedTag && expectedTag !== `v${version}`) {
    fail(`Git tag ${expectedTag} does not match application version v${version}.`);
  }
  console.log(`\\n✅ All six version fields match: ${version}`);
  return version;
}

function bump(version, kind) {
  const match = version.match(/^(\\d+)\\.(\\d+)\\.(\\d+)$/);
  if (!match) fail(`Automatic bump supports stable x.y.z versions only; found ${version}.`);
  let [, major, minor, patch] = match.map(Number);
  if (kind === "major") { major += 1; minor = 0; patch = 0; }
  else if (kind === "minor") { minor += 1; patch = 0; }
  else if (kind === "patch") patch += 1;
  else fail("Usage: npm run release:patch | release:minor | release:major");
  return `${major}.${minor}.${patch}`;
}

function replaceCargoPackageVersion(content, nextVersion) {
  const packageStart = content.search(/^\\[package\\]\s*$/m);
  if (packageStart < 0) fail("Missing [package] section in Cargo.toml.");
  const nextSection = content.slice(packageStart).search(/^\\[/m);
  const end = nextSection > 0 ? packageStart + nextSection : content.length;
  const before = content.slice(0, packageStart);
  const block = content.slice(packageStart, end);
  const updated = block.replace(/^(version\\s*=\\s*")[^"]+(")/m, `$1${nextVersion}$2`);
  if (updated === block) fail("Could not update Cargo.toml [package].version.");
  return before + updated + content.slice(end);
}

function replaceCargoLockVersion(content, nextVersion) {
  const blocks = content.split(/(?=^\\[\\[package\\]\\]\\s*$)/m);
  let found = false;
  const updated = blocks.map((block) => {
    if (!/^name\\s*=\\s*"sm-erp"\\s*$/m.test(block)) return block;
    found = true;
    return block.replace(/^(version\\s*=\\s*")[^"]+(")/m, `$1${nextVersion}$2`);
  }).join("");
  if (!found) fail("Could not update the local sm-erp entry in Cargo.lock.");
  return updated;
}

function release(kind) {
  const currentVersion = validate();
  const nextVersion = bump(currentVersion, kind);

  const branch = run("git", ["branch", "--show-current"], { quiet: true });
  if (branch !== "main") fail(`Releases must be created from main; current branch is "${branch}".`);
  if (run("git", ["status", "--porcelain"], { quiet: true })) {
    fail("Your working tree is not clean. Commit or stash your changes before releasing.");
  }

  console.log("\\nChecking that local main is up to date with origin/main...");
  run("git", ["fetch", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"], { quiet: true });
  const remoteHead = run("git", ["rev-parse", "origin/main"], { quiet: true });
  if (head !== remoteHead) fail("Local main is not exactly aligned with origin/main. Pull/push your changes first.");

  const tag = `v${nextVersion}`;
  if (run("git", ["tag", "--list", tag], { quiet: true })) fail(`Git tag ${tag} already exists locally.`);
  if (run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { quiet: true })) {
    fail(`Git tag ${tag} already exists on origin.`);
  }

  const pkg = readJson(files.package);
  const lock = readJson(files.packageLock);
  const tauri = readJson(files.tauri);
  pkg.version = nextVersion;
  lock.version = nextVersion;
  if (!lock.packages?.[""]) fail('package-lock.json is missing packages[""].');
  lock.packages[""].version = nextVersion;
  tauri.version = nextVersion;

  fs.writeFileSync(files.package, `${JSON.stringify(pkg, null, 4)}\\n`);
  fs.writeFileSync(files.packageLock, `${JSON.stringify(lock, null, 4)}\\n`);
  fs.writeFileSync(files.tauri, `${JSON.stringify(tauri, null, 2)}\\n`);
  fs.writeFileSync(files.cargo, replaceCargoPackageVersion(fs.readFileSync(files.cargo, "utf8"), nextVersion));
  fs.writeFileSync(files.cargoLock, replaceCargoLockVersion(fs.readFileSync(files.cargoLock, "utf8"), nextVersion));

  validate();
  console.log(`\\nBuilding frontend before creating release ${tag}...`);
  run("npm", ["run", "build"]);

  run("git", ["add", "package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]);
  run("git", ["commit", "-m", `chore(release): ${tag}`]);
  run("git", ["tag", "-a", tag, "-m", `SM Sourcing ${tag}`]);

  console.log(`\\nPushing main and ${tag} atomically to GitHub...`);
  run("git", ["push", "--atomic", "origin", "main", `refs/tags/${tag}`]);
  console.log(`\\n🚀 Release ${tag} pushed. GitHub Actions will build and publish the installer.`);
}

const [mode, expectedTag] = process.argv.slice(2);
if (mode === "check") validate(expectedTag);
else if (["patch", "minor", "major"].includes(mode)) release(mode);
else fail("Usage: node scripts/release.js check [vX.Y.Z] | patch | minor | major");

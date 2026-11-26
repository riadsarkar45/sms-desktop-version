import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { stdin, stdout } from "node:process";

const root = process.cwd();
const repo = "riadsarkar45/sms-desktop-version";
const betaConfig = path.join(root, "src-tauri/tauri.beta.conf.json");
const generatedConfig = path.join(root, "src-tauri/tauri.beta.generated.conf.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function fail(message) {
  console.error("\n❌ Beta release stopped: " + message + "\n");
  process.exit(1);
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      env: options.env || process.env,
      shell: false,
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString() || error.stdout?.toString() || error.message;
    fail(command + " " + args.join(" ") + " failed.\n" + detail);
  }
}

function runNpm(args = []) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) fail("Cannot locate npm CLI. Start this command with npm run release:beta.");
  run(process.execPath, [npmCli, ...args]);
}

function canRun(command, args) {
  try {
    execFileSync(command, args, { cwd: root, stdio: "ignore", shell: false });
    return true;
  } catch {
    return false;
  }
}

function parseVersion(value) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/);
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3], beta: match[4] === undefined ? null : +match[4] };
}

function compareCore(a, b) {
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return 0;
}

async function askVersion() {
  const current = parseVersion(packageJson.version);
  if (!current || current.beta !== null) fail("package.json must contain a stable x.y.z version.");
  const suggested = `${current.major}.${current.minor}.${current.patch + 1}-beta.1`;
  const cliVersion = process.argv[2];
  if (cliVersion) return cliVersion;

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Enter beta version [${suggested}]: `);
    return answer.trim() || suggested;
  } finally {
    rl.close();
  }
}

function checkRepository() {
  if (run("git", ["branch", "--show-current"], { quiet: true }) !== "main") {
    fail('Run beta releases from the main branch.');
  }
  if (run("git", ["status", "--porcelain"], { quiet: true })) {
    fail("Working tree is not clean. Commit or stash changes first.");
  }

  run("git", ["fetch", "origin", "main"]);
  const local = run("git", ["rev-parse", "HEAD"], { quiet: true });
  const remote = run("git", ["rev-parse", "origin/main"], { quiet: true });
  if (local !== remote) fail("Local main is not exactly aligned with origin/main. Pull the latest main first.");
}

function checkStableVersionFiles() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const tauri = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
  const cargoLock = fs.readFileSync(path.join(root, "src-tauri/Cargo.lock"), "utf8");
  const cargoPackage = cargo.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockBlock = cargoLock.split(/(?=^\[\[package\]\]\s*$)/m).find(x => /^name\s*=\s*"sm-erp"\s*$/m.test(x));
  const cargoLockVersion = lockBlock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const versions = [
    packageJson.version,
    lock.version,
    lock.packages?.[""]?.version,
    tauri.version,
    cargoPackage,
    cargoLockVersion,
  ];
  if (versions.some(v => !v) || new Set(versions).size !== 1) {
    fail("The six stable version fields do not match. Run npm run version:check first.");
  }
}

async function main() {
  if (!canRun("gh", ["--version"])) fail("GitHub CLI (gh) is required. Install it from https://cli.github.com/ and reopen CMD.");
  run("gh", ["auth", "status"]);
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) fail("TAURI_SIGNING_PRIVATE_KEY environment variable is missing.");
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) fail("TAURI_SIGNING_PRIVATE_KEY_PASSWORD environment variable is missing.");

  checkRepository();
  checkStableVersionFiles();

  const version = await askVersion();
  const parsed = parseVersion(version);
  if (!parsed || parsed.beta === null) fail("Version must use x.y.z-beta.n, for example 4.8.2-beta.1.");

  const stable = parseVersion(packageJson.version);
  if (compareCore(parsed, stable) <= 0) fail("Beta version core (x.y.z) must be greater than current stable version " + packageJson.version + ".");

  const tag = "beta";
  const baseConfig = JSON.parse(fs.readFileSync(betaConfig, "utf8"));
  const config = { ...baseConfig, version };
  fs.writeFileSync(generatedConfig, JSON.stringify(config, null, 2) + "\n");

  try {
    console.log("\n🔨 Building SM Sourcing " + version + " locally...");
    runNpm(["ci"]);
    runNpm(["run", "build"]);
    runNpm(["run", "tauri", "--", "build", "--config", "src-tauri/tauri.beta.generated.conf.json"]);

    const msiDir = path.join(root, "src-tauri/target/release/bundle/msi");
    const msi = fs.readdirSync(msiDir).filter(name => name.toLowerCase().endsWith(".msi")).map(name => path.join(msiDir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!msi) fail("Tauri build completed but no MSI was found in " + msiDir);

    const signaturePath = msi + ".sig";
    if (!fs.existsSync(signaturePath)) fail("Updater signature not found: " + signaturePath);
    const signature = fs.readFileSync(signaturePath, "utf8").trim();
    if (!signature) fail("Updater signature file is empty.");

    const assetName = path.basename(msi);
    const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
    const manifest = {
      version,
      notes: `SM Sourcing Beta ${version}`,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": { signature, url: downloadUrl }
      }
    };
    const manifestPath = path.join(path.dirname(msi), "latest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    const releaseExists = canRun("gh", ["release", "view", tag]);
    if (releaseExists) {
      console.log("\nUploading new beta assets to the existing rolling beta release...");
      run("gh", ["release", "upload", tag, msi, signaturePath, manifestPath, "--clobber"]);
      run("git", ["tag", "-f", tag, "origin/main"]);
      run("git", ["push", "origin", "refs/tags/" + tag, "--force"]);
      run("gh", ["release", "edit", tag, "--title", "SM Sourcing Beta (" + version + ")", "--notes", "Rolling beta channel. Current build: " + version + ". For selected beta testers only.", "--prerelease"]);
    } else {
      console.log("\nCreating the rolling beta release...");
      run("gh", ["release", "create", tag, msi, signaturePath, manifestPath, "--target", "main", "--title", "SM Sourcing Beta (" + version + ")", "--notes", "Rolling beta channel. Current build: " + version + ". For selected beta testers only.", "--prerelease"]);
    }

    console.log("\n🚀 Beta " + version + " published successfully.");
    console.log("Release: https://github.com/" + repo + "/releases/tag/beta");
    console.log("Beta installer: " + downloadUrl);
    console.log("\nStable release configuration and version files were not changed.");
  } finally {
    if (fs.existsSync(generatedConfig)) fs.unlinkSync(generatedConfig);
  }
}

main().catch(error => fail(error.message));

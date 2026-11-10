
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const files = {
  package: "package.json",
  packageLock: "package-lock.json",
  tauri: "src-tauri/tauri.conf.json",
  cargo: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

const absolute = (name) => path.join(root, name);

function fail(message) {
  console.error("\n❌ Release stopped: " + message + "\n");
  process.exit(1);
}

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(absolute(name), "utf8"));
  } catch (error) {
    fail("Cannot read " + name + ": " + error.message);
  }
}

function run(command, args, quiet = false) {
  try {
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
    });

    return typeof output === "string" ? output.trim() : "";
  } catch (error) {
    const errorOutput =
      error.stderr?.toString() ||
      error.stdout?.toString() ||
      error.message;

    fail(
      "Command failed: " +
        command +
        " " +
        args.join(" ") +
        "\n" +
        errorOutput
    );
  }
}

function getCargoVersion(content) {
  const lines = content.split(/\r?\n/);
  let inPackage = false;

  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      inPackage = line.trim() === "[package]";
    } else if (inPackage) {
      const match = line.match(/^\s*version\s*=\s*"([^"]+)"/);

      if (match) {
        return match[1];
      }
    }
  }

  fail("Could not find [package].version in Cargo.toml.");
}

function getCargoLockVersion(content) {
  const blocks = content.split(/(?=^\[\[package\]\]\s*$)/m);

  const block = blocks.find((part) =>
    /^name\s*=\s*"sm-erp"\s*$/m.test(part)
  );

  const match = block?.match(/^version\s*=\s*"([^"]+)"\s*$/m);

  if (!match) {
    fail("Could not find local sm-erp package in Cargo.lock.");
  }

  return match[1];
}

function validate(expectedTag) {
  const pkg = readJson(files.package);
  const lock = readJson(files.packageLock);
  const tauri = readJson(files.tauri);

  const cargo = fs.readFileSync(absolute(files.cargo), "utf8");
  const cargoLock = fs.readFileSync(absolute(files.cargoLock), "utf8");

  const versions = {
    "package.json": pkg.version,
    "package-lock.json root": lock.version,
    'package-lock.json packages[""]': lock.packages?.[""]?.version,
    "tauri.conf.json": tauri.version,
    "Cargo.toml [package]": getCargoVersion(cargo),
    "Cargo.lock local sm-erp": getCargoLockVersion(cargoLock),
  };

  const values = Object.values(versions);

  if (values.some((value) => !value) || new Set(values).size !== 1) {
    console.error("\nVersion mismatch detected:");

    for (const [file, version] of Object.entries(versions)) {
      console.error("  " + file + ": " + (version ?? "MISSING"));
    }

    fail("All six application version fields must match.");
  }

  const version = pkg.version;

  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      version
    )
  ) {
    fail("Invalid semantic version: " + version);
  }

  if (expectedTag && expectedTag !== "v" + version) {
    fail(
      "Git tag " +
        expectedTag +
        " does not match application version v" +
        version +
        "."
    );
  }

  console.log("\n✅ All six version fields match: " + version);

  return version;
}

function bump(version, kind) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    fail(
      "Automatic bump supports stable x.y.z versions only; found " +
        version +
        "."
    );
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (kind === "major") {
    major++;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor++;
    patch = 0;
  } else if (kind === "patch") {
    patch++;
  } else {
    fail("Use release:patch, release:minor, or release:major.");
  }

  return major + "." + minor + "." + patch;
}

function setCargoVersion(content, nextVersion) {
  const lines = content.split(/\r?\n/);

  let inPackage = false;
  let changed = false;

  const updated = lines.map((line) => {
    if (/^\s*\[/.test(line)) {
      inPackage = line.trim() === "[package]";
    }

    if (inPackage && /^\s*version\s*=/.test(line)) {
      changed = true;

      return line.replace(
        /(version\s*=\s*")[^"]+(")/,
        "$1" + nextVersion + "$2"
      );
    }

    return line;
  });

  if (!changed) {
    fail("Could not update [package].version in Cargo.toml.");
  }

  return updated.join("\n");
}

function setCargoLockVersion(content, nextVersion) {
  const blocks = content.split(/(?=^\[\[package\]\]\s*$)/m);

  let found = false;

  const updated = blocks.map((block) => {
    if (!/^name\s*=\s*"sm-erp"\s*$/m.test(block)) {
      return block;
    }

    found = true;

    return block.replace(
      /^(version\s*=\s*")[^"]+(")/m,
      "$1" + nextVersion + "$2"
    );
  });

  if (!found) {
    fail("Could not update local sm-erp package in Cargo.lock.");
  }

  return updated.join("");
}

function release(kind) {
  const current = validate();
  const next = bump(current, kind);

  console.log("\nChecking Git branch...");

  const branch = run("git", ["branch", "--show-current"], true);

  if (branch !== "main") {
    fail(
      'Releases must run from main; current branch is "' +
        branch +
        '".'
    );
  }

  const workingTree = run("git", ["status", "--porcelain"], true);

  if (workingTree) {
    fail("Working tree is not clean. Commit or stash changes first.");
  }

  console.log("\nChecking local main against origin/main...");

  run("git", ["fetch", "origin", "main"]);

  const localHead = run("git", ["rev-parse", "HEAD"], true);
  const remoteHead = run("git", ["rev-parse", "origin/main"], true);

  if (localHead !== remoteHead) {
    fail(
      "Local main is not exactly aligned with origin/main. " +
        "Pull/push your changes first."
    );
  }

  const tag = "v" + next;

  console.log("\nChecking whether " + tag + " already exists...");

  if (run("git", ["tag", "--list", tag], true)) {
    fail("Tag " + tag + " already exists locally.");
  }

  if (
    run(
      "git",
      ["ls-remote", "--tags", "origin", "refs/tags/" + tag],
      true
    )
  ) {
    fail("Tag " + tag + " already exists on origin.");
  }

  console.log("\nUpdating all six version fields...");

  const pkg = readJson(files.package);
  const lock = readJson(files.packageLock);
  const tauri = readJson(files.tauri);

  if (!lock.packages?.[""]) {
    fail('package-lock.json is missing packages[""].');
  }

  pkg.version = next;
  lock.version = next;
  lock.packages[""].version = next;
  tauri.version = next;

  fs.writeFileSync(
    absolute(files.package),
    JSON.stringify(pkg, null, 4) + "\n"
  );

  fs.writeFileSync(
    absolute(files.packageLock),
    JSON.stringify(lock, null, 4) + "\n"
  );

  fs.writeFileSync(
    absolute(files.tauri),
    JSON.stringify(tauri, null, 2) + "\n"
  );

  fs.writeFileSync(
    absolute(files.cargo),
    setCargoVersion(
      fs.readFileSync(absolute(files.cargo), "utf8"),
      next
    )
  );

  fs.writeFileSync(
    absolute(files.cargoLock),
    setCargoLockVersion(
      fs.readFileSync(absolute(files.cargoLock), "utf8"),
      next
    )
  );

  validate();

  console.log("\nBuilding frontend before creating " + tag + "...");

  run("npm", ["run", "build"]);

  console.log("\nCommitting release files...");

  run("git", ["add", ...Object.values(files)]);

  run("git", ["commit", "-m", "chore(release): " + tag]);

  console.log("\nCreating annotated Git tag...");

  run("git", ["tag", "-a", tag, "-m", "SM Sourcing " + tag]);

  console.log("\nPushing main and " + tag + " atomically...");

  run("git", [
    "push",
    "--atomic",
    "origin",
    "main",
    "refs/tags/" + tag,
  ]);

  console.log(
    "\n🚀 " + tag + " pushed. GitHub Actions will publish the installer."
  );
}

const [mode, expectedTag] = process.argv.slice(2);

if (mode === "check") {
  validate(expectedTag);
} else if (["patch", "minor", "major"].includes(mode)) {
  release(mode);
} else {
  fail(
    "Usage: node scripts/release.js check [vX.Y.Z] | patch | minor | major"
  );
}

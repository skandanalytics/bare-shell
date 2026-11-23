const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const packageJson = require('../package.json');

const forbiddenPackageRoots = [
  'modules_src',
  'remote_modules',
  'premium_modules',
  'paid_modules',
  'private_modules',
  'strategy_modules',
  'strategies_src',
  'admin_portal',
  'module_dist',
  'server',
  'secure_keys',
  'keys',
  'data',
  '.env'
];

const hostedOnlyFiles = [
  'src/license_server.js',
  'src/license_subscription_store.js',
  'src/rate_limiter.js'
];

function main() {
  const build = packageJson.build || {};
  const files = (build.files || []).map(String);
  assert.ok(files.length, 'package.json build.files must explicitly list shell files');
  assert.equal(packageJson.name, 'trade-assist', 'package name must stay generic for the shared bare shell');
  assert.equal(build.productName, 'Trade Assist', 'productName must stay generic for the shared bare shell');
  assert.match(
    String(build.artifactName || ''),
    /^\$\{productName\}-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}$/,
    'artifactName must stay platform/version-only, not customer/feature specific'
  );
  assertNoEntitlementBuildFlavor(packageJson.scripts || {});

  for (const forbidden of forbiddenPackageRoots) {
    assert.equal(filesIncludesRoot(files, forbidden), false, `${forbidden} must not be included in customer package`);
  }

  assert.ok(files.includes('src/**/*'), 'shell src must stay packaged');
  assert.ok(files.includes('renderer/**/*'), 'renderer must stay packaged');

  for (const hostedOnlyFile of hostedOnlyFiles) {
    assert.ok(files.includes(`!${hostedOnlyFile}`), `${hostedOnlyFile} must be excluded from customer package`);
  }

  assertPackagedRootsDoNotContainPremiumSource(files);

  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^module_dist\/$/m, 'module_dist must stay ignored');
  assert.match(ignore, /^secure_keys\/$/m, 'secure_keys must stay ignored');
  assert.match(ignore, /^keys\/$/m, 'keys must stay ignored');
  assert.match(ignore, /^data\/\*$/m, 'captured data must stay ignored');

  console.log('package boundary tests passed');
}

function assertPackagedRootsDoNotContainPremiumSource(files) {
  const packagedRoots = packagedTopLevelRoots(files);
  const forbiddenDirNames = new Set([
    'modules_src',
    'remote_modules',
    'premium_modules',
    'paid_modules',
    'private_modules',
    'strategy_modules',
    'strategies_src',
    'proprietary_strategies',
    'chargeable_strategies'
  ]);
  const forbiddenFilePatterns = [
    /(^|[/\\])private[_-]?key/i,
    /(^|[/\\])signing[_-]?key/i,
    /(^|[/\\])license_config\.json$/i,
    /(^|[/\\])operators\.json$/i,
    /\.(pem|p12|pfx|key)$/i
  ];

  for (const root of packagedRoots) {
    const rootPath = path.join(ROOT, root);
    if (!fs.existsSync(rootPath)) continue;
    const stat = fs.statSync(rootPath);
    const paths = stat.isDirectory() ? walk(rootPath) : [rootPath];
    for (const filePath of paths) {
      const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');
      if (isExcludedByBuildFiles(relative, files)) continue;
      const parts = relative.split('/');
      assert.equal(
        parts.some((part) => forbiddenDirNames.has(part)),
        false,
        `packaged root contains forbidden premium/source directory: ${relative}`
      );
      assert.equal(
        forbiddenFilePatterns.some((pattern) => pattern.test(relative)),
        false,
        `packaged root contains forbidden secret or premium artifact: ${relative}`
      );
    }
  }
}

function isExcludedByBuildFiles(relative, files) {
  return files.some((entry) => {
    if (!entry.startsWith('!')) return false;
    const normalized = entry.slice(1).replace(/\\/g, '/');
    if (normalized.endsWith('/**/*')) {
      const root = normalized.slice(0, -5);
      return relative === root || relative.startsWith(`${root}/`);
    }
    return relative === normalized;
  });
}

function assertNoEntitlementBuildFlavor(scripts) {
  const forbidden = /\b(customer|tenant|tier|premium|pro|enterprise|feature|entitlement|license)\b/i;
  for (const [name, command] of Object.entries(scripts)) {
    if (!/^dist|^pack|release|installer/i.test(name)) continue;
    assert.equal(
      forbidden.test(`${name} ${command}`),
      false,
      `release/package script must not create entitlement-specific installer flavor: ${name}`
    );
  }
}

function filesIncludesRoot(files, root) {
  return files.some((entry) => {
    const normalized = entry.replace(/\\/g, '/').replace(/^!/, '');
    return normalized === root || normalized === `${root}/**/*` || normalized.startsWith(`${root}/`);
  });
}

function packagedTopLevelRoots(files) {
  const roots = new Set();
  for (const entry of files) {
    const normalized = entry.replace(/\\/g, '/').replace(/^!/, '');
    if (!normalized || normalized.startsWith('.')) continue;
    roots.add(normalized.split('/')[0]);
  }
  return Array.from(roots);
}

function walk(dirPath) {
  const out = [];
  for (const name of fs.readdirSync(dirPath)) {
    const filePath = path.join(dirPath, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) out.push(...walk(filePath));
    else out.push(filePath);
  }
  return out;
}

main();

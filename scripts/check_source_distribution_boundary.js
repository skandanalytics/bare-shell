const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const FORBIDDEN = [
  [/^admin_portal\//, 'operator/admin portal source must not ship in the public source repo'],
  [/^deploy\//, 'hosted deployment scaffolding must stay private'],
  [/^src\/license_server\.js$/, 'hosted license server source must stay private'],
  [/^src\/license_subscription_store\.js$/, 'hosted license database source must stay private'],
  [/^src\/rate_limiter\.js$/, 'hosted service internals must stay private'],
  [/^scripts\/license_admin_portal\.js$/, 'operator portal runtime must stay private'],
  [/^scripts\/check_hosted_uptime\.js$/, 'hosted monitoring internals must stay private'],
  [/^scripts\/check_deployment_scaffold\.js$/, 'hosted deployment validation must stay private'],
  [/^src\/momentum_reversal_strategy\.js$/, 'premium strategy implementation must be delivered as a signed module, not public source'],
  [/^scripts\/export_strategy_training_data\.js$/, 'strategy training tooling must stay private'],
  [/^scripts\/evaluate_trailing_strategy\.js$/, 'strategy evaluation tooling must stay private'],
  [/^scripts\/train_weighted_strategy_model\.js$/, 'ML strategy training tooling must stay private'],
  [/^scripts\/generate_daily_model_evaluation_report\.js$/, 'model evaluation tooling must stay private'],
  [/^scripts\/watch_strategy_today\.js$/, 'live strategy support tooling must stay private'],
  [/^scripts\/report_strategy_status\.js$/, 'strategy status tooling must stay private'],
  [/^scripts\/manage_signing_keys\.js$/, 'module signing-key operator tooling must stay private'],
  [/^scripts\/module_signing_pipeline\.js$/, 'module release signing pipeline must stay private'],
  [/^scripts\/publish_feature_module\.js$/, 'module publishing tooling must stay private'],
  [/^docs\/strategy_.*\.md$/, 'strategy analysis reports must stay private'],
  [/^docs\/daily_model_evaluation_report\.md$/, 'model evaluation report must stay private'],
  [/^docs\/trailing_strategy_evaluation\.md$/, 'trailing strategy evaluation report must stay private'],
  [/^docs\/(backup_restore_runbook|license_admin_portal|license_server_api|license_server_deployment|licensing_monitoring_plan|module_cdn_delivery|module_publishing_workflow|morning_sync_autoscaling_plan|scale_architecture|signing_key_management|stateless_license_scaling)\.md$/, 'hosted/operator documentation must stay private'],
  [/^docs\/master_implementation_checklist\.md$/, 'internal implementation checklist must stay private'],
  [/^module_dist\//, 'signed module build output must not be in the source repo'],
  [/^modules_src\//, 'premium module source must stay private'],
  [/^premium_modules\//, 'premium module source must stay private'],
  [/^paid_modules\//, 'premium module source must stay private'],
  [/^private_modules\//, 'private module source must stay private'],
  [/^strategy_modules\//, 'strategy module source must stay private'],
  [/^strategies_src\//, 'strategy source must stay private']
];

function main() {
  const files = listTrackedFiles();
  const findings = [];
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    for (const [pattern, reason] of FORBIDDEN) {
      if (pattern.test(normalized)) {
        findings.push({ file: normalized, reason });
        break;
      }
    }
  }

  if (findings.length) {
    console.error('Source distribution boundary failed.');
    console.error('These files must be removed from a public/customer source-install branch:');
    for (const item of findings) {
      console.error(`- ${item.file}: ${item.reason}`);
    }
    process.exit(1);
  }

  console.log('Source distribution boundary passed.');
}

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (result.status === 0) {
    return String(result.stdout || '').split(/\r?\n/).filter(Boolean);
  }
  return walk(ROOT).map((file) => path.relative(ROOT, file));
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.tools') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

if (require.main === module) {
  main();
}

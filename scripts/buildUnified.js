const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const appRoot = path.join(repoRoot, 'forge-your-future');
const frontendOutDir = path.join(backendRoot, 'public-frontend');

const run = (command, args, cwd) => {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
};

const resetDir = (dirPath) => {
    fs.rmSync(dirPath, { recursive: true, force: true });
    fs.mkdirSync(dirPath, { recursive: true });
};

const copyDir = (sourceDir, targetDir) => {
    fs.cpSync(sourceDir, targetDir, { recursive: true });
};

const getNpmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const npmCommand = getNpmCommand();

console.log('Building unified frontend (website + app) from forge-your-future...');
run(npmCommand, ['ci'], appRoot);
run(npmCommand, ['run', 'build'], appRoot);

console.log('Preparing backend static directory...');
resetDir(frontendOutDir);

copyDir(path.join(appRoot, 'dist'), frontendOutDir);

console.log('Unified frontend build complete (public-frontend).');

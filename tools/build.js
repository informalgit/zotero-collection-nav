/**
 * 打包 xpi。
 *
 * 用法： node tools/build.js
 *
 * 产物： dist/zotero-collection-nav-<version>.xpi
 * 版本号取自 manifest.json，因此只需改一处。
 *
 * 命名注意：插件市场爬虫按 Content-Type 识别 release 附件，
 * .xpi 后缀会被 GitHub 识别为 application/x-xpinstall，
 * 改成 .zip 也能被兜底识别，但其他后缀会直接跳过。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const distDir = path.join(root, 'dist');
const outXpi = path.join(distDir, `zotero-collection-nav-${version}.xpi`);

// 打进 xpi 的文件
const files = ['manifest.json', 'bootstrap.js', 'icon.svg'];

// 提交前先做语法检查，避免打出坏包
try {
	execFileSync(process.execPath, ['--check', path.join(root, 'bootstrap.js')], { stdio: 'inherit' });
}
catch (e) {
	console.error('bootstrap.js 语法检查失败，中止打包');
	process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(outXpi)) {
	fs.unlinkSync(outXpi);
}

// 优先用 7-Zip，回退到 PowerShell 的 Compress-Archive
const sevenZ = [
	'C:\\Program Files\\7-Zip\\7z.exe',
	'C:\\Program Files (x86)\\7-Zip\\7z.exe',
].find(p => fs.existsSync(p));

if (sevenZ) {
	execFileSync(sevenZ, ['a', '-tzip', '-mx=9', outXpi, ...files], { cwd: root, stdio: 'pipe' });
}
else {
	const ps = [
		'-NoProfile', '-Command',
		`Compress-Archive -Path ${files.map(f => `'${f}'`).join(',')} -DestinationPath '${outXpi}' -Force`,
	];
	execFileSync('powershell.exe', ps, { cwd: root, stdio: 'pipe' });
}

const size = fs.statSync(outXpi).size;
console.log(`打包完成: dist/${path.basename(outXpi)} (${size} bytes, version ${version})`);

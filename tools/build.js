/**
 * 打包 xpi。
 *
 * 用法： node tools/build.js
 *
 * 产物： dist/zotero-collection-nav-<version>.xpi
 * 版本号取自 manifest.json，因此只需改一处。
 *
 * 跨平台：优先用 7-Zip（快），没有就用内置 zip 实现（纯 Node，无依赖），
 * 这样 Windows 本地和 GitHub Actions 的 Ubuntu 都能跑。
 *
 * 命名注意：插件市场爬虫按 Content-Type 识别 release 附件，
 * .xpi 后缀会被 GitHub 识别为 application/x-xpinstall。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const distDir = path.join(root, 'dist');
const outXpi = path.join(distDir, `zotero-collection-nav-${version}.xpi`);

// 打进 xpi 的文件
const files = ['manifest.json', 'bootstrap.js', 'icon.svg'];

// ---------------------------------------------------------------- 语法检查
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

// ---------------------------------------------------------------- 纯 Node zip
const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[i] = c;
	}
	return table;
})();

function crc32(buf) {
	let crc = -1;
	for (let i = 0; i < buf.length; i++) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
	}
	return (crc ^ -1) >>> 0;
}

/**
 * 生成 zip。使用 deflate 压缩，不写 zip64（插件包远小于 4GB）。
 */
function makeZip(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuf = Buffer.from(entry.name, 'utf8');
		const data = entry.data;
		const compressed = zlib.deflateRawSync(data, { level: 9 });
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);   // 签名
		local.writeUInt16LE(20, 4);           // 版本
		local.writeUInt16LE(0x0800, 6);       // 通用标志：UTF-8 文件名
		local.writeUInt16LE(8, 8);            // 压缩方法 deflate
		local.writeUInt16LE(0, 10);           // 修改时间
		local.writeUInt16LE(0x21, 12);        // 修改日期（1980-01-01）
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);           // extra 长度

		localParts.push(local, nameBuf, compressed);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0); // 签名
		central.writeUInt16LE(20, 4);         // 创建版本
		central.writeUInt16LE(20, 6);         // 解压所需版本
		central.writeUInt16LE(0x0800, 8);     // 通用标志
		central.writeUInt16LE(8, 10);         // 压缩方法
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0x21, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt16LE(0, 30);         // extra
		central.writeUInt16LE(0, 32);         // comment
		central.writeUInt16LE(0, 34);         // 磁盘号
		central.writeUInt16LE(0, 36);         // 内部属性
		central.writeUInt32LE(0, 38);         // 外部属性
		central.writeUInt32LE(offset, 42);    // 本地头偏移

		centralParts.push(central, nameBuf);

		offset += local.length + nameBuf.length + compressed.length;
	}

	const centralDir = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralDir.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, centralDir, end]);
}

// ---------------------------------------------------------------- 打包
const sevenZ = [
	'C:\\Program Files\\7-Zip\\7z.exe',
	'C:\\Program Files (x86)\\7-Zip\\7z.exe',
].find(p => fs.existsSync(p));

if (sevenZ) {
	execFileSync(sevenZ, ['a', '-tzip', '-mx=9', outXpi, ...files], { cwd: root, stdio: 'pipe' });
}
else {
	const entries = files.map(name => ({
		name,
		data: fs.readFileSync(path.join(root, name)),
	}));
	fs.writeFileSync(outXpi, makeZip(entries));
}

const size = fs.statSync(outXpi).size;
console.log(`打包完成: dist/${path.basename(outXpi)} (${size} bytes, version ${version})`);

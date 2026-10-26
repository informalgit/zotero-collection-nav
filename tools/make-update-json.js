/**
 * 生成 update.json（Zotero 插件自动更新清单）。
 *
 * 用法： node tools/make-update-json.js
 *
 * 产物： update.json（仓库根目录），配合 manifest 里的 update_url 使用。
 * Zotero 会定期请求该地址，比对 version 后提示更新。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const zotero = manifest.applications.zotero;
const version = manifest.version;

const update = {
	addons: {
		[zotero.id]: {
			updates: [
				{
					version,
					update_link: `https://github.com/informalgit/zotero-collection-nav/releases/download/v${version}/zotero-collection-nav-${version}.xpi`,
					applications: {
						zotero: {
							strict_min_version: zotero.strict_min_version,
							strict_max_version: zotero.strict_max_version,
						},
					},
				},
			],
		},
	},
};

const out = path.join(root, 'update.json');
fs.writeFileSync(out, JSON.stringify(update, null, 2) + '\n', 'utf8');
console.log(`已生成 update.json (version ${version})`);
console.log(`update_link: ${update.addons[zotero.id].updates[0].update_link}`);

/**
 * 把 Collection Breadcrumb 注册进 Zotero profile 的 extensions.json。
 *
 * 现代 Firefox/Zotero 不再扫描 profile/extensions 目录自动安装 XPI，
 * 必须由 AddonManager 记录在 extensions.json 里才会被加载。
 * 这个脚本照抄现有插件（如 zoterotag@euclpts.com）的条目结构再改字段。
 *
 * 用法： node register.js <profile 目录>
 */
const fs = require('fs');
const path = require('path');

// 版本与插件 id 统一从 manifest.json 读，避免和打包结果不一致
const manifest = JSON.parse(
	fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
);
const ADDON_ID = manifest.applications.zotero.id;
const VERSION = manifest.version;

const profileDir = process.argv[2] || 'C:\\Users\\NOND\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\zaagubbn.default';
const extJson = path.join(profileDir, 'extensions.json');
const xpiPath = path.join(profileDir, 'extensions', ADDON_ID + '.xpi');

const raw = fs.readFileSync(extJson, 'utf8');
let j;
try {
	j = JSON.parse(raw);
}
catch (e) {
	console.error('extensions.json 不是合法 JSON：', e.message);
	process.exit(2);
}

const existing = j.addons.find(a => a.id === ADDON_ID);
if (existing) {
	console.log('已存在条目，仅刷新字段');
}

// 找一个同为 app-profile 位置的条目做模板
const template = j.addons.find(a => a.location === 'app-profile');
if (!template) {
	console.error('找不到可用的模板条目');
	process.exit(3);
}

const now = Date.now();
// 拼 rootURI：Windows 盘符路径需变成 file:///C:/...，POSIX 路径本身就是 /...
const posixPath = xpiPath.replace(/\\/g, '/');
const rootURI = posixPath.startsWith('/')
	? 'jar:file://' + posixPath + '!/'
	: 'jar:file:///' + posixPath + '!/';

const entry = Object.assign({}, template, {
	id: ADDON_ID,
	syncGUID: '{' + require('crypto').randomUUID() + '}',
	version: VERSION,
	updateURL: manifest.applications.zotero.update_url || null,
	defaultLocale: {
		name: manifest.name,
		description: manifest.description,
		creator: manifest.author,
		homepageURL: manifest.homepage_url || null,
		developers: null,
		translators: null,
		contributors: null,
	},
	locales: [],
	visible: true,
	active: true,
	userDisabled: false,
	appDisabled: false,
	embedderDisabled: false,
	installDate: now,
	updateDate: now,
	applyBackgroundUpdates: 1,
	path: xpiPath,
	skinnable: false,
	sourceURI: xpiPath,
	releaseNotesURI: null,
	softDisabled: false,
	foreignInstall: false,
	strictCompatibility: true,
	targetApplications: [{
		id: 'zotero@zotero.org',
		minVersion: manifest.applications.zotero.strict_min_version,
		maxVersion: manifest.applications.zotero.strict_max_version,
	}],
	targetPlatforms: [],
	signedState: 0,
	signedTypes: [],
	signedDate: null,
	seen: true,
	dependencies: [],
	incognito: 'spanning',
	userPermissions: { permissions: [], origins: [], data_collection: [] },
	optionalPermissions: { permissions: [], origins: [], data_collection: [] },
	requestedPermissions: { permissions: [], origins: [], data_collection: [] },
	icons: { 48: 'icon.svg', 96: 'icon.svg' },
	iconURL: null,
	blocklistAttentionDismissed: false,
	blocklistState: 0,
	blocklistURL: null,
	startupData: null,
	hidden: false,
	installTelemetryInfo: { source: 'about:addons', method: 'drag-and-drop' },
	recommendationState: null,
	rootURI: rootURI,
	location: 'app-profile',
});

const idx = j.addons.findIndex(a => a.id === ADDON_ID);
if (idx >= 0) {
	j.addons[idx] = entry;
}
else {
	j.addons.push(entry);
}

fs.writeFileSync(extJson, JSON.stringify(j), 'utf8');
console.log('已注册:', ADDON_ID, VERSION);
console.log('path    :', xpiPath);
console.log('rootURI :', rootURI);
console.log('addons  :', j.addons.length);

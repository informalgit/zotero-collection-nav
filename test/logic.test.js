/**
 * 离线逻辑测试：用 mock 替换 Zotero API，验证路径计算与渲染逻辑。
 * 运行： node test/logic.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bootstrapSrc = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8');

// ---------------------------------------------------------------- mock 数据
const libraries = {
	1: { id: 1, name: '我的文库', isGroup: false },
	2: { id: 2, name: '课题组共享库', isGroup: true },
};

const collections = {
	10: { id: 10, name: '超导理论', libraryID: 1, parentID: false },
	11: { id: 11, name: 'NbC12', libraryID: 1, parentID: 10 },
	12: { id: 12, name: '能带结构', libraryID: 1, parentID: 11 },
	13: { id: 13, name: '超导计算', libraryID: 1, parentID: 10 },
	20: { id: 20, name: '顶刊精读', libraryID: 2, parentID: false },
};

const Zotero = {
	Collections: { get: (id) => collections[id] || null },
	Libraries: { get: (id) => libraries[id] || null },
	logError: (e) => { throw e; },
	debug: () => {},
	warn: () => {},
	version: '10.0.6',
	Promise: { delay: () => Promise.resolve() },
};

// ---------------------------------------------------------------- 极简 DOM
function makeDoc() {
	const makeEl = (tag) => ({
		tagName: tag.toUpperCase(),
		className: '',
		children: [],
		attributes: {},
		textContent: '',
		title: '',
		style: {},
		appendChild(c) { this.children.push(c); return c; },
		insertBefore(c) { this.children.push(c); return c; },
		addEventListener() {},
		removeEventListener() {},
		querySelector() { return null; },
		setAttribute(k, v) { this.attributes[k] = v; },
	});
	return { createElement: makeEl, getElementById: () => null, documentElement: makeEl('html'), head: makeEl('head') };
}

const sandbox = {
	Zotero,
	Services: {},
	Components: {},
	console,
	Map,
	Array,
	Promise,
	setTimeout: () => {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(bootstrapSrc, sandbox);

const ZCB = sandbox.ZCB;

// ---------------------------------------------------------------- 用例
let pass = 0, fail = 0;
function check(label, actual, expected) {
	const ok = actual === expected;
	ok ? pass++ : fail++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}` + (ok ? '' : `\n        got:      ${JSON.stringify(actual)}\n        expected: ${JSON.stringify(expected)}`));
}

check('ancestorChain 顶层', ZCB.ancestorChain(collections[10]).map(c => c.id).join(','), '10');
check('ancestorChain 三层', ZCB.ancestorChain(collections[12]).map(c => c.id).join(','), '10,11,12');
check('ancestorChain 跨文库顶层', ZCB.ancestorChain(collections[20]).map(c => c.id).join(','), '20');
check('pathString 三层', ZCB.pathString(collections[12]), '我的文库 › 超导理论 › NbC12 › 能带结构');
check('pathString 顶层', ZCB.pathString(collections[10]), '我的文库 › 超导理论');
check('pathString 群组库', ZCB.pathString(collections[20]), '课题组共享库 › 顶刊精读');
check('pathString null', ZCB.pathString(null), '');

// 渲染：选中第 3 层
const win = {
	document: makeDoc(),
	ZoteroPane: {
		collectionsView: {
			getSelectedCollections: () => [collections[12]],
			selectCollection: () => {},
		},
	},
};
const bar = win.document.createElement('div');
ZCB.render(win, bar);
const texts = bar.children.map(c => c.textContent);
// 个人库「我的文库」不显示，所以只剩 3 级分类 + 2 个分隔符
check('渲染段数（个人库不含文库名）', texts.length, 5);
check('渲染内容（个人库不含文库名）', texts.join('|'), '超导理论|›|NbC12|›|能带结构');
check('当前段高亮', bar.children[4].className, 'zcb-crumb zcb-current');
check('父段可点击', bar.children[0].tagName, 'A');

// 群组库：文库名要保留
const winLib = {
	document: makeDoc(),
	ZoteroPane: {
		collectionsView: {
			getSelectedCollections: () => [collections[20]],
			selectCollection: () => {},
		},
	},
};
const barLib = winLib.document.createElement('div');
ZCB.render(winLib, barLib);
check('群组库保留文库名', barLib.children.map(c => c.textContent).join('|'), '课题组共享库|›|顶刊精读');

// tooltip 仍给出完整路径（含个人库）
check('tooltip 含个人库', ZCB.pathString(collections[12]), '我的文库 › 超导理论 › NbC12 › 能带结构');

// 渲染：选中文库（非分类）
const win2 = {
	document: makeDoc(),
	ZoteroPane: {
		collectionsView: { getSelectedCollections: () => [] },
		getSelectedLibraryIDs: () => [1],
	},
};
const bar2 = win2.document.createElement('div');
ZCB.render(win2, bar2);
check('选中文库时只显示文库', bar2.children.map(c => c.textContent).join('|'), '我的文库');

// 渲染：选中已保存的搜索
const win4 = {
	document: makeDoc(),
	ZoteroPane: {
		collectionsView: {
			getSelectedCollections: () => [],
			getSelectedSearches: () => [{ id: 99, name: '我的精读' }],
		},
		getSelectedLibraryIDs: () => [1],
	},
};
const bar4 = win4.document.createElement('div');
ZCB.render(win4, bar4);
check('选中搜索时显示搜索名', bar4.children.map(c => c.textContent).join('|'), '我的精读');

// 渲染：无选中
const win3 = {
	document: makeDoc(),
	ZoteroPane: {
		collectionsView: { getSelectedCollections: () => [] },
		getSelectedLibraryIDs: () => [],
	},
};
const bar3 = win3.document.createElement('div');
ZCB.render(win3, bar3);
check('无选中时隐藏', bar3.style.display, 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

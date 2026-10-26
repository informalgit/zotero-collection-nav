/**
 * Collection Breadcrumb for Zotero
 * ============================================================================
 *
 * 在左侧收藏夹栏（collections pane）顶部插入一条面包屑，显示当前选中分类的
 * 完整层级路径：
 *
 *     我的文库 › 超导理论 › NbC12 › 能带结构
 *
 * - 每一段可点击，点击即跳到该层级（中间层可直接跳回父分类）。
 * - 鼠标悬停在收藏夹树的任意分类行上，会以 tooltip 显示该分类的完整路径。
 *
 * 设计要点
 * ---------------------------------------------------------------------------
 * 只使用 Zotero 7~10 公开且稳定的 API：
 *   ZoteroPane.collectionsView.getSelectedCollections()  取当前选中的分类
 *   ZoteroPane.collectionsView.onSelect                  选中变化事件
 *   ZoteroPane.collectionsView.selectCollection(id)      跳转到某个分类
 *   ZoteroPane.collectionsView.selectLibrary(id)         跳转到某个文库
 *   Zotero.Collections.get(id)                           同步取分类对象
 *   Zotero.Libraries.get(libraryID)                      同步取文库对象
 *   收藏夹树行 DOM id 形如 `<treeId>-row-<index>`，可反推行号 → view.getRow(index)
 *
 * 不修改 Zotero 自身的任何文件/数据，只往 DOM 里插一个 div。
 */

var ZCB = {
	// win -> { bar, view, refresh, tree, onMouseOver }
	_states: new Map(),
};

function install(data, reason) {}

function uninstall(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
	await Zotero.initializationPromise;
	// 注意：Zotero 的启动顺序是「先开主窗口 → 再启动插件」，
	// 因此 onMainWindowLoad 钩子在这种启动路径下不会被触发（对所有插件都一样）。
	// 这里主动去取主窗口并等待 collectionsView 就绪。
	await ZCB.tryInit();
}

/**
 * 等待主窗口和收藏夹树就绪，然后注入面包屑。
 */
ZCB.tryInit = async function (attempt = 0) {
	let win = null;
	try {
		win = Zotero.getMainWindow();
	}
	catch (e) {
		win = null;
	}
	if (win && win.ZoteroPane && win.ZoteroPane.collectionsView) {
		Zotero.debug('[Collection Breadcrumb] main window ready, injecting');
		ZCB.init(win);
		return true;
	}
	if (attempt >= 60) {
		// 最多等 30 秒
		Zotero.warn('[Collection Breadcrumb] main window never became ready');
		ZCB.selfTest(win, null, null);
		return false;
	}
	await Zotero.Promise.delay(500);
	return ZCB.tryInit(attempt + 1);
};

/**
 * Zotero 会在主窗口加载完成时调用这个钩子（bootstrap 作用域的全局函数）。
 */
async function onMainWindowLoad({ window }, reason) {
	try {
		ZCB.init(window);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

async function onMainWindowUnload({ window }, reason) {
	ZCB.destroy(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
	for (const win of Array.from(ZCB._states.keys())) {
		ZCB.destroy(win);
	}
	// 兜底：即使状态表里没有记录（注入中途失败过），也把残留元素清干净
	try {
		const win = Zotero.getMainWindow();
		win?.document?.getElementById('zcb-breadcrumb')?.remove();
		win?.document?.getElementById('zcb-style')?.remove();
	}
	catch (e) {
		// ignore
	}
}

// ============================================================================
// 样式
// ============================================================================

ZCB.STYLE = `
#zcb-breadcrumb {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 3px;
	padding: 3px 8px;
	font-size: 11px;
	line-height: 16px;
	white-space: nowrap;
	overflow: hidden;
	color: var(--fill-secondary, #555);
}
#zcb-breadcrumb .zcb-sep {
	flex: 0 0 auto;
	opacity: .55;
}
#zcb-breadcrumb .zcb-crumb {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}
#zcb-breadcrumb a.zcb-crumb {
	cursor: pointer;
	text-decoration: none;
}
#zcb-breadcrumb a.zcb-crumb:hover {
	color: var(--accent-blue, #2e5fa3);
	text-decoration: underline;
}
#zcb-breadcrumb .zcb-lib {
	font-weight: 600;
}
#zcb-breadcrumb .zcb-current {
	font-weight: 600;
	color: var(--fill-primary, #000);
}
`;

// ============================================================================
// 生命周期
// ============================================================================

ZCB.init = function (win) {
	if (ZCB._states.has(win)) {
		return;
	}
	try {
		ZCB.inject(win);
	}
	catch (e) {
		Zotero.logError(e);
		// 注入到一半失败就把可能已经插进去的残留撤掉，保证界面干净
		try {
			win?.document?.getElementById('zcb-breadcrumb')?.remove();
			win?.document?.getElementById('zcb-style')?.remove();
		}
		catch (_) {
			// ignore
		}
	}
};

ZCB.inject = function (win) {
	const doc = win.document;
	const pane = doc.getElementById('zotero-collections-pane');
	if (!pane) {
		return;
	}
	// collectionsView 可能还没建好，稍后重试
	const view = win.ZoteroPane?.collectionsView;
	if (!view) {
		win.setTimeout(() => ZCB.init(win), 300);
		return;
	}

	// 样式只注入一次
	if (!doc.getElementById('zcb-style')) {
		const style = doc.createElement('style');
		style.id = 'zcb-style';
		style.textContent = ZCB.STYLE;
		(doc.head || doc.documentElement).appendChild(style);
	}

	// 面包屑容器：插在收藏夹树工具栏正下方、树容器正上方。
	// 锚点做了多级兜底：万一将来 Zotero 改了元素 id，还能退回到直接插进 pane 顶部，
	// 而不是整个功能静默失效。
	const bar = doc.createElement('div');
	bar.id = 'zcb-breadcrumb';
	const toolbar = doc.getElementById('zotero-toolbar-collection-tree');
	if (toolbar && toolbar.parentNode) {
		toolbar.parentNode.insertBefore(bar, toolbar.nextSibling);
	}
	else {
		const treeContainer = doc.getElementById('zotero-collections-tree-container');
		if (treeContainer && treeContainer.parentNode) {
			treeContainer.parentNode.insertBefore(bar, treeContainer);
		}
		else {
			pane.insertBefore(bar, pane.firstChild);
		}
	}

	const refresh = () => ZCB.render(win, bar);
	view.onSelect.addListener(refresh);

	// 悬停 tooltip：显示任意分类行的完整路径
	const tree = doc.getElementById('zotero-collections-tree');
	const onMouseOver = (event) => {
		const row = event.target?.closest?.('.row');
		if (!row || !row.id) {
			return;
		}
		// 行 id 形如 "zotero-collections-tree-row-42"
		const match = /-row-(\d+)$/.exec(row.id);
		if (!match) {
			return;
		}
		let treeRow;
		try {
			treeRow = view.getRow(Number(match[1]));
		}
		catch (e) {
			return;
		}
		if (!treeRow || !treeRow.isCollection || !treeRow.isCollection()) {
			return;
		}
		const label = row.querySelector('span.cell-text');
		if (label) {
			label.title = ZCB.pathString(treeRow.ref);
		}
	};
	tree?.addEventListener('mouseover', onMouseOver);

	ZCB._states.set(win, { bar, view, refresh, tree, onMouseOver });
	refresh();
	Zotero.debug('[Collection Breadcrumb] injected, bar text = "' + bar.textContent + '"');

	// 可选自检：把启动诊断写到日志文件（默认关闭）
	ZCB.selfTest(win, bar, view);
};

/**
 * 清理：摘掉面包屑、注销监听、移除注入的样式。
 * 停用插件（Zotero 调用 shutdown）或关闭窗口时都会走这里，
 * 保证界面完全回到没有这个插件的样子。
 */
ZCB.destroy = function (win) {
	const state = ZCB._states.get(win);
	if (!state) {
		return;
	}
	try {
		state.view?.onSelect?.removeListener(state.refresh);
		state.tree?.removeEventListener('mouseover', state.onMouseOver);
		state.bar?.remove();
	}
	catch (e) {
		// ignore
	}
	try {
		// 样式是全局注入的，这里一并撤掉
		win?.document?.getElementById('zcb-style')?.remove();
	}
	catch (e) {
		// ignore
	}
	ZCB._states.delete(win);
};

// ============================================================================
// 路径计算
// ============================================================================

/**
 * 从分类对象向上回溯，得到 [最上层, ..., 自身] 的数组。
 * 每一项是 Zotero.Collection 对象。
 */
ZCB.ancestorChain = function (collection) {
	const chain = [];
	let current = collection;
	// parentID 在顶层分类上为 false；用 while 而不是递归，避免深树爆栈
	while (current) {
		chain.unshift(current);
		current = current.parentID ? Zotero.Collections.get(current.parentID) : null;
	}
	return chain;
};

/**
 * 生成 "我的文库 / 父分类 / 当前分类" 这样的完整路径字符串。
 */
ZCB.pathString = function (collection) {
	if (!collection) {
		return '';
	}
	const parts = ZCB.ancestorChain(collection).map(c => c.name);
	const library = ZCB.libraryOf(collection);
	if (library) {
		parts.unshift(library.name);
	}
	return parts.join(' › ');
};

ZCB.libraryOf = function (collection) {
	try {
		return collection?.libraryID ? Zotero.Libraries.get(collection.libraryID) : null;
	}
	catch (e) {
		return null;
	}
};

/**
 * 面包屑里是否显示文库名。
 *
 * 「我的文库」是个人库，所有分类都在它下面，显示出来只是冗余前缀，所以不显示。
 * 群组库的名字则是有用信息（能看出这份分类属于哪个共享库），保留。
 *
 * 注意：tooltip 用的是 pathString()，仍然给出完整路径，不受这里影响。
 */
ZCB.shouldShowLibrary = function (library) {
	if (!library) {
		return false;
	}
	try {
		// isGroup 是 Zotero.Library 原型上的 getter（library.js:159），返回 libraryType == 'group'
		return library.isGroup === true;
	}
	catch (e) {
		return false;
	}
	// 注意：isGroup 若为 undefined（未来 API 变化），不会误显示个人库，
	// 因为只有严格 true 才显示。
};

// ============================================================================
// 渲染
// ============================================================================

ZCB.render = function (win, bar) {
	const view = win.ZoteroPane?.collectionsView;
	if (!view) {
		return;
	}
	bar.textContent = '';

	let selected = [];
	try {
		selected = view.getSelectedCollections() || [];
	}
	catch (e) {
		selected = [];
	}

	// 选中的不是分类：可能是文库、已保存的搜索，或者什么都没有
	if (selected.length !== 1) {
		const search = ZCB.selectedSearch(view);
		if (search) {
			const el = ZCB.el(win, 'span', 'zcb-crumb zcb-current', search.name);
			el.title = search.name;
			bar.appendChild(el);
			bar.style.display = '';
			return;
		}
		const library = ZCB.selectedLibrary(win, view);
		if (library) {
			const el = ZCB.el(win, 'span', 'zcb-crumb zcb-lib', library.name);
			el.title = library.name;
			bar.appendChild(el);
			bar.style.display = '';
		}
		else {
			bar.style.display = 'none';
		}
		return;
	}

	const collection = selected[0];
	const chain = ZCB.ancestorChain(collection);
	const library = ZCB.libraryOf(collection);

	bar.style.display = '';

	// 文库段：个人库不显示，群组库保留
	if (ZCB.shouldShowLibrary(library)) {
		const libEl = ZCB.el(win, 'span', 'zcb-crumb zcb-lib', library.name);
		libEl.title = library.name;
		bar.appendChild(libEl);
		bar.appendChild(ZCB.el(win, 'span', 'zcb-sep', '›'));
	}

	// 各级分类段
	for (let i = 0; i < chain.length; i++) {
		const col = chain[i];
		const isLast = (i === chain.length - 1);

		let el;
		if (isLast) {
			el = ZCB.el(win, 'span', 'zcb-crumb zcb-current', col.name);
		}
		else {
			el = ZCB.el(win, 'a', 'zcb-crumb', col.name);
			el.href = '#';
			el.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				view.selectCollection(col.id);
			});
		}
		el.title = ZCB.pathString(col);
		bar.appendChild(el);

		if (!isLast) {
			bar.appendChild(ZCB.el(win, 'span', 'zcb-sep', '›'));
		}
	}
};

/**
 * 当前选中的是否为一个"已保存的搜索"。
 */
ZCB.selectedSearch = function (view) {
	try {
		const searches = view.getSelectedSearches?.();
		return Array.isArray(searches) && searches.length === 1 ? searches[0] : null;
	}
	catch (e) {
		return null;
	}
};

/**
 * 当选中的不是分类时，尽量判断当前选中的是哪个文库。
 */
ZCB.selectedLibrary = function (win, view) {
	try {
		const ids = win.ZoteroPane.getSelectedLibraryIDs?.() || [];
		if (!ids.length) {
			return null;
		}
		return Zotero.Libraries.get(ids[0]);
	}
	catch (e) {
		return null;
	}
};

ZCB.el = function (win, tag, className, text) {
	const el = win.document.createElement(tag);
	if (className) {
		el.className = className;
	}
	if (text != null) {
		el.textContent = text;
	}
	return el;
};

// ============================================================================
// 自检（可选）
// ============================================================================

/**
 * 把启动诊断写到日志文件，用于在没有 GUI 的情况下验证插件是否正常挂载。
 *
 * 开启方式（prefs.js）：
 *   user_pref("extensions.zotero.collection-breadcrumb.debug", true);
 *   user_pref("extensions.zotero.collection-breadcrumb.logPath", "C:\\path\\zcb.log");
 */
ZCB.selfTest = function (win, bar, view) {
	let enabled = false;
	try {
		// 注意：Zotero.Prefs.get(pref, global) 中 global 为 true 时会「原样」使用 pref 名，
		// 不加 extensions.zotero. 前缀。这里要的是全局分支，所以第二个参数不能传 true。
		enabled = Zotero.Prefs.get('collection-breadcrumb.debug') === true;
	}
	catch (e) {
		enabled = false;
	}
	if (!enabled) {
		return;
	}
	try {
		let logPath = Zotero.Prefs.get('collection-breadcrumb.logPath');
		if (!logPath) {
			logPath = PathUtils.join(Zotero.DataDirectory.dir, 'zcb-selftest.json');
		}
		let selected = [];
		try {
			selected = view?.getSelectedCollections?.() || [];
		}
		catch (e) {
			selected = [];
		}
		const report = {
			time: new Date().toISOString(),
			zoteroVersion: Zotero.version,
			mainWindow: !!win,
			collectionsPane: !!win?.document?.getElementById('zotero-collections-pane'),
			toolbar: !!win?.document?.getElementById('zotero-toolbar-collection-tree'),
			barInserted: !!bar?.isConnected,
			barParent: bar?.parentNode?.id || null,
			barNextSibling: bar?.nextElementSibling?.id || null,
			barDisplay: bar?.style.display ?? null,
			barText: bar?.textContent ?? null,
			barSegmentCount: bar?.children.length ?? 0,
			collectionsView: !!view,
			onSelectIsEvent: typeof view?.onSelect?.addListener === 'function',
			treeAttached: !!win?.document?.getElementById('zotero-collections-tree'),
			selectedCount: selected.length,
			selectedName: selected.length === 1 ? selected[0].name : null,
			selectedPath: selected.length === 1 ? ZCB.pathString(selected[0]) : null,
			selectedLibrary: selected.length === 1
				? ZCB.libraryOf(selected[0])?.name || null
				: null,
		};
		IOUtils.writeUTF8(
			logPath,
			JSON.stringify(report, null, 2),
			{ tmpPath: logPath + '.tmp' }
		);
	}
	catch (e) {
		try {
			Zotero.logError(e);
		}
		catch (_) {
			// ignore
		}
	}
};

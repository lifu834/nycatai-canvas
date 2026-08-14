// 角色钉住（P4）：按画布记录被钉住的"角色/风格锚点"节点。
// 存 localStorage（轻量、不进画布数据结构 = 不碰上游存储格式）；
// 消费方 = copilot 的 canvas_get_state（pinned 标记）+ 系统提示词规则（新建图/视频节点必须从钉住节点连线）。

const STORAGE_KEY = "nycatai:copilot-pins";

type PinMap = Record<string, string[]>;

function readAll(): PinMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as PinMap) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(map: PinMap) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // 存储满/隐私模式时静默失败，钉住只影响体验不影响正确性
    }
}

export function getPinnedNodeIds(projectId: string): string[] {
    return readAll()[projectId] || [];
}

/** 切换一组节点的钉住态：已全部钉住则解除，否则全部钉上。返回最新钉住列表。 */
export function togglePinnedNodes(projectId: string, nodeIds: string[]): string[] {
    if (!nodeIds.length) return getPinnedNodeIds(projectId);
    const map = readAll();
    const current = new Set(map[projectId] || []);
    const allPinned = nodeIds.every((id) => current.has(id));
    nodeIds.forEach((id) => (allPinned ? current.delete(id) : current.add(id)));
    map[projectId] = Array.from(current);
    writeAll(map);
    return map[projectId];
}

/** 清掉画布里已不存在的节点 id，返回有效钉住列表 */
export function prunePinnedNodes(projectId: string, existingIds: Set<string>): string[] {
    const map = readAll();
    const pruned = (map[projectId] || []).filter((id) => existingIds.has(id));
    if (pruned.length !== (map[projectId] || []).length) {
        map[projectId] = pruned;
        writeAll(map);
    }
    return pruned;
}

export const t = {
  app: {
    title: "Codex 助理"
  },
  header: {
    notifications: "通知",
    scan: "扫码绑定"
  },
  device: {
    online: "在线",
    offline: "离线",
    linked: "已连接",
    unboundTitle: "未绑定设备",
    unboundHint: "请先绑定一台桌面端，开启移动远程协作。",
    bindCta: "去绑定设备",
    bindHelp: "了解如何绑定",
    connectedSubline: "{name} / 已连接",
    desktopFallback: "桌面端"
  },
  search: {
    placeholder: "搜索命令或任务（⌘K）"
  },
  filter: {
    all: "全部",
    running: "执行中",
    waitingApproval: "等待审批",
    done: "已完成",
    failed: "失败",
    cancelled: "已取消",
    rejected: "已拒绝",
    created: "等待中"
  },
  command: {
    recentTitle: "最近的 Codex 命令",
    refresh: "刷新",
    empty: "暂无命令记录",
    emptyHint: "点击右下角按钮发送一个新的 Codex 命令吧。",
    durationLabel: "用时 {value}",
    runningLabel: "执行中…",
    relativeJustNow: "刚刚",
    relativeMinutes: "{value} 分钟前",
    relativeToday: "今天 {time}",
    relativeYesterday: "昨天 {time}",
    relativeDate: "{date} {time}",
    titlePrefix: "codex run"
  },
  status: {
    created: "等待中",
    running: "执行中",
    waitingApproval: "等待审批",
    done: "已完成",
    failed: "失败",
    cancelled: "已取消",
    rejected: "已拒绝"
  },
  create: {
    title: "新建命令",
    subtitle: "选择目标设备，输入工作目录与提示词",
    workspace: "工作目录",
    workspacePlaceholder: "/Users/you/project",
    prompt: "提示词",
    promptPlaceholder: "描述你希望 Codex 执行的任务...",
    desktop: "目标设备",
    desktopEmpty: "暂无可用设备，请先绑定。",
    run: "运行命令",
    running: "发送中...",
    back: "返回",
    fabLabel: "新建命令"
  },
  detail: {
    title: "命令详情",
    cancel: "取消任务",
    cancelling: "取消中...",
    refresh: "刷新输出",
    refreshing: "刷新中...",
    approve: "通过",
    reject: "拒绝",
    processing: "处理中...",
    approvalTitle: "等待审批",
    approvalCommand: "命令",
    approvalCwd: "工作目录",
    approvalReason: "原因",
    outputTitle: "执行输出",
    outputEmpty: "暂无输出",
    outputLoadMore: "加载更多",
    promptLabel: "提示词",
    workspaceLabel: "工作目录",
    deviceLabel: "目标设备",
    statusLabel: "状态",
    createdAtLabel: "创建于",
    updatedAtLabel: "更新于"
  },
  scan: {
    title: "扫描桌面端二维码",
    subtitle: "把摄像头对准桌面端展示的二维码即可完成绑定。",
    permissionTitle: "需要相机权限",
    permissionHint: "允许访问相机后即可扫描桌面端绑定二维码。",
    requestingPermission: "请求中...",
    grantCamera: "允许相机",
    noCameraTitle: "无法启动相机",
    noCameraHint: "当前设备没有可用的后置摄像头，请粘贴二维码内容完成绑定。",
    cameraErrorFallback: "相机启动失败，请粘贴二维码内容完成绑定。",
    cameraErrorPrefix: "相机启动失败：",
    rescan: "重新扫描",
    manualLabel: "手动绑定内容",
    manualPlaceholder: "粘贴桌面端二维码中的 JSON",
    manualSubmit: "使用文本绑定",
    manualMissingTitle: "缺少绑定内容",
    manualMissingBody: "请先粘贴桌面端二维码中的绑定内容。",
    back: "返回"
  },
  pairing: {
    title: "输入桌面端验证码",
    subtitle: "请把桌面端显示的 6 位验证码输入到下方。",
    placeholder: "6 位验证码",
    submit: "确认绑定",
    submitting: "绑定中...",
    back: "重新扫码",
    cancel: "取消"
  },
  drawer: {
    title: "已绑定设备",
    empty: "尚未绑定任何桌面端。",
    scanCta: "扫描桌面端二维码",
    delete: "解除绑定",
    close: "关闭",
    active: "当前设备",
    setActive: "切换为当前"
  },
  alert: {
    confirmDeleteTitle: "确认解除绑定？",
    confirmDeleteBody: "解除后将无法接收该桌面端的指令，可随时重新绑定。",
    confirm: "确认",
    cancel: "取消"
  }
} as const;

export function format(
  template: string,
  params: Record<string, string | number> = {}
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

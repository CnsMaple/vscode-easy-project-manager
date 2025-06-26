import {
  window,
  TreeDataProvider,
  TreeItem,
  Event,
  EventEmitter,
  ExtensionContext,
  commands,
} from "vscode";
import {
  readProjectManagerData,
  addProject,
  removeProject,
  ProjectItem,
  getCurrentWorkspaceDir,
  addRecent,
} from "./utils";

const path = require("path");

export function registerSidebar(context: ExtensionContext) {
  // 每次激活/切换工作区时，自动添加到 recent
  function addCurrentWorkspaceToRecent() {
    const currentDir = getCurrentWorkspaceDir();
    if (currentDir) {
      // label 取目录名
      const label = path.basename(currentDir);
      // 这里直接调用 addRecent
      addRecent(context, { label, dir: currentDir });
    }
  }
  // 初始化时也执行一次
  addCurrentWorkspaceToRecent();

  const provider = new ProjectManagerProvider(context);
  const treeView = window.createTreeView("easyProjectManagerSidebar", {
    treeDataProvider: provider,
  });

  context.subscriptions.push(treeView);
  // 状态栏显示当前目录所在的label
  const statusBarItem = window.createStatusBarItem(1, 0); // 1 = 左侧, 100 = 优先级
  statusBarItem.command = "easy-project-manager.quickOpenProject";
  function updateStatusBar() {
    const data = readProjectManagerData(context);
    const currentDir = getCurrentWorkspaceDir();
    let label = "no project";
    let tooltip = "no current project";
    if (currentDir) {
      // 先查找项目
      const project = data.project.find((p: any) => p.dir === currentDir);
      if (project) {
        label = project.label;
      }
      tooltip = `current: ${currentDir}`;
    }
    statusBarItem.text = `$(file-directory) ${label}`;
    statusBarItem.tooltip = tooltip;
    statusBarItem.show();
  }
  // 注册状态栏点击命令，弹出项目搜索
  context.subscriptions.push(
    commands.registerCommand("easy-project-manager.quickOpenProject", async () => {
      const data = readProjectManagerData(context);
      const currentDir = getCurrentWorkspaceDir();
      const items = [
        ...data.project.map((p: any) => ({
          label: p.dir === currentDir ? `➡️ ${p.label}` : p.label,
          description: p.dir,
          dir: p.dir,
          type: "project",
        })),
      ];
      if (items.length === 0) {
        window.showInformationMessage("Project list is empty, please add a project first");
        return;
      }
      const pick = await window.showQuickPick(items, {
        placeHolder: "Search and select a project to open",
        matchOnDescription: true,
      });
      if (pick && pick.dir) {
        const vscode = require("vscode");
        const uri = vscode.Uri.file(pick.dir);
        await commands.executeCommand("vscode.openFolder", uri, false);
      }
    })
  );
  // 注册最近打开目录的搜索命令
  context.subscriptions.push(
    commands.registerCommand("easy-project-manager.quickOpenRecent", async () => {
      const data = readProjectManagerData(context);
      const currentDir = getCurrentWorkspaceDir();
      const items = [
        ...data.recent.map((r: any) => ({
          label: r.dir === currentDir ? `➡️ ${r.label}` : r.label,
          description: r.dir,
          dir: r.dir,
          type: "recent",
        })),
      ];
      if (items.length === 0) {
        window.showInformationMessage("Recent list is empty");
        return;
      }
      const pick = await window.showQuickPick(items, {
        placeHolder: "Search and select a recent directory to open",
        matchOnDescription: true,
      });
      if (pick && pick.dir) {
        const vscode = require("vscode");
        const uri = vscode.Uri.file(pick.dir);
        await commands.executeCommand("vscode.openFolder", uri, false);
      }
    })
  );
  updateStatusBar();
  context.subscriptions.push(statusBarItem);

  // 监听工作区切换和项目变更，刷新状态栏
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      updateStatusBar();
      addCurrentWorkspaceToRecent();
    })
  );
  // 监听侧边栏刷新时也刷新状态栏
  provider.refresh = (function (orig) {
    return function (this: ProjectManagerProvider) {
      orig.call(this);
      updateStatusBar();
    };
  })(provider.refresh);

  // 编辑管理JSON文件命令
  context.subscriptions.push(
    commands.registerCommand("easy-project-manager.editJson", async () => {
      // 获取 JSON 文件路径
      const fs = require("fs");
      const filePath = require("path").join(
        context.globalStorageUri.fsPath,
        "easy-project-manager.json"
      );
      // 若文件不存在则创建空结构
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(require("path").dirname(filePath), { recursive: true });
        fs.writeFileSync(
          filePath,
          JSON.stringify({ recent: [], project: [] }, null, 2),
          "utf-8"
        );
      }
      const doc = await (
        await import("vscode")
      ).workspace.openTextDocument(filePath);
      await (await import("vscode")).window.showTextDocument(doc);
    })
  );

  // 刷新命令
  context.subscriptions.push(
    commands.registerCommand("easy-project-manager.refresh", () => {
      provider.refresh();
    })
  );

  // 添加项目命令

  context.subscriptions.push(
    commands.registerCommand("easy-project-manager.addProject", async () => {
      const defaultDir = getCurrentWorkspaceDir();
      const defaultLabel = path.basename(defaultDir);
      const label = await window.showInputBox({
        prompt: "Project name",
        value: defaultLabel,
      });
      if (!label) return;
      const dir = await window.showInputBox({
        prompt: "Project directory",
        value: defaultDir,
      });
      if (!dir) return;
      // 只接受绝对路径并检查有效性
      const fs = require("fs");
      if (!path.isAbsolute(dir)) {
        window.showErrorMessage("Project directory must be an absolute path");
        return;
      }
      let isValid = false;
      try {
        isValid = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      } catch (e) {
        isValid = false;
      }
      if (!isValid) {
        window.showErrorMessage("Please enter a valid project directory path");
        return;
      }
      addProject(context, { label, dir });
      provider.refresh();
    })
  );

  // 删除项目命令
  context.subscriptions.push(
    commands.registerCommand(
      "easy-project-manager.removeProject",
      async (item: ProjectItem) => {
        removeProject(context, item.dir);
        provider.refresh();
      }
    )
  );

  // 编辑项目命令
  context.subscriptions.push(
    commands.registerCommand(
      "easy-project-manager.editProject",
      async (item: ProjectItem) => {
        const newLabel = await window.showInputBox({
          prompt: "New project name",
          value: item.label,
        });
        if (!newLabel) return;
        const newDir = await window.showInputBox({
          prompt: "New project directory",
          value: item.dir,
        });
        if (!newDir) return;
        const fs = require("fs");
        if (!path.isAbsolute(newDir)) {
          window.showErrorMessage("Project directory must be an absolute path");
          return;
        }
        let isValid = false;
        try {
          isValid = fs.existsSync(newDir) && fs.statSync(newDir).isDirectory();
        } catch (e) {
          isValid = false;
        }
        if (!isValid) {
          window.showErrorMessage("Please enter a valid project directory path");
          return;
        }
        // 先移除旧的，再添加新的
        removeProject(context, item.dir);
        addProject(context, { label: newLabel, dir: newDir });
        provider.refresh();
      }
    )
  );

  // 打开项目命令
  context.subscriptions.push(
    commands.registerCommand(
      "easy-project-manager.openProject",
      async (dir: string) => {
        if (!dir) return;
        const vscode = require("vscode");
        const uri = vscode.Uri.file(dir);
        await commands.executeCommand("vscode.openFolder", uri, false);
      }
    )
  );
}

class ProjectManagerProvider implements TreeDataProvider<TreeItemNode> {
  private _onDidChangeTreeData: EventEmitter<TreeItemNode | undefined | void> =
    new EventEmitter<TreeItemNode | undefined | void>();
  readonly onDidChangeTreeData: Event<TreeItemNode | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(private context: ExtensionContext) {}

  getChildren(element?: TreeItemNode): TreeItemNode[] {
    const data = readProjectManagerData(this.context);
    if (!element) {
      return [
        new TreeItemNode("Project List", "project", 2),
        new TreeItemNode("Recently Opened", "recent", 2),
      ];
    }
    if (element.type === "recent") {
      return data.recent.map(
        (item) => new TreeItemNode(item.label, "recentItem", 0, item.dir)
      );
    }
    if (element.type === "project") {
      return data.project.map(
        (p) => new TreeItemNode(p.label, "projectItem", 0, p.dir)
      );
    }
    return [];
  }

  getTreeItem(element: TreeItemNode): TreeItem {
    /**
     * 渲染节点的信息
     */
    let label = element.label;
    // 如果是项目项或最近项，且dir等于当前工作区目录，则label前加*
    if (
      (element.type === "projectItem" || element.type === "recentItem") &&
      element.dir
    ) {
      const currentDir = getCurrentWorkspaceDir();
      if (currentDir && element.dir === currentDir) {
        label = `➡️ ${label}`;
      }
    }
    const item = new TreeItem(label);
    if (element.type === "recent" || element.type === "project") {
      item.collapsibleState = element.collapsibleState;
      // 设置 contextValue 以便在 package.json 里配置按钮
      if (element.type === "project") {
        item.iconPath = new (require("vscode").ThemeIcon)("file-directory");
      } else if (element.type === "recent") {
        item.iconPath = new (require("vscode").ThemeIcon)("clock");
      }
      item.contextValue = element.type;
    }
    if (element.type != "recent" && element.type != "project") {
      item.description = element.dir || "";
      item.contextValue = element.type;
      // 添加点击打开项目命令
      if (element.dir) {
        item.command = {
          command: "easy-project-manager.openProject",
          title: "Open Project",
          arguments: [element.dir],
        };
      }
    }
    return item;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class TreeItemNode {
  // label（必需）：节点显示的文本
  // collapsibleState：节点是否可展开（如 TreeItemCollapsibleState.Collapsed/Expanded/None）
  // description：显示在 label 右侧的灰色文本
  // iconPath：自定义图标
  // contextValue：用于命令菜单的上下文判断
  // command：点击节点时执行的命令
  constructor(
    public label: string,
    public type: "recent" | "project" | "recentItem" | "projectItem",
    public collapsibleState: 0 | 1 | 2 = 0,
    public dir?: string
  ) {}
}

import { defineExtension, useCommand } from "reactive-vscode";
import { window, ViewColumn, ExtensionContext, Uri } from "vscode";
import {
  logger,
  readProjectManagerData,
  addRecent,
  addProject,
  removeProject,
  ProjectManagerData,
  ProjectItem,
} from "./utils";
import * as fs from "fs";
import * as path from "path";
import { alwaysShowStartPage } from "./configs";
import { getCurrentWorkspaceDir } from "./utils";

// 全局保存 start page panel
let currentStartPagePanel: import("vscode").WebviewPanel | undefined;

export = defineExtension((context: ExtensionContext) => {
  logger.info("Extension Activated");

  // 自动显示开始页
  if (alwaysShowStartPage.value) {
    logger.info("Showing start page");
    showStartPage(context);
  } else {
    // 如果当前vscode没有打开工作区，则显示开始页
    const currentDir = getCurrentWorkspaceDir();
    if (!currentDir) {
      logger.info("No workspace opened, showing start page");
      showStartPage(context);
    }
    logger.info("Workspace opened");
  }

  // 侧边栏注册，传递 currentStartPagePanel 的 getter
  const { registerSidebar } = require("./sidebar");
  registerSidebar(context, () => currentStartPagePanel);

  // 监听起始页webview消息
  context.subscriptions.push(
    // 只在 showStartPage 时注册一次
    // 这里简化处理，实际可优化
    window.onDidChangeActiveTextEditor(() => {})
  );

  useCommand("easy-project-manager.showStartPage", () =>
    showStartPage(context)
  );
});

function showStartPage(context: ExtensionContext) {
  const panel = window.createWebviewPanel(
    "easyProjectManagerStartPage",
    "easy-project-manager",
    ViewColumn.One,
    {
      enableScripts: true,
    }
  );
  currentStartPagePanel = panel;
  panel.onDidDispose(() => {
    if (currentStartPagePanel === panel) currentStartPagePanel = undefined;
  });
  const iconUri = Uri.file(
    path.join(context.extensionPath, "assets", "icon.png")
  );
  panel.iconPath = iconUri; // 使用 assets/icon.jpg 作为图标
  panel.webview.html = getStartPageHtml(context);

  // 监听 webview 消息，返回数据
  panel.webview.onDidReceiveMessage(
    (msg) => {
      if (msg.type === "getData") {
        const data = readProjectManagerData(context);
        // 获取当前工作区目录
        let currentDir = "";
        try {
          const { getCurrentWorkspaceDir } = require("./utils");
          currentDir = getCurrentWorkspaceDir();
        } catch {}
        panel.webview.postMessage({
          type: "data",
          data: { ...data, currentDir },
        });
      } else if (msg.type === "openProject" && msg.dir) {
        const vscode = require("vscode");
        vscode.commands.executeCommand(
          "easy-project-manager.openProject",
          msg.dir
        );
      } else if (msg.type === "vscode-command" && msg.command) {
        // 新增：处理 h2 点击事件，调用命令
        const vscode = require("vscode");
        vscode.commands.executeCommand(msg.command);
      }
    },
    undefined,
    context.subscriptions
  );
}

function getStartPageHtml(context: ExtensionContext) {
  // 假设 start-page.html 放在插件根目录
  const htmlPath = path.join(context.extensionPath, "start-page.html");
  try {
    return fs.readFileSync(htmlPath, "utf-8");
  } catch (e) {
    return `<h1>can not load start page</h1>`;
  }
}
